-- Migration: Convert All Factors to API Collection
-- Date: 2025-10-23
-- Description: Updates all factor_definitions to use 'api' collection method since all factors
--              are now collectible via Alpha Vantage API or other automated sources.
--              Removes manual collection method and qualitative factors entirely.

-- First, disable any qualitative factors (they can't be fetched from APIs)
UPDATE factor_definitions
SET is_active = false
WHERE type = 'qualitative';

-- Remove any IPS factor assignments that reference qualitative factors
DELETE FROM ips_factors
WHERE factor_id IN (
  SELECT id FROM factor_definitions WHERE type = 'qualitative'
);

-- Update all manual factors to 'api' since we now have API coverage for everything
UPDATE factor_definitions
SET collection_method = 'api'
WHERE collection_method = 'manual' OR collection_method IS NULL;

-- Update calculated factors to use 'api' collection method as well
-- (they are "calculated" but the inputs come from APIs)
UPDATE factor_definitions
SET collection_method = 'api'
WHERE collection_method = 'calculated';

-- Add comment explaining the change
COMMENT ON COLUMN factor_definitions.collection_method IS
  'How the factor is collected: api (fetched from Alpha Vantage, Tavily, or other APIs). All factors are now API-based.';

-- Verify the update
DO $$
DECLARE
  manual_count INTEGER;
  api_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO manual_count FROM factor_definitions WHERE collection_method = 'manual';
  SELECT COUNT(*) INTO api_count FROM factor_definitions WHERE collection_method = 'api';

  RAISE NOTICE 'Factor collection method update complete:';
  RAISE NOTICE '  Manual factors: % (should be 0)', manual_count;
  RAISE NOTICE '  API factors: %', api_count;

  IF manual_count > 0 THEN
    RAISE WARNING 'Still have % manual factors - migration may not have completed fully', manual_count;
  END IF;
END $$;
