# Supabase Table Consolidation Audit
**Date:** October 13, 2025

## Executive Summary

After auditing all 17 tables in your Supabase database, I've identified **significant redundancies and opportunities for consolidation**. The `trades` table has grown to **65 columns** with massive duplication, several tables are completely empty, and behavioral metrics are spread across multiple tables.

**Key Findings:**
- 🔴 **CRITICAL**: `trades` table has 65 columns (should be ~25-30)
- 🔴 **7 empty tables** that were created but never used
- 🟡 **Duplicate data** across trade_snapshots, trades behavioral columns
- 🟡 **Redundant columns** in trades table (strike_price vs short_strike/long_strike)
- 🟢 **RAG tables** are properly structured and should be kept

---

## Table Inventory

### Tables by Status

#### ✅ **Active & Healthy** (6 tables)
1. `trades` - 40 rows (BUT BLOATED - needs cleanup)
2. `ips_configurations` - 1 row
3. `ips_factors` - 21 rows
4. `factor_definitions` - 210 rows
5. `watchlist_items` - 22 rows
6. `vol_regime_daily` - 4,001 rows

#### ⚠️ **Active but Needs Work** (4 tables)
7. `trade_embeddings` - 35 rows (RAG - KEEP)
8. `trade_postmortems` - 16 rows (AI analysis - KEEP but review structure)
9. `reddit_sentiment` - 86 rows (KEEP but low usage)
10. `daily_market_context` - 0 rows (NEW - just added, KEEP)

#### ❌ **Empty/Unused** (7 tables - DELETE or POPULATE)
11. `trade_snapshots` - 0 rows ⚠️ **CRITICAL - designed but never used!**
12. `snapshot_embeddings` - 0 rows
13. `trade_monitor_cache` - 0 rows
14. `iv_cache` - 0 rows
15. `api_sync_log` - 0 rows
16. `news_sentiment_history` - 0 rows
17. `insider_transactions_history` - 0 rows

---

## 🔴 CRITICAL ISSUE #1: Bloated `trades` Table

### Problem: 65 Columns (Too Many!)

The `trades` table has **65 columns**, many of which are:
- Duplicates (different names for same data)
- Should be in related tables
- Behavioral metrics that belong in snapshots
- Calculated fields that could be computed

### Redundant/Duplicate Columns

| Current Columns | Issue | Recommendation |
|----------------|-------|----------------|
| `strike_price`, `strike_price_short`, `strike_price_long`, `short_strike`, `long_strike` | **5 columns for 2 values!** | Keep only `short_strike`, `long_strike` |
| `contracts`, `quantity`, `number_of_contracts` | **3 columns for same data!** | Keep only `number_of_contracts` |
| `realized_pnl`, `realized_pl`, `realized_pl_percent` | Duplicate naming | Keep `realized_pnl` and `realized_pnl_percent` |
| `premium_collected`, `credit_received` | Same data | Keep `credit_received` |
| `entry_price`, `exit_price` | Redundant for spreads | Remove (use credit/debit values) |

### Behavioral Metrics (Should be in trade_snapshots)

These columns belong in `trade_snapshots`, NOT `trades`:

```
peak_unrealized_pnl
peak_unrealized_pnl_percent
lowest_unrealized_pnl
lowest_unrealized_pnl_percent
max_delta_reached
min_delta_reached
days_at_profit
days_above_50pct_profit
total_snapshots
first_snapshot_at
last_snapshot_at
```

**Why?** These are *temporal metrics* that should be calculated from snapshots, not stored on the trade record.

### Current State Greeks (Should be in latest snapshot)

```
delta_short_leg
theta
vega
iv_at_entry
current_spread_price
current_spread_bid
current_spread_ask
spread_price_updated_at
```

**Why?** These are *point-in-time* values that should come from the most recent snapshot.

---

## 🔴 CRITICAL ISSUE #2: Empty `trade_snapshots` Table

### The Problem

You built a comprehensive snapshot system (`trade-snapshot-service.ts`, migrations, etc.) but **the table has 0 rows**! This means:

1. ❌ Behavioral metrics calculation doesn't work
2. ❌ RAG `snapshot_embeddings` can't be populated
3. ❌ Temporal pattern detection is impossible
4. ❌ The snapshot job isn't running or failing silently

### What Should Be There

Based on your 40 trades, you should have **hundreds of snapshots** by now (daily snapshots for active trades + event-triggered snapshots).

### Investigation Needed

Check:
1. Is the snapshot job running? (`/api/jobs/snapshot-sync`)
2. Are there errors in the snapshot service?
3. Is the table schema correct?

---

## 🟡 ISSUE #3: Empty Cache/History Tables

### Empty Tables That Should Have Data

| Table | Purpose | Why Empty? |
|-------|---------|------------|
| `iv_cache` | Cache IV rank/percentile | Not being populated |
| `api_sync_log` | Track API sync jobs | Not using logging system |
| `news_sentiment_history` | Alpha Intelligence news | System not activated |
| `insider_transactions_history` | Alpha Intelligence insiders | System not activated |

**Recommendation:** Either populate these or delete them until needed.

---

## Consolidation Plan

### Phase 1: Fix Critical Issues

#### 1.1 Clean Up `trades` Table (Remove 25+ columns)

**Columns to DELETE:**
```sql
ALTER TABLE trades DROP COLUMN IF EXISTS strike_price;
ALTER TABLE trades DROP COLUMN IF EXISTS strike_price_short;
ALTER TABLE trades DROP COLUMN IF EXISTS strike_price_long;
ALTER TABLE trades DROP COLUMN IF EXISTS quantity;
ALTER TABLE trades DROP COLUMN IF EXISTS contracts;
ALTER TABLE trades DROP COLUMN IF EXISTS entry_price;
ALTER TABLE trades DROP COLUMN IF EXISTS exit_price;
ALTER TABLE trades DROP COLUMN IF EXISTS premium_collected;
ALTER TABLE trades DROP COLUMN IF EXISTS premium_paid;
ALTER TABLE trades DROP COLUMN IF EXISTS ips_score_calculation_id;

-- Remove behavioral metrics (should be in snapshots)
ALTER TABLE trades DROP COLUMN IF EXISTS peak_unrealized_pnl;
ALTER TABLE trades DROP COLUMN IF EXISTS peak_unrealized_pnl_percent;
ALTER TABLE trades DROP COLUMN IF EXISTS lowest_unrealized_pnl;
ALTER TABLE trades DROP COLUMN IF EXISTS lowest_unrealized_pnl_percent;
ALTER TABLE trades DROP COLUMN IF EXISTS max_delta_reached;
ALTER TABLE trades DROP COLUMN IF EXISTS min_delta_reached;
ALTER TABLE trades DROP COLUMN IF EXISTS days_at_profit;
ALTER TABLE trades DROP COLUMN IF EXISTS days_above_50pct_profit;
ALTER TABLE trades DROP COLUMN IF EXISTS total_snapshots;
ALTER TABLE trades DROP COLUMN IF EXISTS first_snapshot_at;
ALTER TABLE trades DROP COLUMN IF EXISTS last_snapshot_at;

-- Remove current state columns (should come from latest snapshot)
ALTER TABLE trades DROP COLUMN IF EXISTS delta_short_leg;
ALTER TABLE trades DROP COLUMN IF EXISTS theta;
ALTER TABLE trades DROP COLUMN IF EXISTS vega;
ALTER TABLE trades DROP COLUMN IF EXISTS current_spread_price;
ALTER TABLE trades DROP COLUMN IF EXISTS current_spread_bid;
ALTER TABLE trades DROP COLUMN IF EXISTS current_spread_ask;
ALTER TABLE trades DROP COLUMN IF EXISTS spread_price_updated_at;
```

**Result:** `trades` table goes from 65 columns → **~35 columns**

#### 1.2 Verify `trade_snapshots` Schema

Check that trade_snapshots has all the columns from your service:

```sql
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'trade_snapshots'
ORDER BY ordinal_position;
```

If empty, re-run the migration:
```bash
psql ... -f supabase/migrations/20251009_create_trade_snapshots.sql
```

#### 1.3 Populate `trade_snapshots`

Run the snapshot job manually for all active trades:

```bash
curl -X POST http://localhost:3000/api/jobs/snapshot-sync \
  -H "Authorization: Bearer $CRON_SECRET"
```

---

### Phase 2: Remove Empty Tables

#### 2.1 Delete Completely Unused Tables

```sql
-- These were never implemented
DROP TABLE IF EXISTS snapshot_embeddings;  -- Never used, use trade_embeddings
DROP TABLE IF EXISTS trade_monitor_cache;   -- Never used
DROP TABLE IF EXISTS api_sync_log;          -- Never used

-- Alpha Intelligence tables (not yet activated)
DROP TABLE IF EXISTS news_sentiment_history;  -- Keep or delete based on plan
DROP TABLE IF EXISTS insider_transactions_history;  -- Keep or delete based on plan
```

#### 2.2 Keep for Future Use

```sql
-- Keep these for future features:
-- - iv_cache (for IV rank/percentile caching)
-- - daily_market_context (just added)
```

---

### Phase 3: Optimize Data Structure

#### 3.1 Create Views for Computed Fields

Instead of storing behavioral metrics in `trades`, create views:

```sql
CREATE OR REPLACE VIEW trades_with_behavioral_metrics AS
SELECT
  t.*,
  -- Calculate behavioral metrics from snapshots
  MAX(ts.unrealized_pnl) as peak_unrealized_pnl,
  MAX(ts.unrealized_pnl_percent) as peak_unrealized_pnl_percent,
  MIN(ts.unrealized_pnl) as lowest_unrealized_pnl,
  MIN(ts.unrealized_pnl_percent) as lowest_unrealized_pnl_percent,
  MAX(ABS(ts.delta_spread)) as max_delta_reached,
  MIN(ABS(ts.delta_spread)) as min_delta_reached,
  COUNT(CASE WHEN ts.unrealized_pnl > 0 THEN 1 END) as days_at_profit,
  COUNT(CASE WHEN ts.unrealized_pnl_percent > 50 THEN 1 END) as days_above_50pct_profit,
  COUNT(ts.id) as total_snapshots,
  MIN(ts.snapshot_time) as first_snapshot_at,
  MAX(ts.snapshot_time) as last_snapshot_at
FROM trades t
LEFT JOIN trade_snapshots ts ON ts.trade_id = t.id
GROUP BY t.id;
```

#### 3.2 Create View for Latest Greeks

```sql
CREATE OR REPLACE VIEW trades_with_latest_greeks AS
SELECT
  t.*,
  ts.delta_short_leg,
  ts.delta_long_leg,
  ts.delta_spread,
  ts.theta,
  ts.vega,
  ts.gamma,
  ts.current_spread_price,
  ts.iv_short_strike,
  ts.iv_long_strike
FROM trades t
LEFT JOIN LATERAL (
  SELECT * FROM trade_snapshots
  WHERE trade_id = t.id
  ORDER BY snapshot_time DESC
  LIMIT 1
) ts ON true;
```

---

## Recommended Final Table Structure

### Core Tables (6)
1. ✅ `trades` - **35 columns** (down from 65)
2. ✅ `ips_configurations` - 19 columns
3. ✅ `ips_factors` - 14 columns
4. ✅ `factor_definitions` - 12 columns
5. ✅ `watchlist_items` - 22 columns
6. ✅ `trade_snapshots` - **Full schema** (populate it!)

### Market Data (2)
7. ✅ `vol_regime_daily` - 12 columns
8. ✅ `iv_cache` - Keep for future (currently empty)

### RAG/AI (4)
9. ✅ `trade_embeddings` - 6 columns
10. ✅ `trade_postmortems` - 5 columns
11. ✅ `daily_market_context` - NEW (just added)
12. ❌ `snapshot_embeddings` - **DELETE** (use trade_embeddings)

### Sentiment (1-2)
13. ✅ `reddit_sentiment` - 12 columns
14. ⚠️ `news_sentiment_history` - Keep if using Alpha Intelligence
15. ⚠️ `insider_transactions_history` - Keep if using Alpha Intelligence

### Views (Computed Data)
- `trades_with_behavioral_metrics` - Computed from snapshots
- `trades_with_latest_greeks` - Latest snapshot greeks
- `recent_market_context` - Last 30 days (already exists)

---

## Migration Scripts Needed

### 1. Clean trades table
```bash
supabase/migrations/20251013_cleanup_trades_table.sql
```

### 2. Verify/fix trade_snapshots
```bash
supabase/migrations/20251013_verify_trade_snapshots.sql
```

### 3. Create views
```bash
supabase/migrations/20251013_create_computed_views.sql
```

### 4. Drop unused tables
```bash
supabase/migrations/20251013_drop_unused_tables.sql
```

---

## Benefits of Consolidation

### Storage Savings
- **trades**: 65 → 35 columns (~46% reduction)
- **5 empty tables deleted**: Removes clutter
- **Computed views**: No duplicate data storage

### Performance Improvements
- ✅ Smaller table scans on trades
- ✅ Better index utilization
- ✅ Clearer data model

### Maintainability
- ✅ Single source of truth for behavioral metrics (snapshots)
- ✅ No duplicate columns
- ✅ Easier to understand schema

### Data Integrity
- ✅ Behavioral metrics always match snapshots
- ✅ No stale "current" values in trades table
- ✅ Clear separation of concerns

---

## Risks & Mitigation

### Risk 1: Breaking Existing Code

**Mitigation:**
- Create views with old column names for backward compatibility
- Update code incrementally
- Test thoroughly before production

### Risk 2: Losing Data

**Mitigation:**
- **BACKUP FIRST**: `pg_dump` before any changes
- Test migrations on a copy
- Keep migrations reversible

### Risk 3: trade_snapshots Issues

**Mitigation:**
- Investigate why it's empty before proceeding
- Fix snapshot service first
- Populate historical snapshots if possible

---

## Next Steps

1. **IMMEDIATE**: Investigate why `trade_snapshots` is empty
   ```bash
   # Check if snapshot job is running
   curl http://localhost:3000/api/jobs/snapshot-sync

   # Check service logs
   npm run dev
   # Look for snapshot errors
   ```

2. **BACKUP**: Export current database
   ```bash
   pg_dump ... > backup_before_consolidation.sql
   ```

3. **CREATE MIGRATIONS**: I can create all the migration scripts

4. **TEST**: Run on a copy/staging environment first

5. **DEPLOY**: Apply to production

---

## Questions for You

Before I create the migrations, please clarify:

1. **Alpha Intelligence**: Are you actively using `news_sentiment_history` and `insider_transactions_history`? If not, should we delete them?

2. **Snapshot System**: Do you want me to investigate why `trade_snapshots` is empty?

3. **Breaking Changes**: Are you okay with potentially breaking existing code that references the removed columns? (I can create backward-compatible views)

4. **Timing**: When should we do this? (Recommend off-hours with trades closed)

---

**Ready to proceed with consolidation?** Let me know and I'll create all the migration scripts!
