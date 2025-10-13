-- Migration: Add IPS factor data to snapshots for AI-driven analysis
-- Purpose: Store complete IPS factor state at each snapshot (no hard-coded thresholds)

-- Add IPS factor data column
ALTER TABLE public.trade_snapshots
ADD COLUMN IF NOT EXISTS ips_factor_data JSONB,
ADD COLUMN IF NOT EXISTS raw_data JSONB,
ADD COLUMN IF NOT EXISTS rho NUMERIC,
ADD COLUMN IF NOT EXISTS hv_30 NUMERIC,
ADD COLUMN IF NOT EXISTS spy_change_percent NUMERIC,
ADD COLUMN IF NOT EXISTS vix_change_percent NUMERIC;

-- Index for JSONB queries on IPS factors
CREATE INDEX IF NOT EXISTS idx_trade_snapshots_ips_factors
  ON public.trade_snapshots USING gin (ips_factor_data);

-- Index for raw data queries
CREATE INDEX IF NOT EXISTS idx_trade_snapshots_raw_data
  ON public.trade_snapshots USING gin (raw_data);

COMMENT ON COLUMN public.trade_snapshots.ips_factor_data IS 'Complete IPS factor values at time of snapshot - all factors that contributed to IPS score';
COMMENT ON COLUMN public.trade_snapshots.raw_data IS 'Additional raw market/trade data for AI analysis - flexible schema';
