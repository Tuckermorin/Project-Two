-- Migration: Trade Post-Mortem Analysis System
-- Purpose: AI analyzes closed trades to understand what worked/didn't work
-- This creates a learning feedback loop for the AI

-- 1. Create trade_postmortem_analysis table
CREATE TABLE IF NOT EXISTS trade_postmortem_analysis (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trade_id uuid NOT NULL REFERENCES trades(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Link to original evaluation
  original_evaluation_id uuid REFERENCES ai_trade_evaluations(id) ON DELETE SET NULL,
  original_rationale_embedding_id uuid REFERENCES trade_rationale_embeddings(id) ON DELETE SET NULL,

  -- Trade Performance Summary
  performance_summary jsonb NOT NULL,
  -- {
  --   "entry_date": "2024-10-23",
  --   "exit_date": "2024-11-15",
  --   "days_held": 23,
  --   "realized_pl": 450.00,
  --   "realized_pl_percent": 45.0,
  --   "outcome": "win|loss|break_even",
  --   "exit_reason": "Hit profit target",
  --   "max_unrealized_gain": 500.00,
  --   "max_unrealized_loss": -50.00
  -- }

  -- AI Post-Mortem Analysis (comprehensive structured analysis)
  postmortem_analysis jsonb NOT NULL,
  -- {
  --   "executive_summary": {
  --     "overall_assessment": "strong_success|success|neutral|failure|strong_failure",
  --     "one_sentence_verdict": "Trade exceeded expectations...",
  --     "what_went_right": ["Factor 1", "Factor 2"],
  --     "what_went_wrong": ["Issue 1", "Issue 2"]
  --   },
  --   "original_thesis_review": {
  --     "original_recommendation": "strong_buy",
  --     "original_confidence": "high",
  --     "original_key_factors": [...],
  --     "thesis_accuracy": "highly_accurate|mostly_accurate|partially_accurate|inaccurate",
  --     "factors_that_played_out": [...],
  --     "factors_that_didnt": [...]
  --   },
  --   "performance_analysis": {
  --     "vs_expectations": "exceeded|met|underperformed|failed",
  --     "key_performance_drivers": [...],
  --     "unexpected_developments": [...],
  --     "risk_factors_realized": [...],
  --     "opportunities_captured": [...]
  --   },
  --   "ips_factor_retrospective": {
  --     "factors_that_mattered_most": [...],
  --     "factors_that_didnt_matter": [...],
  --     "missing_factors_identified": [...],
  --     "factor_weight_recommendations": [...]
  --   },
  --   "lessons_learned": {
  --     "key_insights": [...],
  --     "pattern_recognition": "What pattern does this fit?",
  --     "future_recommendations": [...],
  --     "similar_setups_to_watch_for": [...],
  --     "similar_setups_to_avoid": [...]
  --   },
  --   "market_context_review": {
  --     "market_environment_during_trade": "...",
  --     "how_market_affected_outcome": "...",
  --     "sector_performance": "...",
  --     "macro_events_impact": [...]
  --   },
  --   "decision_quality_vs_outcome": {
  --     "was_decision_quality_good": true|false,
  --     "was_outcome_lucky_or_skillful": "skill|luck|unlucky",
  --     "would_make_same_decision_again": true|false,
  --     "what_would_change": [...]
  --   }
  -- }

  -- Embedding of post-mortem analysis (for similarity search)
  postmortem_embedding vector(1536),

  -- Metadata
  analyzed_at timestamptz NOT NULL DEFAULT now(),
  analysis_confidence numeric(3,2), -- 0.0 to 1.0
  data_quality_score integer, -- 0 to 100

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 2. Indexes for performance
CREATE INDEX IF NOT EXISTS idx_postmortem_trade_id ON trade_postmortem_analysis(trade_id);
CREATE INDEX IF NOT EXISTS idx_postmortem_user_id ON trade_postmortem_analysis(user_id);
CREATE INDEX IF NOT EXISTS idx_postmortem_original_eval ON trade_postmortem_analysis(original_evaluation_id);
CREATE INDEX IF NOT EXISTS idx_postmortem_analyzed_at ON trade_postmortem_analysis(analyzed_at);

-- Vector similarity search index
CREATE INDEX IF NOT EXISTS idx_postmortem_embedding
ON trade_postmortem_analysis
USING hnsw (postmortem_embedding vector_cosine_ops)
WITH (m = 16, ef_construction = 64);

-- 3. RLS policies
ALTER TABLE trade_postmortem_analysis ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own postmortems"
  ON trade_postmortem_analysis FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own postmortems"
  ON trade_postmortem_analysis FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own postmortems"
  ON trade_postmortem_analysis FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own postmortems"
  ON trade_postmortem_analysis FOR DELETE
  USING (auth.uid() = user_id);

-- 4. Trigger for updated_at
CREATE OR REPLACE FUNCTION update_postmortem_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_postmortem_updated_at
  BEFORE UPDATE ON trade_postmortem_analysis
  FOR EACH ROW
  EXECUTE FUNCTION update_postmortem_updated_at();

-- 5. Function to find similar post-mortems (learn from past outcomes)
CREATE OR REPLACE FUNCTION match_similar_postmortems(
  query_embedding vector(1536),
  match_threshold float DEFAULT 0.75,
  match_count int DEFAULT 10,
  filter_user_id uuid DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  trade_id uuid,
  performance_summary jsonb,
  postmortem_analysis jsonb,
  similarity float,
  analyzed_at timestamptz
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    pm.id,
    pm.trade_id,
    pm.performance_summary,
    pm.postmortem_analysis,
    1 - (pm.postmortem_embedding <=> query_embedding) AS similarity,
    pm.analyzed_at
  FROM trade_postmortem_analysis pm
  WHERE
    (filter_user_id IS NULL OR pm.user_id = filter_user_id)
    AND 1 - (pm.postmortem_embedding <=> query_embedding) > match_threshold
  ORDER BY pm.postmortem_embedding <=> query_embedding
  LIMIT match_count;
END;
$$ LANGUAGE plpgsql;

-- 6. View: Trades needing post-mortem analysis
CREATE OR REPLACE VIEW v_trades_needing_postmortem AS
SELECT
  t.id,
  t.user_id,
  t.symbol,
  t.strategy_type,
  t.status,
  t.entry_date,
  t.closed_at,
  t.realized_pl_percent,
  t.ai_evaluation_id,
  t.structured_rationale,
  CASE
    WHEN EXISTS (
      SELECT 1 FROM trade_postmortem_analysis pm
      WHERE pm.trade_id = t.id
    ) THEN false
    ELSE true
  END AS needs_postmortem
FROM trades t
WHERE
  t.status = 'closed'
  AND t.closed_at IS NOT NULL
  AND t.ai_evaluation_id IS NOT NULL -- Only analyze trades that had AI evaluation
  AND NOT EXISTS (
    SELECT 1 FROM trade_postmortem_analysis pm
    WHERE pm.trade_id = t.id
  );

-- 7. Function to get trades ready for post-mortem analysis
CREATE OR REPLACE FUNCTION get_trades_for_postmortem_batch(
  batch_size int DEFAULT 10,
  filter_user_id uuid DEFAULT NULL
)
RETURNS TABLE (
  trade_id uuid,
  user_id uuid,
  symbol text,
  entry_date timestamptz,
  closed_at timestamptz,
  realized_pl_percent numeric,
  ai_evaluation_id uuid
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    t.id AS trade_id,
    t.user_id,
    t.symbol,
    t.entry_date,
    t.closed_at,
    t.realized_pl_percent,
    t.ai_evaluation_id
  FROM v_trades_needing_postmortem t
  WHERE
    (filter_user_id IS NULL OR t.user_id = filter_user_id)
    AND t.needs_postmortem = true
  ORDER BY t.closed_at DESC
  LIMIT batch_size;
END;
$$ LANGUAGE plpgsql;

-- Comments
COMMENT ON TABLE trade_postmortem_analysis IS 'AI-generated post-mortem analysis of closed trades for learning';
COMMENT ON COLUMN trade_postmortem_analysis.postmortem_analysis IS 'Comprehensive structured analysis of trade outcome and lessons learned';
COMMENT ON COLUMN trade_postmortem_analysis.postmortem_embedding IS 'Vector embedding for finding similar post-mortem analyses';
COMMENT ON FUNCTION match_similar_postmortems IS 'Find similar post-mortem analyses using semantic similarity';
COMMENT ON VIEW v_trades_needing_postmortem IS 'Closed trades that need AI post-mortem analysis';
COMMENT ON FUNCTION get_trades_for_postmortem_batch IS 'Get batch of trades ready for post-mortem analysis (for cron jobs)';
