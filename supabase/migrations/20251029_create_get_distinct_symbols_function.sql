-- Create function to efficiently get distinct symbols from historical_options_data
-- This avoids loading millions of rows into memory
-- Uses GROUP BY instead of DISTINCT for better performance with indexes

CREATE OR REPLACE FUNCTION get_distinct_historical_symbols()
RETURNS TEXT[] AS $$
BEGIN
  RETURN ARRAY(
    SELECT symbol
    FROM historical_options_data
    GROUP BY symbol
    ORDER BY symbol
  );
END;
$$ LANGUAGE plpgsql STABLE;
