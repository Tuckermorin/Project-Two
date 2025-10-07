# Quick Start - Automated Scheduler

## The Easiest Way to Start

Just run this command in your terminal:

```bash
npm run scheduler
```

That's it! 🎉

## What This Does

This single command starts **all automated jobs**:

1. ✅ **Spread Price Updates** - Every 5 minutes (market hours)
2. ✅ **Daily Trade Monitoring** - 9:00 AM EST (Mon-Fri)
3. ✅ **Midday Trade Check** - 12:00 PM EST (Mon-Fri)
4. ✅ **Auto Post-Mortems** - Every hour
5. ✅ **Weekly RAG Enrichment** - 2:00 AM Sunday

## What You'll See

```
================================================================================
TENXIV AUTOMATED JOB SCHEDULER
================================================================================

Starting all automated jobs...
Timezone: America/New_York (EST/EDT)

================================================================================

📊 SPREAD PRICE UPDATES
--------------------------------------------------------------------------------
[Spread Updater] Scheduled updates:
  - Every 5 minutes during market hours
  - Monday-Friday, 9:30 AM - 4:00 PM EST

🔍 TAVILY RESEARCH JOBS
--------------------------------------------------------------------------------
[Tavily Jobs] ✓ Daily trade monitoring scheduled
  - Time: 9:00 AM EST
  - Frequency: Monday-Friday
  - Purpose: Deep research on all active trades

[Tavily Jobs] ✓ Auto post-mortem scheduled
  - Time: Every hour
  - Purpose: Generate post-mortem for closed trades

[Tavily Jobs] ✓ Weekly RAG enrichment scheduled
  - Time: 2:00 AM EST Sunday
  - Purpose: Refresh knowledge base

[Tavily Jobs] ✓ Midday trade check scheduled
  - Time: 12:00 PM EST
  - Frequency: Monday-Friday

================================================================================

✅ ALL SCHEDULERS RUNNING

Press Ctrl+C to stop all jobs
```

## Cost Estimate

- **~2,920 Tavily credits per month**
- **~$146/month** (at $0.05/credit)
- **Well within your 4,000 credit budget**

## Important Notes

1. **Keep the terminal open** - Jobs only run while this command is active
2. **Press Ctrl+C to stop** - This will gracefully shut down all jobs
3. **Check logs** - You'll see activity when jobs run at scheduled times

## For 24/7 Operation (Optional)

If you want jobs to run even when you close the terminal, use PM2:

```bash
# Install PM2
npm install -g pm2

# Start with PM2
pm2 start npm --name "tenxiv" -- run scheduler

# View logs
pm2 logs tenxiv

# Stop
pm2 stop tenxiv
```

## Need Help?

See [docs/SCHEDULER_GUIDE.md](docs/SCHEDULER_GUIDE.md) for:
- Detailed job descriptions
- Troubleshooting tips
- Advanced configuration
- Cost breakdowns

## Test It Now

1. Open terminal in project directory
2. Run: `npm run scheduler`
3. Wait for jobs to run at scheduled times
4. Check Tavily usage: `curl http://localhost:3000/api/admin/tavily-usage`

That's all you need to know! 🚀
