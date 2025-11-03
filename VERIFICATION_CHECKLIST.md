# Monitoring Optimization Verification Checklist

## Quick Verification (5 minutes)

After deployment, verify these key improvements:

### ✅ 1. Check Tavily Schema Fix
**Action:** Restart your Next.js dev server and check logs
**Expected:** No more "Schema validation failed" errors
**Verify:**
```bash
# Start server and watch for errors
npm run dev

# Look for these in logs:
❌ OLD: [Tavily Search] Schema validation failed for query: "VST stock news"
✅ NEW: [Tavily Search] Results: 10 articles found
```

---

### ✅ 2. Verify AlphaVantage Integration
**Action:** Open browser console on any page that uses monitoring
**Expected:** Console logs showing AV usage
**Verify:**
```javascript
// Open DevTools Console (F12)
// Navigate to a page with trade monitoring
// Look for:
✅ [UnifiedIntel] Getting catalysts for AAPL (7 days back)
✅ [UnifiedIntel] ✓ Found 15 catalysts from Alpha Vantage (0 credits)
✅ [UnifiedIntel] ✓ Found 8 analyst articles from Alpha Vantage (0 credits)

// Should NOT see:
❌ [UnifiedIntel] ⚠️ Using Tavily for catalysts (will cost credits)
```

---

### ✅ 3. Check Smart Filtering
**Action:** View server logs during morning monitoring (9 AM)
**Expected:** WATCH/SKIP breakdown
**Verify:**
```bash
# Look for these logs:
✅ [ActiveMonitor] Found 10 active trades
✅ [ActiveMonitor] SMART FILTER: 4 WATCH trades (skipped 6 GOOD trades)
✅ [ActiveMonitor] Skipping AAPL (IPS: 88, DTE: 30d, Proximity: 12.3%)

# Credit usage should be LOW:
✅ [ActiveMonitor] Research complete. Credits used: 3
❌ OLD: Credits used: 28
```

---

### ✅ 4. Verify Extended Cache
**Action:** Run monitoring twice within 24 hours
**Expected:** Second run uses cache (0 credits)
**Verify:**
```bash
# First run (9 AM):
✅ [ActiveMonitor] Fetching context for AAPL (7d lookback)
✅ [ActiveMonitor] Research complete. Credits used: 3

# Second run (12 PM midday check):
✅ [ActiveMonitor] Using cached monitor data (3.2h old)
✅ [Cron] User xyz: Midday check complete, 0 credits (cached)
```

---

### ✅ 5. Check Database Tables
**Action:** Query database for monitoring data
**Verify:**
```sql
-- Check monitor cache
SELECT COUNT(*) FROM trade_monitor_cache WHERE created_at > NOW() - INTERVAL '24 hours';
-- Expected: Should see entries if monitoring has run

-- Check AlphaVantage sentiment cache
SELECT COUNT(*) FROM historical_sentiment_cache WHERE fetched_at > NOW() - INTERVAL '7 days';
-- Expected: Should grow over time as symbols are monitored

-- Verify credit tracking is accurate
SELECT
  (monitor_data->>'credits_used')::int as credits,
  (monitor_data->>'symbol') as symbol,
  created_at
FROM trade_monitor_cache
ORDER BY created_at DESC
LIMIT 5;
-- Expected: Credits should be 3-5, not 28
```

---

## Deep Verification (30 minutes)

### Test 1: AlphaVantage Direct Test
```typescript
// In browser console or test file
import { getAlphaVantageClient } from '@/lib/api/alpha-vantage';

const av = getAlphaVantageClient();
const result = await av.getNewsSentiment('AAPL', 10, {
  topics: ['earnings'],
  time_from: '20251001T0000'
});

console.log('✅ Articles:', result.raw_articles?.length);
console.log('✅ Sentiment:', result.overall_sentiment_label);
console.log('✅ Score:', result.overall_sentiment_score);
```

**Expected Results:**
- Articles: 5-20 articles
- Sentiment: "Bullish", "Bearish", or "Neutral"
- Score: Number between -1 and 1
- Credits used: 0 (it's free!)

---

### Test 2: Unified Intelligence Test
```typescript
import { getCatalysts, getAnalystActivity, getOperationalRisks } from '@/lib/services/unified-intelligence-service';

// Test catalysts
const catalysts = await getCatalysts('AAPL', 7);
console.log('✅ Catalysts:', catalysts.length);
console.log('✅ Sources:', catalysts.map(c => c.sourceType));

// Test analyst activity
const analysts = await getAnalystActivity('AAPL', 7);
console.log('✅ Analyst articles:', analysts.length);
console.log('✅ Sources:', analysts.map(a => a.sourceType));

// Test operational risks
const risks = await getOperationalRisks('AAPL', 30);
console.log('✅ Risk articles:', risks.length);
console.log('✅ Sources:', risks.map(r => r.sourceType));
```

**Expected Results:**
- All arrays should have length > 0
- Sources should be "alpha_vantage" or "external_db" (NOT "tavily")
- If you see "tavily", check logs for why AV failed

---

### Test 3: Single Trade Monitoring
```bash
# Call monitoring API endpoint
curl -X POST http://localhost:3000/api/monitor/trade \
  -H "Content-Type: application/json" \
  -d '{"tradeId": "YOUR_TRADE_ID_HERE"}'

# Check response JSON:
{
  "credits_used": 3-5,           // ✅ Should be low
  "cached_results": 3,           // ✅ Number of AV hits
  "current_context": {
    "catalysts": [
      {
        "sourceType": "alpha_vantage",  // ✅ Using AV
        ...
      }
    ]
  }
}
```

---

### Test 4: Batch Monitoring (Full Integration)
```bash
# Trigger morning monitoring
curl -X POST http://localhost:3000/api/monitor/batch \
  -H "Content-Type: application/json" \
  -d '{"userId": "YOUR_USER_ID", "watchOnly": true}'

# Check response:
{
  "total_trades": 10,
  "monitored": 4,                // ✅ Smart filter working
  "skipped": 6,                  // ✅ 60% reduction
  "total_credits_used": 12-20,   // ✅ Way less than old 280
  "risk_summary": {
    "critical": 0,
    "high": 1,
    "medium": 2,
    "low": 1
  }
}
```

---

### Test 5: Cache Effectiveness
```bash
# Run monitoring at 9 AM
curl -X POST http://localhost:3000/api/monitor/batch \
  -d '{"userId": "xyz", "useCache": true}'

# Response 1:
{
  "total_credits_used": 15  // ✅ First run uses API
}

# Run again at 12 PM
curl -X POST http://localhost:3000/api/monitor/batch \
  -d '{"userId": "xyz", "useCache": true}'

# Response 2:
{
  "total_credits_used": 0  // ✅ Cache hit, no API calls!
}
```

---

## Production Monitoring (Ongoing)

### Daily Checks
After system is deployed, monitor these metrics daily:

#### 1. Credit Usage Dashboard
```sql
-- Daily credit usage
SELECT
  DATE(created_at) as date,
  COUNT(*) as monitoring_sessions,
  SUM((monitor_data->>'credits_used')::int) as total_credits,
  AVG((monitor_data->>'credits_used')::int) as avg_credits_per_trade
FROM trade_monitor_cache
WHERE created_at > NOW() - INTERVAL '7 days'
GROUP BY DATE(created_at)
ORDER BY date DESC;

-- Expected:
-- total_credits: 40-80 per day (was 400-600)
-- avg_credits_per_trade: 3-5 (was 28)
```

#### 2. Source Breakdown
```sql
-- Which data sources are being used?
SELECT
  jsonb_array_elements(monitor_data->'current_context'->'catalysts')->>'sourceType' as source,
  COUNT(*) as usage_count
FROM trade_monitor_cache
WHERE created_at > NOW() - INTERVAL '1 day'
GROUP BY source
ORDER BY usage_count DESC;

-- Expected:
-- alpha_vantage: 80-90%
-- external_db: 5-10%
-- tavily: <10% (only fallback)
```

#### 3. Cache Hit Rate
```sql
-- How effective is caching?
WITH cache_age AS (
  SELECT
    EXTRACT(EPOCH FROM (NOW() - created_at)) / 3600 as hours_old,
    (monitor_data->>'credits_used')::int as credits
  FROM trade_monitor_cache
  WHERE created_at > NOW() - INTERVAL '7 days'
)
SELECT
  CASE
    WHEN hours_old < 12 THEN 'Fresh (0-12h)'
    WHEN hours_old < 24 THEN 'Valid (12-24h)'
    ELSE 'Stale (>24h)'
  END as cache_status,
  COUNT(*) as count,
  AVG(credits) as avg_credits
FROM cache_age
GROUP BY cache_status
ORDER BY cache_status;

-- Expected:
-- Fresh (0-12h): Most entries, low credits
-- Valid (12-24h): Some entries, 0 credits (cache hits)
-- Stale (>24h): Should be cleaned up
```

#### 4. Smart Filter Effectiveness
```sql
-- What percentage of trades are being skipped?
WITH trade_analysis AS (
  SELECT
    COUNT(*) as total_trades,
    COUNT(CASE WHEN ips_score < 75 OR
      ABS((short_strike - current_price) / current_price * 100) < 5 OR
      EXTRACT(DAY FROM (expiration_date - NOW())) <= 14
      THEN 1 END) as watch_trades
  FROM trades
  WHERE status = 'active'
)
SELECT
  total_trades,
  watch_trades,
  (total_trades - watch_trades) as skipped_trades,
  ROUND((total_trades - watch_trades)::numeric / total_trades * 100, 1) as skip_percentage
FROM trade_analysis;

-- Expected:
-- skip_percentage: 60-70%
-- (Higher is better = more cost savings)
```

---

## Success Criteria

### Must Have (Critical)
- ✅ No Tavily schema validation errors
- ✅ AlphaVantage providing 80%+ of news data
- ✅ Daily credit usage < 100 credits
- ✅ Cache hit rate > 50% for midday checks
- ✅ Smart filter skipping 60%+ of trades

### Should Have (Important)
- ✅ Average credits per trade: 3-5 (not 28)
- ✅ Monthly credit usage < 2,000 (fits in 4,000 budget)
- ✅ No circuit breaker activations
- ✅ External DB contributing 5-10% of data

### Nice to Have (Optimal)
- ✅ Daily credit usage < 60 credits
- ✅ Cache hit rate > 80%
- ✅ Smart filter skipping 70%+ of trades
- ✅ Zero Tavily fallbacks (100% AV/External DB)

---

## Troubleshooting Guide

### Issue: High Tavily usage (still seeing 20+ credits per trade)
**Diagnosis:**
```bash
# Check logs for fallback warnings
grep "Using Tavily" logs/server.log

# Common causes:
# 1. AlphaVantage rate limit hit
# 2. AlphaVantage API key invalid
# 3. External DB connection failed
```

**Fix:**
1. Check `ALPHA_VANTAGE_API_KEY` in .env.local
2. Verify `ALPHA_VANTAGE_TIER` is set to "enterprise" (600 RPM)
3. Test AV connection: `curl https://www.alphavantage.co/query?function=NEWS_SENTIMENT&tickers=AAPL&apikey=YOUR_KEY`
4. Check External Supabase connection in `getExternalSupabase()`

---

### Issue: Cache not working (midday check using credits)
**Diagnosis:**
```sql
-- Check cache entries
SELECT
  trade_id,
  created_at,
  EXTRACT(EPOCH FROM (NOW() - created_at)) / 3600 as hours_old
FROM trade_monitor_cache
ORDER BY created_at DESC
LIMIT 10;
```

**Fix:**
1. Verify cache TTL is 24 hours (not 12)
2. Check `useCache: true` is passed to monitoring functions
3. Ensure trade_id is consistent (not changing between runs)
4. Clear old cache: `DELETE FROM trade_monitor_cache WHERE created_at < NOW() - INTERVAL '7 days'`

---

### Issue: Smart filter not skipping trades
**Diagnosis:**
```sql
-- Check trade criteria
SELECT
  symbol,
  ips_score,
  ABS((short_strike - current_price) / current_price * 100) as percent_to_strike,
  EXTRACT(DAY FROM (expiration_date - NOW())) as days_to_expiry,
  CASE
    WHEN ips_score < 75 THEN 'WATCH (IPS)'
    WHEN ABS((short_strike - current_price) / current_price * 100) < 5 THEN 'WATCH (Strike)'
    WHEN EXTRACT(DAY FROM (expiration_date - NOW())) <= 14 THEN 'WATCH (DTE)'
    ELSE 'SKIP'
  END as decision
FROM trades
WHERE status = 'active';
```

**Fix:**
1. Verify `watchOnly: true` is passed to `monitorAllActiveTrades()`
2. Check trade data quality (null values may cause issues)
3. Adjust filter thresholds if needed (e.g., IPS < 70 instead of 75)

---

### Issue: AlphaVantage returning no data
**Diagnosis:**
```bash
# Test AV API directly
curl "https://www.alphavantage.co/query?function=NEWS_SENTIMENT&tickers=AAPL&apikey=YOUR_KEY"

# Check response:
# - If "Note: Thank you for using Alpha Vantage..." → Rate limited
# - If "Invalid API call" → Bad API key
# - If empty results → Symbol may have no recent news
```

**Fix:**
1. Wait 1 minute if rate limited (free tier: 5 RPM, enterprise: 600 RPM)
2. Verify API key in environment variables
3. Test with high-volume symbol (AAPL, TSLA, NVDA)
4. Check `time_from` parameter (may be too far back)

---

## Final Validation

Run this SQL to get comprehensive system health:

```sql
-- System Health Dashboard
WITH monitoring_stats AS (
  SELECT
    COUNT(*) as total_sessions,
    SUM((monitor_data->>'credits_used')::int) as total_credits,
    AVG((monitor_data->>'credits_used')::int) as avg_credits,
    COUNT(DISTINCT trade_id) as unique_trades
  FROM trade_monitor_cache
  WHERE created_at > NOW() - INTERVAL '7 days'
),
sentiment_stats AS (
  SELECT
    COUNT(*) as total_sentiment,
    COUNT(DISTINCT symbol) as unique_symbols
  FROM historical_sentiment_cache
  WHERE fetched_at > NOW() - INTERVAL '7 days'
),
trade_stats AS (
  SELECT
    COUNT(*) as total_active,
    COUNT(CASE WHEN ips_score < 75 THEN 1 END) as watch_by_ips,
    COUNT(CASE WHEN EXTRACT(DAY FROM (expiration_date - NOW())) <= 14 THEN 1 END) as watch_by_dte
  FROM trades
  WHERE status = 'active'
)
SELECT
  'Monitoring' as metric,
  total_sessions as value,
  'sessions in last 7d' as unit
FROM monitoring_stats
UNION ALL
SELECT 'Average Credits', avg_credits, 'per trade' FROM monitoring_stats
UNION ALL
SELECT 'Total Credits', total_credits, 'in last 7d' FROM monitoring_stats
UNION ALL
SELECT 'Cache Entries', total_sentiment, 'sentiment records' FROM sentiment_stats
UNION ALL
SELECT 'Active Trades', total_active, 'trades' FROM trade_stats
UNION ALL
SELECT 'WATCH Trades', watch_by_ips + watch_by_dte, 'need monitoring' FROM trade_stats;
```

**Expected Output:**
```
| Metric           | Value  | Unit                  |
|------------------|--------|-----------------------|
| Monitoring       | 50-100 | sessions in last 7d   |
| Average Credits  | 3-5    | per trade             |
| Total Credits    | 200-400| in last 7d            |
| Cache Entries    | 20-50  | sentiment records     |
| Active Trades    | 10-20  | trades                |
| WATCH Trades     | 3-6    | need monitoring       |
```

---

## Success! 🎉

If all checks pass, you've successfully:
- ✅ Reduced Tavily credit usage by 80-85%
- ✅ Extended your 4,000 credit budget from 9 days to 2+ months
- ✅ Improved monitoring quality with AlphaVantage sentiment data
- ✅ Implemented intelligent caching and filtering
- ✅ Created a sustainable, cost-effective monitoring system

Monitor the system for 7 days and review the dashboard queries weekly to ensure continued optimization.
