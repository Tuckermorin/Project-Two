# Testing Agent v3 + RAG Deep Dive

## 📋 Table Updates Summary

### ✅ Changes Made to `ips_factors`

Added `factor_scope` column to distinguish factor types:

```sql
-- Check your updated table
SELECT
  factor_id,
  factor_name,
  weight,
  target_operator,
  target_value,
  target_value_max,
  collection_method,
  factor_scope  -- NEW!
FROM ips_factors
WHERE ips_id = 'your-ips-id'
ORDER BY weight DESC, factor_scope;
```

**What you'll see:**
- `factor_scope = 'general'`: Factors that DON'T need options chains
  - Examples: market cap, moving averages, news sentiment, inflation
- `factor_scope = 'chain'`: Factors that NEED options chains
  - Examples: delta, IV, theta, open interest, bid-ask spread

---

## 🧪 Testing Agent v3 - Step by Step

### **Prerequisites**

1. **Have an active IPS** with factors configured
2. **Have some closed trades** (for RAG to learn from - optional but recommended)
3. **Alpha Vantage API key** in `.env` (`ALPHA_VANTAGE_API_KEY`)
4. **OpenAI API key** in `.env` (`OPENAI_API_KEY`) - for RAG embeddings

### **Step 1: Seed RAG Embeddings (One-Time)**

```bash
# Auto-detects all users with closed trades and seeds embeddings
curl -X POST http://localhost:3000/api/agent/rag/seed
```

**Expected response:**
```json
{
  "ok": true,
  "users_processed": 1,
  "total_embedded": 45,
  "results": [
    {
      "userId": "abc-123",
      "embedded": 45
    }
  ]
}
```

**What this does:**
1. Finds all users with closed trades (`status = 'closed'` and `realized_pnl IS NOT NULL`)
2. For each closed trade, creates a text summary
3. Sends summary to OpenAI to generate embedding vector (1536 dimensions)
4. Stores embedding in `trade_embeddings` table with pgvector

**Verify it worked:**
```sql
SELECT COUNT(*) as total_embeddings
FROM trade_embeddings;

-- Should show 45 (or however many closed trades you have)
```

### **Step 2: Get Your IPS ID**

```sql
SELECT id, name, total_factors, active_factors
FROM ips_configurations
WHERE is_active = true;
```

Copy the `id` value.

### **Step 3: Run Agent v3**

```bash
curl -X POST http://localhost:3000/api/agent/run \
  -H "Content-Type: application/json" \
  -d '{
    "symbols": ["AAPL", "AMD", "TSLA", "NVDA", "MU"],
    "mode": "paper",
    "ipsId": "YOUR-IPS-ID-HERE",
    "useV3": true
  }'
```

**Watch the console logs** - you'll see:

```
[AgentV3] Starting run abc-123 with 5 symbols, IPS: your-ips-id

[FetchIPS] Loaded IPS: My Trading Strategy with 21 factors

[PreFilterGeneral] Found 3 high-weight general factors to check
[PreFilterGeneral] Processing 5 symbols
[PreFilterGeneral] ✓ AAPL passed general filters
[PreFilterGeneral] ✓ AMD passed general filters
[PreFilterGeneral] ✗ TSLA filtered out: Earnings within 14 days
[PreFilterGeneral] 4/5 symbols passed general filters

[ReasoningCheckpoint1] Evaluating whether to proceed with 4 symbols
[ReasoningCheckpoint1] Decision: PROCEED, Symbols: 4

[FetchOptionsChains] Pulling chains for 4 symbols
[FetchOptionsChains] Got 1247 contracts for AAPL
[FetchOptionsChains] Got 983 contracts for AMD
...

[FilterHighWeight] Found 6 high-weight chain factors
[FilterHighWeight] ✓ AAPL candidate passed
[FilterHighWeight] ✗ AMD candidate filtered: Delta 0.42 exceeds 0.35
[FilterHighWeight] 8 candidates passed high-weight filters

[ReasoningCheckpoint2] Decision: PROCEED

[FilterLowWeight] Found 3 low-weight factors
[FilterLowWeight] ✓ AAPL passed (1/3 violations)
[FilterLowWeight] 6/8 candidates passed

[ReasoningCheckpoint3] Decision: PROCEED

[RAGScoring] Finding similar trades for AAPL put_credit_spread
[RAGScoring] Found 12 similar trades (threshold: 0.75)
[RAGScoring] AAPL: Composite=78.5, Historical Win Rate=65.0% (12 similar trades, high confidence)
[RAGScoring] AMD: Composite=72.1 (no historical data available)

[SortTop5] Selected top 5
[Diversification] ⚠️ AAPL: Already have 2 AAPL positions

[FinalizeOutput] Preparing final output for 5 trades
```

**Expected response:**
```json
{
  "ok": true,
  "version": "v3",
  "runId": "abc-123-xyz",
  "selected": [
    {
      "symbol": "AAPL",
      "strategy": "put_credit_spread",
      "entry_mid": 1.25,
      "max_profit": 125,
      "max_loss": 375,
      "composite_score": 78.5,
      "yield_score": 25.0,
      "ips_score": 87.3,
      "historical_analysis": {
        "has_data": true,
        "trade_count": 12,
        "win_rate": 0.65,
        "avg_roi": 8.5,
        "confidence": "high"
      },
      "diversification_warnings": [
        "⚠️ Already have 2 AAPL positions"
      ]
    }
    // ... 4 more trades
  ],
  "candidates_total": 6,
  "reasoning_decisions": [
    {
      "checkpoint": "after_general_filter",
      "decision": "PROCEED",
      "reasoning": "4 symbols passed general filters",
      "timestamp": "2025-01-05T..."
    },
    // ... 2 more checkpoints
  ],
  "errors": []
}
```

### **Step 4: View Results in Database**

```sql
SELECT
  symbol,
  strategy,
  entry_mid,
  max_profit,
  max_loss,
  (detailed_analysis->>'composite_score')::numeric as composite,
  (detailed_analysis->>'ips_score')::numeric as ips_score,
  (detailed_analysis->'historical_analysis'->>'win_rate')::numeric as hist_win_rate,
  (detailed_analysis->'historical_analysis'->>'trade_count')::int as similar_trades,
  detailed_analysis->'diversification_warnings' as warnings
FROM trade_candidates
WHERE run_id = 'YOUR-RUN-ID'
ORDER BY composite DESC;
```

---

## 🎓 RAG Deep Dive

### **What is RAG?**

**RAG** = Retrieval-Augmented Generation

It's a technique to enhance LLM responses with **your own data** by:
1. Converting your data into **vector embeddings** (numerical representations)
2. Storing embeddings in a **vector database** (pgvector)
3. When making decisions, **retrieve similar past examples**
4. Use those examples to inform the AI's decision

### **Why RAG for Trading?**

Traditional approach:
```
User asks: "Should I take this AAPL put credit spread?"
LLM responds: "Based on general options knowledge, this seems reasonable."
```

With RAG:
```
User asks: "Should I take this AAPL put credit spread?"
RAG finds: 15 similar AAPL spreads you've traded before
         → 10 won (66% win rate)
         → Average ROI: 8.5%
         → Similar deltas, IV ranks
LLM responds: "Based on YOUR 15 similar AAPL trades (66% win rate, 8.5% avg ROI),
               this trade aligns with your successful patterns."
```

### **How Vector Embeddings Work**

**1. Text → Numbers**

Your trade:
```
Symbol: AAPL
Strategy: put_credit_spread
IPS Score: 87%
Delta: 0.15
IV Rank: 62
Outcome: WIN (P&L: $125, ROI: 9.2%)
```

OpenAI converts this to a **1536-dimensional vector**:
```
[0.023, -0.145, 0.892, ..., 0.334]  // 1536 numbers
```

Each number represents a "feature" learned by the AI (e.g., "bullishness", "volatility", "profitability").

**2. Similarity = Distance**

Two trades with similar characteristics will have vectors that are **close together** in 1536-dimensional space.

**Cosine similarity** measures how close:
- `1.0` = Identical
- `0.8-1.0` = Very similar
- `0.5-0.8` = Somewhat similar
- `<0.5` = Different

**3. Fast Lookup with pgvector**

pgvector creates an index (like a spatial map) so finding similar trades is fast:

```sql
-- Without index: Check ALL 10,000 trades (slow!)
-- With pgvector index: Check ~100 trades (fast!)

SELECT trade_id, 1 - (embedding <=> query_vector) AS similarity
FROM trade_embeddings
WHERE 1 - (embedding <=> query_vector) > 0.75  -- Only >75% similar
ORDER BY embedding <=> query_vector
LIMIT 10;
```

### **RAG in Your Agent**

When Agent v3 scores a candidate trade, it:

1. **Embeds the candidate** (same process as closed trades)
2. **Queries pgvector** for similar historical trades
3. **Calculates statistics**:
   - Win rate: `wins / total_similar_trades`
   - Avg ROI: Average of all similar trades' ROIs
   - Confidence: Based on sample size & similarity
4. **Adjusts composite score**:
   ```typescript
   composite = (Yield × 0.4) + (IPS × 0.3) + (Historical Win Rate × 0.3)
   ```

**Example:**

```
Candidate: AMD put credit spread
├─ Yield Score: 25 (risk/reward ratio)
├─ IPS Score: 82 (meets 18/21 factors)
├─ RAG Query:
│   ├─ Found 12 similar AMD spreads
│   ├─ 8 won, 4 lost → 66.7% win rate
│   ├─ Avg ROI: 7.2%
│   └─ Confidence: HIGH (12 trades, 0.85 avg similarity)
└─ Composite: (25×0.4) + (82×0.3) + (66.7×0.3) = 54.6
```

Without RAG (no historical data):
```
Composite: (25×0.6) + (82×0.4) = 47.8  // Lower score!
```

### **Confidence Levels**

Agent v3 calculates confidence based on:

```typescript
if (similar_trades >= 10 && avg_similarity >= 0.85)
  → HIGH confidence

else if (similar_trades >= 5 && avg_similarity >= 0.75)
  → MEDIUM confidence

else
  → LOW confidence
```

**High confidence** = Trust the historical win rate
**Low confidence** = Not enough data, fall back to IPS + yield

---

## 🔍 Debugging Agent v3

### **1. Check which factors are general vs chain**

```sql
SELECT
  factor_scope,
  COUNT(*) as factor_count,
  SUM(weight) as total_weight
FROM ips_factors
WHERE ips_id = 'your-ips-id'
GROUP BY factor_scope;
```

Expected:
```
factor_scope | factor_count | total_weight
-----------------------------------------
general      |     11       |      42
chain        |     10       |      58
```

### **2. See what symbols get filtered out**

Check the `reasoning_decisions` in the API response:

```json
{
  "reasoning_decisions": [
    {
      "checkpoint": "after_general_filter",
      "decision": "PROCEED",
      "reasoning": "3/5 symbols passed (TSLA: earnings, MU: low volume)"
    }
  ]
}
```

### **3. Check RAG embeddings**

```sql
-- See which trades have embeddings
SELECT
  t.symbol,
  t.strategy_type,
  t.realized_pnl,
  te.id as embedding_id
FROM trades t
LEFT JOIN trade_embeddings te ON te.trade_id = t.id
WHERE t.status = 'closed'
ORDER BY t.exit_date DESC
LIMIT 20;
```

If `embedding_id` is NULL, that trade wasn't embedded. Run the seed endpoint again.

### **4. Test similarity search manually**

```sql
-- Find similar trades to a specific trade
SELECT
  t.symbol,
  t.strategy_type,
  t.realized_pnl,
  1 - (te.embedding <=> (
    SELECT embedding FROM trade_embeddings WHERE trade_id = 'KNOWN-TRADE-ID'
  )) AS similarity
FROM trade_embeddings te
JOIN trades t ON t.id = te.trade_id
WHERE te.trade_id != 'KNOWN-TRADE-ID'
ORDER BY similarity DESC
LIMIT 10;
```

---

## ⚡ Performance Tips

### **1. API Rate Limiting**

Agent v3 has built-in rate limiting:
- Waits 60s after 500 Alpha Vantage calls
- Uses `PQueue` to limit concurrency (2 calls/second)

**If you hit rate limits:**
- Reduce symbols (5-7 is optimal)
- Use general factors to filter before pulling chains

### **2. RAG Performance**

pgvector is FAST, but:
- First query might be slow (cold start)
- With 1000+ embeddings, use `lists` parameter in index:

```sql
-- For large datasets (>10k trades), tune the index
CREATE INDEX trade_embeddings_vector_idx
ON trade_embeddings
USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 100);  -- Increase for more data
```

### **3. Reasoning Checkpoint Performance**

Each checkpoint calls the LLM (slow). You can:
- **Skip checkpoints** if you trust your IPS (edit graph edges)
- **Cache decisions** for same market conditions
- **Use cheaper model** (gpt-4o-mini instead of o1)

---

## 📊 Understanding Your Results

### **Composite Score Breakdown**

For each trade, you get:

```json
{
  "composite_score": 78.5,    // Overall ranking score
  "yield_score": 25.0,        // (max_profit / max_loss) × 100
  "ips_score": 87.3,          // % of IPS factors met
  "historical_analysis": {
    "win_rate": 0.65,         // 65% of similar trades won
    "trade_count": 12,        // 12 similar historical trades
    "confidence": "high"      // HIGH/MEDIUM/LOW
  }
}
```

**How to interpret:**

- **Composite 80-100**: Excellent trade (high yield + IPS match + proven history)
- **Composite 60-80**: Good trade (may have 1-2 weak areas)
- **Composite 40-60**: Mediocre (missing key factors or poor history)
- **Composite <40**: Avoid (multiple red flags)

**Example comparison:**

```
Trade A: Composite 85
├─ Yield: 30 (good risk/reward)
├─ IPS: 92 (near perfect match)
└─ Win Rate: 70% (12 similar trades) ✅ BEST

Trade B: Composite 72
├─ Yield: 40 (great risk/reward!)
├─ IPS: 68 (missing some factors)
└─ Win Rate: 55% (6 similar trades) ⚠️ Risky

Trade C: Composite 45
├─ Yield: 20 (poor risk/reward)
├─ IPS: 82 (good IPS match)
└─ No historical data ❌ SKIP
```

---

## 🎯 Next Steps

1. **Test with your real IPS** and symbols
2. **Close some trades** and watch RAG learn
3. **Iterate on your IPS factors** based on results
4. **Compare Agent v1 vs v3** (set `useV3: false` to use old version)

---

## 🐛 Common Issues

**Problem**: "No embeddings found"
**Fix**: Run `POST /api/agent/rag/seed`

**Problem**: "OpenAI API error"
**Fix**: Check `.env` has `OPENAI_API_KEY`

**Problem**: "All symbols filtered out"
**Fix**: Check your IPS factors - might be too restrictive

**Problem**: "Low confidence on all trades"
**Fix**: Normal for first run - need more closed trades to learn from

---

Good luck testing! 🚀
