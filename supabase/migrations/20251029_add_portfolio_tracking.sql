-- Migration: Add Portfolio Tracking to Backtest Results
-- Date: 2025-10-29
-- Purpose: Track portfolio growth and equity curve for backtests

-- Add portfolio metrics columns to ips_backtest_results
ALTER TABLE ips_backtest_results
ADD COLUMN IF NOT EXISTS starting_portfolio numeric DEFAULT 25000,
ADD COLUMN IF NOT EXISTS ending_portfolio numeric,
ADD COLUMN IF NOT EXISTS total_return numeric,
ADD COLUMN IF NOT EXISTS cagr numeric,
ADD COLUMN IF NOT EXISTS portfolio_max_drawdown numeric,
ADD COLUMN IF NOT EXISTS equity_curve jsonb;

COMMENT ON COLUMN ips_backtest_results.starting_portfolio IS 'Starting portfolio value (default $25,000)';
COMMENT ON COLUMN ips_backtest_results.ending_portfolio IS 'Ending portfolio value after all trades';
COMMENT ON COLUMN ips_backtest_results.total_return IS 'Total return percentage';
COMMENT ON COLUMN ips_backtest_results.cagr IS 'Compound Annual Growth Rate';
COMMENT ON COLUMN ips_backtest_results.portfolio_max_drawdown IS 'Maximum drawdown as percentage of portfolio';
COMMENT ON COLUMN ips_backtest_results.equity_curve IS 'Array of {date, portfolioValue} points for equity curve visualization';

-- Add portfolio tracking columns to ips_backtest_trade_matches
ALTER TABLE ips_backtest_trade_matches
ADD COLUMN IF NOT EXISTS portfolio_value_before numeric,
ADD COLUMN IF NOT EXISTS portfolio_value_after numeric,
ADD COLUMN IF NOT EXISTS position_size integer,
ADD COLUMN IF NOT EXISTS capital_allocated numeric;

COMMENT ON COLUMN ips_backtest_trade_matches.portfolio_value_before IS 'Portfolio value before this trade';
COMMENT ON COLUMN ips_backtest_trade_matches.portfolio_value_after IS 'Portfolio value after this trade';
COMMENT ON COLUMN ips_backtest_trade_matches.position_size IS 'Number of contracts traded';
COMMENT ON COLUMN ips_backtest_trade_matches.capital_allocated IS 'Capital allocated to this trade';

-- Add portfolio configuration to ips_backtest_runs
ALTER TABLE ips_backtest_runs
ADD COLUMN IF NOT EXISTS portfolio_size numeric DEFAULT 25000,
ADD COLUMN IF NOT EXISTS risk_per_trade numeric DEFAULT 2;

COMMENT ON COLUMN ips_backtest_runs.portfolio_size IS 'Starting portfolio size for position sizing';
COMMENT ON COLUMN ips_backtest_runs.risk_per_trade IS 'Percentage of portfolio to risk per trade';
