-- Seed: Reddit Factor Definitions
-- Purpose: Add Reddit-based IPS factors for social sentiment analysis

-- Insert Reddit factor definitions
INSERT INTO factor_definitions (id, name, type, category, data_type, unit, source, description, is_active)
VALUES
  (
    'reddit-sentiment',
    'Reddit Sentiment',
    'quantitative',
    'stock',
    'numeric',
    'score',
    'reddit',
    'Reddit social sentiment score ranging from -1 (bearish) to +1 (bullish). Aggregated from r/wallstreetbets, r/stocks, r/investing, r/options. Weighted by upvotes.',
    true
  ),
  (
    'reddit-mentions',
    'Reddit Mentions',
    'quantitative',
    'stock',
    'numeric',
    'count',
    'reddit',
    'Number of Reddit mentions across major stock subreddits in the last 24 hours. High mention count indicates elevated retail interest.',
    true
  ),
  (
    'reddit-trending-rank',
    'Reddit Trending Rank',
    'quantitative',
    'stock',
    'numeric',
    'rank',
    'reddit',
    'Trending position (1-100) on r/wallstreetbets. Rank ≤10 indicates viral meme stock activity. Lower is more trending.',
    true
  ),
  (
    'reddit-mention-velocity',
    'Reddit Mention Velocity',
    'quantitative',
    'stock',
    'percentage',
    '%',
    'reddit',
    'Percentage change in Reddit mentions over 24 hours. High velocity (+50%+) often precedes IV expansion. Useful for timing entries.',
    true
  )
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  source = EXCLUDED.source,
  is_active = EXCLUDED.is_active;

-- Add comments
COMMENT ON COLUMN factor_definitions.source IS 'Data source: reddit, alpha_vantage, tavily, manual, calculated, fred';
