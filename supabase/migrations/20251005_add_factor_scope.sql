-- Add factor_scope column to ips_factors
-- Distinguishes between general (non-chain) and chain-specific factors

ALTER TABLE ips_factors
ADD COLUMN IF NOT EXISTS factor_scope text DEFAULT 'chain';

-- Add constraint
ALTER TABLE ips_factors
ADD CONSTRAINT ips_factors_factor_scope_check
CHECK (factor_scope IN ('general', 'chain'));

-- Update existing factors based on their nature
-- General factors: Don't require options chain data
UPDATE ips_factors SET factor_scope = 'general'
WHERE factor_id IN (
  'calc-market-cap-category',
  'calc-52w-range-position',
  'calc-dist-52w-high',
  'av-50-day-ma',
  'av-200-day-ma',
  'av-mom',
  'av-inflation',
  'tavily-analyst-rating-avg',
  'tavily-news-sentiment-score',
  'tavily-news-volume',
  'tavily-social-sentiment'
);

-- Chain-specific factors: Require options chain data
UPDATE ips_factors SET factor_scope = 'chain'
WHERE factor_id IN (
  'opt-delta',
  'opt-iv',
  'opt-vega',
  'opt-iv-rank',
  'opt-open-interest',
  'opt-theta',
  'opt-put-call-ratio',
  'calc-put-call-oi-ratio',
  'opt-bid-ask-spread'
);

-- Create index for efficient filtering
CREATE INDEX IF NOT EXISTS idx_ips_factors_scope
ON ips_factors(factor_scope);

COMMENT ON COLUMN ips_factors.factor_scope IS
  'Scope of factor: general (non-chain data like fundamentals) or chain (requires options chain data)';
