-- Migration: Add AI Filtering Support to Backtesting
-- Date: 2025-10-29
-- Purpose: Add columns to track AI evaluation and filtering in backtests

-- Add AI filtering columns to ips_backtest_runs
ALTER TABLE ips_backtest_runs
ADD COLUMN IF NOT EXISTS use_ai_filtering BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS ai_recommendation_threshold TEXT DEFAULT 'buy';

COMMENT ON COLUMN ips_backtest_runs.use_ai_filtering IS 'Whether AI filtering was enabled for this backtest run';
COMMENT ON COLUMN ips_backtest_runs.ai_recommendation_threshold IS 'Minimum AI recommendation required to take trade (strong_avoid, avoid, neutral, buy, strong_buy)';

-- Add AI evaluation columns to ips_backtest_trade_matches
ALTER TABLE ips_backtest_trade_matches
ADD COLUMN IF NOT EXISTS ai_recommendation TEXT,
ADD COLUMN IF NOT EXISTS ai_score NUMERIC,
ADD COLUMN IF NOT EXISTS ai_confidence TEXT,
ADD COLUMN IF NOT EXISTS composite_score NUMERIC;

COMMENT ON COLUMN ips_backtest_trade_matches.ai_recommendation IS 'AI recommendation for this trade (strong_avoid, avoid, neutral, buy, strong_buy)';
COMMENT ON COLUMN ips_backtest_trade_matches.ai_score IS 'AI score for this trade (0-100)';
COMMENT ON COLUMN ips_backtest_trade_matches.ai_confidence IS 'AI confidence level (very_high, high, medium, low, very_low)';
COMMENT ON COLUMN ips_backtest_trade_matches.composite_score IS 'Composite score combining IPS and AI (0-100)';

-- Create index for AI filtering queries
CREATE INDEX IF NOT EXISTS idx_backtest_trade_matches_ai_recommendation
ON ips_backtest_trade_matches(run_id, ai_recommendation);

CREATE INDEX IF NOT EXISTS idx_backtest_trade_matches_would_take
ON ips_backtest_trade_matches(run_id, would_have_traded);
