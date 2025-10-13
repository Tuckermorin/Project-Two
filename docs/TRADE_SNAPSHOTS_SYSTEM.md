# Trade Snapshots System

## Overview

The Trade Snapshots System captures temporal state of trades throughout their lifecycle, enabling the AI agent to learn behavioral patterns beyond simple entry/exit analysis. Instead of only knowing "trade entered at X and exited at Y", the agent can now learn "when delta reached 0.40, 80% of trades hit max loss".

## Architecture

### Core Components

1. **Trade Snapshots Table** (`trade_snapshots`)
   - Captures complete trade state at regular intervals
   - Stores greeks, P&L, IV metrics, risk metrics, and market context
   - Triggered by: scheduled (EOD), significant moves, greek thresholds, manual

2. **Behavioral Metrics** (added to `trades` table)
   - Tracks peak/low points during trade lifecycle
   - `peak_unrealized_pnl`, `max_delta_reached`, `days_at_profit`, etc.
   - Automatically updated via database trigger when snapshots are created

3. **Materialized View** (`trade_behavioral_patterns`)
   - Aggregates snapshot data for fast pattern queries
   - Pre-calculates common patterns (high delta, gave back profits, etc.)
   - Refresh with: `SELECT refresh_behavioral_patterns();`

4. **Snapshot Embeddings** (`trade_snapshot_embeddings`)
   - Vector embeddings of snapshots for semantic search
   - Enables queries like "find similar situations to current trade state"
   - Includes outcome data for closed trades (win/loss)

### Data Flow

```
Active Trade
    ↓
Snapshot Service (captures state)
    ↓
trade_snapshots table
    ↓
    ├─→ Behavioral Metrics Trigger → Updates trades table
    ├─→ RAG Embedding → trade_snapshot_embeddings
    └─→ Materialized View → trade_behavioral_patterns
```

## Key Features

### 1. Temporal Pattern Detection

**Problem Solved**: "When delta > 0.40, what typically happens?"

```typescript
const patternService = getPatternDetectionService();
const analysis = await patternService.analyzeDeltaThreshold(0.40, { user_id });

// Result:
// {
//   win_rate: 20,  // Only 20% recover
//   loss_rate: 80,
//   avg_final_pnl: -45,
//   insight: "When delta reaches 0.40+, 80% hit max loss. Strong exit signal."
// }
```

### 2. Behavioral Flags

Automatically identifies:
- **Gave Back Profits**: Peaked at 60% profit but closed as loss
- **High Delta Risk**: Delta exceeded 0.40 during trade
- **Missed Exit Opportunity**: Was above 50% profit target but didn't close
- **High P&L Volatility**: Extreme swings during trade lifecycle

### 3. Enhanced Post-Mortems

Post-mortem analysis now includes:
- Peak/low P&L during trade
- Critical moments (turning points, max delta, peak profit)
- Behavioral flags that contributed to outcome
- Days spent above profit targets

### 4. AI Learning from Snapshots

The agent can now learn:
- "Trades that reach 50% profit and have delta < 0.20 have 85% win rate"
- "When IV Rank drops 20+ points mid-trade, 75% result in losses"
- "Holding beyond 21 DTE when delta > 0.35 increases loss probability 40%"

## Usage

### 1. Automatic Snapshot Capture (Cron Job)

**Daily EOD Snapshot**:
```bash
# Vercel Cron: Schedule in vercel.json
POST /api/jobs/snapshot-sync
Authorization: Bearer {CRON_SECRET}
Body: { "trigger": "scheduled" }
```

**Response**:
```json
{
  "success": true,
  "snapshots_captured": 12,
  "trigger": "scheduled",
  "timestamp": "2025-10-09T16:00:00Z"
}
```

### 2. Event-Triggered Snapshots

**Monitor for Threshold Breaches**:
```bash
POST /api/trades/monitor-snapshots
Body: {
  "delta_threshold": 0.05,  // Trigger if delta changes by 5%
  "pnl_threshold": 10,      // Trigger if P&L changes by 10%
  "time_threshold_hours": 4 // Trigger if 4+ hours since last snapshot
}
```

### 3. Manual Snapshot for Specific Trade

```bash
POST /api/trades/{trade_id}/snapshot
Body: { "trigger": "manual" }
```

### 4. Pattern Analysis

**Get Common Patterns**:
```bash
GET /api/patterns/analyze?user_id={user_id}
```

**Response**:
```json
{
  "common_patterns": [
    {
      "pattern_description": "Delta ≥ 0.40",
      "win_rate": 18,
      "snapshots_with_outcomes": 25,
      "confidence": "high",
      "insight": "When delta reaches 0.40+, only 18% recover. Strong exit signal."
    },
    {
      "pattern_description": "P&L ≥ 50%",
      "win_rate": 72,
      "snapshots_with_outcomes": 45,
      "confidence": "high",
      "insight": "72% of trades at 50%+ profit close profitably. Safe to hold for max gain."
    }
  ],
  "gave_back_profits": {
    "total_trades": 150,
    "gave_back_count": 12,
    "gave_back_rate": 8,
    "avg_peak_pnl": 65,
    "avg_final_pnl": -15,
    "common_characteristics": [
      "75% reached high delta (>0.40)",
      "Avg 28 days held (theta decay risk)"
    ]
  }
}
```

**Custom Pattern Query**:
```bash
POST /api/patterns/analyze
Body: {
  "user_id": "...",
  "query": {
    "delta_min": 0.30,
    "pnl_min": 25,
    "iv_rank_min": 60
  }
}
```

### 5. Query Snapshot History

```bash
GET /api/trades/{trade_id}/snapshot?limit=50
```

**Response**:
```json
{
  "success": true,
  "snapshots": [
    {
      "snapshot_time": "2025-10-08T16:00:00Z",
      "delta_spread": 0.15,
      "unrealized_pnl_percent": 42,
      "iv_rank": 65,
      "days_in_trade": 5,
      "days_to_expiration": 16,
      "snapshot_trigger": "scheduled"
    }
  ],
  "count": 8
}
```

## Database Schema

### trade_snapshots
```sql
CREATE TABLE trade_snapshots (
  id UUID PRIMARY KEY,
  trade_id UUID REFERENCES trades(id),
  user_id UUID REFERENCES auth.users(id),
  snapshot_time TIMESTAMP DEFAULT NOW(),

  -- Greeks
  delta_short_leg NUMERIC,
  delta_long_leg NUMERIC,
  delta_spread NUMERIC,
  theta NUMERIC,
  gamma NUMERIC,
  vega NUMERIC,

  -- P&L
  unrealized_pnl NUMERIC,
  unrealized_pnl_percent NUMERIC,

  -- IV & Risk
  iv_short_strike NUMERIC,
  iv_rank NUMERIC,
  probability_of_profit NUMERIC,
  probability_itm NUMERIC,

  -- Market Context
  vix_level NUMERIC,
  spy_price NUMERIC,
  sector_performance NUMERIC,

  snapshot_trigger VARCHAR(50) -- 'scheduled', 'significant_move', 'greek_threshold', 'manual'
);
```

### Behavioral Metrics (trades table additions)
```sql
ALTER TABLE trades ADD COLUMN
  peak_unrealized_pnl_percent NUMERIC,
  lowest_unrealized_pnl_percent NUMERIC,
  max_delta_reached NUMERIC,
  days_at_profit INTEGER,
  days_above_50pct_profit INTEGER;
```

## SQL Queries

### Find Trades with High Delta Risk
```sql
SELECT t.symbol, t.realized_pl_percent, t.max_delta_reached
FROM trades t
WHERE t.max_delta_reached > 0.40
  AND t.status = 'closed'
ORDER BY t.max_delta_reached DESC;
```

### Analyze Delta Threshold Pattern
```sql
SELECT * FROM analyze_snapshot_pattern(
  p_user_id := 'your-user-id',
  p_delta_min := 0.40
);
```

### View Pattern Summary
```sql
SELECT * FROM delta_threshold_analysis;
SELECT * FROM exit_timing_analysis;
SELECT * FROM ips_behavioral_validation;
```

### Refresh Materialized View (After New Snapshots)
```sql
SELECT refresh_behavioral_patterns();
```

## AI Agent Integration

### 1. Enhanced Decision Making

When evaluating a new trade, the agent can query:
```typescript
import { findSimilarSnapshots } from '@/lib/agent/rag-embeddings';

const similarSnapshots = await findSimilarSnapshots(currentSnapshot, {
  onlyWithOutcomes: true,  // Only match closed trades
  matchThreshold: 0.85
});

// Agent sees: "In 15 similar situations, 80% resulted in losses when delta > 0.35"
```

### 2. Exit Signal Detection

```typescript
import { getPatternDetectionService } from '@/lib/services/pattern-detection-service';

const deltaPattern = await patternService.analyzeDeltaThreshold(
  currentDelta,
  { user_id, above: true }
);

if (deltaPattern.loss_rate > 75) {
  // Trigger exit recommendation
  console.log(`High risk: ${deltaPattern.insight}`);
}
```

### 3. Post-Mortem with Snapshots

```typescript
import { analyzeTradePostMortem } from '@/lib/agent/trade-postmortem';

const postMortem = await analyzeTradePostMortem(tradeId);

// Now includes snapshot_analysis:
// {
//   peak_pnl_percent: 68,
//   behavioral_flags: ["Gave back profits: peaked at 68% but closed as loss"],
//   critical_moments: [
//     { description: "Peak profit: 68% (exit opportunity)", delta: 0.18 },
//     { description: "Max delta: 0.42 (risk escalation)", pnl_percent: -15 }
//   ]
// }
```

## Performance Considerations

1. **Materialized View Refresh**: Run daily after snapshot capture
   ```sql
   SELECT refresh_behavioral_patterns();
   ```

2. **Snapshot Frequency**:
   - Scheduled: Daily EOD
   - Event-triggered: Only on significant changes (delta ±0.05, P&L ±10%)
   - Avoids excessive data storage

3. **Embedding Strategy**:
   - Only embed snapshots from **closed trades** (with outcomes)
   - Batch embed nightly to avoid rate limits
   - ~100ms delay between embeddings for OpenAI rate limits

4. **Query Optimization**:
   - Use materialized view for aggregated queries
   - Use direct snapshot queries for specific trade analysis
   - Indexes on: trade_id, snapshot_time, delta_spread, unrealized_pnl_percent

## Deployment Checklist

- [x] Run all migrations
- [x] Set up cron job for daily snapshots
- [x] Configure CRON_SECRET in environment
- [x] Enable pgvector extension (for embeddings)
- [x] Set OpenAI API key for embeddings
- [ ] Schedule materialized view refresh (daily after snapshots)
- [ ] Backfill snapshots for existing active trades
- [ ] Embed historical snapshots for closed trades

## Example: Learning from Snapshots

**Before Snapshots** (Entry/Exit Only):
```
Trade NVDA Put Credit Spread
- Entry: $280 IPS 75%
- Exit: -$150 Loss
Agent learns: "NVDA at IPS 75% lost money" ❌ Not actionable
```

**After Snapshots** (Temporal Analysis):
```
Trade NVDA Put Credit Spread
- Entry: $280, IPS 75%, Delta 0.15
- Day 5: Delta 0.25, P&L +45% ✓ Exit opportunity missed
- Day 8: Delta 0.42, P&L -10% ⚠️ High risk signal
- Day 12: Delta 0.55, P&L -35% 🚨 Should have exited
- Exit: Delta 0.62, P&L -53% Loss

Agent learns:
- "When delta > 0.40, 80% hit max loss" ✓
- "Exit at 50% profit when available" ✓
- "Delta 0.42 was the turning point" ✓
```

## Future Enhancements

1. **Real-time Monitoring Dashboard**
   - Live snapshot feed for active trades
   - Visual delta/P&L charts over time
   - Automated alerts on pattern matches

2. **Pattern-Based Auto-Adjustment**
   - Auto-close when reaching high-risk patterns
   - Dynamic stop-loss based on historical patterns
   - Profit-taking automation at optimal points

3. **Comparative Analysis**
   - "Your trade vs. similar historical trades"
   - Percentile ranking (delta, P&L, days held)
   - Expected outcome probability

4. **Machine Learning Integration**
   - Train ML models on snapshot sequences
   - Predict exit outcomes from current state
   - Feature importance analysis (which metrics matter most)

---

**Built with**: PostgreSQL, pgvector, OpenAI Embeddings, Next.js API Routes
**Version**: 1.0.0
**Last Updated**: 2025-10-09
