# Automated Scheduler Guide

Complete guide to running all automated jobs for TenXIV.

---

## Quick Start

### Start All Jobs (Recommended)

Open a terminal and run:

```bash
npx tsx scripts/start-all-schedulers.ts
```

This single command starts **everything**:
- ✅ Spread price updates (every 5 min during market hours)
- ✅ Daily trade monitoring (9 AM EST)
- ✅ Midday trade check (12 PM EST)
- ✅ Auto post-mortems (every hour)
- ✅ Weekly RAG enrichment (Sunday 2 AM)

**Keep this terminal window open** - the scheduler will run until you stop it with `Ctrl+C`.

---

## What Jobs Are Running?

### 1. **Spread Price Updates** 📊
- **When**: Every 5 minutes during market hours (9:30 AM - 4:00 PM EST, Mon-Fri)
- **What**: Updates current spread prices for all active trades
- **Cost**: $0 (uses free Alpha Vantage API)
- **Log example**:
  ```
  [Spread Updater] Updated AAPL: price=$1.25, P/L=$75.00 (25.0%)
  ```

### 2. **Daily Trade Monitoring** 🔍
- **When**: 9:00 AM EST, Monday-Friday
- **What**: Deep research on all active trades (news, analysts, risks)
- **Cost**: ~100 Tavily credits/day (with caching)
- **Log example**:
  ```
  [Daily Monitoring] Monitored 13 trades
  Risk summary: { critical: 0, high: 2, medium: 5, low: 6 }
  ⚠️ 2 URGENT TRADES DETECTED:
    - NVDA: HIGH - Earnings event in 3 days
  ```

### 3. **Midday Trade Check** ⏰
- **When**: 12:00 PM EST, Monday-Friday
- **What**: Quick check for new alerts (uses cached data from morning)
- **Cost**: ~0 credits (uses cache)
- **Log example**:
  ```
  [Midday Check] Checked 13 trades
  Credits used: 0 (cached)
  ✓ All trades in good standing
  ```

### 4. **Auto Post-Mortems** 📝
- **When**: Every hour, 24/7
- **What**: Generates post-mortem analysis for newly closed trades
- **Cost**: ~20-25 credits per closed trade
- **Log example**:
  ```
  [Auto Post-Mortem] Found 2 closed trades
  Generating post-mortem for AAPL...
  ✓ AAPL - WIN (28 credits)
    Key insight: Strong IPS alignment and positive sentiment drove success
  ```

### 5. **Weekly RAG Enrichment** 🧠
- **When**: Sunday at 2:00 AM EST
- **What**: Refreshes knowledge base with latest research for watchlist symbols
- **Cost**: ~60-80 credits per week (with caching)
- **Log example**:
  ```
  [Weekly RAG Enrichment] Enriching 20 symbols
  Results:
    Total credits: 70
    RAG hits: 8 (40.0% cache rate)
    Tavily fetches: 12
  ```

---

## Monthly Cost Estimate

| Job | Frequency | Cost/Run | Monthly Total |
|-----|-----------|----------|---------------|
| Spread updates | 78×/day | $0 | $0 |
| Daily monitoring | 1×/day | 100 credits | 2,200 credits |
| Midday check | 1×/day | 0 credits | 0 credits |
| Post-mortems | ~2×/day | 22 credits | 440 credits |
| Weekly enrichment | 1×/week | 70 credits | 280 credits |
| **TOTAL** | | | **~2,920 credits/month** |

**Budget**: 4,000 credits/month
**Remaining**: ~1,080 credits for manual research/testing

At $0.05/credit: **$146/month** total Tavily cost

---

## Running Individual Jobs

If you only want to run specific schedulers:

### Spread Prices Only
```bash
npx tsx scripts/spread-price-scheduler.ts
```

### Tavily Jobs Only
```bash
# Create a new file: scripts/tavily-scheduler.ts
import dotenv from 'dotenv';
import { startTavilyJobs } from '../src/lib/jobs/tavily-jobs';

dotenv.config();
console.log('Starting Tavily jobs...');
const scheduler = startTavilyJobs();

process.on('SIGINT', () => {
  scheduler.stopAll();
  process.exit(0);
});
```

Then run:
```bash
npx tsx scripts/tavily-scheduler.ts
```

---

## Manual Testing

You can manually trigger any job for testing:

```typescript
// In a Node.js REPL or test script
import { manualTriggers } from './src/lib/jobs/tavily-jobs';

// Test daily monitoring
await manualTriggers.dailyMonitoring();

// Test post-mortem generation
await manualTriggers.autoPostMortem();

// Test RAG enrichment
await manualTriggers.weeklyEnrichment();

// Test midday check
await manualTriggers.middayCheck();
```

Or use the API endpoints:
```bash
# Monitor all trades
curl http://localhost:3000/api/trades/monitor-all

# Enrich RAG
curl -X POST http://localhost:3000/api/agent/rag/enrich

# Check usage
curl http://localhost:3000/api/admin/tavily-usage
```

---

## Production Deployment

### Option 1: Keep Terminal Open (Simple)
Just run `npx tsx scripts/start-all-schedulers.ts` and leave the terminal window open.

**Pros**: Simple, no extra setup
**Cons**: Stops if you close terminal or restart computer

### Option 2: PM2 Process Manager (Recommended)
Install PM2 to keep jobs running in background:

```bash
# Install PM2 globally
npm install -g pm2

# Start scheduler with PM2
pm2 start npx --name "tenxiv-scheduler" -- tsx scripts/start-all-schedulers.ts

# View logs
pm2 logs tenxiv-scheduler

# Stop scheduler
pm2 stop tenxiv-scheduler

# Restart scheduler
pm2 restart tenxiv-scheduler

# Make it auto-start on system reboot
pm2 startup
pm2 save
```

**Pros**: Runs in background, auto-restarts on crashes, persists across reboots
**Cons**: Requires PM2 installation

### Option 3: Windows Service (Advanced)
Convert to a Windows service using `node-windows`:

```bash
npm install -g node-windows
```

Create service script (advanced - ask if you want details).

---

## Monitoring

### Check if Scheduler is Running

Look for these logs in your terminal:
```
[Fri Jan 07 2025 10:15:32 EST] Scheduler active...
```

### View Tavily Usage
```bash
curl http://localhost:3000/api/admin/tavily-usage | jq .data.summary
```

Output:
```json
{
  "total_requests": 247,
  "total_credits_used": 456,
  "estimated_monthly_cost": "$684.00",
  "cache_hit_rate": "52.3%"
}
```

### View Recent Monitoring Results
Check Supabase tables:
- `trade_monitor_cache` - Recent monitoring data
- `trade_postmortems` - Post-mortem analyses

---

## Troubleshooting

### Scheduler not starting
**Error**: `Missing Supabase environment variables`
**Fix**: Make sure `.env` file has:
```
NEXT_PUBLIC_SUPABASE_URL=your-url
SUPABASE_SERVICE_ROLE_KEY=your-key
TAVILY_API_KEY=your-key
OPENAI_API_KEY=your-key
```

### No trades being monitored
**Error**: `No active trades found`
**Fix**: Make sure you have trades with `status='active'` in the `trades` table

### High credit usage
**Issue**: Using more than 150 credits/day
**Fix**:
1. Check cache hit rate: `curl http://localhost:3000/api/admin/tavily-usage`
2. If cache hit rate is low (<40%), something is wrong with caching
3. Check logs for errors like "cache miss" repeatedly

### Jobs not running at scheduled times
**Issue**: Job scheduled for 9 AM but didn't run
**Fix**:
1. Check timezone: Jobs use `America/New_York` timezone
2. Make sure scheduler is running: Look for `[Scheduler active...]` logs
3. Check system time: `date` command should show correct time

---

## Next Steps

1. **Start the scheduler**: `npx tsx scripts/start-all-schedulers.ts`
2. **Let it run for a day** to see logs and verify everything works
3. **Check costs**: Visit `/api/admin/tavily-usage` endpoint daily
4. **Set up PM2** (optional) for production use
5. **Configure alerts** (optional) for critical trade risks

---

## Cron Schedule Reference

For your reference, here's what the cron expressions mean:

| Expression | Meaning |
|------------|---------|
| `*/5 * * * 1-5` | Every 5 minutes, Monday-Friday |
| `0 9 * * 1-5` | 9:00 AM, Monday-Friday |
| `0 12 * * 1-5` | 12:00 PM, Monday-Friday |
| `0 * * * *` | Every hour, every day |
| `0 2 * * 0` | 2:00 AM, Sunday only |

Format: `minute hour day month dayOfWeek`
- minute: 0-59
- hour: 0-23
- day: 1-31
- month: 1-12
- dayOfWeek: 0-6 (0 = Sunday)

---

## Support

If you run into issues:
1. Check logs in the terminal where scheduler is running
2. Check Supabase database for errors
3. Check `/api/admin/tavily-usage` for credit usage
4. Review this guide for troubleshooting tips
