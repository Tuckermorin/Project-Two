# PM2 Setup Guide - Run Jobs 24/7

Complete guide to setting up PM2 for running TenXIV jobs continuously in the background.

---

## What is PM2?

PM2 is a production-grade process manager for Node.js applications. It will:
- ✅ Run your jobs in the background (no terminal window needed)
- ✅ Auto-restart if they crash
- ✅ Auto-start when you restart your computer
- ✅ Keep logs of everything
- ✅ Work across all your machines (once you set it up on each)

---

## One-Time Setup (5 minutes)

### Step 1: Install PM2 Globally

Open PowerShell or Command Prompt and run:

```bash
npm install -g pm2
```

This installs PM2 globally so you can use it from anywhere.

---

### Step 2: Create Logs Directory

In your project folder:

```bash
cd "c:\Users\tucker.morin\OneDrive - Squire\Desktop\Utah Tech\tenxiv"
mkdir logs
```

---

### Step 3: Start the Scheduler with PM2

```bash
pm2 start ecosystem.config.js
```

That's it! Your scheduler is now running in the background.

---

### Step 4: Make It Auto-Start on Computer Restart

This is the magic step - run these commands **ONCE**:

```bash
# Generate startup script
pm2 startup

# Save the current PM2 process list
pm2 save
```

**On Windows**, PM2 will show you a command to run. Copy and paste it into your terminal (it will look something like):

```bash
pm2-startup install
```

**Now your scheduler will automatically start every time you restart your computer!**

---

## Daily Usage

After the one-time setup, you don't need to do anything! But here are useful commands:

### Check if Scheduler is Running

```bash
pm2 status
```

Output:
```
┌─────┬──────────────────────┬─────────┬─────────┬──────────┐
│ id  │ name                 │ status  │ ↻       │ cpu      │
├─────┼──────────────────────┼─────────┼─────────┼──────────┤
│ 0   │ tenxiv-scheduler     │ online  │ 0       │ 0.3%     │
└─────┴──────────────────────┴─────────┴─────────┴──────────┘
```

Status should say **"online"** ✅

---

### View Live Logs

```bash
pm2 logs tenxiv-scheduler
```

This shows you what's happening in real-time. Press `Ctrl+C` to exit logs (scheduler keeps running).

---

### View Last 100 Lines of Logs

```bash
pm2 logs tenxiv-scheduler --lines 100
```

---

### Restart Scheduler (if needed)

```bash
pm2 restart tenxiv-scheduler
```

---

### Stop Scheduler (if you need to)

```bash
pm2 stop tenxiv-scheduler
```

To start again:
```bash
pm2 start tenxiv-scheduler
```

---

### Delete Scheduler (to completely remove it)

```bash
pm2 delete tenxiv-scheduler
```

---

## Setting Up on Another Machine

When you move to a different computer:

1. **Clone/copy your project** to the new machine
2. **Install dependencies**: `npm install`
3. **Install PM2 globally**: `npm install -g pm2`
4. **Start scheduler**: `pm2 start ecosystem.config.js`
5. **Setup auto-start**: `pm2 startup` then `pm2 save`

Done! Takes about 2 minutes.

---

## When Deploying to a Website

When you deploy to a hosting service like **Vercel**, **Railway**, **Render**, etc., PM2 won't be needed because those services have their own job schedulers.

### For Vercel

Add to `vercel.json`:

```json
{
  "crons": [
    {
      "path": "/api/cron/daily-monitoring",
      "schedule": "0 9 * * 1-5"
    },
    {
      "path": "/api/cron/midday-check",
      "schedule": "0 12 * * 1-5"
    },
    {
      "path": "/api/cron/weekly-enrichment",
      "schedule": "0 2 * * 0"
    },
    {
      "path": "/api/cron/auto-postmortem",
      "schedule": "0 * * * *"
    }
  ]
}
```

Then create API routes that call your job functions.

### For Other Hosting Services

Most have built-in cron job support:
- **Railway**: Uses cron jobs in `railway.toml`
- **Render**: Uses cron jobs in dashboard
- **Fly.io**: Uses scheduled tasks
- **DigitalOcean**: Use cron on the server

I can help set these up when you're ready to deploy!

---

## Monitoring & Maintenance

### Daily Check (Optional)

Check logs once a day to make sure everything is running smoothly:

```bash
pm2 logs tenxiv-scheduler --lines 50
```

Look for:
- ✅ `[Daily Monitoring] Monitored X trades`
- ✅ `[Spread Updater] Updated X trades`
- ❌ Any error messages

---

### View Resource Usage

```bash
pm2 monit
```

This shows real-time CPU and memory usage. Press `Ctrl+C` to exit.

---

### Clear Old Logs (Optional)

Logs can build up over time. To clear them:

```bash
pm2 flush
```

Or manually delete files from the `logs/` folder.

---

## Troubleshooting

### PM2 says "command not found"

**Fix**: Install PM2 globally again:
```bash
npm install -g pm2
```

---

### Scheduler shows "errored" or "stopped"

**Check logs**:
```bash
pm2 logs tenxiv-scheduler --err
```

**Common causes**:
- Missing environment variables (check `.env` file)
- Database connection issues
- Missing dependencies (run `npm install`)

**Fix**: Restart after fixing:
```bash
pm2 restart tenxiv-scheduler
```

---

### Scheduler not auto-starting after reboot

**Fix**: Re-run setup commands:
```bash
pm2 startup
pm2 save
```

---

### "Port already in use" errors

This shouldn't happen with the scheduler (it doesn't use ports), but if you see it:

**Check what's running**:
```bash
pm2 list
```

**Kill duplicate processes**:
```bash
pm2 delete duplicate-name
```

---

## Advanced: Multiple Machines Sync

If you want the **same PM2 setup across all your machines**, you can:

1. **Export config** on first machine:
   ```bash
   pm2 save
   ```

2. **Copy `ecosystem.config.js`** to other machines

3. **Import on other machines**:
   ```bash
   pm2 start ecosystem.config.js
   pm2 save
   ```

---

## Comparison: With vs Without PM2

| Feature | Without PM2 | With PM2 |
|---------|-------------|----------|
| Keeps running when terminal closes | ❌ No | ✅ Yes |
| Auto-restart on crash | ❌ No | ✅ Yes |
| Auto-start on computer restart | ❌ No | ✅ Yes |
| Easy to view logs | ❌ Hard | ✅ `pm2 logs` |
| Monitor resource usage | ❌ Hard | ✅ `pm2 monit` |
| Background operation | ❌ No | ✅ Yes |

---

## Summary

**Setup (one time per machine)**:
```bash
npm install -g pm2
mkdir logs
pm2 start ecosystem.config.js
pm2 startup
pm2 save
```

**Daily usage**:
```bash
pm2 status          # Check if running
pm2 logs            # View logs
pm2 restart         # Restart if needed
```

**That's it!** Your jobs will now run 24/7 automatically, even after restarting your computer. 🎉

---

## Next Steps

1. ✅ Install PM2: `npm install -g pm2`
2. ✅ Start scheduler: `pm2 start ecosystem.config.js`
3. ✅ Enable auto-start: `pm2 startup` then `pm2 save`
4. ✅ Check it's running: `pm2 status`
5. ✅ View logs: `pm2 logs tenxiv-scheduler`

Done! You never have to think about starting the scheduler again.
