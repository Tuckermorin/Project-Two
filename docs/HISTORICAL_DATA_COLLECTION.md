# Historical Data Collection & RAG Enhancement

This system collects historical options and stock data from Alpha Vantage to power your RAG (Retrieval-Augmented Generation) system for better trade recommendations.

## Overview

With 600 API calls/minute and no daily limits, we can build comprehensive historical datasets including:

- **Historical Options Data**: 15+ years of options chains with Greeks and IV
- **Historical Stock Data**: 20+ years of daily OHLCV data
- **Spread Analysis**: Pre-computed optimal spreads with actual outcomes

## Database Schema

### Tables Created

1. **`historical_options_data`**
   - Stores complete historical options chains
   - Includes pricing, volume, Greeks, and IV
   - Indexed by symbol, date, delta, strike

2. **`historical_stock_data`**
   - Daily OHLCV with adjustments
   - Dividend and split information
   - 20+ years of data per symbol

3. **`historical_intraday_data`** (future use)
   - 2 years of intraday price data
   - Multiple intervals: 1min, 5min, 15min, 30min, 60min

4. **`historical_data_backfill_progress`**
   - Tracks collection progress
   - Prevents duplicate API calls
   - Shows status and errors

5. **`historical_spread_analysis`**
   - Pre-analyzed spread opportunities
   - Actual outcomes (P&L, exit reason)
   - IPS scores and factor breakdowns

## Quick Start

### 1. Collect Historical Data

#### Option A: Collect for Watchlist (Recommended)
```bash
# Collect 3 years of data for all watchlist symbols
npm run backfill-historical -- --watchlist --years 3

# Dry run first to see what will happen
npm run backfill-historical -- --watchlist --years 3 --dry-run
```

#### Option B: Collect for Specific Symbols
```bash
# Collect data for specific symbols
npm run backfill-historical -- --symbols MU,AMD,TSLA --years 2

# Collect data for a custom date range
npm run backfill-historical -- --symbols AAPL --start-date 2020-01-01 --end-date 2023-12-31
```

#### Option C: Collect Only Daily Data (Faster)
```bash
# Skip options, just get daily stock data
npm run backfill-historical -- --watchlist --years 5 --data-types daily
```

### 2. Analyze Historical Spreads

After collecting data, analyze it to find optimal spreads and their outcomes:

```bash
# Analyze watchlist symbols for the past 2 years
npm run analyze-historical -- --watchlist --years 2

# Analyze specific symbols
npm run analyze-historical -- --symbols MU,AMD --start-date 2022-01-01 --end-date 2023-12-31

# Sample every 10 days instead of every 5 (faster)
npm run analyze-historical -- --watchlist --years 2 --sample-interval 10
```

## Data Collection Strategy

### What Gets Collected

**Daily Stock Data (1 API call per symbol)**
- One call gets full 20+ year history
- ~5,000 trading days per symbol
- Fast and efficient

**Options Data (Sampled)**
- Collects every 5th trading day by default
- ~250 days per year per symbol
- Each day captures full options chain
- Thousands of contracts per snapshot

### API Usage Estimates

For a typical symbol over 3 years:

```
Daily Data:     1 call
Options Data:   ~150 calls (750 days / 5)
Total:          ~151 calls per symbol
```

For 10 symbols over 3 years: **~1,510 calls** (takes ~3 minutes at 600 calls/min)

### Example: Full Watchlist Backfill

If you have 20 symbols and want 3 years of data:

```bash
npm run backfill-historical -- --watchlist --years 3 --dry-run
```

Output will show:
```
Estimated API Calls: 3,020
Estimated Time: ~5 minutes
```

## Understanding the Data

### Historical Options Data

Each snapshot includes:
- **Contract Details**: strike, expiration, type (put/call)
- **Pricing**: bid, ask, last, mark
- **Volume**: volume, open interest, bid/ask sizes
- **Greeks**: delta, gamma, theta, vega, rho
- **IV**: Implied volatility for each contract
- **Calculated**: DTE (days to expiration)

### Historical Spread Analysis

Pre-computed spreads with:
- **Entry Metrics**: credit, max profit/loss, ROI, POP
- **Greeks at Entry**: delta, theta, vega, gamma
- **Actual Outcome**: P&L %, exit date, exit reason
- **IPS Score**: Score at time of entry
- **Market Context**: underlying price, IV rank

## Querying Historical Data

### Find Similar Past Trades

```sql
-- Find historical spreads similar to current opportunity
SELECT *
FROM historical_spread_analysis
WHERE symbol = 'MU'
  AND delta BETWEEN 0.12 AND 0.15
  AND dte BETWEEN 7 AND 14
  AND actual_pl_percent IS NOT NULL
ORDER BY ips_score DESC
LIMIT 10;
```

### Analyze Win Rate by Delta

```sql
-- Win rate for different delta ranges
SELECT
  CASE
    WHEN delta BETWEEN 0.08 AND 0.12 THEN '0.08-0.12'
    WHEN delta BETWEEN 0.12 AND 0.15 THEN '0.12-0.15'
    WHEN delta BETWEEN 0.15 AND 0.18 THEN '0.15-0.18'
    WHEN delta BETWEEN 0.18 AND 0.20 THEN '0.18-0.20'
  END AS delta_range,
  COUNT(*) as total_trades,
  AVG(CASE WHEN actual_pl_percent >= 0 THEN 1.0 ELSE 0.0 END) * 100 AS win_rate,
  AVG(actual_pl_percent) as avg_return
FROM historical_spread_analysis
WHERE actual_pl_percent IS NOT NULL
  AND symbol = 'MU'
GROUP BY delta_range
ORDER BY delta_range;
```

### Find Best Exit Timing

```sql
-- Analyze which exit reasons are most profitable
SELECT
  exit_reason,
  COUNT(*) as count,
  AVG(actual_pl_percent) as avg_return,
  AVG(EXTRACT(EPOCH FROM (exit_date::timestamp - snapshot_date::timestamp)) / 86400) as avg_days_held
FROM historical_spread_analysis
WHERE actual_pl_percent IS NOT NULL
GROUP BY exit_reason
ORDER BY avg_return DESC;
```

## Integration with RAG

### Current RAG System

Your RAG currently uses:
- `trade_snapshots`: Real-time trade data
- `trade_snapshot_embeddings`: Vector embeddings

### Adding Historical Data

The historical data enhances RAG by:

1. **Pattern Matching**: Find similar historical setups
2. **Outcome Prediction**: See what happened in similar scenarios
3. **Risk Assessment**: Historical win rates by criteria
4. **Timing Optimization**: Best entry/exit timing from past trades

### Example RAG Query Enhancement

When the agent evaluates a trade:

```typescript
// Current: Only looks at IPS score and current market data
const ipsScore = calculateIPS(trade);

// Enhanced: Also queries historical similar trades
const similarHistoricalTrades = await supabase
  .from('historical_spread_analysis')
  .select('*')
  .eq('symbol', trade.symbol)
  .gte('delta', trade.delta - 0.02)
  .lte('delta', trade.delta + 0.02)
  .not('actual_pl_percent', 'is', null)
  .order('snapshot_date', { ascending: false })
  .limit(20);

// Calculate historical success rate
const historicalWinRate = similarHistoricalTrades.filter(t => t.actual_pl_percent >= 0).length / similarHistoricalTrades.length;
const avgHistoricalReturn = similarHistoricalTrades.reduce((sum, t) => sum + t.actual_pl_percent, 0) / similarHistoricalTrades.length;

// Use in decision making
const enhancedRecommendation = {
  ipsScore,
  historicalWinRate,
  avgHistoricalReturn,
  confidence: historicalWinRate > 0.7 ? 'high' : 'medium',
};
```

## Maintenance

### Check Data Coverage

```bash
# See what data you have
npm run backfill-historical -- --symbols MU --dry-run
```

### Incremental Updates

Run periodically to keep data current:

```bash
# Update last 30 days for watchlist
npm run backfill-historical -- --watchlist --start-date $(date -d '30 days ago' +%Y-%m-%d) --end-date $(date +%Y-%m-%d)
```

### Monitor Progress

Check the `historical_data_backfill_progress` table:

```sql
SELECT
  symbol,
  data_type,
  status,
  records_collected,
  started_at,
  completed_at
FROM historical_data_backfill_progress
ORDER BY started_at DESC
LIMIT 20;
```

## Troubleshooting

### Rate Limit Errors

Even with 600 calls/min, you might hit limits if:
- Multiple processes running simultaneously
- Network issues causing retries

**Solution**: The queue system handles this automatically with backoff.

### Missing Data

Some dates may have no options data:
- Holidays and weekends (automatically skipped)
- Very old data (options data starts ~2008)
- Low-volume symbols

**Check coverage**:
```sql
SELECT COUNT(DISTINCT snapshot_date) as days_collected
FROM historical_options_data
WHERE symbol = 'MU'
  AND snapshot_date BETWEEN '2022-01-01' AND '2023-12-31';
```

### Slow Analysis

If analysis is taking too long:
- Increase `--sample-interval` (e.g., every 10 days instead of 5)
- Reduce date range (`--years 1` instead of 3)
- Analyze fewer symbols at once

## Advanced Usage

### Custom Collection Service

```typescript
import { getHistoricalDataCollector } from './src/lib/services/historical-data-collector';

const collector = getHistoricalDataCollector();

// Collect specific date
await collector.collectHistoricalOptions('MU', '2023-06-15');

// Check what you have
const coverage = await collector.getDataCoverage('MU', 'options');
console.log(coverage); // { earliestDate, latestDate, totalRecords }
```

### Custom Spread Analysis

```typescript
import { getHistoricalSpreadAnalyzer } from './src/lib/services/historical-spread-analyzer';

const analyzer = getHistoricalSpreadAnalyzer();

// Find spreads for specific criteria
const spreads = await analyzer.findHistoricalSpreads('MU', '2023-06-15', {
  minDelta: 0.12,
  maxDelta: 0.15,
  minDTE: 7,
  maxDTE: 14,
  minCredit: 0.40,
});

// Calculate outcome for a specific spread
const outcome = await analyzer.calculateSpreadOutcome(spreads[0]);
```

## Next Steps

1. **Start with a test**: Run with `--dry-run` first
2. **Collect data**: Start with 1-2 symbols and 1 year
3. **Verify data**: Query the tables to confirm data quality
4. **Analyze**: Run spread analysis on collected data
5. **Scale up**: Once comfortable, run full watchlist backfill
6. **Integrate**: Use historical data in your RAG queries

## Summary

You now have a complete system for:
- ✅ Collecting 15+ years of historical options data
- ✅ Storing 20+ years of stock price data
- ✅ Analyzing optimal spread opportunities and outcomes
- ✅ Tracking collection progress
- ✅ Querying historical patterns for RAG

With your 600 calls/minute limit, you can backfill years of data quickly and keep it updated with minimal effort.
