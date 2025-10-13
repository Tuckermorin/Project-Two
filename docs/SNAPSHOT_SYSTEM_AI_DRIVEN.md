# AI-Driven Trade Snapshots System

## Philosophy

**No Hard-Coded Thresholds. Pure Data Collection. AI Pattern Discovery.**

This system captures comprehensive temporal data throughout a trade's lifecycle and lets the AI agent discover patterns organically. We don't pre-define what "high delta" means or when to exit - the AI learns from actual outcomes.

## What Gets Captured

### Every Snapshot Includes:

1. **All IPS Factor Values** - Complete state of every factor in the IPS configuration
2. **Market Data** - Stock price, volume, fundamentals, sector performance
3. **Options Greeks** - Delta, theta, vega, gamma, rho for both legs
4. **P&L State** - Unrealized P&L, days in trade, days to expiration
5. **IV Metrics** - IV rank, IV percentile, historical volatility
6. **Market Context** - SPY, VIX, sector ETF performance
7. **Raw Data** - Complete options chain data, fundamentals, trade state

### Example Snapshot Data Structure:

```json
{
  "snapshot_time": "2025-10-08T16:00:00Z",
  "current_stock_price": 145.23,
  "delta_spread": 0.38,
  "unrealized_pnl_percent": 42,

  "ips_factor_data": {
    "pe_ratio": { "value": 18.5, "weight": 15, "threshold": 20, "direction": "below" },
    "iv_rank": { "value": 68, "weight": 25, "threshold": 50, "direction": "above" },
    "revenue_growth": { "value": 12.3, "weight": 10, "threshold": 10, "direction": "above" },
    "beta": { "value": 1.2, "weight": 5, "threshold": 1.5, "direction": "below" },
    ... // All configured IPS factors
  },

  "raw_data": {
    "stock_data": {
      "fundamentals": { /* complete fundamentals */ },
      "volume": 5432100,
      "previous_close": 144.80
    },
    "options_data": {
      "short_leg": { /* complete options data with greeks */ },
      "long_leg": { /* complete options data with greeks */ }
    }
  }
}
```

## How the AI Learns

### 1. **Vector Embeddings**
All snapshots are embedded with their outcome (for closed trades):
```
"Snapshot: NVDA at day 5, delta 0.25, P&L +45%, IV Rank 68, all IPS factors..."
"Outcome: Loss (-35%)"
```

The AI can then query: "Show me similar situations" and see what happened.

### 2. **Temporal Pattern Recognition**
The AI analyzes sequences:
- "When delta went from 0.15 → 0.25 → 0.42, what happened next?"
- "When P&L peaked at 60% then dropped, what was the final outcome?"
- "What IPS factors correlated with successful exits?"

### 3. **No Pre-Judgment**
We don't tell the AI that delta > 0.40 is bad. Instead:
- Capture: "Delta reached 0.42"
- Outcome: "Trade lost -35%"
- AI learns: "When delta reaches these levels, outcomes tend to be X"

The AI discovers the threshold organically from data.

## Usage

### Automatic Snapshot Capture
```bash
# Daily EOD (via cron)
POST /api/jobs/snapshot-sync
{
  "trigger": "scheduled"
}
```

### Query Snapshot Data
```bash
GET /api/trades/{trade_id}/snapshot?limit=50
```

Returns complete temporal history with all IPS factors at each point.

### AI Analysis
The AI agent can:
1. **Query similar snapshots** - "Find trades with similar characteristics"
2. **Analyze outcomes** - "When these conditions occurred, what happened?"
3. **Discover patterns** - "What factors best predicted wins vs losses?"

## Database Schema

### trade_snapshots
```sql
CREATE TABLE trade_snapshots (
  -- Greeks, P&L, IV metrics (same as before)
  ...

  -- IPS Factor Data (NEW)
  ips_factor_data JSONB,  -- All IPS factors at snapshot time

  -- Raw Data (NEW)
  raw_data JSONB  -- Complete market/options data for AI
);
```

### Indexes for AI Queries
```sql
-- Vector similarity search
CREATE INDEX ON trade_snapshot_embeddings USING hnsw (embedding vector_cosine_ops);

-- JSONB queries on IPS factors
CREATE INDEX ON trade_snapshots USING gin (ips_factor_data);
CREATE INDEX ON trade_snapshots USING gin (raw_data);
```

## AI Agent Integration

### Example: Evaluate Current Trade

```typescript
import { findSimilarSnapshots } from '@/lib/agent/rag-embeddings';

// Current trade state
const currentSnapshot = await captureSnapshot(tradeId);

// Find similar historical situations
const similarSnapshots = await findSimilarSnapshots(currentSnapshot, {
  onlyWithOutcomes: true,  // Only closed trades
  matchThreshold: 0.85
});

// AI sees:
// - 15 similar situations found
// - 12 resulted in losses
// - Common pattern: delta increased, IV rank dropped
// - Recommendation: Consider exiting
```

### Example: Post-Mortem Analysis

```typescript
const postMortem = await analyzeTradePostMortem(tradeId);

// Now includes:
{
  "snapshot_analysis": {
    "behavioral_flags": [
      "Peaked at 68% profit, closed as loss",  // Fact, not judgment
      "Max delta reached: 0.42",               // Fact, not judgment
      "P&L range: 85% (peak: 68%, low: -17%)" // Fact, not judgment
    ],
    "critical_moments": [
      { "description": "Peak profit: 68%", "delta": 0.18 },
      { "description": "Max delta: 0.42", "pnl_percent": -15 },
      { "description": "Turning point: +42% to -10%", "delta": 0.35 }
    ]
  }
}
```

The AI agent analyzes these facts and makes its own conclusions.

## What's Different From Before

### ❌ Before (Hard-Coded):
```typescript
if (delta > 0.40) {
  flags.push("HIGH DELTA RISK");
  recommendation = "EXIT NOW";
}
```

### ✅ Now (AI-Driven):
```typescript
// Just capture the data
snapshot.delta_spread = 0.42;
snapshot.ips_factor_data = { /* all factors */ };

// Let AI analyze
const similar = await findSimilarSnapshots(snapshot);
// AI: "In 15 similar situations, 80% resulted in losses"
// AI: "Common pattern: IV rank dropped 15+ points"
// AI: "Recommendation: Based on historical data, consider exiting"
```

## Query Examples

### Get All Snapshot Data for Analysis
```sql
SELECT
  s.*,
  t.symbol,
  t.realized_pl_percent,
  t.status
FROM trade_snapshots s
JOIN trades t ON t.id = s.trade_id
WHERE t.status = 'closed'
  AND s.ips_factor_data IS NOT NULL
ORDER BY s.snapshot_time;
```

### Find Trades with Specific IPS Factor Values
```sql
SELECT
  symbol,
  snapshot_time,
  delta_spread,
  unrealized_pnl_percent,
  ips_factor_data->>'iv_rank' as iv_rank
FROM trade_snapshots
WHERE (ips_factor_data->>'iv_rank')::numeric > 70
  AND delta_spread > 0.30;
```

### Pattern Discovery (AI does this automatically)
```sql
WITH snapshot_outcomes AS (
  SELECT
    s.*,
    t.realized_pl_percent > 0 as win
  FROM trade_snapshots s
  JOIN trades t ON t.id = s.trade_id
  WHERE t.status = 'closed'
)
SELECT
  CASE
    WHEN delta_spread < 0.20 THEN '0-0.20'
    WHEN delta_spread < 0.30 THEN '0.20-0.30'
    WHEN delta_spread < 0.40 THEN '0.30-0.40'
    ELSE '0.40+'
  END as delta_range,
  COUNT(*) as total,
  SUM(CASE WHEN win THEN 1 ELSE 0 END) as wins,
  ROUND(100.0 * SUM(CASE WHEN win THEN 1 ELSE 0 END) / COUNT(*), 1) as win_rate
FROM snapshot_outcomes
GROUP BY delta_range
ORDER BY delta_range;
```

## Benefits

1. **Adaptive Learning** - As market conditions change, patterns evolve
2. **No Bias** - We don't impose our assumptions on what matters
3. **Comprehensive** - Every IPS factor is tracked, not just "important" ones
4. **Explainable** - AI can show which factors led to its conclusions
5. **Continuous Improvement** - More data = better patterns

## Future: Let AI Define Exit Rules

Instead of:
```typescript
if (delta > 0.40 || pnl < -50) {
  exitTrade();
}
```

The AI will learn:
```typescript
const exitRecommendation = await agent.analyzeExitSignals(currentSnapshot);

if (exitRecommendation.confidence > 0.85) {
  // AI: "Based on 50 similar situations, 90% exited in loss when held"
  // AI: "Key factors: delta=0.38, IV dropped 20 points, sector down 3%"
  exitTrade();
}
```

---

**Philosophy**: Capture everything. Let AI discover what matters.

**Result**: Smarter, adaptive trading decisions based on actual historical outcomes, not pre-conceived rules.

