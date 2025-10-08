-- Add iv_percentile column to vol_regime_daily table
-- This migration adds the missing iv_percentile column that was referenced in code but didn't exist

ALTER TABLE public.vol_regime_daily
ADD COLUMN IF NOT EXISTS iv_percentile double precision;

-- Add index for efficient queries on iv_percentile
CREATE INDEX IF NOT EXISTS idx_vol_regime_iv_percentile
ON public.vol_regime_daily (symbol, as_of_date)
WHERE iv_percentile IS NOT NULL;

-- Create function to calculate both iv_rank and iv_percentile
-- iv_rank uses the existing calculate_iv_rank function logic
-- iv_percentile is the same (both are 0-100 percentile rankings)
CREATE OR REPLACE FUNCTION calculate_iv_percentile(
  p_symbol text,
  p_current_iv numeric,
  p_lookback_days integer DEFAULT 252
)
RETURNS numeric
LANGUAGE plpgsql
AS $$
BEGIN
  -- IV percentile and IV rank are the same metric (0-100 percentile)
  -- Just call the existing function
  RETURN calculate_iv_rank(p_symbol, p_current_iv, p_lookback_days);
END;
$$;

COMMENT ON COLUMN vol_regime_daily.iv_percentile IS 'IV percentile rank (0-100) based on historical IV data, same as iv_rank';
COMMENT ON FUNCTION calculate_iv_percentile IS 'Calculate IV percentile (alias for calculate_iv_rank for backwards compatibility)';

GRANT EXECUTE ON FUNCTION calculate_iv_percentile TO authenticated;
