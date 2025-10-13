-- Migration: Create materialized views for trade behavioral patterns
-- Purpose: Fast querying of aggregated pattern data for agent learning

-- Materialized view for closed trade behavioral patterns
CREATE MATERIALIZED VIEW IF NOT EXISTS trade_behavioral_patterns AS
SELECT
  t.id,
  t.user_id,
  t.symbol,
  t.strategy_type,
  t.contract_type,
  t.sector,
  t.entry_date,
  t.exit_date,
  t.status,
  t.realized_pnl,
  t.realized_pl_percent,
  t.ips_score,

  -- Snapshot-derived metrics
  t.peak_unrealized_pnl_percent,
  t.lowest_unrealized_pnl_percent,
  t.max_delta_reached,
  t.min_delta_reached,
  t.days_at_profit,
  t.days_above_50pct_profit,
  t.total_snapshots,

  -- Calculated behavioral indicators
  CASE
    WHEN t.realized_pl_percent > 0 THEN 'win'
    ELSE 'loss'
  END as outcome,

  CASE
    WHEN t.peak_unrealized_pnl_percent > 50 AND t.realized_pl_percent < 25 THEN TRUE
    ELSE FALSE
  END as gave_back_profits,

  CASE
    WHEN t.max_delta_reached > 0.40 THEN TRUE
    ELSE FALSE
  END as high_delta_reached,

  CASE
    WHEN t.days_above_50pct_profit > 0 AND t.realized_pl_percent < 50 THEN TRUE
    ELSE FALSE
  END as missed_exit_opportunity,

  -- Snapshot statistics
  COUNT(ts.id) as snapshot_count,
  MAX(ts.delta_spread) as max_delta_from_snapshots,
  MAX(ts.unrealized_pnl_percent) as peak_pnl_pct,
  MIN(ts.unrealized_pnl_percent) as lowest_pnl_pct,
  AVG(ts.iv_rank) as avg_iv_rank_during_trade,
  AVG(ts.vix_level) as avg_vix_during_trade,

  -- Days-based metrics
  EXTRACT(DAY FROM (CAST(t.exit_date AS TIMESTAMP) - CAST(t.entry_date AS TIMESTAMP)))::INTEGER as days_held,
  COUNT(*) FILTER (WHERE ts.unrealized_pnl_percent > 50) as days_above_50pct_target,
  COUNT(*) FILTER (WHERE ts.delta_spread > 0.30) as days_above_30_delta,
  COUNT(*) FILTER (WHERE ts.delta_spread > 0.40) as days_above_40_delta

FROM trades t
LEFT JOIN trade_snapshots ts ON ts.trade_id = t.id
WHERE t.status = 'closed'
GROUP BY t.id;

-- Indexes on materialized view for fast pattern queries
CREATE INDEX IF NOT EXISTS idx_behavioral_patterns_outcome
  ON trade_behavioral_patterns (outcome);

CREATE INDEX IF NOT EXISTS idx_behavioral_patterns_high_delta
  ON trade_behavioral_patterns (high_delta_reached);

CREATE INDEX IF NOT EXISTS idx_behavioral_patterns_gave_back
  ON trade_behavioral_patterns (gave_back_profits);

CREATE INDEX IF NOT EXISTS idx_behavioral_patterns_symbol
  ON trade_behavioral_patterns (symbol);

CREATE INDEX IF NOT EXISTS idx_behavioral_patterns_user_id
  ON trade_behavioral_patterns (user_id);

-- View for delta threshold analysis (your specific example)
CREATE OR REPLACE VIEW delta_threshold_analysis AS
SELECT
  'Delta > 0.30' as threshold_rule,
  COUNT(*) as total_trades,
  COUNT(*) FILTER (WHERE outcome = 'loss') as losses,
  COUNT(*) FILTER (WHERE outcome = 'win') as wins,
  ROUND(100.0 * COUNT(*) FILTER (WHERE outcome = 'loss') / NULLIF(COUNT(*), 0), 2) as loss_rate_pct,
  ROUND(AVG(realized_pl_percent) FILTER (WHERE outcome = 'loss'), 2) as avg_loss_pct,
  ROUND(AVG(days_held) FILTER (WHERE days_above_30_delta > 0), 2) as avg_days_held
FROM trade_behavioral_patterns
WHERE days_above_30_delta > 0

UNION ALL

SELECT
  'Delta > 0.40' as threshold_rule,
  COUNT(*) as total_trades,
  COUNT(*) FILTER (WHERE outcome = 'loss') as losses,
  COUNT(*) FILTER (WHERE outcome = 'win') as wins,
  ROUND(100.0 * COUNT(*) FILTER (WHERE outcome = 'loss') / NULLIF(COUNT(*), 0), 2) as loss_rate_pct,
  ROUND(AVG(realized_pl_percent) FILTER (WHERE outcome = 'loss'), 2) as avg_loss_pct,
  ROUND(AVG(days_held) FILTER (WHERE days_above_40_delta > 0), 2) as avg_days_held
FROM trade_behavioral_patterns
WHERE days_above_40_delta > 0

UNION ALL

SELECT
  'Gave Back Profits' as threshold_rule,
  COUNT(*) as total_trades,
  COUNT(*) FILTER (WHERE outcome = 'loss') as losses,
  COUNT(*) FILTER (WHERE outcome = 'win') as wins,
  ROUND(100.0 * COUNT(*) FILTER (WHERE outcome = 'loss') / NULLIF(COUNT(*), 0), 2) as loss_rate_pct,
  ROUND(AVG(realized_pl_percent), 2) as avg_loss_pct,
  ROUND(AVG(days_held), 2) as avg_days_held
FROM trade_behavioral_patterns
WHERE gave_back_profits = TRUE;

-- View for exit timing analysis
CREATE OR REPLACE VIEW exit_timing_analysis AS
SELECT
  CASE
    WHEN days_above_50pct_profit = 0 THEN 'Never reached 50%'
    WHEN days_above_50pct_profit > 0 AND realized_pl_percent >= 50 THEN 'Closed at/above 50%'
    WHEN days_above_50pct_profit > 0 AND realized_pl_percent < 50 THEN 'Missed 50% exit'
    ELSE 'Other'
  END as exit_category,
  COUNT(*) as trade_count,
  COUNT(*) FILTER (WHERE outcome = 'win') as wins,
  COUNT(*) FILTER (WHERE outcome = 'loss') as losses,
  ROUND(100.0 * COUNT(*) FILTER (WHERE outcome = 'win') / NULLIF(COUNT(*), 0), 2) as win_rate_pct,
  ROUND(AVG(realized_pl_percent), 2) as avg_return_pct,
  ROUND(AVG(days_held), 2) as avg_days_held
FROM trade_behavioral_patterns
GROUP BY exit_category
ORDER BY win_rate_pct DESC;

-- View for IPS score validation with behavioral data
CREATE OR REPLACE VIEW ips_behavioral_validation AS
WITH ips_ranges AS (
  SELECT
    CASE
      WHEN ips_score >= 80 THEN '80-100 (Very High)'
      WHEN ips_score >= 70 THEN '70-79 (High)'
      WHEN ips_score >= 60 THEN '60-69 (Medium)'
      WHEN ips_score >= 50 THEN '50-59 (Low)'
      ELSE 'Below 50 (Very Low)'
    END as ips_range,
    outcome,
    realized_pl_percent,
    max_delta_reached,
    high_delta_reached,
    gave_back_profits
  FROM trade_behavioral_patterns
  WHERE ips_score IS NOT NULL
)
SELECT
  ips_range,
  COUNT(*) as total_trades,
  ROUND(100.0 * COUNT(*) FILTER (WHERE outcome = 'win') / NULLIF(COUNT(*), 0), 2) as win_rate_pct,
  ROUND(AVG(realized_pl_percent), 2) as avg_return_pct,
  ROUND(AVG(max_delta_reached), 3) as avg_max_delta,
  COUNT(*) FILTER (WHERE high_delta_reached = TRUE) as high_delta_count,
  COUNT(*) FILTER (WHERE gave_back_profits = TRUE) as gave_back_count
FROM ips_ranges
GROUP BY ips_range
ORDER BY
  CASE ips_range
    WHEN '80-100 (Very High)' THEN 1
    WHEN '70-79 (High)' THEN 2
    WHEN '60-69 (Medium)' THEN 3
    WHEN '50-59 (Low)' THEN 4
    ELSE 5
  END;

-- Function to refresh materialized view
CREATE OR REPLACE FUNCTION refresh_behavioral_patterns()
RETURNS VOID AS $$
BEGIN
  REFRESH MATERIALIZED VIEW trade_behavioral_patterns;
END;
$$ LANGUAGE plpgsql;

-- Comments
COMMENT ON MATERIALIZED VIEW trade_behavioral_patterns IS 'Aggregated behavioral patterns from trades and snapshots for fast pattern analysis';
COMMENT ON VIEW delta_threshold_analysis IS 'Analysis of outcomes when delta thresholds are breached';
COMMENT ON VIEW exit_timing_analysis IS 'Analysis of exit timing effectiveness and missed opportunities';
COMMENT ON VIEW ips_behavioral_validation IS 'Validates IPS scoring effectiveness using behavioral trade data';
