-- Add columns to track spread pricing for active trades
ALTER TABLE trades
ADD COLUMN IF NOT EXISTS current_spread_price NUMERIC,
ADD COLUMN IF NOT EXISTS current_spread_bid NUMERIC,
ADD COLUMN IF NOT EXISTS current_spread_ask NUMERIC,
ADD COLUMN IF NOT EXISTS spread_price_updated_at TIMESTAMP WITH TIME ZONE;

COMMENT ON COLUMN trades.current_spread_price IS 'Current mid-price of the spread (for closing)';
COMMENT ON COLUMN trades.current_spread_bid IS 'Current bid price of the spread';
COMMENT ON COLUMN trades.current_spread_ask IS 'Current ask price of the spread';
COMMENT ON COLUMN trades.spread_price_updated_at IS 'Last time spread pricing was updated';
