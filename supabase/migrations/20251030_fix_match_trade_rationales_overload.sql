-- Migration: Fix match_trade_rationales Function Overloading Conflict
-- Date: 2025-10-30
-- Issue: Multiple versions of match_trade_rationales exist causing PGRST203 error
-- Solution: Drop old versions and keep only the latest 2000-dimension version

-- ============================================================================
-- Drop All Old Versions of match_trade_rationales
-- ============================================================================

-- Drop the old 1536-dimension version with extended parameters (from 20251023_create_rationale_embeddings.sql)
DROP FUNCTION IF EXISTS public.match_trade_rationales(
  vector(1536),
  float,
  int,
  uuid,
  boolean,
  text
);

-- Drop the old 4096-dimension versions (from qwen3 migrations)
DROP FUNCTION IF EXISTS public.match_trade_rationales(
  vector(4096),
  float,
  int,
  uuid
);

-- ============================================================================
-- Recreate the Current 2000-Dimension Version
-- ============================================================================
-- This ensures we have a clean, single version of the function

CREATE OR REPLACE FUNCTION match_trade_rationales(
  query_embedding vector(2000),
  match_threshold float DEFAULT 0.75,
  match_count int DEFAULT 5,
  filter_user_id uuid DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  trade_evaluation_id uuid,
  rationale_text text,
  trade_details jsonb,
  outcome jsonb,
  similarity float,
  created_at timestamptz
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    tre.id,
    tre.trade_evaluation_id,
    tre.rationale_text,
    tre.trade_details,
    tre.outcome,
    1 - (tre.rationale_embedding <=> query_embedding) AS similarity,
    tre.created_at
  FROM trade_rationale_embeddings tre
  WHERE
    (filter_user_id IS NULL OR tre.user_id = filter_user_id)
    AND tre.rationale_embedding IS NOT NULL
    AND 1 - (tre.rationale_embedding <=> query_embedding) > match_threshold
  ORDER BY tre.rationale_embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- ============================================================================
-- Add Function Comment
-- ============================================================================

COMMENT ON FUNCTION match_trade_rationales IS
  'Find similar trade rationales using vector similarity search (2000 dimensions).
   Returns rationales with similarity above threshold, ordered by relevance.';

-- ============================================================================
-- Verification
-- ============================================================================

DO $$
DECLARE
  function_count int;
BEGIN
  -- Count how many overloads exist
  SELECT COUNT(*) INTO function_count
  FROM pg_proc p
  JOIN pg_namespace n ON p.pronamespace = n.oid
  WHERE n.nspname = 'public'
  AND p.proname = 'match_trade_rationales';

  RAISE NOTICE '===========================================';
  RAISE NOTICE 'Function Overload Fix Complete!';
  RAISE NOTICE '===========================================';
  RAISE NOTICE 'Number of match_trade_rationales overloads: %', function_count;
  RAISE NOTICE '';

  IF function_count != 1 THEN
    RAISE WARNING 'Expected 1 overload but found %. Manual cleanup may be required.', function_count;
  ELSE
    RAISE NOTICE '✓ Function overload conflict resolved!';
    RAISE NOTICE '✓ Only one version of match_trade_rationales exists';
    RAISE NOTICE '✓ Using vector(2000) dimensions';
  END IF;

  RAISE NOTICE '===========================================';
END $$;
