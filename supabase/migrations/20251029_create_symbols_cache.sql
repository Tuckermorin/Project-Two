-- Create a simple cache table for distinct symbols
-- Much faster than querying 9.8M rows every time

CREATE TABLE IF NOT EXISTS historical_symbols_cache (
  symbol TEXT PRIMARY KEY,
  last_seen TIMESTAMPTZ DEFAULT NOW()
);

-- Populate with current distinct symbols
INSERT INTO historical_symbols_cache (symbol)
SELECT DISTINCT symbol FROM historical_options_data
ON CONFLICT (symbol) DO UPDATE SET last_seen = NOW();

-- Create a simpler function that reads from cache
CREATE OR REPLACE FUNCTION get_distinct_historical_symbols()
RETURNS TEXT[] AS $$
BEGIN
  RETURN ARRAY(
    SELECT symbol
    FROM historical_symbols_cache
    ORDER BY symbol
  );
END;
$$ LANGUAGE plpgsql STABLE;

-- Create index for fast ordering
CREATE INDEX IF NOT EXISTS idx_symbols_cache_symbol ON historical_symbols_cache(symbol);

COMMENT ON TABLE historical_symbols_cache IS 'Cache of distinct symbols from historical_options_data for fast lookups';
