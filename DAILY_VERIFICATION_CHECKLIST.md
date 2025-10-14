# Daily Verification Checklist

Quick reference for verifying your automated trading system is working correctly.

---

## End of Day (After Market Close - 4:00 PM EST)

### 1. Verify Snapshots Captured ✅
```bash
npx tsx scripts/check-eod-snapshots.ts
```

**What to look for**:
- ✅ Number of snapshots matches number of active trades
- ✅ Recent snapshot times (around market close)
- ✅ P&L calculations are accurate
- ✅ Greeks are populated (Delta, Theta, etc.)
- ✅ AI summaries and news data present

### 2. If Missing AI Summaries ⚠️
```bash
npx tsx scripts/trigger-daily-monitoring.ts
```

This will fetch news and generate AI risk assessments for all active trades.

**When to run**:
- No AI summaries found
- Morning job (9 AM) didn't run
- Want fresh data after significant market events

### 3. Check Scheduler Status 🔄
```bash
# Check if scheduler is running
ps aux | grep "start-all-schedulers"

# If not running, start it
npm run scheduler
```

---

## Morning Routine (Before Market Open - Before 9:30 AM EST)

### 1. Review Daily Monitoring Results 📊
The 9:00 AM job should have run automatically. Check results:

```bash
npx tsx scripts/check-eod-snapshots.ts
```

Look for AI summaries showing:
- Risk assessments for each trade
- News sentiment
- Analyst activity
- Upcoming catalysts

### 2. Check Tavily Credit Usage 💰
```bash
curl http://localhost:3000/api/admin/tavily-usage | jq .
```

**Budget**: 4,000 credits/month (~$200)
**Daily usage**: ~100 credits (with caching)
**Remaining**: Should show ~2,920 credits/month used

---

## Weekly Routine (Monday Morning)

### 1. Verify Weekly RAG Enrichment Ran ✅
The Sunday 2:00 AM job should have updated the knowledge base.

Check last run:
```bash
curl http://localhost:3000/api/admin/tavily-usage | jq '.data.last_enrichment'
```

### 2. Review Closed Trades 📈
Check if post-mortems were generated for any trades closed last week:

```sql
SELECT
  symbol,
  outcome,
  realized_pnl,
  realized_pnl_percent,
  key_lessons
FROM trade_postmortems
WHERE created_at >= CURRENT_DATE - INTERVAL '7 days'
ORDER BY created_at DESC;
```

---

## Troubleshooting Quick Reference

### Problem: No snapshots today
**Quick fix**:
```bash
# Check active trades
npx tsx scripts/check-eod-snapshots.ts

# Manually capture snapshots
curl -X POST http://localhost:3000/api/trades/monitor-snapshots
```

### Problem: Scheduler not running
**Quick fix**:
```bash
# Start scheduler
npm run scheduler

# Or with PM2 for 24/7 operation
pm2 start npm --name "tenxiv-scheduler" -- run scheduler
pm2 save
```

### Problem: High API credit usage
**Quick fix**:
```bash
# Check cache hit rate (should be >40%)
curl http://localhost:3000/api/admin/tavily-usage | jq '.data.summary.cache_hit_rate'

# If low, check for duplicate monitoring calls in logs
```

### Problem: Stale AI summaries
**Quick fix**:
```bash
# Force refresh (bypasses cache)
curl -X POST http://localhost:3000/api/trades/monitor-all \
  -H "Content-Type: application/json" \
  -d '{"forceRefresh": true}'
```

---

## One-Command Health Check

Run this single command to check everything:

```bash
npx tsx scripts/check-eod-snapshots.ts && \
curl -s http://localhost:3000/api/trades/monitor-snapshots | jq '.' && \
curl -s http://localhost:3000/api/admin/tavily-usage | jq '.data.summary'
```

This checks:
1. ✅ EOD snapshots captured
2. ✅ Snapshot monitoring status
3. ✅ Tavily credit usage

---

## What Success Looks Like

### EOD Snapshot Output:
```
✅ FOUND 38 SNAPSHOTS TODAY

SNAPSHOTS BY TRIGGER TYPE:
  scheduled: 35
  significant_move: 3

📊 AMD - SCHEDULED
   P&L: $2025.00 (642.9%)
   Risk Level: Low
   Risk Score: 25/100

✅ FOUND 19 AI SUMMARIES/NEWS DATA

📰 AMD - AI Summary
   Summary: Strong momentum with positive analyst sentiment...
   Catalysts: 2 found
   News Sentiment: Positive
```

### Scheduler Running:
```
Active Jobs:
  1. Spread Price Updates    - Every 5 min during market hours
  2. Daily Trade Monitoring  - 9:00 AM EST (Mon-Fri)
  3. Auto Post-Mortems       - Every hour (24/7)
  4. Weekly RAG Enrichment   - 2:00 AM EST (Sunday)
```

### Healthy Usage:
```
"total_requests": 247,
"total_credits_used": 456,
"estimated_monthly_cost": "$146.00",
"cache_hit_rate": "52.3%"
```

---

## Quick Commands Reference

| Task | Command |
|------|---------|
| Verify snapshots | `npx tsx scripts/check-eod-snapshots.ts` |
| Trigger monitoring | `npx tsx scripts/trigger-daily-monitoring.ts` |
| Start scheduler | `npm run scheduler` |
| Check scheduler status | `ps aux \| grep start-all-schedulers` |
| Check API usage | `curl http://localhost:3000/api/admin/tavily-usage` |
| Snapshot status | `curl http://localhost:3000/api/trades/monitor-snapshots` |

---

## When to Run What

| Time | What | Command |
|------|------|---------|
| 9:00 AM | Daily monitoring (auto) | - |
| 9:30 AM | Review monitoring results | `check-eod-snapshots.ts` |
| 4:00 PM | EOD snapshot check | `check-eod-snapshots.ts` |
| 4:30 PM | Final verification | `check-eod-snapshots.ts` |
| Weekly | Check closed trades | SQL query |
| Weekly | Verify RAG enrichment | Check last run timestamp |

---

## Red Flags 🚩

Watch for these issues:

- ❌ No snapshots for >2 hours during market hours
- ❌ Cache hit rate <30%
- ❌ Daily credit usage >150 credits
- ❌ Scheduler not running
- ❌ AI summaries missing for active trades
- ❌ P&L calculations showing N/A
- ❌ Greeks not populated

If you see any of these, investigate immediately.
