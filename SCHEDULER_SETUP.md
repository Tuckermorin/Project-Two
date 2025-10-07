# Options Pricing Scheduler Setup

## Problem
Options prices need to be updated regularly throughout the trading day so that P/L calculations for active trades are accurate. Previously, it was unclear if the scheduler was running or when prices were last updated.

## Solution
We've implemented:
1. **Scheduled automatic updates** every 5 minutes during market hours (9:30 AM - 4:00 PM EST)
2. **Visible last update timestamp** in the Active Trades Summary
3. **Manual refresh button** to trigger updates on-demand

## How to Run the Scheduler

### Option 1: Run in a Separate Terminal (Development)

Open a new terminal and run:
```bash
npm run spread-scheduler
```

Keep this terminal running. You should see:
```
==========================================================
SPREAD PRICE SCHEDULER
==========================================================

Starting scheduled spread price updates...
Timezone: America/New_York (EST/EDT)

[Spread Updater] Starting scheduler...
[Spread Updater] Scheduled updates:
  - Every 5 minutes during market hours
  - Monday-Friday, 9:30 AM - 4:00 PM EST
  - Approximately 78 updates per day

Scheduler is running. Press Ctrl+C to stop.
Ready and waiting for scheduled times...
```

### Option 2: Run in Background (Production)

Using PM2 (recommended for production):
```bash
# Install PM2 globally if not already installed
npm install -g pm2

# Start the scheduler
pm2 start npm --name "spread-scheduler" -- run spread-scheduler

# Save the PM2 process list
pm2 save

# Set PM2 to start on system boot
pm2 startup
```

To check status:
```bash
pm2 status
pm2 logs spread-scheduler
```

### Option 3: Manual Updates

If you don't want to run the scheduler, you can manually update prices:

**Via API:**
```bash
curl -X POST http://localhost:3000/api/trades/spread-prices
```

**Via UI:**
In the Active Trades Summary component (at the top of your dashboard), click the "Update Now" button.

## How It Works

### Scheduled Updates
The scheduler runs **every 5 minutes** during market hours (Monday-Friday):
- **9:30 AM - 4:00 PM EST** - Continuous updates every 5 minutes
- **Approximately 78 updates per trading day**
- Automatically skips updates outside market hours (nights, weekends, holidays)

At each 5-minute interval, the system:
1. Fetches all active trades from the database
2. For each trade, calls Alpha Vantage API to get current option prices
3. Calculates the spread closing price (for credit spreads)
4. Updates the database with new prices and timestamp
5. Respects rate limits (100ms delay between calls = 600/minute max)

### Manual Updates
The "Update Now" button in the UI triggers the same process immediately, without waiting for scheduled times. This is useful when:
- You want to see the latest prices right now
- The scheduler isn't running
- You're checking a trade before making a decision

### Last Update Display
The Active Trades Summary now shows:
- **"Options Pricing Last Updated: [time]"** at the bottom
- Shows "Never" if no prices have been fetched yet
- Shows relative time (e.g., "5m ago", "2h ago") if recently updated
- Shows date/time if older than 24 hours
- Text is RED if never updated, gray otherwise

## Troubleshooting

### Scheduler Not Updating Prices

1. **Check if scheduler is running:**
   ```bash
   # Check for running node processes
   tasklist | grep node

   # Or use PM2
   pm2 status
   ```

2. **Check logs:**
   - Look at the terminal where you ran `npm run spread-scheduler`
   - Or check PM2 logs: `pm2 logs spread-scheduler`
   - Look for messages like:
     ```
     [Spread Updater] Starting update at 2025-10-07T14:30:00.000Z
     [Spread Updater] Found 13 active trades
     [Spread Updater] Updated AMD: price=$0.45, P/L=$220.00 (48.9%)
     ```

3. **Verify scheduled times:**
   - Scheduler runs every 5 minutes during market hours (9:30 AM - 4:00 PM EST)
   - Only runs Mon-Fri during trading days
   - Times are in EST/EDT (America/New_York timezone)

4. **Check API rate limits:**
   - Alpha Vantage allows 600 calls/minute (plenty for 5-minute updates)
   - With 13 active trades, updates take ~1.3 seconds
   - Running every 5 minutes = ~78 updates per day = ~1,000 API calls per day

### "Last Updated: Never" Showing

This means the `spread_price_updated_at` timestamp is NULL for all active trades.

**Fix:** Manually trigger an update:
```bash
# Via API
curl -X POST http://localhost:3000/api/trades/spread-prices

# Or click "Update Now" button in the UI
```

### Prices Seem Stale (Yesterday's Data)

1. **Check when scheduler last ran:**
   - Look at "Last Updated" timestamp in UI
   - If it's from yesterday, the scheduler isn't running

2. **Restart the scheduler:**
   ```bash
   # If running manually, stop (Ctrl+C) and restart
   npm run spread-scheduler

   # If using PM2
   pm2 restart spread-scheduler
   ```

3. **Trigger manual update:**
   - Click "Update Now" button in UI
   - Or use API: `curl -X POST http://localhost:3000/api/trades/spread-prices`

### Alpha Vantage API Errors

If you see errors like "API rate limit exceeded" or "API key invalid":

1. **Check your .env file:**
   ```
   ALPHA_VANTAGE_API_KEY=your_key_here
   ```

2. **Verify API key is valid:**
   ```bash
   curl "https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=AMD&apikey=YOUR_KEY"
   ```

3. **Check rate limits:**
   - Free tier: 25 calls/day (not sufficient for this feature)
   - Premium tier: 600 calls/minute (required)

## Database Schema

The following columns track spread pricing in the `trades` table:

```sql
current_spread_price      -- Current mid-price to close the spread
current_spread_bid        -- Best-case closing price
current_spread_ask        -- Worst-case closing price
spread_price_updated_at   -- Timestamp of last update
```

## Files Modified

1. **`src/app/api/trades/spread-prices/route.ts`**
   - Added POST endpoint for manual refresh
   - Returns updated count and timestamp

2. **`src/components/dashboard/active-trades-summary.tsx`**
   - Added last update timestamp display
   - Added "Update Now" manual refresh button
   - Added loading state and toast notifications

3. **`src/lib/jobs/spread-price-updater.ts`** (existing)
   - Contains the cron scheduler and update logic
   - Runs at scheduled times

4. **`scripts/spread-price-scheduler.ts`** (existing)
   - Entry point script to start the scheduler

## Next Steps

1. **Start the scheduler** in a terminal or with PM2
2. **Wait for first scheduled update** (or click "Update Now")
3. **Verify** the "Last Updated" timestamp appears
4. **Monitor** to ensure updates happen at scheduled times

## Production Deployment

For production, use PM2 or a similar process manager:
```bash
# Start and save
pm2 start npm --name "spread-scheduler" -- run spread-scheduler
pm2 save

# Auto-start on reboot
pm2 startup

# Monitor
pm2 monit
```

Alternatively, use a systemd service, Docker container, or cloud cron job (e.g., AWS Lambda with EventBridge).
