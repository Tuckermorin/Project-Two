-- AI Trade Evaluations Table
-- Stores AI-enhanced trade recommendations with full context and explainability

-- ============================================================================
-- Main Evaluations Table
-- ============================================================================

CREATE TABLE IF NOT EXISTS ai_trade_evaluations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- References
  trade_candidate_id UUID REFERENCES trades(id) ON DELETE SET NULL,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  ips_id UUID NOT NULL REFERENCES ips_configurations(id) ON DELETE CASCADE,

  -- Trade Details
  symbol VARCHAR(10) NOT NULL,
  strategy_type VARCHAR(50) NOT NULL,

  -- IPS Evaluation Results
  ips_passed BOOLEAN NOT NULL,
  ips_score NUMERIC(5,2) NOT NULL, -- 0-100

  -- AI Evaluation Results
  ai_recommendation VARCHAR(20) NOT NULL, -- strong_buy, buy, neutral, avoid, strong_avoid
  ai_confidence VARCHAR(20) NOT NULL, -- very_high, high, medium, low, very_low
  ai_score NUMERIC(5,2) NOT NULL, -- 0-100

  -- Weighted Scoring
  composite_score NUMERIC(5,2) NOT NULL, -- 0-100
  ips_weight NUMERIC(3,2) NOT NULL, -- 0-1
  ai_weight NUMERIC(3,2) NOT NULL, -- 0-1

  -- Final Recommendation
  final_recommendation VARCHAR(20) NOT NULL,

  -- Full Context (JSONB for flexibility)
  evaluation_context JSONB NOT NULL,
  explainability JSONB NOT NULL,

  -- Outcome Tracking (filled in after trade closes)
  actual_trade_id UUID REFERENCES trades(id) ON DELETE SET NULL,
  trade_was_executed BOOLEAN DEFAULT FALSE,
  actual_outcome VARCHAR(20), -- win, loss, break_even
  actual_roi NUMERIC(10,4),
  recommendation_accuracy NUMERIC(5,2), -- How close was the prediction

  -- Metadata
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================================================
-- Indexes for Performance
-- ============================================================================

CREATE INDEX idx_ai_evaluations_user_id ON ai_trade_evaluations(user_id);
CREATE INDEX idx_ai_evaluations_symbol ON ai_trade_evaluations(symbol);
CREATE INDEX idx_ai_evaluations_ips_id ON ai_trade_evaluations(ips_id);
CREATE INDEX idx_ai_evaluations_final_rec ON ai_trade_evaluations(final_recommendation);
CREATE INDEX idx_ai_evaluations_composite_score ON ai_trade_evaluations(composite_score DESC);
CREATE INDEX idx_ai_evaluations_created_at ON ai_trade_evaluations(created_at DESC);
CREATE INDEX idx_ai_evaluations_symbol_user ON ai_trade_evaluations(symbol, user_id);

-- GIN index for JSONB queries
CREATE INDEX idx_ai_evaluations_context ON ai_trade_evaluations USING GIN(evaluation_context);
CREATE INDEX idx_ai_evaluations_explainability ON ai_trade_evaluations USING GIN(explainability);

-- ============================================================================
-- Helper Functions
-- ============================================================================

-- Update timestamp on modification
CREATE OR REPLACE FUNCTION update_ai_evaluation_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER ai_evaluation_updated
BEFORE UPDATE ON ai_trade_evaluations
FOR EACH ROW
EXECUTE FUNCTION update_ai_evaluation_timestamp();

-- Calculate recommendation accuracy after trade closes
CREATE OR REPLACE FUNCTION calculate_recommendation_accuracy(
  predicted_recommendation VARCHAR(20),
  actual_outcome VARCHAR(20),
  predicted_score NUMERIC(5,2)
)
RETURNS NUMERIC(5,2) AS $$
DECLARE
  accuracy NUMERIC(5,2);
BEGIN
  -- Map recommendations to expected outcomes
  -- strong_buy/buy should predict wins
  -- avoid/strong_avoid should predict losses
  -- neutral is 50/50

  IF actual_outcome = 'win' THEN
    CASE predicted_recommendation
      WHEN 'strong_buy' THEN accuracy := 100;
      WHEN 'buy' THEN accuracy := 85;
      WHEN 'neutral' THEN accuracy := 50;
      WHEN 'avoid' THEN accuracy := 25;
      WHEN 'strong_avoid' THEN accuracy := 10;
      ELSE accuracy := 50;
    END CASE;
  ELSIF actual_outcome = 'loss' THEN
    CASE predicted_recommendation
      WHEN 'strong_buy' THEN accuracy := 10;
      WHEN 'buy' THEN accuracy := 25;
      WHEN 'neutral' THEN accuracy := 50;
      WHEN 'avoid' THEN accuracy := 85;
      WHEN 'strong_avoid' THEN accuracy := 100;
      ELSE accuracy := 50;
    END CASE;
  ELSE
    accuracy := 50; -- break_even or unknown
  END IF;

  RETURN accuracy;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- ============================================================================
-- Views
-- ============================================================================

-- Recommendation Accuracy Leaderboard
CREATE OR REPLACE VIEW v_ai_recommendation_accuracy AS
SELECT
  user_id,
  COUNT(*) as total_recommendations,
  COUNT(*) FILTER (WHERE trade_was_executed = TRUE) as executed_count,
  AVG(recommendation_accuracy) as avg_accuracy,
  AVG(composite_score) as avg_composite_score,

  -- Breakdown by recommendation type
  COUNT(*) FILTER (WHERE final_recommendation = 'strong_buy') as strong_buy_count,
  COUNT(*) FILTER (WHERE final_recommendation = 'buy') as buy_count,
  COUNT(*) FILTER (WHERE final_recommendation = 'neutral') as neutral_count,
  COUNT(*) FILTER (WHERE final_recommendation = 'avoid') as avoid_count,
  COUNT(*) FILTER (WHERE final_recommendation = 'strong_avoid') as strong_avoid_count,

  -- Win rates by recommendation
  AVG(CASE WHEN final_recommendation IN ('strong_buy', 'buy') AND actual_outcome = 'win' THEN 1 ELSE 0 END) * 100 as buy_win_rate,
  AVG(CASE WHEN final_recommendation IN ('avoid', 'strong_avoid') AND actual_outcome = 'loss' THEN 1 ELSE 0 END) * 100 as avoid_accuracy,

  MAX(created_at) as last_recommendation
FROM ai_trade_evaluations
WHERE trade_was_executed = TRUE
GROUP BY user_id;

-- Symbol Performance by Recommendation
CREATE OR REPLACE VIEW v_symbol_recommendation_performance AS
SELECT
  symbol,
  final_recommendation,
  COUNT(*) as recommendation_count,
  COUNT(*) FILTER (WHERE trade_was_executed = TRUE) as executed_count,
  AVG(composite_score) as avg_composite_score,
  AVG(actual_roi) FILTER (WHERE actual_roi IS NOT NULL) as avg_roi,
  AVG(recommendation_accuracy) FILTER (WHERE recommendation_accuracy IS NOT NULL) as avg_accuracy,
  COUNT(*) FILTER (WHERE actual_outcome = 'win') as win_count,
  COUNT(*) FILTER (WHERE actual_outcome = 'loss') as loss_count
FROM ai_trade_evaluations
GROUP BY symbol, final_recommendation;

-- Progressive Weighting Analysis
CREATE OR REPLACE VIEW v_progressive_weighting_stats AS
SELECT
  CASE
    WHEN ips_weight >= 0.55 THEN 'Phase 1 (60/40)'
    WHEN ips_weight >= 0.45 THEN 'Phase 2 (50/50)'
    ELSE 'Phase 3 (30/70)'
  END as weighting_phase,
  COUNT(*) as recommendation_count,
  AVG(composite_score) as avg_composite_score,
  AVG(recommendation_accuracy) FILTER (WHERE recommendation_accuracy IS NOT NULL) as avg_accuracy,
  AVG(actual_roi) FILTER (WHERE actual_roi IS NOT NULL) as avg_roi,
  COUNT(*) FILTER (WHERE actual_outcome = 'win') as win_count,
  COUNT(*) FILTER (WHERE actual_outcome = 'loss') as loss_count
FROM ai_trade_evaluations
WHERE trade_was_executed = TRUE
GROUP BY weighting_phase;

-- Recent Recommendations
CREATE OR REPLACE VIEW v_recent_ai_recommendations AS
SELECT
  id,
  symbol,
  strategy_type,
  final_recommendation,
  composite_score,
  ai_confidence,
  ips_passed,
  ROUND(ips_weight * 100) || '/' || ROUND(ai_weight * 100) as weight_ratio,
  trade_was_executed,
  actual_outcome,
  created_at
FROM ai_trade_evaluations
ORDER BY created_at DESC
LIMIT 50;

-- ============================================================================
-- Row Level Security (RLS)
-- ============================================================================

ALTER TABLE ai_trade_evaluations ENABLE ROW LEVEL SECURITY;

-- Users can only see their own evaluations
CREATE POLICY ai_evaluations_select_policy ON ai_trade_evaluations
  FOR SELECT
  USING (auth.uid() = user_id);

-- Users can only insert their own evaluations
CREATE POLICY ai_evaluations_insert_policy ON ai_trade_evaluations
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can only update their own evaluations
CREATE POLICY ai_evaluations_update_policy ON ai_trade_evaluations
  FOR UPDATE
  USING (auth.uid() = user_id);

-- Users can only delete their own evaluations
CREATE POLICY ai_evaluations_delete_policy ON ai_trade_evaluations
  FOR DELETE
  USING (auth.uid() = user_id);

-- ============================================================================
-- Comments
-- ============================================================================

COMMENT ON TABLE ai_trade_evaluations IS 'AI-enhanced trade recommendations with full context and explainability';
COMMENT ON COLUMN ai_trade_evaluations.composite_score IS 'Weighted combination of IPS and AI scores';
COMMENT ON COLUMN ai_trade_evaluations.evaluation_context IS 'Full enriched context used for evaluation';
COMMENT ON COLUMN ai_trade_evaluations.explainability IS 'Human-readable explanation of recommendation';
COMMENT ON COLUMN ai_trade_evaluations.recommendation_accuracy IS 'How accurate the recommendation was (calculated after trade closes)';

COMMENT ON VIEW v_ai_recommendation_accuracy IS 'Tracks how accurate AI recommendations are over time';
COMMENT ON VIEW v_progressive_weighting_stats IS 'Analyzes performance across different weighting phases';
