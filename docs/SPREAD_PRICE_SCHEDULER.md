# Spread Price Scheduler

Automatically updates spread prices for all active trades at key market times.

## Features

- **Automatic Updates**: Fetches real-time option chain data and calculates spread closing prices
- **Market Hours Scheduling**: Updates at optimal times during trading hours
- **P/L Calculation**: Automatically computes current profit/loss for each position
- **Rate Limiting**: Respects Alpha Vantage's 600 calls/minute limit

## Scheduled Update Times (EST)

- **9:30 AM** - Market Open
- **10:00 AM** - Mid-Morning
- **12:00 PM** - Midday
- **2:00 PM** - Afternoon
- **4:00 PM** - Market Close

*Updates only run Monday-Friday during market days*

## Usage

### Start the Scheduler

Run the scheduler in the background to enable automatic updates:

```bash
npm run spread-scheduler
```

This will:
1. Start the cron scheduler
2. Wait for the scheduled times
3. Automatically fetch and update spread prices
4. Continue running until you stop it (Ctrl+C)

### Manual Update

To manually trigger a spread price update immediately:

```bash
npm run update-spreads
```

Or call the API directly:

```bash
curl http://localhost:3000/api/trades/spread-prices
```

## How It Works

1. **Fetch Active Trades**: Queries all trades with status='active'
2. **Get Option Chain**: For each trade, fetches real-time option prices from Alpha Vantage
3. **Calculate Spread Price**: Computes the current cost to close the spread
   - For credit spreads: `closing_cost = short_leg_ask - long_leg_bid`
4. **Calculate P/L**:
   - `P/L = (credit_received - current_spread_price) × contracts × 100`
5. **Update Database**: Stores the spread price and timestamp

## Data Stored

For each active trade, the following is updated:

- `current_spread_price` - Mid-price of closing the spread
- `current_spread_bid` - Best-case closing price
- `current_spread_ask` - Worst-case closing price
- `spread_price_updated_at` - Timestamp of last update

## Dashboard Display

The dashboard automatically shows:

- **Spread Price**: Current cost to close the position
- **Current P/L**: Real-time profit/loss in dollars (color-coded)
- **Current P/L %**: Percentage return (color-coded)

These values update whenever you refresh the dashboard after a scheduled update.

## Production Deployment

For production, you'll want to run the scheduler as a background service:

### Option 1: PM2 (Node.js Process Manager)

```bash
npm install -g pm2
pm2 start npm --name "spread-scheduler" -- run spread-scheduler
pm2 save
```

### Option 2: systemd (Linux)

Create `/etc/systemd/system/spread-scheduler.service`:

```ini
[Unit]
Description=Spread Price Scheduler
After=network.target

[Service]
Type=simple
User=your-user
WorkingDirectory=/path/to/tenxiv
ExecStart=/usr/bin/npm run spread-scheduler
Restart=always

[Install]
WantedBy=multi-user.target
```

Then:
```bash
sudo systemctl enable spread-scheduler
sudo systemctl start spread-scheduler
```

### Option 3: Docker

Add to your docker-compose.yml:

```yaml
services:
  spread-scheduler:
    build: .
    command: npm run spread-scheduler
    env_file: .env
    restart: unless-stopped
```

## Monitoring

The scheduler logs all activities:

```
[Spread Updater] Starting update at 2025-10-06T14:30:00.000Z
[Spread Updater] Found 5 active trades
[Spread Updater] Updated AMD: price=$0.45, P/L=$220.00 (48.9%)
[Spread Updater] Updated NVDA: price=$0.30, P/L=$340.00 (56.7%)
[Spread Updater] Completed in 3.2s - Success: 5, Failed: 0
```

## Troubleshooting

**No updates happening?**
- Check that the scheduler is running (`npm run spread-scheduler`)
- Verify you're in the correct timezone (America/New_York)
- Check logs for errors

**Getting API rate limit errors?**
- The system is designed to respect 600 calls/minute
- If you have many trades, updates may take a few minutes

**Spread prices not showing in dashboard?**
- Make sure the scheduler has run at least once
- Check the database: `SELECT current_spread_price FROM trades WHERE status='active'`
- Verify `spread_price_updated_at` is recent

## API Endpoints

### GET /api/trades/spread-prices

Update all active trades:
```bash
GET /api/trades/spread-prices
```

Update a specific trade:
```bash
GET /api/trades/spread-prices?tradeId=xxx-xxx-xxx
```

Response:
```json
{
  "success": true,
  "total": 5,
  "successful": 5,
  "failed": 0,
  "results": [
    {
      "success": true,
      "symbol": "AMD",
      "spreadPrice": 0.45,
      "currentPL": 220.00,
      "currentPLPercent": 48.9
    }
  ]
}
```
