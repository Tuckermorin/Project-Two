-- Migration: Add behavioral metrics to trades table
-- Purpose: Track peak/low points during trade lifecycle for analysis

ALTER TABLE public.trades
ADD COLUMN IF NOT EXISTS peak_unrealized_pnl NUMERIC,
ADD COLUMN IF NOT EXISTS peak_unrealized_pnl_percent NUMERIC,
ADD COLUMN IF NOT EXISTS lowest_unrealized_pnl NUMERIC,
ADD COLUMN IF NOT EXISTS lowest_unrealized_pnl_percent NUMERIC,
ADD COLUMN IF NOT EXISTS max_delta_reached NUMERIC,
ADD COLUMN IF NOT EXISTS min_delta_reached NUMERIC,
ADD COLUMN IF NOT EXISTS days_at_profit INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS days_above_50pct_profit INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS total_snapshots INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS first_snapshot_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS last_snapshot_at TIMESTAMP WITH TIME ZONE;

-- Add indexes for querying behavioral patterns
CREATE INDEX IF NOT EXISTS idx_trades_max_delta
  ON public.trades USING btree (max_delta_reached)
  WHERE status = 'closed';

CREATE INDEX IF NOT EXISTS idx_trades_peak_pnl
  ON public.trades USING btree (peak_unrealized_pnl_percent)
  WHERE status = 'closed';

-- Function to update behavioral metrics when snapshot is created
CREATE OR REPLACE FUNCTION update_trade_behavioral_metrics()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE trades
  SET
    peak_unrealized_pnl = GREATEST(COALESCE(peak_unrealized_pnl, NEW.unrealized_pnl), NEW.unrealized_pnl),
    peak_unrealized_pnl_percent = GREATEST(COALESCE(peak_unrealized_pnl_percent, NEW.unrealized_pnl_percent), NEW.unrealized_pnl_percent),
    lowest_unrealized_pnl = LEAST(COALESCE(lowest_unrealized_pnl, NEW.unrealized_pnl), NEW.unrealized_pnl),
    lowest_unrealized_pnl_percent = LEAST(COALESCE(lowest_unrealized_pnl_percent, NEW.unrealized_pnl_percent), NEW.unrealized_pnl_percent),
    max_delta_reached = GREATEST(COALESCE(max_delta_reached, NEW.delta_spread), NEW.delta_spread),
    min_delta_reached = LEAST(COALESCE(min_delta_reached, NEW.delta_spread), NEW.delta_spread),
    days_at_profit = CASE
      WHEN NEW.unrealized_pnl > 0 THEN COALESCE(days_at_profit, 0) + 1
      ELSE COALESCE(days_at_profit, 0)
    END,
    days_above_50pct_profit = CASE
      WHEN NEW.unrealized_pnl_percent > 50 THEN COALESCE(days_above_50pct_profit, 0) + 1
      ELSE COALESCE(days_above_50pct_profit, 0)
    END,
    total_snapshots = COALESCE(total_snapshots, 0) + 1,
    first_snapshot_at = COALESCE(first_snapshot_at, NEW.snapshot_time),
    last_snapshot_at = NEW.snapshot_time,
    updated_at = NOW()
  WHERE id = NEW.trade_id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to automatically update behavioral metrics
DROP TRIGGER IF EXISTS trigger_update_behavioral_metrics ON trade_snapshots;
CREATE TRIGGER trigger_update_behavioral_metrics
  AFTER INSERT ON trade_snapshots
  FOR EACH ROW
  EXECUTE FUNCTION update_trade_behavioral_metrics();

COMMENT ON COLUMN trades.peak_unrealized_pnl IS 'Highest unrealized P&L reached during trade lifecycle';
COMMENT ON COLUMN trades.lowest_unrealized_pnl IS 'Lowest unrealized P&L reached during trade lifecycle';
COMMENT ON COLUMN trades.max_delta_reached IS 'Maximum delta value reached during trade (risk indicator)';
COMMENT ON COLUMN trades.days_at_profit IS 'Number of snapshot days where trade was profitable';
COMMENT ON COLUMN trades.days_above_50pct_profit IS 'Number of snapshot days where trade was above 50% of max profit target';
