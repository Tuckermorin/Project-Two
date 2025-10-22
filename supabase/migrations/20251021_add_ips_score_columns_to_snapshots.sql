-- Migration: Add IPS score tracking columns to trade snapshots
-- Purpose: Store calculated IPS score at time of snapshot for trend analysis

-- Add IPS score columns
ALTER TABLE public.trade_snapshots
ADD COLUMN IF NOT EXISTS ips_score NUMERIC,
ADD COLUMN IF NOT EXISTS ips_targets_met INTEGER,
ADD COLUMN IF NOT EXISTS ips_target_percentage NUMERIC;

-- Add comments
COMMENT ON COLUMN public.trade_snapshots.ips_score IS 'Calculated IPS score at time of snapshot (0-100)';
COMMENT ON COLUMN public.trade_snapshots.ips_targets_met IS 'Number of IPS factor targets met at time of snapshot';
COMMENT ON COLUMN public.trade_snapshots.ips_target_percentage IS 'Percentage of IPS targets met (0-100)';
