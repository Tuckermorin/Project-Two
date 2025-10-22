# Phase 4: Agent Integration with AI-Enhanced Evaluations

## Overview

Integrate the AI-Enhanced Trading System (Phase 3 with live intelligence) into the Options Trading Agent (V3) to enable:
- Progressive AI/IPS weighting based on data availability
- Live news sentiment in trade selection
- Composite scoring (IPS + AI) for better recommendations
- Full evaluation tracking with explainability

## Current Agent Flow (V3)

```
1. Watchlist Validation
2. IPS Loading
3. Macro Data Fetching
4. Pre-Filter (chain-independent factors)
5. Options Chain Fetching
6. Generate Candidates (put credit spreads)
7. Filter by High-Weight Factors
8. Calculate IPS Scores (0-100)
9. Sort by IPS Score
10. Apply Diversity Filters
11. Select Top N (tiered selection)
11.5. Generate AI Rationales (GPT-4 summaries)
12. Diversification Check
13. Finalize Output
```

**Current Scoring:** IPS-only (0-100)
**Current AI Usage:** Post-hoc rationale generation only
**Current Data:** Cached external intelligence, no live news

## Phase 4 Integration Points

### Integration Point 1: After Step 11 (Tiered Selection)

**Where:** `sortAndSelectTiered()` → after selecting top candidates
**What:** Replace AI rationale generation with full AI evaluation
**Why:** Get composite scores before final ranking

### Integration Point 2: New Step 11.5 (AI-Enhanced Evaluation)

**Replace:** `generateTradeRationales()`
**With:** `evaluateTradesWithAI()`

**New Flow:**
```typescript
async function evaluateTradesWithAI(state: AgentState): Promise<Partial<AgentState>> {
  // For each selected candidate:
  // 1. Convert to TradeCandidate format
  // 2. Call getEnhancedTradeRecommendationService()
  // 3. Get enriched context with live news
  // 4. Get AI evaluation with progressive weighting
  // 5. Update candidate with composite_score, ai_score, etc.
  // 6. Save to ai_trade_evaluations table
}
```

### Integration Point 3: Re-Rank by Composite Score

**After AI evaluation:**
- Re-sort candidates by `composite_score` instead of just `ips_score`
- This allows AI to influence final ranking when it has high confidence

## Implementation Strategy

### Option A: Full Integration (Recommended)

**Pros:**
- Uses best available scoring (IPS + AI composite)
- Leverages all Phase 3 work (live news, progressive weighting)
- Provides explainability for each recommendation
- Tracks evaluations for learning

**Cons:**
- Requires OpenAI API calls (cost)
- Slower (GPT-4 takes ~2-5s per trade)
- Need to handle API failures gracefully

**Implementation:**
1. Add `evaluateTradesWithAI()` step after tiered selection
2. Batch process candidates (3-5 at a time to manage rate limits)
3. Update candidates with composite scores
4. Re-sort by composite score
5. Save evaluations to database

### Option B: Hybrid (IPS Primary, AI Secondary)

**Pros:**
- Faster (only evaluate top IPS candidates)
- Lower cost
- Graceful degradation if AI fails

**Cons:**
- Doesn't fully utilize Phase 3 capabilities
- AI only validates IPS selections, doesn't influence them

**Implementation:**
1. Use IPS scoring for initial filtering (current behavior)
2. Run AI evaluation on top 10-20 candidates only
3. Use composite score to re-rank within that subset
4. Fall back to IPS-only if AI fails

### Option C: Parallel Scoring (Best of Both)

**Pros:**
- IPS and AI run independently
- Can compare IPS-only vs AI-enhanced results
- Shows value of AI clearly

**Cons:**
- More complex
- Duplicates some logic

**Implementation:**
1. Keep current IPS flow intact
2. Run AI evaluation in parallel on same candidates
3. Present both rankings to user
4. Let user toggle between IPS-only and AI-enhanced

## Recommended Approach: **Option A (Full Integration)**

### Detailed Implementation

#### Step 1: Create AI Evaluation Step

**File:** `src/lib/agent/options-agent-v3.ts`

```typescript
// ============================================================================
// STEP 11.5: AI-Enhanced Trade Evaluation
// ============================================================================

async function evaluateTradesWithAI(state: AgentState): Promise<Partial<AgentState>> {
  console.log(`[AIEvaluation] Evaluating ${state.selected.length} trades with AI`);

  const { getEnhancedTradeRecommendationService } = await import('../services/enhanced-trade-recommendation-service');
  const recommendationService = getEnhancedTradeRecommendationService();

  const evaluatedTrades: any[] = [];
  const batchSize = 3; // Process 3 at a time to manage rate limits

  for (let i = 0; i < state.selected.length; i += batchSize) {
    const batch = state.selected.slice(i, i + batchSize);

    const batchResults = await Promise.all(
      batch.map(async (candidate) => {
        try {
          // Convert agent candidate to TradeCandidate format
          const tradeCandidate = convertToTradeCandidate(candidate);

          // Get AI-enhanced evaluation with live news
          const evaluation = await recommendationService.getRecommendation({
            candidate: tradeCandidate,
            ips_id: state.ipsId!,
            user_id: 'agent-run', // Or get from context
            options: {
              save_evaluation: true, // Save to database
              include_live_news: true,
              include_external_intelligence: true,
              include_internal_rag: false, // Skip for speed
              include_tavily: false, // Skip for speed
            },
          });

          // Merge AI evaluation results into candidate
          return {
            ...candidate,
            composite_score: evaluation.weighted_score.composite_score,
            ai_score: evaluation.ai_evaluation.ai_score,
            ai_recommendation: evaluation.final_recommendation,
            ai_confidence: evaluation.ai_evaluation.confidence,
            ips_weight: evaluation.weighted_score.ips_weight,
            ai_weight: evaluation.weighted_score.ai_weight,
            weighting_rationale: evaluation.weighted_score.weighting_rationale,
            ai_rationale: evaluation.explainability.decision_breakdown,
            live_news_sentiment: evaluation.enriched_context.live_market_intelligence?.news_sentiment?.aggregate_sentiment,
            data_quality: evaluation.enriched_context.data_quality,
          };
        } catch (error: any) {
          console.error(`[AIEvaluation] Failed to evaluate ${candidate.symbol}:`, error.message);
          // Fall back to IPS-only scoring
          return {
            ...candidate,
            composite_score: candidate.ips_score,
            ai_score: null,
            ai_recommendation: 'unavailable',
            ai_confidence: 'low',
          };
        }
      })
    );

    evaluatedTrades.push(...batchResults);
  }

  // Re-sort by composite score (IPS + AI weighted)
  evaluatedTrades.sort((a, b) => (b.composite_score || 0) - (a.composite_score || 0));

  console.log(`[AIEvaluation] Completed AI evaluation`);
  console.log(`  Top composite score: ${evaluatedTrades[0]?.composite_score?.toFixed(2) || 'N/A'}`);
  console.log(`  Average weighting: ${Math.round((evaluatedTrades[0]?.ips_weight || 0.5) * 100)}/${Math.round((evaluatedTrades[0]?.ai_weight || 0.5) * 100)} (IPS/AI)`);

  return {
    selected: evaluatedTrades,
  };
}

function convertToTradeCandidate(agentCandidate: any): TradeCandidate {
  const shortLeg = agentCandidate.contract_legs?.find((l: any) => l.type === 'SELL');
  const longLeg = agentCandidate.contract_legs?.find((l: any) => l.type === 'BUY');

  return {
    symbol: agentCandidate.symbol,
    strategy_type: 'put_credit_spread',
    short_strike: shortLeg?.strike || 0,
    long_strike: longLeg?.strike || 0,
    contract_type: 'put',
    expiration_date: shortLeg?.expiry || '',
    dte: calculateDTE(shortLeg?.expiry || ''),
    credit_received: agentCandidate.entry_mid || 0,
    delta: Math.abs(shortLeg?.delta || 0),
    iv_rank: agentCandidate.iv_rank || 0,
    estimated_pop: agentCandidate.estimated_pop || 0,
    composite_score: 0,
    yield_score: 0,
    ips_score: agentCandidate.ips_score || 0,
  };
}
```

#### Step 2: Update Agent Graph

**Replace** `generateTradeRationales` with `evaluateTradesWithAI` in the workflow.

**Before:**
```typescript
.addNode("generateRationales", generateTradeRationales)
```

**After:**
```typescript
.addNode("evaluateWithAI", evaluateTradesWithAI)
```

#### Step 3: Update Agent Config

Add AI evaluation config:

```typescript
export const AGENT_CONFIG = {
  // ... existing config
  ai_evaluation: {
    enabled: true,
    batch_size: 3,
    include_live_news: true,
    include_external_intelligence: true,
    include_internal_rag: false,
    include_tavily: false,
    fallback_to_ips_on_error: true,
  },
};
```

#### Step 4: Update UI to Show AI Data

**In trades table/cards, show:**
- Composite Score (instead of just IPS score)
- Weighting (e.g., "50/50 IPS/AI" or "30/70 IPS/AI")
- AI Recommendation badge
- Live News Sentiment indicator
- Data Quality indicator

## Benefits of Phase 4

1. **Better Trade Selection:** Composite scoring combines rule-based IPS with AI analysis
2. **Live Market Awareness:** Trades are evaluated against current news/sentiment
3. **Progressive Weighting:** AI weight increases with data availability
4. **Full Explainability:** Each trade has detailed reasoning
5. **Learning System:** All evaluations tracked for continuous improvement
6. **Graceful Degradation:** Falls back to IPS-only if AI fails

## Testing Strategy

### Test 1: Single Stock with Live News

```bash
# Run agent on NVDA (has lots of news)
POST /api/agent/run
{
  "symbols": ["NVDA"],
  "ipsId": "your-ips-id",
  "mode": "paper"
}

# Check:
# - Live news fetched (50 articles)
# - AI evaluation completed
# - Composite score used for ranking
# - Weighting shown (likely 50/50 or 30/70 if high data)
```

### Test 2: Multi-Stock Watchlist

```bash
# Run agent on diverse watchlist
POST /api/agent/run
{
  "symbols": ["NVDA", "AMD", "AAPL", "TSLA", "MSFT"],
  "ipsId": "your-ips-id",
  "mode": "paper"
}

# Check:
# - All stocks get AI evaluation
# - Composite scores vary based on news/data quality
# - Progressive weighting works (different per stock)
```

### Test 3: Database Verification

```sql
-- Check evaluations were saved
SELECT
  symbol,
  final_recommendation,
  composite_score,
  ips_weight,
  ai_weight,
  created_at
FROM ai_trade_evaluations
ORDER BY created_at DESC
LIMIT 10;

-- Check evaluation context includes live news
SELECT
  symbol,
  evaluation_context->'enriched_context'->'live_market_intelligence'->'news_sentiment'->'aggregate_sentiment'->>'article_count' as articles,
  evaluation_context->'enriched_context'->'data_quality'->>'has_live_news' as has_live_news
FROM ai_trade_evaluations
ORDER BY created_at DESC
LIMIT 5;
```

## Performance Considerations

**Timing:**
- IPS filtering: ~2-5s
- Options chain fetching: ~10-30s (parallel)
- AI evaluation (20 trades @ 3s each): ~20-25s (batched)
- **Total: ~35-60s** for full agent run with AI

**Cost:**
- GPT-4 Turbo: ~$0.01 per 1K tokens
- Average evaluation: ~3K tokens input, 500 tokens output = ~$0.035 per trade
- 20 trades: ~$0.70 per agent run
- Monthly (30 runs): ~$21/month

**Optimization:**
- Cache live news (5-min TTL) to reduce API calls
- Batch AI evaluations (3-5 at a time)
- Skip Tavily and internal RAG for speed
- Only evaluate top N candidates

## Rollout Plan

1. **Deploy Phase 4 behind feature flag**
2. **Test with single IPS user**
3. **Compare IPS-only vs AI-enhanced results**
4. **Measure performance improvements**
5. **Gradually enable for all users**
6. **Monitor costs and performance**

## Success Metrics

- [ ] Agent successfully fetches live news for all symbols
- [ ] AI evaluations complete without errors
- [ ] Composite scores improve trade selection quality
- [ ] Progressive weighting adjusts appropriately
- [ ] Evaluations saved to database
- [ ] User can see AI reasoning in UI
- [ ] Actual trade outcomes tracked against recommendations
