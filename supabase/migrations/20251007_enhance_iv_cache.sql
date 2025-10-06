-- Enhancement to vol_regime_daily table for IV caching
-- Adds indexes and stored function for efficient IV rank calculations

-- Add composite index for fast IV queries (if not exists)
CREATE INDEX IF NOT EXISTS idx_vol_regime_symbol_date_desc
ON public.vol_regime_daily (symbol, as_of_date DESC);

-- Add index on IV columns for faster calculations
CREATE INDEX IF NOT EXISTS idx_vol_regime_iv_values
ON public.vol_regime_daily (symbol, as_of_date)
WHERE iv_atm_30d IS NOT NULL;

-- Stored function to calculate IV rank server-side
CREATE OR REPLACE FUNCTION calculate_iv_rank(
  p_symbol text,
  p_current_iv numeric,
  p_lookback_days integer DEFAULT 252
)
RETURNS numeric
LANGUAGE plpgsql
AS $$
DECLARE
  v_cutoff_date date;
  v_count_below bigint;
  v_total_count bigint;
  v_rank numeric;
BEGIN
  -- Calculate cutoff date
  v_cutoff_date := CURRENT_DATE - p_lookback_days;

  -- Count total non-null IV values
  SELECT COUNT(*)
  INTO v_total_count
  FROM public.vol_regime_daily
  WHERE symbol = UPPER(p_symbol)
    AND as_of_date >= v_cutoff_date
    AND iv_atm_30d IS NOT NULL;

  -- Need at least 20 data points
  IF v_total_count < 20 THEN
    RETURN NULL;
  END IF;

  -- Count values below or equal to current IV
  SELECT COUNT(*)
  INTO v_count_below
  FROM public.vol_regime_daily
  WHERE symbol = UPPER(p_symbol)
    AND as_of_date >= v_cutoff_date
    AND iv_atm_30d IS NOT NULL
    AND iv_atm_30d <= p_current_iv;

  -- Calculate percentile rank (0-100 scale)
  v_rank := (v_count_below::numeric / v_total_count::numeric) * 100;

  RETURN v_rank;
END;
$$;

-- Comment documentation
COMMENT ON FUNCTION calculate_iv_rank IS 'Calculate IV percentile rank (0-100) for a symbol based on historical IV data';

COMMENT ON INDEX idx_vol_regime_symbol_date_desc IS 'Optimize queries for latest IV data by symbol';

COMMENT ON INDEX idx_vol_regime_iv_values IS 'Optimize IV rank calculations by filtering non-null values';

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION calculate_iv_rank TO authenticated;
