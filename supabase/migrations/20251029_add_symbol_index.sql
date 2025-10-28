-- Add index on symbol column in historical_options_data for fast DISTINCT queries
-- This will speed up the get_distinct_historical_symbols() function

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_historical_options_symbol
ON historical_options_data(symbol);

-- Add comment
COMMENT ON INDEX idx_historical_options_symbol IS 'Index for fast symbol lookups and distinct queries';
