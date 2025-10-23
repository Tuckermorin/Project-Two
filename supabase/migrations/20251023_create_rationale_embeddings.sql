-- Migration: Create Trade Rationale Embeddings Table
-- Purpose: Store AI-generated rationales with embeddings for semantic similarity search
-- Enables the AI to learn from past decisions and outcomes

-- ============================================================================
-- Main Table
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.trade_rationale_embeddings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- References
  trade_evaluation_id UUID NOT NULL REFERENCES ai_trade_evaluations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Embedding Data
  rationale_embedding vector(1536) NOT NULL, -- OpenAI text-embedding-3-small
  rationale_text TEXT NOT NULL, -- Full JSON of StructuredRationale

  -- Trade Characteristics (for filtering)
  trade_details JSONB NOT NULL DEFAULT '{}'::jsonb,

  -- Outcome Data (filled in after trade closes)
  outcome JSONB, -- { actual_outcome, actual_roi, days_held, exit_reason }
  outcome_recorded_at TIMESTAMP WITH TIME ZONE,

  -- Metadata
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  -- Constraints
  CONSTRAINT trade_rationale_embeddings_unique_evaluation
    UNIQUE (trade_evaluation_id)
);

-- ============================================================================
-- Indexes
-- ============================================================================

-- Vector similarity search index (HNSW for fast approximate search)
CREATE INDEX idx_rationale_embeddings_vector
  ON public.trade_rationale_embeddings
  USING hnsw (rationale_embedding vector_cosine_ops);

-- Regular indexes for filtering
CREATE INDEX idx_rationale_embeddings_user_id
  ON public.trade_rationale_embeddings(user_id);

CREATE INDEX idx_rationale_embeddings_evaluation_id
  ON public.trade_rationale_embeddings(trade_evaluation_id);

CREATE INDEX idx_rationale_embeddings_outcome
  ON public.trade_rationale_embeddings((outcome->>'actual_outcome'));

CREATE INDEX idx_rationale_embeddings_created_at
  ON public.trade_rationale_embeddings(created_at DESC);

-- GIN index for trade_details JSONB queries
CREATE INDEX idx_rationale_embeddings_trade_details
  ON public.trade_rationale_embeddings USING GIN(trade_details);

-- ============================================================================
-- Functions
-- ============================================================================

-- Update timestamp trigger
CREATE OR REPLACE FUNCTION update_rationale_embedding_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER rationale_embedding_updated
BEFORE UPDATE ON public.trade_rationale_embeddings
FOR EACH ROW
EXECUTE FUNCTION update_rationale_embedding_timestamp();

-- Function to find similar trade rationales
CREATE OR REPLACE FUNCTION match_trade_rationales(
  query_embedding vector(1536),
  match_threshold float DEFAULT 0.75,
  match_count int DEFAULT 10,
  p_user_id UUID DEFAULT NULL,
  filter_by_outcome boolean DEFAULT FALSE,
  required_outcome text DEFAULT NULL
)
RETURNS TABLE (
  id UUID,
  trade_evaluation_id UUID,
  similarity float,
  rationale_text TEXT,
  trade_details JSONB,
  outcome JSONB,
  created_at TIMESTAMP WITH TIME ZONE
) LANGUAGE plpgsql AS $$
BEGIN
  RETURN QUERY
  SELECT
    tre.id,
    tre.trade_evaluation_id,
    1 - (tre.rationale_embedding <=> query_embedding) AS similarity,
    tre.rationale_text,
    tre.trade_details,
    tre.outcome,
    tre.created_at
  FROM trade_rationale_embeddings tre
  WHERE
    -- Similarity threshold
    1 - (tre.rationale_embedding <=> query_embedding) > match_threshold
    -- Optional user filter
    AND (p_user_id IS NULL OR tre.user_id = p_user_id)
    -- Optional outcome filter
    AND (NOT filter_by_outcome OR tre.outcome IS NOT NULL)
    AND (required_outcome IS NULL OR tre.outcome->>'actual_outcome' = required_outcome)
  ORDER BY tre.rationale_embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- Function to analyze rationale accuracy over time
CREATE OR REPLACE FUNCTION analyze_rationale_accuracy(
  p_user_id UUID,
  p_since_date TIMESTAMP WITH TIME ZONE DEFAULT NOW() - INTERVAL '90 days'
)
RETURNS TABLE (
  total_rationales BIGINT,
  with_outcomes BIGINT,
  wins BIGINT,
  losses BIGINT,
  win_rate NUMERIC,
  avg_roi NUMERIC,
  avg_days_held NUMERIC,
  recommendation_breakdown JSONB
) LANGUAGE plpgsql AS $$
BEGIN
  RETURN QUERY
  WITH rationale_outcomes AS (
    SELECT
      tre.id,
      tre.outcome,
      ate.ai_recommendation,
      ate.ai_confidence,
      ate.composite_score,
      (tre.outcome->>'actual_roi')::NUMERIC as roi,
      (tre.outcome->>'days_held')::INT as days_held
    FROM trade_rationale_embeddings tre
    JOIN ai_trade_evaluations ate ON tre.trade_evaluation_id = ate.id
    WHERE tre.user_id = p_user_id
      AND tre.created_at >= p_since_date
  )
  SELECT
    COUNT(*)::BIGINT as total_rationales,
    COUNT(*) FILTER (WHERE outcome IS NOT NULL)::BIGINT as with_outcomes,
    COUNT(*) FILTER (WHERE outcome->>'actual_outcome' = 'win')::BIGINT as wins,
    COUNT(*) FILTER (WHERE outcome->>'actual_outcome' = 'loss')::BIGINT as losses,
    ROUND(
      100.0 * COUNT(*) FILTER (WHERE outcome->>'actual_outcome' = 'win') /
      NULLIF(COUNT(*) FILTER (WHERE outcome IS NOT NULL), 0),
      2
    ) as win_rate,
    ROUND(AVG(roi) FILTER (WHERE outcome IS NOT NULL), 2) as avg_roi,
    ROUND(AVG(days_held::NUMERIC) FILTER (WHERE outcome IS NOT NULL), 1) as avg_days_held,
    jsonb_build_object(
      'strong_buy', COUNT(*) FILTER (WHERE ai_recommendation = 'strong_buy'),
      'buy', COUNT(*) FILTER (WHERE ai_recommendation = 'buy'),
      'neutral', COUNT(*) FILTER (WHERE ai_recommendation = 'neutral'),
      'avoid', COUNT(*) FILTER (WHERE ai_recommendation = 'avoid'),
      'strong_avoid', COUNT(*) FILTER (WHERE ai_recommendation = 'strong_avoid')
    ) as recommendation_breakdown
  FROM rationale_outcomes;
END;
$$;

-- Function to get learning insights
CREATE OR REPLACE FUNCTION get_learning_insights(
  p_user_id UUID,
  p_symbol TEXT DEFAULT NULL,
  p_min_similarity FLOAT DEFAULT 0.80,
  p_limit INT DEFAULT 20
)
RETURNS TABLE (
  pattern_description TEXT,
  similar_trade_count BIGINT,
  avg_similarity NUMERIC,
  win_rate NUMERIC,
  avg_roi NUMERIC,
  key_insights JSONB
) LANGUAGE plpgsql AS $$
BEGIN
  -- This is a placeholder for more sophisticated pattern analysis
  -- In the future, we could cluster similar rationales and analyze outcomes
  RETURN QUERY
  SELECT
    'Similar trades with outcome data'::TEXT as pattern_description,
    COUNT(*)::BIGINT as similar_trade_count,
    ROUND(AVG(1.0), 3) as avg_similarity,
    ROUND(
      100.0 * COUNT(*) FILTER (WHERE outcome->>'actual_outcome' = 'win') /
      NULLIF(COUNT(*), 0),
      2
    ) as win_rate,
    ROUND(AVG((outcome->>'actual_roi')::NUMERIC), 2) as avg_roi,
    jsonb_build_object(
      'total_trades', COUNT(*),
      'completed_trades', COUNT(*) FILTER (WHERE outcome IS NOT NULL),
      'avg_days_held', AVG((outcome->>'days_held')::INT)
    ) as key_insights
  FROM trade_rationale_embeddings
  WHERE user_id = p_user_id
    AND (p_symbol IS NULL OR trade_details->>'symbol' = p_symbol)
    AND outcome IS NOT NULL
  LIMIT p_limit;
END;
$$;

-- ============================================================================
-- Row Level Security (RLS)
-- ============================================================================

ALTER TABLE public.trade_rationale_embeddings ENABLE ROW LEVEL SECURITY;

-- Users can only see their own rationales
CREATE POLICY rationale_embeddings_select_policy
  ON public.trade_rationale_embeddings
  FOR SELECT
  USING (auth.uid() = user_id);

-- Users can only insert their own rationales
CREATE POLICY rationale_embeddings_insert_policy
  ON public.trade_rationale_embeddings
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can only update their own rationales
CREATE POLICY rationale_embeddings_update_policy
  ON public.trade_rationale_embeddings
  FOR UPDATE
  USING (auth.uid() = user_id);

-- Users can only delete their own rationales
CREATE POLICY rationale_embeddings_delete_policy
  ON public.trade_rationale_embeddings
  FOR DELETE
  USING (auth.uid() = user_id);

-- ============================================================================
-- Views for Analysis
-- ============================================================================

-- View: Rationales with Outcomes for Learning
CREATE OR REPLACE VIEW v_rationales_with_outcomes AS
SELECT
  tre.id,
  tre.trade_evaluation_id,
  ate.symbol,
  ate.strategy_type,
  ate.ai_recommendation,
  ate.ai_confidence,
  ate.composite_score,
  tre.trade_details,
  tre.outcome,
  tre.created_at,
  tre.outcome_recorded_at,
  -- Parse outcome details
  (tre.outcome->>'actual_outcome')::TEXT as actual_outcome,
  (tre.outcome->>'actual_roi')::NUMERIC as actual_roi,
  (tre.outcome->>'days_held')::INT as days_held,
  (tre.outcome->>'exit_reason')::TEXT as exit_reason,
  -- Calculate accuracy
  CASE
    WHEN ate.ai_recommendation IN ('strong_buy', 'buy') AND tre.outcome->>'actual_outcome' = 'win' THEN 100
    WHEN ate.ai_recommendation IN ('strong_buy', 'buy') AND tre.outcome->>'actual_outcome' = 'loss' THEN 0
    WHEN ate.ai_recommendation IN ('avoid', 'strong_avoid') AND tre.outcome->>'actual_outcome' = 'loss' THEN 100
    WHEN ate.ai_recommendation IN ('avoid', 'strong_avoid') AND tre.outcome->>'actual_outcome' = 'win' THEN 0
    ELSE 50
  END as recommendation_accuracy
FROM trade_rationale_embeddings tre
JOIN ai_trade_evaluations ate ON tre.trade_evaluation_id = ate.id
WHERE tre.outcome IS NOT NULL
ORDER BY tre.created_at DESC;

-- View: Learning Performance Summary
CREATE OR REPLACE VIEW v_learning_performance AS
SELECT
  user_id,
  COUNT(*) as total_rationales,
  COUNT(*) FILTER (WHERE outcome IS NOT NULL) as completed_trades,
  ROUND(AVG(recommendation_accuracy), 2) as avg_accuracy,
  ROUND(
    100.0 * COUNT(*) FILTER (WHERE actual_outcome = 'win') /
    NULLIF(COUNT(*) FILTER (WHERE outcome IS NOT NULL), 0),
    2
  ) as win_rate,
  ROUND(AVG(actual_roi), 2) as avg_roi,
  ROUND(AVG(days_held), 1) as avg_days_held,
  MAX(created_at) as last_rationale_generated
FROM v_rationales_with_outcomes
GROUP BY user_id;

-- ============================================================================
-- Comments
-- ============================================================================

COMMENT ON TABLE public.trade_rationale_embeddings IS
  'Stores AI-generated trade rationales with vector embeddings for semantic similarity search and learning';

COMMENT ON COLUMN public.trade_rationale_embeddings.rationale_embedding IS
  'OpenAI text-embedding-3-small vector (1536 dimensions) for similarity search';

COMMENT ON COLUMN public.trade_rationale_embeddings.rationale_text IS
  'Full JSON of StructuredRationale for detailed analysis';

COMMENT ON COLUMN public.trade_rationale_embeddings.trade_details IS
  'Trade characteristics: symbol, strategy_type, dte, delta, iv_rank';

COMMENT ON COLUMN public.trade_rationale_embeddings.outcome IS
  'Actual trade outcome: actual_outcome (win/loss), actual_roi, days_held, exit_reason';

COMMENT ON FUNCTION match_trade_rationales IS
  'Find similar trade rationales using vector similarity search with optional filters';

COMMENT ON FUNCTION analyze_rationale_accuracy IS
  'Analyze how accurate AI rationales have been over time';

COMMENT ON FUNCTION get_learning_insights IS
  'Get insights from similar past trades to inform current decisions';

COMMENT ON VIEW v_rationales_with_outcomes IS
  'Rationales joined with their outcomes for learning analysis';

COMMENT ON VIEW v_learning_performance IS
  'Summary of AI learning performance per user';
