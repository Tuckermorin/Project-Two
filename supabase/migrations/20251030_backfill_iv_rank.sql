-- Backfill IV rank for all existing historical data in vol_regime_daily
-- This migration calculates and populates the iv_rank column for rows that have
-- iv_atm_30d data but are missing the calculated rank

-- Step 1: Add iv_percentile column if it doesn't exist (for compatibility)
ALTER TABLE public.vol_regime_daily
ADD COLUMN IF NOT EXISTS iv_percentile double precision;

-- Step 2: Backfill iv_rank for all rows with IV data but missing rank
-- This uses the existing calculate_iv_rank function to compute percentile rank
DO $$
DECLARE
  v_updated_count integer := 0;
  v_symbol text;
  v_date date;
  v_iv numeric;
  v_calculated_rank numeric;
BEGIN
  RAISE NOTICE 'Starting IV rank backfill...';

  -- Process each row that has IV data but missing rank
  FOR v_symbol, v_date, v_iv IN
    SELECT symbol, as_of_date, iv_atm_30d
    FROM vol_regime_daily
    WHERE iv_atm_30d IS NOT NULL
      AND iv_rank IS NULL
    ORDER BY symbol, as_of_date
  LOOP
    -- Calculate the rank using the stored function
    v_calculated_rank := calculate_iv_rank(v_symbol, v_iv, 252);

    -- Update the row with calculated rank and percentile (same value)
    UPDATE vol_regime_daily
    SET
      iv_rank = v_calculated_rank,
      iv_percentile = v_calculated_rank
    WHERE symbol = v_symbol
      AND as_of_date = v_date;

    v_updated_count := v_updated_count + 1;

    -- Log progress every 100 rows
    IF v_updated_count % 100 = 0 THEN
      RAISE NOTICE 'Processed % rows...', v_updated_count;
    END IF;
  END LOOP;

  RAISE NOTICE 'Backfill complete! Updated % rows with IV rank calculations.', v_updated_count;
END $$;

-- Step 3: Add index on iv_rank for better query performance
CREATE INDEX IF NOT EXISTS idx_vol_regime_iv_rank
ON public.vol_regime_daily (symbol, as_of_date)
WHERE iv_rank IS NOT NULL;

-- Step 4: Verify results
DO $$
DECLARE
  v_total_rows integer;
  v_rows_with_iv integer;
  v_rows_with_rank integer;
  v_missing_rank integer;
BEGIN
  SELECT
    COUNT(*),
    COUNT(iv_atm_30d),
    COUNT(iv_rank),
    COUNT(CASE WHEN iv_atm_30d IS NOT NULL AND iv_rank IS NULL THEN 1 END)
  INTO v_total_rows, v_rows_with_iv, v_rows_with_rank, v_missing_rank
  FROM vol_regime_daily;

  RAISE NOTICE '=== IV RANK BACKFILL SUMMARY ===';
  RAISE NOTICE 'Total rows: %', v_total_rows;
  RAISE NOTICE 'Rows with IV data: %', v_rows_with_iv;
  RAISE NOTICE 'Rows with IV rank: %', v_rows_with_rank;
  RAISE NOTICE 'Rows still missing rank: %', v_missing_rank;

  IF v_missing_rank > 0 THEN
    RAISE NOTICE 'Note: % rows still missing rank (likely due to insufficient historical data)', v_missing_rank;
  END IF;
END $$;

-- Add comment for documentation
COMMENT ON COLUMN vol_regime_daily.iv_rank IS 'IV percentile rank (0-100) calculated from historical IV data over lookback period';
COMMENT ON COLUMN vol_regime_daily.iv_percentile IS 'IV percentile rank (0-100), same as iv_rank for backwards compatibility';
