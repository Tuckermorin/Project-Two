# Scheduled Updates System

This document describes all scheduled and automatic updates in the TenXIV application.

## Overview

The application uses a combination of server-side cron jobs and client-side intervals to ensure data stays fresh and up-to-date.

---

## Server-Side Scheduled Jobs

All server-side jobs are managed by `src/lib/utils/server-scheduler.ts` and use `node-cron` for scheduling.

### 1. Daily Trade Monitoring
- **Schedule**: 9:00 AM EST (Monday-Friday)
- **Function**: Monitors all active trades
- **Details**:
  - Analyzes last 7 days of trade activity
  - Uses cached data to minimize API costs
  - Identifies critical/high-risk trades
  - Approximately 100 credits per day

### 2. Midday Trade Check
- **Schedule**: 12:00 PM EST (Monday-Friday)
- **Function**: Quick check on active trades
- **Details**:
  - Analyzes last 1 day of activity
  - Heavily cached (0 credits typically)
  - Provides midday status updates

### 3. Auto Post-Mortems
- **Schedule**: Every hour
- **Function**: Automatically generates post-mortem analysis for recently closed trades
- **Details**:
  - Finds trades closed in last 2 hours
  - Generates AI-powered analysis
  - Embeds insights into RAG system
  - Approximately 22 credits per closed trade

### 4. Weekly RAG Enrichment
- **Schedule**: 2:00 AM EST Sunday
- **Function**: Enriches RAG knowledge base with market research
- **Details**:
  - Analyzes up to 20 watchlist symbols
  - Performs intelligent research routing
  - Hybrid search enabled
  - Approximately 70 credits per week

### 5. Daily Watchlist IV Update
- **Schedule**: 5:00 AM EST (Monday-Friday)
- **Function**: Updates volatility regime data for all watchlist items
- **Details**:
  - Updates `vol_regime_daily` table
  - Calculates IV rank and percentile
  - Rate limited to 600 requests/minute (Alpha Vantage premium tier)
  - Uses Alpha Vantage API (not Anthropic credits)
  - Processes up to 100 watchlist symbols

---

## Client-Side Auto-Refresh

### Dashboard Components

#### Active Trades Dashboard
- **Component**: `src/components/dashboard/excel-style-trades-dashboard.tsx`
- **Refresh Interval**: Every 5 minutes
- **Details**:
  - Automatically refreshes all active trade data
  - Updates current prices, P/L, and exit signals
  - Silent background refresh (no loading spinner)
  - Can be manually triggered with "Refresh" button

#### Market Overview
- **Component**: `src/components/dashboard/market-overview.tsx`
- **Refresh Interval**: Every 3 hours
- **Details**:
  - Updates major market indices (DIA, SPY, QQQ, VIXY)
  - Shows cached data indicator if API limits reached
  - Manual refresh available via button
  - Displays "last updated" timestamp

---

## Watchlist Updates

### On Item Addition
When a new stock is added to the watchlist:

1. **Immediate**: Stock data is fetched and saved to `watchlist_items` table
2. **Background**: Fire-and-forget request to `/api/watchlist/seed-cache`
3. **Seed Cache**: Historical IV data is cached (252 trading days)
4. **Storage**: Data saved to `vol_regime_daily` table
5. **Rate Limited**: Respects Alpha Vantage API limits (10ms delay between requests)

**Files Involved**:
- `src/app/api/watchlist/route.ts` (lines 75-86)
- `src/app/api/watchlist/seed-cache/route.ts`
- `src/lib/services/iv-cache-service.ts`

### Daily Updates
The daily IV update scheduler (5:00 AM EST) ensures all watchlist items have fresh volatility data:
- Updates today's IV for all watchlist symbols
- Calculates current IV rank
- Maintains rolling historical data
- Does NOT re-seed historical data (only updates current day)

---

## Manual Refresh Options

### Dashboard Refresh Button
- **Location**: Active Trades Dashboard (top right)
- **Action**: Manually triggers refresh of all active trades
- **Endpoint**: `POST /api/trades/refresh-active`
- **Updates**:
  - Current stock prices
  - Spread prices
  - Greeks (delta, theta, vega)
  - P/L calculations
  - Exit signals

### Market Overview Refresh Button
- **Location**: Market Overview widget (top right)
- **Action**: Manually refreshes market indices
- **Endpoint**: `GET /api/market-data`

---

## Data Flow Diagrams

### Watchlist IV Caching Flow
```
User adds stock to watchlist
         ↓
API saves to watchlist_items
         ↓
Fire-and-forget seed-cache request
         ↓
IVCacheService.cacheHistoricalIVForSymbol()
         ↓
Fetch 252 days of historical options data
         ↓
Calculate ATM IV for each day
         ↓
Store in vol_regime_daily table
```

### Daily Dashboard Refresh Flow
```
5-minute timer expires
         ↓
Client calls handleRefresh()
         ↓
POST /api/trades/refresh-active
         ↓
Server fetches current market data
         ↓
Updates trades table with fresh data
         ↓
Client reloads trades from database
         ↓
UI updates with new values
```

---

## Configuration

### Environment Variables
- `ALPHA_VANTAGE_API_KEY`: Required for market data and IV calculations
- `ALPHA_VANTAGE_MIN_DELAY_MS`: Rate limiting delay (default: 10ms for premium tier)
- `NEXT_PUBLIC_SUPABASE_URL`: Database connection
- `SUPABASE_SERVICE_ROLE_KEY`: Server-side database access

### Scheduler Initialization
The scheduler is auto-initialized when the Next.js server starts:
- `src/lib/init-scheduler.ts`: Entry point
- Imported by root layout or API routes
- Runs only on server side (`typeof window === 'undefined'`)

---

## Cost Estimates

### Anthropic API (Claude)
- Daily monitoring: ~100 credits/day
- Midday checks: ~0 credits (cached)
- Auto post-mortems: ~22 credits per closed trade
- Weekly enrichment: ~70 credits/week
- **Total**: ~2,920 credits/month (~$146)

### Alpha Vantage API
- Watchlist IV updates: Rate limited, but within premium tier limits
- Market data refreshes: Cached with 15-minute TTL
- Historical options data: One-time cache on watchlist addition

---

## Monitoring and Logs

All scheduled jobs log to console with prefixes:
- `[Cron]`: Server-side cron job
- `[Dashboard]`: Client-side dashboard refresh
- `[IV Cache]`: Volatility caching operations
- `[Scheduler]`: Scheduler initialization/shutdown

Monitor logs for:
- Failed API requests
- Rate limiting warnings
- Missing data errors
- Successful completion messages

---

## Troubleshooting

### Scheduler Not Running
1. Check if `src/lib/init-scheduler.ts` is imported in your root layout
2. Verify server-side execution (`typeof window === 'undefined'`)
3. Look for initialization logs on server startup
4. Check for duplicate initialization warnings

### Dashboard Not Auto-Refreshing
1. Verify component is mounted and not unmounted/remounted frequently
2. Check browser console for errors
3. Ensure `handleRefresh` function is defined before useEffect
4. Test manual refresh button to isolate issue

### Watchlist IV Data Missing
1. Check if Alpha Vantage API key is set
2. Verify seed-cache endpoint is being called (check logs)
3. Look for rate limiting errors
4. Ensure `vol_regime_daily` table exists and has proper RLS policies

### High API Costs
1. Review cron job frequencies
2. Check for duplicate scheduler instances
3. Verify cache is being used (check `servedFromCache` flags)
4. Consider adjusting refresh intervals

---

## Future Enhancements

Potential improvements to the scheduling system:
- User-configurable refresh intervals
- Smart refresh (only when market is open)
- Webhook-based updates instead of polling
- Per-user scheduling preferences
- Real-time WebSocket connections for live data
- Notification system for critical alerts
