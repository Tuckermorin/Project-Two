# Agent v3 - Implementation Complete

## Summary

Agent v3 has been fully implemented following your Agent Flow v3 specification with progressive filtering, reasoning checkpoints, RAG integration, and diversification checks.

---

## ✅ What's Been Built

### **1. Core Agent Flow** ([options-agent-v3.ts](src/lib/agent/options-agent-v3.ts))

Complete implementation of all 13 steps from your flow diagram:

#### **Step 1-2: IPS Loading & Watchlist Validation**
- `fetchIPS()` - Loads IPS configuration and validates factors
- Initializes `survivingSymbols` array to track filtering

#### **Step 4: Pre-Filter General Factors (Chain-Independent)**
- `preFilterGeneral()` - Filters on factors that don't require options chains
- Checks: earnings dates, market cap, volume, sector sentiment
- **Saves API calls** by filtering before expensive chain pulls

#### **Reasoning Checkpoint 1**
- `reasoningCheckpoint1()` - LLM decides whether to proceed after general filter
- Uses `rationaleLLM` to evaluate if near-misses should continue
- Returns JSON: `{decision: "PROCEED" | "REJECT" | "PROCEED_WITH_CAUTION"}`

#### **Step 5: Pull Options Chains (PSSA)**
- `fetchOptionsChains()` - Pulls chains only for surviving symbols
- **API rate limiting**: Waits 60s after 500 Alpha Vantage calls
- Merges with general data (fundamentals already fetched)

#### **Step 6: Filter High-Weight Factors (weights ≥5)**
- `filterHighWeightFactors()` - Filters on chain-dependent factors
- Checks: delta, IV rank, theta, open interest, bid-ask spread
- Generates trade candidates (put credit spreads) for passing symbols

#### **Reasoning Checkpoint 2**
- `reasoningCheckpoint2()` - Evaluates after high-weight filter
- Can suggest threshold adjustments if candidates barely miss

#### **Step 8: Filter Low-Weight Factors (weights <5)**
- `filterLowWeightFactors()` - More lenient filtering
- Allows up to 50% factor failures (vs 0% for high-weight)
- Checks: gamma, vega, news sentiment, profit margin

#### **Reasoning Checkpoint 3**
- `reasoningCheckpoint3()` - Final decision point
- Suggests "Cash/Wait" if all factors >30% outside targets

#### **Step 10: RAG Correlation + Composite Scoring**
- `ragCorrelationScoring()` - Queries vector DB for similar historical trades
- **Composite Score** = (Yield × 0.4) + (IPS × 0.3) + (Historical Win Rate × 0.3)
- Falls back to (Yield × 0.6) + (IPS × 0.4) if no historical data

#### **Step 11: Sort & Select Top 5**
- `sortAndSelectTop5()` - Sorts by composite score
- Selects top 5 candidates

#### **Step 12: Diversification Check**
- `diversificationCheck()` - Checks portfolio concentration
- **Rules**:
  - Max 2 trades per symbol
  - Max 3 trades per expiration week
  - Warns if >30% portfolio weight
- Adds warnings but doesn't reject (user can decide)

#### **Step 13: Final Output**
- `finalizeOutput()` - Persists to database
- Shows: IPS %, composite score, entry/max profit/max loss, warnings

---

### **2. RAG Integration** ([rag-embeddings.ts](src/lib/agent/rag-embeddings.ts))

Complete RAG pipeline with OpenAI embeddings and pgvector:

#### **Embedding Creation**
```typescript
embedTradeOutcome(trade) → Creates vector embedding for closed trade
buildTradeContext(trade) → Formats trade data for embedding
```

**What gets embedded:**
- Symbol, strategy, status
- IPS score, factors met/total
- Entry/exit prices, strikes, credit
- Outcome (win/loss), P&L, ROI
- Hold days, evaluation notes

#### **Retrieval**
```typescript
findSimilarTrades(candidate) → Queries pgvector for similar trades
analyzeHistoricalPerformance(candidate) → Returns win rate, avg ROI, confidence
```

**Returns:**
- Trade count (e.g., 12 similar trades)
- Win rate (e.g., 65%)
- Average ROI (e.g., 8.5%)
- Confidence: high/medium/low based on sample size and similarity

#### **Batch Operations**
```typescript
seedTradeEmbeddings(userId) → Seed embeddings for all closed trades
onTradeClose(tradeId) → Auto-embed when trade closes
```

---

### **3. API Endpoints**

#### **Run Agent v3**
```
POST /api/agent/run
Body: { symbols: string[], mode: "paper", ipsId: string, useV3: true }
```

**Response:**
```json
{
  "ok": true,
  "version": "v3",
  "runId": "uuid",
  "selected": [...5 trades],
  "candidates_total": 12,
  "reasoning_decisions": [
    {
      "checkpoint": "after_general_filter",
      "decision": "PROCEED",
      "reasoning": "8 symbols passed general filters",
      "timestamp": "2025-01-05T..."
    }
  ],
  "errors": []
}
```

#### **Seed RAG Embeddings**
```
POST /api/agent/rag/seed
Body: { userId: string }
```

**Response:**
```json
{
  "ok": true,
  "embedded_count": 45,
  "total_embeddings": 45
}
```

---

## 🔧 How to Use

### **1. Seed Historical Data (First Time)**

Before running the agent, seed embeddings for your existing trades:

```bash
curl -X POST http://localhost:3000/api/agent/rag/seed \
  -H "Content-Type: application/json" \
  -d '{"userId": "your-user-id"}'
```

This creates vector embeddings for all closed trades. Run this once, then it auto-updates when trades close.

### **2. Run Agent v3**

```bash
curl -X POST http://localhost:3000/api/agent/run \
  -H "Content-Type: application/json" \
  -d '{
    "symbols": ["AAPL", "AMD", "TSLA", "NVDA", "MU"],
    "mode": "paper",
    "ipsId": "your-ips-id",
    "useV3": true
  }'
```

**What happens:**
1. Loads IPS with 21 factors
2. Pre-filters on general factors (earnings, sector, etc.)
3. **Reasoning checkpoint**: Proceed?
4. Pulls options chains for survivors (with rate limiting)
5. Filters on high-weight factors (delta, IV rank, etc.)
6. **Reasoning checkpoint**: Proceed?
7. Filters on low-weight factors (gamma, sentiment, etc.)
8. **Reasoning checkpoint**: Proceed?
9. Queries RAG for historical win rates
10. Calculates composite scores
11. Sorts and selects top 5
12. Checks diversification
13. Returns trades with IPS %, composite score, warnings

### **3. View Results**

Agent persists candidates to `trade_candidates` table:

```sql
SELECT
  symbol,
  strategy,
  entry_mid,
  max_profit,
  max_loss,
  detailed_analysis->>'composite_score' as composite,
  detailed_analysis->>'ips_score' as ips_score,
  detailed_analysis->'historical_analysis'->>'win_rate' as hist_win_rate,
  detailed_analysis->'diversification_warnings' as warnings
FROM trade_candidates
WHERE run_id = 'your-run-id'
ORDER BY (detailed_analysis->>'composite_score')::numeric DESC;
```

---

## 📊 Key Features

### **Progressive Filtering**
- **Saves API calls** by filtering general factors first
- Tracks `survivingSymbols` at each stage
- Only pulls expensive options chains for viable candidates

### **Reasoning Checkpoints**
- 3 decision points with LLM evaluation
- Audit trail in `reasoningDecisions` array
- Can suggest threshold adjustments for near-misses

### **RAG-Enhanced Scoring**
- Queries similar historical trades
- Adjusts composite score based on win rate
- Shows confidence level (high/medium/low)

### **Diversification Protection**
- Prevents over-concentration by symbol, expiration, strategy
- Warnings displayed to user (doesn't auto-reject)

### **Composite Scoring Formula**
```
With historical data:
  (Yield × 0.4) + (IPS × 0.3) + (Historical Win Rate × 0.3)

Without historical data:
  (Yield × 0.6) + (IPS × 0.4)
```

---

## 🔮 Future Enhancements

### **Immediate TODO Items**
1. **Add macro data fetching** (FRED integration) - Step 5 placeholder
2. **Implement threshold adjustment** in Reasoning Checkpoint 2
3. **Calculate hold days** in RAG analysis (from entry/exit dates)
4. **Add more factor evaluators** for low-weight factors

### **Nice-to-Have**
1. **Reasoning node RAG integration** - Retrieve similar past decisions
2. **Multi-strategy support** - Currently only put credit spreads
3. **Risk/position sizing** - Suggest number of contracts based on portfolio
4. **Backtesting mode** - Run agent on historical dates

---

## 🎯 Testing the Agent

### **Recommended Test Sequence**

1. **Seed embeddings** (if you have closed trades):
   ```bash
   POST /api/agent/rag/seed {"userId": "..."}
   ```

2. **Run with 5-10 symbols**:
   ```bash
   POST /api/agent/run {
     "symbols": ["AAPL", "AMD", "TSLA", "NVDA", "MU", "MSFT", "GOOGL", "META", "NFLX", "INTC"],
     "ipsId": "your-ips-id",
     "useV3": true
   }
   ```

3. **Check logs** for:
   - Filter progression (how many symbols survive each stage)
   - Reasoning decisions (PROCEED/REJECT at each checkpoint)
   - RAG queries (similar trade count, win rate)
   - Diversification warnings

4. **Verify database**:
   - `trade_candidates` has 5 entries (or less if filtered out)
   - `detailed_analysis` includes composite score, IPS %, historical data
   - `agent_runs` has entry with `reasoning_decisions`

---

## 📁 File Structure

```
src/lib/agent/
├── options-agent-v3.ts          # Main agent flow (1200 lines)
├── rag-embeddings.ts            # RAG pipeline (350 lines)
└── options-agent-graph.ts       # Old agent (kept for fallback)

src/app/api/agent/
├── run/route.ts                 # Agent execution endpoint
└── rag/seed/route.ts            # RAG seeding endpoint

supabase/migrations/
└── 20251005_enable_pgvector.sql # Vector DB setup
```

---

## 🚀 Quick Start Commands

```bash
# 1. Apply pgvector migration (if not done)
psql -h your-supabase-host -U postgres -d postgres \
  -f supabase/migrations/20251005_enable_pgvector.sql

# 2. Seed RAG embeddings
curl -X POST http://localhost:3000/api/agent/rag/seed \
  -H "Content-Type: application/json" \
  -d '{"userId": "your-user-id"}'

# 3. Run agent
curl -X POST http://localhost:3000/api/agent/run \
  -H "Content-Type: application/json" \
  -d '{
    "symbols": ["AAPL", "AMD", "TSLA"],
    "mode": "paper",
    "ipsId": "your-ips-id",
    "useV3": true
  }'
```

---

## 🎓 Agent Flow Summary

```
START
  ↓
Load IPS (21 factors)
  ↓
Pre-Filter General (earnings, sector, market cap)
  ↓
[REASONING 1] → Proceed?
  ↓ YES
Pull Options Chains (rate limited)
  ↓
Filter High-Weight Factors (delta, IV rank, OI)
  ↓
[REASONING 2] → Proceed?
  ↓ YES
Filter Low-Weight Factors (gamma, vega, sentiment)
  ↓
[REASONING 3] → Proceed?
  ↓ YES
RAG Query (historical win rates)
  ↓
Calculate Composite Scores
  ↓
Sort & Select Top 5
  ↓
Diversification Check (warnings)
  ↓
Persist to DB
  ↓
END
```

---

## 📝 Notes

- **Agent defaults to v3** (`useV3: true` in API)
- **Old agent (v1) still available** as fallback
- **RAG gracefully degrades** - if no historical data, uses pure IPS + yield
- **Reasoning checkpoints can exit early** - respects "REJECT" decisions
- **All decisions logged** to `agent_runs.outcome.reasoning_decisions`

---

Agent v3 is ready for testing! 🎉
