# Trade Snapshot System - Setup & Troubleshooting Guide

## Overview

The trade snapshot system captures comprehensive temporal data for all active trades to enable:
- Pattern detection (how trades behave over time)
- Behavioral metrics (peak P&L, days at profit, etc.)
- Risk monitoring (delta thresholds, P&L alerts)
- RAG learning (AI learns from trade lifecycle patterns)

## Architecture

```
Vercel Cron Jobs (vercel.json)
    ├── 2:30 PM EST Mon-Fri → /api/jobs/snapshot-sync (POST)
    ├── 6:00 PM EST Mon-Fri  → /api/jobs/snapshot-sync (POST)
    └── 9:00 PM EST Mon-Fri  → /api/jobs/snapshot-sync (POST)
                                         ↓
                          TradeSnapshotService
                                         ↓
                    Captures for all active trades:
                    - Current stock/spread prices
                    - Greeks (delta, theta, vega, gamma)
                    - P&L (unrealized, percentage)
                    - IV data (IV rank, HV20)
                    - Risk metrics (PoP, break-even)
                    - Market context (SPY, VIX, sector)
                    - All IPS factors (for AI learning)
                                         ↓
                              trade_snapshots table
                              (18 snapshots as of Oct 14, 2025)
```

## Files Involved

### Core Service
- `src/lib/services/trade-snapshot-service.ts` - Main snapshot capture logic (677 lines)
  - `captureSnapshot(tradeId)` - Capture single trade
  - `captureAllActiveSnapshots()` - Capture all active trades
  - `buildSnapshot()` - Fetch market data + Greeks + IPS factors
  - `storeSnapshot()` - Save to database

### API Endpoints
- `src/app/api/jobs/snapshot-sync/route.ts` - Scheduled cron endpoint
  - POST: Requires `Authorization: Bearer ${CRON_SECRET}` (for Vercel cron)
  - GET: No auth required (for manual testing)
- `src/app/api/trades/monitor-snapshots/route.ts` - Threshold-based monitoring
  - Triggers snapshots when delta/P&L thresholds breached
- `src/app/api/trades/[id]/snapshot/route.ts` - Single trade snapshot endpoint

### Database
- `supabase/migrations/20251009_create_trade_snapshots.sql` - Initial schema
- `supabase/migrations/20251010_add_ips_factors_to_snapshots.sql` - IPS factors added

### Configuration
- `vercel.json` - Cron job schedules (3 times daily)
- `.env` - Must include `CRON_SECRET` environment variable

## The Problem (Resolved Oct 14, 2025)

### What Was Wrong
The trade_snapshots table was completely empty (0 rows) despite having:
- ✅ Comprehensive snapshot service implemented
- ✅ Database schema properly migrated
- ✅ Vercel cron jobs configured (3x daily)
- ✅ API endpoints created

### Root Cause
**Missing `CRON_SECRET` environment variable**

1. Vercel cron jobs call `/api/jobs/snapshot-sync` via POST
2. POST endpoint requires: `Authorization: Bearer ${CRON_SECRET}`
3. `CRON_SECRET` was not defined in `.env`
4. All cron job requests returned `401 Unauthorized`
5. No snapshots were ever captured

### The Fix

#### Step 1: Add CRON_SECRET to .env
```bash
# Added to .env (line 60-62)
CRON_SECRET=tenxiv_snapshot_cron_2025_secure_key_v1
```

#### Step 2: Configure in Vercel Project Settings
When deploying to Vercel, add this environment variable:
1. Go to your project in Vercel Dashboard
2. Settings → Environment Variables
3. Add: `CRON_SECRET` = `tenxiv_snapshot_cron_2025_secure_key_v1`
4. Scope: Production, Preview, Development

#### Step 3: Verify Locally
```bash
# Manual test (GET endpoint, no auth required)
curl http://localhost:3000/api/jobs/snapshot-sync

# Expected response:
{
  "success": true,
  "message": "Manual snapshot completed",
  "snapshots_captured": 18,
  "timestamp": "2025-10-14T03:17:36.195Z"
}
```

#### Step 4: Verify in Production (after deploy)
```bash
# Check snapshot count in database
psql -h <supabase-host> -U <user> -d postgres -c "
  SELECT
    COUNT(*) as total_snapshots,
    COUNT(DISTINCT trade_id) as trades_with_snapshots,
    MIN(snapshot_time) as earliest,
    MAX(snapshot_time) as latest
  FROM trade_snapshots;
"

# Expected: Growing number of snapshots (3x per day per active trade)
```

## Snapshot Schedule

### Vercel Cron Jobs (Production)
```json
// vercel.json
{
  "crons": [
    { "path": "/api/jobs/snapshot-sync", "schedule": "30 14 * * 1-5" },  // 2:30 PM EST
    { "path": "/api/jobs/snapshot-sync", "schedule": "0 18 * * 1-5" },   // 6:00 PM EST
    { "path": "/api/jobs/snapshot-sync", "schedule": "0 21 * * 1-5" }    // 9:00 PM EST
  ]
}
```

**Why these times?**
- **2:30 PM EST**: Mid-market snapshot (markets close at 4 PM)
- **6:00 PM EST**: End-of-day snapshot + market context generation
- **9:00 PM EST**: Late-day snapshot (after-hours moves)

### Market Context Generation
- Automatically triggers at 6 PM EST snapshot
- Uses Tavily API to summarize economic/political news
- Stored in `daily_market_context` table
- Used by RAG system for trade recommendations

## What Gets Captured

### For Each Active Trade
```typescript
{
  // Market Data
  current_stock_price: 171.01,
  current_spread_price: 1.95,

  // Greeks
  delta_short_leg: -0.23221,
  delta_long_leg: 2.00000,
  delta_spread: 1.76779,
  theta: -0.12,
  vega: 0.45,
  gamma: 0.008,

  // P&L
  unrealized_pnl: -2722.49,
  unrealized_pnl_percent: -1344.44,  // (Current value > entry credit)
  days_to_expiration: 2,
  days_in_trade: 5,

  // IV & Volatility
  iv_short_strike: 0.42,
  iv_long_strike: 0.38,
  iv_rank: 65,
  iv_percentile: 72,
  hv_20: 38.5,

  // Risk Metrics
  probability_of_profit: 72.5,
  probability_itm: 18.2,
  break_even_price: 109.80,

  // Market Context
  spy_price: 450.12,
  vix_level: 14.2,
  sector_performance: 1.2,  // Tech sector +1.2% today

  // IPS Factors (all 21 factors from your IPS configuration)
  ips_factor_data: {
    iv_rank: { value: 65, weight: 10, threshold: 50, direction: 'above' },
    pe_ratio: { value: 22.5, weight: 8, threshold: 25, direction: 'below' },
    // ... all 21 factors
  },

  // Metadata
  snapshot_trigger: 'scheduled',  // or 'significant_move', 'greek_threshold', 'manual'
  snapshot_time: '2025-10-14T03:17:36.166878Z'
}
```

## Expected Snapshot Volume

### Daily
- **Active trades**: 18 (currently)
- **Snapshots per trade per day**: 3
- **Daily snapshots**: 18 × 3 = **54 snapshots/day**

### Weekly
- **Days**: Mon-Fri = 5 days
- **Weekly snapshots**: 54 × 5 = **270 snapshots/week**

### Monthly
- **Trading days**: ~21 days
- **Monthly snapshots**: 54 × 21 = **1,134 snapshots/month**

### Per Trade Lifecycle
- **Average trade duration**: 7 days
- **Snapshots per trade**: 7 × 3 = **21 snapshots per trade**

## How to Manually Trigger Snapshots

### Option 1: GET Endpoint (Easiest)
```bash
curl http://localhost:3000/api/jobs/snapshot-sync
```

### Option 2: POST Endpoint (With Auth)
```bash
curl -X POST http://localhost:3000/api/jobs/snapshot-sync \
  -H "Authorization: Bearer tenxiv_snapshot_cron_2025_secure_key_v1" \
  -H "Content-Type: application/json" \
  -d '{
    "trigger": "manual",
    "generateMarketContext": false
  }'
```

### Option 3: Single Trade
```bash
curl -X POST http://localhost:3000/api/trades/{trade_id}/snapshot \
  -H "Content-Type: application/json"
```

## Monitoring & Verification

### Check Snapshot Status
```bash
# Get status from API
curl http://localhost:3000/api/trades/monitor-snapshots

# Response:
{
  "success": true,
  "active_trades": 18,
  "snapshots_today": 54,
  "last_monitoring_run": {
    "timestamp": "2025-10-14T18:00:00Z",
    "status": "success",
    "records_processed": 18
  }
}
```

### Query Database Directly
```sql
-- Total snapshots
SELECT COUNT(*) FROM trade_snapshots;

-- Snapshots per trade
SELECT
  t.symbol,
  COUNT(s.id) as snapshot_count,
  MIN(s.snapshot_time) as first_snapshot,
  MAX(s.snapshot_time) as last_snapshot,
  ROUND(EXTRACT(EPOCH FROM (MAX(s.snapshot_time) - MIN(s.snapshot_time))) / 3600) as hours_tracked
FROM trades t
LEFT JOIN trade_snapshots s ON s.trade_id = t.id
WHERE t.status = 'active'
GROUP BY t.id, t.symbol
ORDER BY snapshot_count DESC;

-- Recent snapshots with key metrics
SELECT
  t.symbol,
  s.snapshot_time,
  s.current_stock_price,
  s.unrealized_pnl_percent,
  s.delta_spread,
  s.days_to_expiration,
  s.snapshot_trigger
FROM trade_snapshots s
JOIN trades t ON t.id = s.trade_id
WHERE t.status = 'active'
ORDER BY s.snapshot_time DESC
LIMIT 10;

-- Snapshots by trigger type
SELECT
  snapshot_trigger,
  COUNT(*) as count,
  MIN(snapshot_time) as earliest,
  MAX(snapshot_time) as latest
FROM trade_snapshots
GROUP BY snapshot_trigger
ORDER BY count DESC;
```

## Common Issues & Troubleshooting

### Issue: No snapshots being captured

**Check 1: CRON_SECRET configured?**
```bash
grep CRON_SECRET .env
# Should output: CRON_SECRET=tenxiv_snapshot_cron_2025_secure_key_v1
```

**Check 2: Vercel environment variable set?**
- Go to Vercel Dashboard → Settings → Environment Variables
- Verify `CRON_SECRET` exists for Production

**Check 3: Test manually**
```bash
curl http://localhost:3000/api/jobs/snapshot-sync
# Should return success with snapshots_captured > 0
```

**Check 4: Check Vercel logs**
- Go to Vercel Dashboard → Deployments → Latest → Logs
- Filter by: `/api/jobs/snapshot-sync`
- Look for 401 Unauthorized errors

### Issue: Snapshots captured but missing data

**Check Greek values:**
```sql
SELECT
  COUNT(*) as total_snapshots,
  COUNT(delta_spread) as with_delta,
  COUNT(theta) as with_theta,
  COUNT(iv_short_strike) as with_iv
FROM trade_snapshots;
```

**If Greeks are NULL:**
- Alpha Vantage API might be rate-limited
- Check API key in `.env`: `ALPHA_VANTAGE_API_KEY`
- Verify entitlement: `ALPHA_VANTAGE_ENTITLEMENT=realtime`

### Issue: Cron jobs not running on schedule

**Verify vercel.json syntax:**
```bash
cat vercel.json | grep -A 15 "crons"
```

**Check cron schedule format:**
```
"30 14 * * 1-5" = 2:30 PM EST Mon-Fri
Format: minute hour day month day-of-week
```

**Redeploy to Vercel:**
```bash
git add vercel.json
git commit -m "Update cron schedule"
git push
# Vercel will automatically redeploy
```

## Integration with Other Systems

### RAG System
- `src/lib/agent/rag-embeddings.ts` - `getSnapshotDataForRAG()`
- Snapshots converted to vector embeddings
- Used to find similar historical trade patterns
- Enables AI to learn from past trade behaviors

### Pattern Detection Service
- `src/lib/services/pattern-detection-service.ts`
- Analyzes snapshot sequences to detect patterns:
  - "Trades that hit 50% profit on day 3 tend to reverse"
  - "High delta spreads (>0.40) signal increased risk"
  - "Trades opened when IV rank >70 close profitably 78% of time"

### Behavioral Metrics (Computed)
- `supabase/migrations/20251009_add_behavioral_metrics_to_trades.sql`
- Computed from snapshots:
  - `peak_pnl` - Highest unrealized P&L during trade
  - `peak_pnl_percent` - Highest P&L percentage
  - `peak_pnl_date` - When peak occurred
  - `days_at_profit` - Days with positive unrealized P&L
  - `max_drawdown` - Largest loss during trade lifecycle

## Cost Analysis

### API Calls per Snapshot
- **Stock price**: 1 call (Alpha Vantage)
- **Short leg options**: 1 call (Alpha Vantage)
- **Long leg options**: 1 call (Alpha Vantage)
- **SPY price**: 1 call (Alpha Vantage)
- **VIX level**: 1 call (Alpha Vantage)
- **Sector ETF**: 1 call (Alpha Vantage)
- **IV rank**: 0 calls (cached in database)

**Total per snapshot**: 6 Alpha Vantage calls

### Daily Cost
- **Snapshots**: 54/day
- **API calls**: 54 × 6 = 324 calls/day
- **Alpha Vantage cost**: $0 (unlimited with premium tier)
- **Supabase storage**: ~50KB per snapshot = 2.7MB/day
- **Total daily cost**: **~$0** (negligible)

### Market Context Generation (6 PM snapshot)
- **Tavily searches**: 10 queries × $0.005 = $0.05
- **GPT-4 analysis**: 5,000 tokens × $0.00003/token = $0.15
- **OpenAI embeddings**: 1,000 tokens × $0.00002/token = $0.02
- **Total**: **~$0.22 per day** = **$6.60/month**

### Total System Cost
- **Snapshots**: Free
- **Market context**: $6.60/month
- **Total**: **~$6.60/month**

## Next Steps

1. **Monitor for 1 week** - Verify 3 snapshots/day per trade
2. **Check behavioral metrics** - Should auto-calculate from snapshots
3. **Enable pattern detection** - Once 50+ snapshots accumulated
4. **Configure alerts** - Set up notifications for risk thresholds
5. **Review Reddit sentiment integration** - Currently not being called correctly

## Status (Oct 14, 2025)

✅ **FIXED**: Snapshot system now working
- 18 snapshots captured manually (test successful)
- CRON_SECRET configured in `.env`
- Vercel cron jobs will run on next scheduled time (2:30 PM EST tomorrow)
- Database schema verified and matches service expectations
- All active trades (18) have initial snapshots

⏳ **PENDING**: First automated cron run
- Next scheduled: Oct 14, 2025 @ 2:30 PM EST
- Expected: 18 new snapshots (one per active trade)
- Monitor Vercel logs for confirmation

🔍 **NEEDS REVIEW**: Reddit sentiment
- `reddit_sentiment` table has 86 rows but mostly zeros
- Not being called correctly or integrated with snapshot system
- Separate investigation needed (per user's earlier comments)
