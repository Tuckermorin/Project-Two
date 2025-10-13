-- Migration: Create trade snapshots system
-- Purpose: Capture temporal state of trades throughout their lifecycle for pattern analysis

CREATE TABLE IF NOT EXISTS public.trade_snapshots (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  trade_id UUID NOT NULL,
  user_id UUID NOT NULL,
  snapshot_time TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),

  -- Market Data at Snapshot
  current_stock_price NUMERIC,
  current_spread_price NUMERIC,  -- Current market price of the spread

  -- Greeks Snapshot (critical for options)
  delta_short_leg NUMERIC,
  delta_long_leg NUMERIC,
  delta_spread NUMERIC,  -- Net delta of position
  theta NUMERIC,
  vega NUMERIC,
  gamma NUMERIC,

  -- P&L at Snapshot
  unrealized_pnl NUMERIC,
  unrealized_pnl_percent NUMERIC,
  days_to_expiration INTEGER,
  days_in_trade INTEGER,

  -- IV & Volatility at Snapshot
  iv_short_strike NUMERIC,
  iv_long_strike NUMERIC,
  iv_rank NUMERIC,
  iv_percentile NUMERIC,
  hv_20 NUMERIC,  -- Historical volatility (20-day)

  -- Risk Metrics at Snapshot
  probability_of_profit NUMERIC,
  probability_itm NUMERIC,  -- Probability short leg ends ITM
  break_even_price NUMERIC,

  -- Market Context
  spy_price NUMERIC,  -- For market context
  vix_level NUMERIC,
  sector_performance NUMERIC,  -- How the sector performed that day

  -- Snapshot Metadata
  snapshot_trigger VARCHAR(50) NOT NULL DEFAULT 'scheduled',  -- 'scheduled', 'significant_move', 'greek_threshold', 'manual'

  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  CONSTRAINT trade_snapshots_pkey PRIMARY KEY (id),
  CONSTRAINT trade_snapshots_trade_id_fkey FOREIGN KEY (trade_id)
    REFERENCES trades(id) ON DELETE CASCADE,
  CONSTRAINT trade_snapshots_user_id_fkey FOREIGN KEY (user_id)
    REFERENCES auth.users(id) ON DELETE CASCADE
) TABLESPACE pg_default;

-- Indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_trade_snapshots_trade_id
  ON public.trade_snapshots USING btree (trade_id);

CREATE INDEX IF NOT EXISTS idx_trade_snapshots_time
  ON public.trade_snapshots USING btree (snapshot_time DESC);

CREATE INDEX IF NOT EXISTS idx_trade_snapshots_trigger
  ON public.trade_snapshots USING btree (snapshot_trigger);

CREATE INDEX IF NOT EXISTS idx_trade_snapshots_user_id
  ON public.trade_snapshots USING btree (user_id);

-- Composite index for finding snapshots by trade and time
CREATE INDEX IF NOT EXISTS idx_trade_snapshots_trade_time
  ON public.trade_snapshots USING btree (trade_id, snapshot_time DESC);

-- Enable RLS
ALTER TABLE public.trade_snapshots ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view own trade snapshots"
  ON public.trade_snapshots
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own trade snapshots"
  ON public.trade_snapshots
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own trade snapshots"
  ON public.trade_snapshots
  FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own trade snapshots"
  ON public.trade_snapshots
  FOR DELETE
  USING (auth.uid() = user_id);

-- Function to get latest snapshot for a trade
CREATE OR REPLACE FUNCTION get_latest_snapshot(p_trade_id UUID)
RETURNS SETOF trade_snapshots AS $$
BEGIN
  RETURN QUERY
  SELECT *
  FROM trade_snapshots
  WHERE trade_id = p_trade_id
  ORDER BY snapshot_time DESC
  LIMIT 1;
END;
$$ LANGUAGE plpgsql;

-- Function to check if snapshot needed based on thresholds
CREATE OR REPLACE FUNCTION should_create_snapshot(
  p_trade_id UUID,
  p_delta_threshold NUMERIC DEFAULT 0.05,
  p_pnl_threshold NUMERIC DEFAULT 10.0
)
RETURNS BOOLEAN AS $$
DECLARE
  v_latest_snapshot RECORD;
  v_current_delta NUMERIC;
  v_current_pnl_pct NUMERIC;
BEGIN
  -- Get the latest snapshot
  SELECT * INTO v_latest_snapshot
  FROM trade_snapshots
  WHERE trade_id = p_trade_id
  ORDER BY snapshot_time DESC
  LIMIT 1;

  -- If no snapshot exists, we should create one
  IF v_latest_snapshot IS NULL THEN
    RETURN TRUE;
  END IF;

  -- Get current trade metrics (would need to be populated from app)
  -- For now, return false to avoid creating duplicate snapshots
  -- This logic will be handled in the application layer
  RETURN FALSE;
END;
$$ LANGUAGE plpgsql;

COMMENT ON TABLE public.trade_snapshots IS 'Temporal snapshots of trade state throughout lifecycle for pattern analysis and agent learning';
COMMENT ON COLUMN public.trade_snapshots.snapshot_trigger IS 'What triggered this snapshot: scheduled (EOD/scheduled), significant_move (price/greek change), greek_threshold (delta/gamma threshold), manual';
COMMENT ON COLUMN public.trade_snapshots.delta_spread IS 'Net delta of the spread position (short_leg_delta + long_leg_delta)';
COMMENT ON COLUMN public.trade_snapshots.unrealized_pnl_percent IS 'Current P&L as percentage of max risk or credit received';
