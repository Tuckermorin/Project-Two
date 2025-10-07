# App-Based Scheduler - Zero Setup Required! 🎉

## How It Works

The scheduler is now **built into your Next.js app**. No PM2, no terminal windows, no setup needed on every machine!

### ✅ What This Means:

1. **When you run `npm run dev`** → Scheduler starts automatically
2. **When you deploy to Vercel/Railway** → Scheduler runs there automatically
3. **On any computer** → Just run the app, scheduler works
4. **No manual setup** → Everything just works!

---

## Quick Start

### Development (Local)

```bash
npm run dev
```

That's it! You'll see:

```
[Init] Starting scheduler on server startup...

================================================================================
TENXIV AUTOMATED SCHEDULER - Starting...
================================================================================

✓ Daily Trade Monitoring - 9:00 AM EST (Mon-Fri)
✓ Midday Trade Check - 12:00 PM EST (Mon-Fri)
✓ Auto Post-Mortems - Every hour
✓ Weekly RAG Enrichment - 2:00 AM Sunday

================================================================================
✅ All scheduled jobs started successfully
================================================================================
```

---

## What's Running

All the same jobs as before:

| Job | Schedule | Purpose |
|-----|----------|---------|
| Daily Monitoring | 9 AM EST (Mon-Fri) | Deep research on active trades |
| Midday Check | 12 PM EST (Mon-Fri) | Quick alert check (cached) |
| Auto Post-Mortems | Every hour | Analyze closed trades |
| Weekly Enrichment | 2 AM Sunday | Refresh RAG knowledge |

**Cost**: Same ~$146/month in Tavily credits

---

## Benefits vs PM2 Approach

| Feature | PM2 Method | App-Based Method |
|---------|------------|------------------|
| Setup on new machine | 3 commands | 0 commands ✅ |
| Works with `npm run dev` | ❌ No | ✅ Yes |
| Auto-works on deployment | ❌ Requires config | ✅ Yes |
| Can close terminal | ❌ Need PM2 running | ❌ Need app running |
| Restart after reboot | ❌ Need PM2 setup | ✅ If app auto-starts |

---

## Deployment

### When You Deploy to Vercel/Railway/Render:

**Nothing extra needed!** The scheduler starts automatically with your app.

However, for **best reliability in production**, you should also add platform-specific cron jobs as backup:

### Vercel (Recommended for Production)

Create `vercel.json`:

```json
{
  "crons": [
    {
      "path": "/api/scheduler/init",
      "schedule": "0 8 * * *"
    }
  ]
}
```

This ensures the scheduler is running even if the app restarts.

### Railway

Add to `railway.toml`:

```toml
[[crons]]
schedule = "0 8 * * *"
command = "curl https://your-app.railway.app/api/scheduler/init"
```

---

## Checking If It's Running

### Method 1: Check Logs

When you run `npm run dev`, you'll see the scheduler initialization messages.

### Method 2: API Endpoint

```bash
curl http://localhost:3000/api/scheduler/init
```

Response:
```json
{
  "success": true,
  "message": "Scheduler is already running",
  "status": "running"
}
```

---

## Manual Control (Optional)

If you ever need to manually start the scheduler:

```bash
curl http://localhost:3000/api/scheduler/init
```

But this shouldn't be needed - it auto-starts!

---

## Development Workflow

### Running Locally

```bash
# Terminal 1: Run Next.js (scheduler auto-starts)
npm run dev

# Terminal 2: Check if scheduler is running
curl http://localhost:3000/api/scheduler/init
```

### Multiple Machines

Just run `npm run dev` on any machine. The scheduler works immediately.

---

## Comparison: Old vs New

### ❌ Old Way (PM2):
```bash
# On Machine 1
npm install -g pm2
pm2 start ecosystem.config.js
pm2 startup
pm2 save

# On Machine 2
npm install -g pm2
pm2 start ecosystem.config.js
pm2 startup
pm2 save

# On Machine 3... (repeat forever)
```

### ✅ New Way (App-Based):
```bash
# On any machine
npm run dev

# Done! 🎉
```

---

## Caveats

### Development

The scheduler only runs while `npm run dev` (or `npm start`) is active. If you stop the dev server, the scheduler stops too.

**Solution for 24/7 local testing**: Use PM2 for your dev machine only (optional):

```bash
pm2 start npm --name "tenxiv-dev" -- run dev
pm2 startup
pm2 save
```

### Production

When deployed to Vercel/Railway/etc., the app (and scheduler) runs 24/7 automatically.

---

## Migration from PM2

If you were using the PM2 approach:

### Stop PM2

```bash
pm2 stop tenxiv-scheduler
pm2 delete tenxiv-scheduler
pm2 save
```

### Start Using App-Based

```bash
npm run dev
```

That's it! Everything now runs through the app.

---

## Files That Make This Work

1. **[src/lib/utils/server-scheduler.ts](../src/lib/utils/server-scheduler.ts)** - Scheduler logic
2. **[src/lib/init-scheduler.ts](../src/lib/init-scheduler.ts)** - Auto-initialization
3. **[src/app/layout.tsx](../src/app/layout.tsx)** - Imports init-scheduler (line 10)
4. **[src/app/api/scheduler/init/route.ts](../src/app/api/scheduler/init/route.ts)** - Manual trigger endpoint

---

## FAQ

### Q: Do I still need PM2?

**A:** No! Unless you want your dev server to run 24/7 on your local machine (rare).

### Q: What if I restart my computer?

**A:** When you run `npm run dev` again, the scheduler auto-starts.

### Q: What about when I deploy?

**A:** Scheduler auto-starts with your deployed app. No config needed!

### Q: Can I still use PM2 if I want?

**A:** Yes! You can use `pm2 start npm -- run dev` to run the app (with scheduler) via PM2.

### Q: How do I know it's working?

**A:** Check your terminal logs when starting the app, or visit `/api/scheduler/init`.

---

## Summary

🎉 **The scheduler is now part of your app!**

- ✅ No setup needed on new machines
- ✅ Works with `npm run dev` automatically
- ✅ Auto-works when deployed
- ✅ One command to rule them all: `npm run dev`

**Just run your app and everything works.** That's how it should be! 🚀
