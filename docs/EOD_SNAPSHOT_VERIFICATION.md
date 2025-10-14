# EOD Snapshot Verification Guide

Complete guide for verifying that end-of-day snapshots and AI summaries are captured correctly.

---

## What Gets Captured Daily

### 1. Trade Snapshots (Market Data)
**When**: Throughout the day, triggered by:
- **Scheduled** - Every 4-5 hours during market hours
- **Significant moves** - When delta or P&L changes significantly
- **Greek thresholds** - When position Greeks exceed thresholds
- **Manual** - On-demand captures

**What's captured**:
- Current stock price
- Current spread price (market value)
- Unrealized P&L (dollars and percentage)
- Greeks (Delta, Theta, Vega, Gamma, Rho)
- IV Rank and IV Percentile
- Probability of Profit
- Probability ITM (in the money)
- Days to expiration
- Days in trade
- Market context (SPY, VIX, sector performance)
- All IPS factors that went into the trade decision

**Where stored**: `trade_snapshots` table

### 2. AI Summaries & News (Daily Monitoring)
**When**: 9:00 AM EST, Monday-Friday (scheduled job)

**What's captured**:
- **News articles** - Recent news for each active trade symbol
- **Analyst activity** - Upgrades, downgrades, price targets
- **SEC filings** - Recent regulatory filings
- **Catalysts** - Upcoming earnings, events, dividends
- **AI risk assessment** - ML-generated risk score and level
- **AI summary** - Natural language summary of trade status
- **Sentiment analysis** - News and analyst sentiment scores

**Where stored**: `trade_monitor_cache` table

---

## How to Verify EOD Snapshots

### Quick Check
Run the verification script:
```bash
npx tsx scripts/check-eod-snapshots.ts
```

This will show:
- ✅ Number of snapshots captured today
- 📊 Detailed snapshot data for each trade
- 📰 AI summaries and news data (if monitoring ran)
- ⚠️  Warnings if data is missing

### What You Should See

**Good results**:
```
✅ FOUND 38 SNAPSHOTS TODAY

SNAPSHOTS BY TRIGGER TYPE:
  scheduled: 35
  significant_move: 2
  greek_threshold: 1

📊 AMD - SCHEDULED
   Time: 02:31 PM EST
   Stock Price: $223.19
   Spread Price: $-1.90
   P&L: $2025.00 (642.9%)
   Delta: 1.560
   IV Rank: 45.2
   PoP: 13.4%
   DTE: 2 days

✅ FOUND 15 AI SUMMARIES/NEWS DATA

📰 AMD - AI Summary
   Time: 09:05 AM EST
   Summary: Strong bullish momentum continues. Recent analyst upgrades from...
   Catalysts: 2 found
   Analyst Activity: 3 updates
   News Sentiment: Positive
   Risk Level: Low
   Risk Score: 25/100
```

**Bad results** (no snapshots):
```
❌ NO SNAPSHOTS FOUND FOR TODAY

This could mean:
  1. No active trades in the system
  2. EOD snapshot job has not run yet
  3. Snapshot capture failed (check logs)

Active trades in system: 19
```

**Missing AI data**:
```
❌ NO AI SUMMARIES FOUND FOR TODAY

The daily trade monitoring job may not have run yet.
This job typically runs at 9:00 AM EST on weekdays.
```

---

## How to Manually Trigger Daily Monitoring

If the 9 AM job didn't run or you want to refresh the AI summaries:

```bash
npx tsx scripts/trigger-daily-monitoring.ts
```

This will:
1. Fetch fresh news and analyst data for all active trades
2. Generate AI risk assessments
3. Create daily summaries
4. Cache results for quick access

**Note**: This uses Tavily API credits (~100 credits with caching enabled)

After running, check again:
```bash
npx tsx scripts/check-eod-snapshots.ts
```

You should now see AI summaries populated.

---

## Scheduled Jobs That Create Snapshots

### 1. Spread Price Updates
- **Frequency**: Every 5 minutes during market hours (9:30 AM - 4:00 PM EST)
- **What it does**: Updates spread prices for all active trades
- **Snapshot trigger**: Not directly, but provides data for threshold monitoring

### 2. Daily Trade Monitoring
- **Frequency**: 9:00 AM EST, Monday-Friday
- **What it does**: Deep research on all active trades
- **Creates**: AI summaries and news data in `trade_monitor_cache`
- **Cost**: ~100 Tavily credits/day (with caching)

### 3. Midday Trade Check
- **Frequency**: 12:00 PM EST, Monday-Friday
- **What it does**: Quick check using cached morning data
- **Cost**: ~0 credits (uses cache)

### 4. Market Close Snapshot
- **Frequency**: 4:00 PM EST, Monday-Friday (from market data job)
- **What it does**: Captures final snapshot at market close
- **Snapshot trigger**: `scheduled`

---

## Direct Database Queries

If you want to query the database directly:

### Check today's snapshots
```sql
SELECT
  ts.snapshot_time,
  ts.snapshot_trigger,
  t.symbol,
  t.status,
  ts.current_stock_price,
  ts.current_spread_price,
  ts.unrealized_pnl,
  ts.unrealized_pnl_percent,
  ts.delta_spread,
  ts.probability_of_profit
FROM trade_snapshots ts
JOIN trades t ON ts.trade_id = t.id
WHERE ts.snapshot_time >= CURRENT_DATE
ORDER BY ts.snapshot_time DESC;
```

### Check AI summaries
```sql
SELECT
  tmc.created_at,
  t.symbol,
  tmc.monitor_data->>'ai_summary' as ai_summary,
  tmc.monitor_data->'risk_assessment'->>'level' as risk_level,
  tmc.monitor_data->'risk_assessment'->>'score' as risk_score
FROM trade_monitor_cache tmc
JOIN trades t ON tmc.trade_id = t.id
WHERE tmc.created_at >= CURRENT_DATE
ORDER BY tmc.created_at DESC;
```

### Count snapshots by trigger type
```sql
SELECT
  snapshot_trigger,
  COUNT(*) as count,
  DATE(snapshot_time) as date
FROM trade_snapshots
WHERE snapshot_time >= CURRENT_DATE - INTERVAL '7 days'
GROUP BY snapshot_trigger, DATE(snapshot_time)
ORDER BY date DESC, snapshot_trigger;
```

---

## API Endpoints for Verification

### Check snapshot status
```bash
curl http://localhost:3000/api/trades/monitor-snapshots
```

Returns:
```json
{
  "success": true,
  "active_trades": 19,
  "snapshots_today": 38,
  "last_monitoring_run": {
    "timestamp": "2025-10-14T09:05:23.000Z",
    "status": "success",
    "records_processed": 19
  }
}
```

### Manually trigger snapshot for specific trade
```bash
curl -X POST http://localhost:3000/api/trades/{trade_id}/snapshot \
  -H "Content-Type: application/json" \
  -d '{"trigger": "manual"}'
```

### Trigger monitoring for all trades
```bash
curl -X POST http://localhost:3000/api/trades/monitor-all \
  -H "Content-Type: application/json"
```

---

## Troubleshooting

### No snapshots captured today
**Possible causes**:
1. No active trades in the system
2. Snapshot service not running
3. Market data API failures
4. Database connection issues

**Fix**:
1. Check if scheduler is running: `ps aux | grep tsx`
2. Check logs for errors
3. Verify active trades: Run `check-eod-snapshots.ts`
4. Manually trigger: `npx tsx scripts/trigger-daily-monitoring.ts`

### Snapshots captured but no AI summaries
**Cause**: Daily monitoring job at 9 AM hasn't run

**Fix**:
```bash
npx tsx scripts/trigger-daily-monitoring.ts
```

### AI summaries are stale (from yesterday)
**Cause**: Caching preventing fresh data

**Fix**:
Call monitoring API with `forceRefresh`:
```bash
curl -X POST http://localhost:3000/api/trades/monitor-all \
  -H "Content-Type: application/json" \
  -d '{"forceRefresh": true}'
```

### High Tavily credit usage
**Check usage**:
```bash
curl http://localhost:3000/api/admin/tavily-usage
```

**Optimize**:
- Ensure caching is working (cache hit rate should be >40%)
- Reduce `daysBack` parameter (default is 7 days)
- Check for duplicate monitoring calls

---

## Best Practices

### Daily Routine
1. **Morning (9:00 AM)** - Daily monitoring runs automatically
2. **Market open (9:30 AM)** - First snapshots captured
3. **Midday (12:00 PM)** - Midday check uses cached data
4. **Market close (4:00 PM)** - Final EOD snapshots captured
5. **End of day** - Run verification script

### Weekly Routine
1. **Sunday 2:00 AM** - Weekly RAG enrichment
2. **Monday morning** - Review weekly summary
3. **Check Tavily usage** - Ensure within budget

### Verification Schedule
Run `check-eod-snapshots.ts`:
- After market close daily
- Before making weekend trade decisions
- When reviewing closed trades

---

## Files Reference

### Scripts
- `scripts/check-eod-snapshots.ts` - Verify snapshots and AI data
- `scripts/trigger-daily-monitoring.ts` - Manually run daily monitoring
- `scripts/start-all-schedulers.ts` - Start all automated jobs

### Services
- `src/lib/services/trade-snapshot-service.ts` - Snapshot capture logic
- `src/lib/agent/active-trade-monitor.ts` - AI monitoring and summaries

### Database Tables
- `trade_snapshots` - Temporal snapshots of trade state
- `trade_monitor_cache` - AI summaries and news data
- `trades` - Main trades table

### API Routes
- `/api/trades/monitor-snapshots` - Snapshot monitoring
- `/api/trades/monitor-all` - Trigger monitoring
- `/api/trades/{id}/snapshot` - Single trade snapshot

---

## Summary

To verify EOD snapshots were captured correctly with AI summaries:

```bash
# 1. Check snapshots
npx tsx scripts/check-eod-snapshots.ts

# 2. If missing AI summaries, trigger monitoring
npx tsx scripts/trigger-daily-monitoring.ts

# 3. Verify again
npx tsx scripts/check-eod-snapshots.ts
```

✅ You should see both market data snapshots AND AI summaries/news data.
