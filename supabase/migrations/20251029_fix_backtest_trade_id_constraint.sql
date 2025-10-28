-- Fix foreign key constraint on ips_backtest_trade_matches
-- Backtest trades are simulated, not real trades, so trade_id should be nullable
-- and shouldn't have a foreign key constraint

-- Drop the foreign key constraint
ALTER TABLE ips_backtest_trade_matches
DROP CONSTRAINT IF EXISTS ips_backtest_trade_matches_trade_id_fkey;

-- Make trade_id nullable since backtest trades don't exist in trades table
ALTER TABLE ips_backtest_trade_matches
ALTER COLUMN trade_id DROP NOT NULL;

-- Add a comment to clarify
COMMENT ON COLUMN ips_backtest_trade_matches.trade_id IS
  'Optional reference to actual trade (null for simulated backtest trades)';

-- Update index to handle nulls
DROP INDEX IF EXISTS idx_ips_backtest_trade_matches_trade_id;
CREATE INDEX idx_ips_backtest_trade_matches_trade_id
  ON ips_backtest_trade_matches(trade_id)
  WHERE trade_id IS NOT NULL;
