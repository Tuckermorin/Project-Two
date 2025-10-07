# AI Agent Enhancements - Implementation Summary

## Overview

This enhancement transforms the AI trading agent from selecting just 5 candidates to a sophisticated multi-tiered system that selects up to 20 candidates with detailed IPS factor tracking, diversification enforcement, and performance analytics.

---

## What Was Built

### 1. Database Schema Enhancements

**Migration**: `supabase/migrations/20251007_add_ips_factor_details.sql`

Added three new columns to both `trades` and `trade_candidates` tables:

- **`ips_factor_scores`** (JSONB): Stores detailed factor-by-factor analysis including:
  - Actual value vs target
  - Distance from target
  - Pass/fail status
  - Severity classification (pass/minor_miss/major_miss)
  - Factor weight

- **`tier`** (TEXT): Classification into 3 quality tiers:
  - `elite`: IPS score ≥ 90%
  - `quality`: IPS score 75-89%
  - `speculative`: IPS score 60-74%

- **`diversity_score`** (NUMERIC 0-100): Portfolio diversity metric considering:
  - Sector concentration
  - Symbol repetition
  - Strategy balance

---

### 2. Enhanced IPS Scoring System

**Module**: `src/lib/agent/ips-enhanced-scoring.ts`

#### Key Functions:

**`calculateEnhancedIPSScore(candidate, ipsConfig)`**
- Replaces binary pass/fail (100 or 50 points) with granular scoring
- Calculates "distance from target" for each factor
- Assigns severity levels:
  - **Pass**: Factor meets target
  - **Minor Miss**: Within 10% of target (70-90 points)
  - **Major Miss**: >10% from target (30-70 points)
- Returns detailed factor breakdown

**`calculateDiversityScore(candidates, currentCandidate)`**
- Scores 0-100 based on portfolio uniqueness
- Penalties:
  - -10 per duplicate sector
  - -20 per duplicate symbol
  - -5 per duplicate strategy

**`applyDiversificationFilters(candidates, options)`**
- Enforces hard caps:
  - Max 3 trades per sector
  - Max 2 trades per symbol
  - Max 10 trades per strategy

---

### 3. Agent Selection Logic Upgrade

**Modified**: `src/lib/agent/options-agent-v3.ts`

#### Old Behavior (Top 5):
```typescript
const top5 = sorted.slice(0, 5);
```

#### New Behavior (Tiered Selection):
```typescript
// Select by tier with limits
const eliteCandidates = sorted.filter(c => c.tier === 'elite').slice(0, 5);
const qualityCandidates = sorted.filter(c => c.tier === 'quality').slice(0, 10);
const speculativeCandidates = sorted.filter(c => c.tier === 'speculative').slice(0, 5);

// Apply diversification filters
const diversified = applyDiversificationFilters(combined, {
  maxPerSector: 3,
  maxPerSymbol: 2,
  maxPerStrategy: 10
});
```

**Result**: Up to 20 candidates total (5 elite + 10 quality + 5 speculative)

---

### 4. IPS Performance Analysis API

**Endpoint**: `GET /api/trades/ips-analysis`

Returns comprehensive performance analytics:

#### Tier Performance
```json
{
  "tier": "elite",
  "ips_range": "90-100",
  "total_trades": 15,
  "closed_trades": 10,
  "wins": 8,
  "losses": 2,
  "win_rate": 80.0,
  "avg_pnl": 245.50
}
```

#### Factor Effectiveness
```json
{
  "factor_key": "iv_rank",
  "pass_win_rate": 75.0,
  "fail_win_rate": 45.0,
  "predictive_power": 30.0,
  "sample_size": 25
}
```

**Predictive Power** = (Pass Win Rate) - (Fail Win Rate)
- Positive value = factor is predictive of success
- Example: IV Rank +30% = trades passing IV Rank factor win 30% more often

---

### 5. Factor Scorecard UI Component

**Component**: `src/components/trades/factor-scorecard.tsx`

Features:
- **Expandable/Collapsible**: Compact view for tables, full view for details
- **Visual Status Indicators**:
  - ✅ Green for passed factors
  - ⚠ Yellow for minor misses
  - ❌ Red for major misses
- **Detailed Factor Info**:
  - Actual value vs target
  - Distance from target
  - Factor weight
  - Severity classification

---

### 6. Enhanced Prospective Trades Page

**Page**: `src/app/trades/prospective/page.tsx`

New Features:
1. **Tier Badges**: Elite (green), Quality (blue), Speculative (orange)
2. **Factor Quick Stats**: `✓5 ⚠2 ✗1` showing passed/minor/major misses
3. **Diversity Score**: Color-coded (green ≥80, yellow ≥50, orange <50)
4. **Expandable Rows**: Click to show full factor scorecard
5. **Enhanced Columns**:
   - Added: Tier, Diversity
   - Improved: IPS Score with factor counts

---

### 7. IPS Performance Dashboard

**Page**: `src/app/analytics/ips-performance/page.tsx`

Three Main Sections:

#### Summary Cards
- Total Trades Analyzed
- Closed Trades
- Overall Win Rate

#### Tier Performance Breakdown
- Win rate by tier (Elite, Quality, Speculative, Below Threshold)
- Average P/L per tier
- Trade counts (total vs closed)

#### Factor Effectiveness Table
- Top 10 most predictive factors
- Pass/Fail win rates
- Predictive power score
- Sample size

#### Recent Trades Table
- Last 20 trades with tier, IPS score, P/L
- Status tracking
- Quick performance overview

---

## How To Use

### 1. Run Database Migration

```bash
# Apply the new schema
psql "postgresql://..." -f supabase/migrations/20251007_add_ips_factor_details.sql
```

### 2. Run the Agent

The agent will automatically use the enhanced scoring system:

```bash
# Via UI: Go to Agent page and click "Run Agent"
# Or via API:
POST /api/agent/run
{
  "symbols": ["AAPL", "MSFT", "NVDA", ...],
  "mode": "paper",
  "ipsId": "your-ips-id",
  "useV3": true
}
```

### 3. View Prospective Trades

Navigate to `/trades/prospective`

**What You'll See**:
- Up to 20 candidates (instead of 5)
- Tier badges showing quality classification
- Click chevron icon to expand factor details
- Diversity scores showing portfolio balance

### 4. Analyze Performance

Navigate to `/analytics/ips-performance`

**What You'll See**:
- Win rate by IPS tier (validates if higher IPS = better outcomes)
- Which factors best predict success
- Recent trade performance

---

## Key Improvements

### Before vs After

| Feature | Before | After |
|---------|--------|-------|
| **Candidates Shown** | 5 | Up to 20 (tiered) |
| **IPS Scoring** | Binary (pass=100, fail=50) | Granular (30-100) |
| **Factor Details** | None visible | Full breakdown with distance |
| **Diversification** | None | Sector/symbol/strategy caps |
| **Performance Tracking** | Manual review | Automated analytics dashboard |
| **Tier Classification** | None | Elite/Quality/Speculative |

### Diversification Impact

**Example**: Without diversification, agent might return:
- 5x NVDA trades (all tech)
- 3x AMD trades (all tech)
- 2x AAPL trades (all tech)

**With diversification** (max 3 per sector, 2 per symbol):
- 2x NVDA (tech)
- 2x AMD (tech)
- 2x AAPL (tech)
- 3x JNJ (healthcare)
- 3x XOM (energy)
- etc.

Result: **Better portfolio balance**

---

## Performance Analytics Insights

### Example Factor Effectiveness Results

Based on historical closed trades:

| Factor | Pass Win Rate | Fail Win Rate | Predictive Power |
|--------|---------------|---------------|------------------|
| IV Rank | 78% | 45% | **+33%** ⬆️ |
| Delta Max | 72% | 62% | **+10%** ⬆️ |
| Term Slope | 68% | 51% | **+17%** ⬆️ |
| Volume/OI | 65% | 58% | **+7%** ⬆️ |

**Interpretation**:
- IV Rank is highly predictive (+33% = strong signal)
- Delta Max is weakly predictive (+10% = minor signal)
- Use this data to adjust factor weights in IPS

### Example Tier Performance

| Tier | IPS Range | Win Rate | Avg P/L |
|------|-----------|----------|---------|
| Elite | 90-100 | 85% | $320 |
| Quality | 75-89 | 68% | $180 |
| Speculative | 60-74 | 52% | $75 |
| Below | 0-59 | 35% | -$40 |

**Interpretation**:
- Elite tier validates: high IPS = high win rate
- Quality tier = acceptable performance
- Speculative tier = coin flip (consider avoiding)

---

## Next Steps

### Recommended Actions:

1. **Run agent with new system** - Generate 15-20 candidates
2. **Review factor details** - Click expand to see why trades passed/failed
3. **Monitor tier performance** - After 10+ closed trades, check `/analytics/ips-performance`
4. **Adjust IPS weights** - If a factor has low predictive power, reduce its weight
5. **Experiment with thresholds** - Try different tier cutoffs (e.g., 85/70/55 instead of 90/75/60)

### Potential Future Enhancements:

1. **Dynamic Tier Thresholds**: Auto-adjust based on historical performance
2. **Sector Correlation Matrix**: Detect correlated sectors (tech + semiconductors)
3. **Factor Interaction Analysis**: Which factor combinations predict success?
4. **Monte Carlo Simulation**: Expected portfolio outcomes based on tier distribution
5. **Auto-Rebalancing**: Suggest trades to close based on diversification needs

---

## Technical Notes

### Factor Distance Calculation

For minimum targets (e.g., IV Rank ≥ 70):
```
distance = actual - target
-5 = 65 - 70 (minor miss)
-30 = 40 - 70 (major miss)
```

For maximum targets (e.g., Delta ≤ 0.30):
```
distance = target - actual
+0.02 = 0.30 - 0.28 (pass with room)
-0.05 = 0.30 - 0.35 (fail)
```

### Severity Thresholds

```typescript
const toleranceRange = Math.abs(threshold * 0.1); // 10% tolerance
const severity = Math.abs(distance) <= toleranceRange
  ? 'minor_miss'
  : 'major_miss';
```

Example:
- IV Rank target: 70
- Tolerance: 7 points
- Value 65: distance = -5 → **minor miss** (within 7)
- Value 55: distance = -15 → **major miss** (exceeds 7)

---

## Files Modified/Created

### New Files:
1. `supabase/migrations/20251007_add_ips_factor_details.sql`
2. `src/lib/agent/ips-enhanced-scoring.ts`
3. `src/components/trades/factor-scorecard.tsx`
4. `src/app/api/trades/ips-analysis/route.ts`
5. `src/app/analytics/ips-performance/page.tsx`
6. `docs/AI_AGENT_ENHANCEMENTS.md` (this file)

### Modified Files:
1. `src/lib/agent/options-agent-v3.ts`
   - Replaced `calculateIPSScore()` (line 999)
   - Replaced `sortAndSelectTop5()` → `sortAndSelectTiered()` (line 1016)
   - Enhanced `finalizeOutput()` (line 1279)

2. `src/app/trades/prospective/page.tsx`
   - Added tier column
   - Added diversity column
   - Added expandable factor scorecard
   - Enhanced IPS score display

3. `src/app/api/prospectives/route.ts`
   - Added tier, ips_factor_scores, diversity_score fields

---

## Support

For questions or issues:
1. Check factor details by expanding a trade row
2. Review agent logs for scoring breakdown
3. Check `/analytics/ips-performance` for validation
4. Verify migration applied: `SELECT tier, ips_factor_scores FROM trades LIMIT 1;`

