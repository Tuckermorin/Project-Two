-- Migration: Create IPS Backtesting Infrastructure
-- Created: 2025-10-22
-- Description: Tables and functions for backtesting different IPS configurations
--              Allows comparison of IPS variants and identification of best performers

-- ============================================================================
-- ips_backtest_runs: Tracks individual backtest executions
-- ============================================================================

CREATE TABLE IF NOT EXISTS ips_backtest_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- IPS Configuration
  ips_id UUID NOT NULL, -- References ips_configurations table
  ips_name TEXT NOT NULL,
  ips_config JSONB NOT NULL, -- Full IPS config snapshot at time of backtest

  -- Backtest Parameters
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  total_days INTEGER GENERATED ALWAYS AS (end_date - start_date) STORED,

  -- Data Selection Criteria
  symbols TEXT[], -- Symbols included in backtest (null = all available)
  strategy_filter TEXT, -- Filter by strategy type (null = all strategies)
  min_trades INTEGER DEFAULT 10, -- Minimum trades required for valid backtest

  -- Execution Metadata
  status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'running', 'completed', 'failed'
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  duration_seconds INTEGER,
  error_message TEXT,

  -- Results Summary (populated after completion)
  total_trades_analyzed INTEGER,
  trades_matched INTEGER, -- How many trades matched this IPS
  trades_passed INTEGER, -- How many passed IPS criteria
  pass_rate NUMERIC, -- Percentage that passed

  -- User and timestamps
  user_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_ips_backtest_runs_ips_id ON ips_backtest_runs(ips_id);
CREATE INDEX IF NOT EXISTS idx_ips_backtest_runs_user_id ON ips_backtest_runs(user_id);
CREATE INDEX IF NOT EXISTS idx_ips_backtest_runs_status ON ips_backtest_runs(status);
CREATE INDEX IF NOT EXISTS idx_ips_backtest_runs_dates ON ips_backtest_runs(start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_ips_backtest_runs_created_at ON ips_backtest_runs(created_at DESC);

-- ============================================================================
-- ips_backtest_results: Performance metrics for each IPS configuration
-- ============================================================================

CREATE TABLE IF NOT EXISTS ips_backtest_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL REFERENCES ips_backtest_runs(id) ON DELETE CASCADE,
  ips_id UUID NOT NULL,

  -- Win Rate Metrics
  total_trades INTEGER NOT NULL,
  winning_trades INTEGER NOT NULL,
  losing_trades INTEGER NOT NULL,
  win_rate NUMERIC NOT NULL, -- Percentage (0-100)

  -- P&L Metrics
  total_pnl NUMERIC NOT NULL,
  avg_pnl NUMERIC NOT NULL,
  median_pnl NUMERIC,
  max_win NUMERIC,
  max_loss NUMERIC,

  -- ROI Metrics (percentage-based)
  avg_roi NUMERIC NOT NULL,
  median_roi NUMERIC,
  best_roi NUMERIC,
  worst_roi NUMERIC,

  -- Risk Metrics
  sharpe_ratio NUMERIC, -- Risk-adjusted return
  sortino_ratio NUMERIC, -- Downside risk-adjusted return
  max_drawdown NUMERIC, -- Maximum peak-to-trough decline
  max_drawdown_duration_days INTEGER,

  -- Consistency Metrics
  win_streak_max INTEGER,
  loss_streak_max INTEGER,
  profit_factor NUMERIC, -- Gross profit / Gross loss

  -- Time-based Metrics
  avg_days_held NUMERIC,
  avg_days_to_expiration NUMERIC,

  -- Strategy Breakdown (JSONB for flexibility)
  strategy_performance JSONB, -- Performance by strategy type
  symbol_performance JSONB, -- Performance by symbol
  monthly_performance JSONB, -- Performance by month

  -- IPS Factor Analysis
  factor_correlation JSONB, -- Which factors correlated with wins/losses
  factor_importance JSONB, -- Which factors were most predictive

  -- Confidence Intervals (95%)
  win_rate_ci_lower NUMERIC,
  win_rate_ci_upper NUMERIC,
  avg_roi_ci_lower NUMERIC,
  avg_roi_ci_upper NUMERIC,

  -- Comparison Metrics (vs benchmark)
  outperformance_vs_random NUMERIC, -- vs random stock picking
  outperformance_vs_market NUMERIC, -- vs SPY buy-and-hold

  -- Metadata
  calculated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_ips_backtest_results_run_id ON ips_backtest_results(run_id);
CREATE INDEX IF NOT EXISTS idx_ips_backtest_results_ips_id ON ips_backtest_results(ips_id);
CREATE INDEX IF NOT EXISTS idx_ips_backtest_results_win_rate ON ips_backtest_results(win_rate DESC);
CREATE INDEX IF NOT EXISTS idx_ips_backtest_results_avg_roi ON ips_backtest_results(avg_roi DESC);
CREATE INDEX IF NOT EXISTS idx_ips_backtest_results_sharpe ON ips_backtest_results(sharpe_ratio DESC);

-- ============================================================================
-- ips_backtest_trade_matches: Individual trade-level results
-- ============================================================================

CREATE TABLE IF NOT EXISTS ips_backtest_trade_matches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL REFERENCES ips_backtest_runs(id) ON DELETE CASCADE,
  trade_id UUID NOT NULL REFERENCES trades(id),

  -- IPS Evaluation
  ips_score NUMERIC NOT NULL, -- Score this trade got from IPS
  passed_ips BOOLEAN NOT NULL, -- Did it pass all IPS criteria?
  factors_passed INTEGER NOT NULL, -- How many factors passed
  factors_failed INTEGER NOT NULL, -- How many factors failed
  factor_scores JSONB NOT NULL, -- Detailed score for each factor

  -- Trade Outcome (at time of backtest)
  trade_status TEXT NOT NULL, -- Status at time of backtest
  realized_pnl NUMERIC, -- Actual P&L (if closed)
  realized_roi NUMERIC, -- Actual ROI percentage
  days_held INTEGER,

  -- Counterfactual Analysis
  would_have_traded BOOLEAN NOT NULL, -- Would agent have taken this trade?
  actual_outcome TEXT, -- 'win', 'loss', 'pending'

  -- Factor Details
  failing_factors JSONB, -- Which factors caused rejection
  marginal_factors JSONB, -- Factors close to threshold

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_ips_backtest_trade_matches_run_id ON ips_backtest_trade_matches(run_id);
CREATE INDEX IF NOT EXISTS idx_ips_backtest_trade_matches_trade_id ON ips_backtest_trade_matches(trade_id);
CREATE INDEX IF NOT EXISTS idx_ips_backtest_trade_matches_passed ON ips_backtest_trade_matches(passed_ips);

-- ============================================================================
-- ips_performance_snapshots: Daily performance tracking
-- ============================================================================

CREATE TABLE IF NOT EXISTS ips_performance_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL REFERENCES ips_backtest_runs(id) ON DELETE CASCADE,
  ips_id UUID NOT NULL,

  -- Snapshot Date
  snapshot_date DATE NOT NULL,

  -- Cumulative Metrics
  cumulative_trades INTEGER NOT NULL,
  cumulative_pnl NUMERIC NOT NULL,
  cumulative_roi NUMERIC NOT NULL,

  -- Rolling Metrics (30-day window)
  rolling_win_rate NUMERIC,
  rolling_avg_roi NUMERIC,
  rolling_sharpe NUMERIC,

  -- Portfolio Metrics
  active_trades INTEGER,
  total_capital_deployed NUMERIC,
  unrealized_pnl NUMERIC,

  -- Drawdown Tracking
  peak_portfolio_value NUMERIC,
  current_drawdown NUMERIC, -- Current drawdown from peak

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE(run_id, snapshot_date)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_ips_performance_snapshots_run_id ON ips_performance_snapshots(run_id);
CREATE INDEX IF NOT EXISTS idx_ips_performance_snapshots_date ON ips_performance_snapshots(snapshot_date DESC);

-- ============================================================================
-- ips_comparison_matrix: Head-to-head IPS comparisons
-- ============================================================================

CREATE TABLE IF NOT EXISTS ips_comparison_matrix (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- IPSs being compared
  ips_ids UUID[] NOT NULL, -- Array of IPS IDs
  comparison_name TEXT,

  -- Comparison Parameters
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  symbols TEXT[], -- Common symbol set

  -- Winner Determination
  best_win_rate_ips_id UUID,
  best_roi_ips_id UUID,
  best_sharpe_ips_id UUID,
  best_consistency_ips_id UUID,
  best_overall_ips_id UUID, -- Composite score

  -- Comparison Summary (JSONB for flexibility)
  summary_stats JSONB, -- Side-by-side comparison
  statistical_significance JSONB, -- P-values for differences

  -- User and timestamps
  user_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_ips_comparison_matrix_user_id ON ips_comparison_matrix(user_id);
CREATE INDEX IF NOT EXISTS idx_ips_comparison_matrix_created_at ON ips_comparison_matrix(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ips_comparison_matrix_ips_ids ON ips_comparison_matrix USING gin(ips_ids);

-- ============================================================================
-- Functions
-- ============================================================================

-- Function: Calculate confidence intervals for win rate
CREATE OR REPLACE FUNCTION calculate_win_rate_ci(
  wins INTEGER,
  total INTEGER,
  confidence_level NUMERIC DEFAULT 0.95
)
RETURNS TABLE(lower_bound NUMERIC, upper_bound NUMERIC)
LANGUAGE plpgsql
AS $$
DECLARE
  p NUMERIC;
  z NUMERIC;
  margin NUMERIC;
BEGIN
  IF total = 0 THEN
    RETURN QUERY SELECT 0::NUMERIC, 0::NUMERIC;
    RETURN;
  END IF;

  p := wins::NUMERIC / total;
  z := 1.96; -- 95% confidence

  margin := z * SQRT((p * (1 - p)) / total);

  RETURN QUERY SELECT
    GREATEST(0, (p - margin) * 100)::NUMERIC,
    LEAST(100, (p + margin) * 100)::NUMERIC;
END;
$$;

-- Function: Calculate Sharpe ratio
CREATE OR REPLACE FUNCTION calculate_sharpe_ratio(
  returns NUMERIC[],
  risk_free_rate NUMERIC DEFAULT 0.02 -- 2% annual
)
RETURNS NUMERIC
LANGUAGE plpgsql
AS $$
DECLARE
  avg_return NUMERIC;
  std_dev NUMERIC;
  sharpe NUMERIC;
BEGIN
  IF array_length(returns, 1) < 2 THEN
    RETURN NULL;
  END IF;

  -- Calculate average return
  SELECT AVG(r) INTO avg_return FROM unnest(returns) AS r;

  -- Calculate standard deviation
  SELECT SQRT(AVG((r - avg_return) ^ 2)) INTO std_dev FROM unnest(returns) AS r;

  IF std_dev = 0 THEN
    RETURN NULL;
  END IF;

  -- Annualize and calculate Sharpe
  sharpe := ((avg_return / 100) - risk_free_rate) / (std_dev / 100);

  RETURN sharpe;
END;
$$;

-- Function: Update backtest run status
CREATE OR REPLACE FUNCTION update_backtest_run_status(
  p_run_id UUID,
  p_status TEXT,
  p_error_message TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE ips_backtest_runs
  SET
    status = p_status,
    error_message = p_error_message,
    updated_at = NOW(),
    completed_at = CASE WHEN p_status IN ('completed', 'failed') THEN NOW() ELSE NULL END,
    duration_seconds = CASE
      WHEN p_status IN ('completed', 'failed') AND started_at IS NOT NULL
      THEN EXTRACT(EPOCH FROM (NOW() - started_at))::INTEGER
      ELSE NULL
    END
  WHERE id = p_run_id;
END;
$$;

-- ============================================================================
-- Views
-- ============================================================================

-- View: IPS Leaderboard (best performing IPSs)
CREATE OR REPLACE VIEW v_ips_leaderboard AS
SELECT
  r.ips_id,
  MAX(r.ips_name) as ips_name,
  COUNT(DISTINCT br.id) as backtest_count,
  AVG(r.win_rate) as avg_win_rate,
  AVG(r.avg_roi) as avg_roi,
  AVG(r.sharpe_ratio) as avg_sharpe,
  AVG(r.total_trades) as avg_trades_analyzed,
  MAX(br.end_date) as last_tested
FROM ips_backtest_results r
JOIN ips_backtest_runs br ON r.run_id = br.id
WHERE br.status = 'completed'
GROUP BY r.ips_id
ORDER BY avg_sharpe DESC NULLS LAST, avg_roi DESC;

-- View: Recent backtest runs
CREATE OR REPLACE VIEW v_recent_backtest_runs AS
SELECT
  br.id,
  br.ips_name,
  br.status,
  br.start_date,
  br.end_date,
  br.trades_matched,
  br.pass_rate,
  r.win_rate,
  r.avg_roi,
  r.sharpe_ratio,
  br.created_at
FROM ips_backtest_runs br
LEFT JOIN ips_backtest_results r ON br.id = r.run_id
ORDER BY br.created_at DESC
LIMIT 50;

-- ============================================================================
-- RLS Policies
-- ============================================================================

ALTER TABLE ips_backtest_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE ips_backtest_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE ips_backtest_trade_matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE ips_performance_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE ips_comparison_matrix ENABLE ROW LEVEL SECURITY;

-- Users can only see their own backtests
CREATE POLICY "Users can view own backtest runs"
  ON ips_backtest_runs FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create own backtest runs"
  ON ips_backtest_runs FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own backtest runs"
  ON ips_backtest_runs FOR UPDATE
  USING (auth.uid() = user_id);

-- Service role has full access
CREATE POLICY "Service role full access to backtest runs"
  ON ips_backtest_runs FOR ALL
  TO service_role
  USING (true);

CREATE POLICY "Service role full access to backtest results"
  ON ips_backtest_results FOR ALL
  TO service_role
  USING (true);

CREATE POLICY "Service role full access to trade matches"
  ON ips_backtest_trade_matches FOR ALL
  TO service_role
  USING (true);

CREATE POLICY "Service role full access to performance snapshots"
  ON ips_performance_snapshots FOR ALL
  TO service_role
  USING (true);

CREATE POLICY "Service role full access to comparison matrix"
  ON ips_comparison_matrix FOR ALL
  TO service_role
  USING (true);

-- ============================================================================
-- Comments
-- ============================================================================

COMMENT ON TABLE ips_backtest_runs IS 'Tracks individual IPS backtest executions with parameters and status';
COMMENT ON TABLE ips_backtest_results IS 'Performance metrics for each IPS configuration after backtesting';
COMMENT ON TABLE ips_backtest_trade_matches IS 'Individual trade-level evaluation results from backtest';
COMMENT ON TABLE ips_performance_snapshots IS 'Daily performance tracking during backtest period';
COMMENT ON TABLE ips_comparison_matrix IS 'Head-to-head comparison results between multiple IPSs';

COMMENT ON VIEW v_ips_leaderboard IS 'Best performing IPSs ranked by Sharpe ratio and ROI';
COMMENT ON VIEW v_recent_backtest_runs IS 'Most recent backtest runs with summary metrics';

COMMENT ON FUNCTION calculate_win_rate_ci IS 'Calculate 95% confidence interval for win rate';
COMMENT ON FUNCTION calculate_sharpe_ratio IS 'Calculate Sharpe ratio from array of returns';
COMMENT ON FUNCTION update_backtest_run_status IS 'Update backtest run status and timing';
