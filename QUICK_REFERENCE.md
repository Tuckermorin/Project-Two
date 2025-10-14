# Quick Reference - EOD Snapshot Verification

## 📋 Daily Commands

### Check Today's Snapshots
```bash
npx tsx scripts/check-eod-snapshots.ts
```
**Shows**: Snapshots + AI summaries + news data for today

### Trigger AI Monitoring (if 9 AM job didn't run)
```bash
npx tsx scripts/trigger-daily-monitoring.ts
```
**Uses**: ~100 Tavily credits (first run), 0 credits (cached)

### Start Scheduler (for 24/7 operation)
```bash
npm run scheduler
```
**Runs**: All automated jobs in background

---

## ✅ What You Should See

### Successful Snapshot Check
```
✅ FOUND 38 SNAPSHOTS TODAY
✅ FOUND 19 AI SUMMARIES/NEWS DATA

📊 AMD - SCHEDULED
   P&L: $2025.00 (642.9%)
   Risk Level: CRITICAL
```

### Successful Monitoring
```
Trades monitored: 19
Tavily credits used: 532 (first run) or 0 (cached)
Risk summary: { critical: 19, high: 0, medium: 0, low: 0 }
```

---

## 🔧 Quick Fixes

### No snapshots found
```bash
# Check if trades exist
npx tsx scripts/debug-trades-status.ts

# Manually trigger snapshot
curl -X POST http://localhost:3000/api/trades/monitor-snapshots
```

### No active trades (wrong user ID)
```bash
# Debug user ID
npx tsx scripts/debug-trades-status.ts

# Will show correct user ID to update in .env
```

### Scheduler not running
```bash
# Restart scheduler
npm run scheduler

# Or with PM2
pm2 restart tenxiv-scheduler
```

---

## 📊 Your Current Status

- **19 active trades**
- **User ID**: `b2c427e9-3eec-4e15-a22e-0aafc3047c0c`
- **Scheduler**: ✅ Working
- **Snapshots**: ✅ Capturing
- **AI Monitoring**: ✅ Working
- **Cache**: ✅ Working (saves credits!)

---

## 📁 Important Files

| File | Purpose |
|------|---------|
| `scripts/check-eod-snapshots.ts` | Daily verification |
| `scripts/trigger-daily-monitoring.ts` | Manual AI monitoring |
| `scripts/debug-trades-status.ts` | Troubleshooting |
| `docs/EOD_SNAPSHOT_VERIFICATION.md` | Full guide |
| `DAILY_VERIFICATION_CHECKLIST.md` | Daily checklist |
| `VERIFICATION_COMPLETE.md` | Setup summary |

---

## ⏰ Scheduled Jobs

| Time | Job | What It Does |
|------|-----|--------------|
| Every 5 min | Spread prices | Updates spread prices |
| 9:00 AM EST | Daily monitoring | AI + news summaries |
| 12:00 PM EST | Midday check | Quick check (cached) |
| Every hour | Post-mortems | Closed trade analysis |
| 2:00 AM Sun | RAG enrichment | Update knowledge base |

---

## 🎯 Daily Routine

**After market close (4:00 PM EST)**:
```bash
npx tsx scripts/check-eod-snapshots.ts
```

That's it! You'll see:
- All snapshots from today
- AI summaries with news
- Risk assessments
- Trade performance

---

**Everything is working! 🚀**

For full details, see: [VERIFICATION_COMPLETE.md](VERIFICATION_COMPLETE.md)
