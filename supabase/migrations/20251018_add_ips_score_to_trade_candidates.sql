-- Add IPS score and related fields to trade_candidates table
-- This allows the agent's calculated IPS scores to persist through the entire flow

ALTER TABLE trade_candidates ADD COLUMN IF NOT EXISTS ips_score numeric;
ALTER TABLE trade_candidates ADD COLUMN IF NOT EXISTS ips_factor_details jsonb;
ALTER TABLE trade_candidates ADD COLUMN IF NOT EXISTS tier text;
ALTER TABLE trade_candidates ADD COLUMN IF NOT EXISTS composite_score numeric;
ALTER TABLE trade_candidates ADD COLUMN IF NOT EXISTS yield_score numeric;
ALTER TABLE trade_candidates ADD COLUMN IF NOT EXISTS reddit_score numeric;
ALTER TABLE trade_candidates ADD COLUMN IF NOT EXISTS diversity_score numeric;
ALTER TABLE trade_candidates ADD COLUMN IF NOT EXISTS historical_analysis jsonb;

-- Add index for quick filtering by IPS score
CREATE INDEX IF NOT EXISTS idx_trade_candidates_ips_score ON trade_candidates(ips_score DESC) WHERE ips_score IS NOT NULL;

-- Add index for tier filtering
CREATE INDEX IF NOT EXISTS idx_trade_candidates_tier ON trade_candidates(tier) WHERE tier IS NOT NULL;
