-- Migration: Add Enhanced IPS Factor Tracking
-- Purpose: Store detailed factor scores, tier classification, and diversity metrics for better trade analysis

-- Add IPS factor details to trades table
ALTER TABLE trades
ADD COLUMN IF NOT EXISTS ips_factor_scores JSONB,
ADD COLUMN IF NOT EXISTS tier TEXT CHECK (tier IN ('elite', 'quality', 'speculative', NULL)),
ADD COLUMN IF NOT EXISTS diversity_score NUMERIC;

-- Add tier and diversity tracking to trade_candidates
ALTER TABLE trade_candidates
ADD COLUMN IF NOT EXISTS tier TEXT CHECK (tier IN ('elite', 'quality', 'speculative', NULL)),
ADD COLUMN IF NOT EXISTS diversity_score NUMERIC,
ADD COLUMN IF NOT EXISTS ips_factor_scores JSONB;

-- Create index for faster IPS analysis queries
CREATE INDEX IF NOT EXISTS idx_trades_ips_tier
ON trades(ips_score DESC, tier, created_at DESC)
WHERE status IN ('prospective', 'active', 'closed');

-- Create index for candidate analysis
CREATE INDEX IF NOT EXISTS idx_candidates_tier_score
ON trade_candidates(tier, run_id, (rationale->>'composite_score') DESC);

-- Add comments for documentation
COMMENT ON COLUMN trades.ips_factor_scores IS 'Detailed IPS factor compliance with values, targets, distances, and pass/fail status';
COMMENT ON COLUMN trades.tier IS 'Trade quality tier: elite (IPS≥90), quality (IPS 75-89), speculative (IPS 60-74)';
COMMENT ON COLUMN trades.diversity_score IS 'Portfolio diversity metric (0-100) considering sector, symbol, and strategy spread';

COMMENT ON COLUMN trade_candidates.tier IS 'Trade quality tier based on IPS score and composite metrics';
COMMENT ON COLUMN trade_candidates.diversity_score IS 'Contribution to portfolio diversity';
COMMENT ON COLUMN trade_candidates.ips_factor_scores IS 'Snapshot of IPS factor analysis at candidate creation time';
