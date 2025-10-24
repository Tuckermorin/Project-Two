-- Migration: Add AI Evaluation Tracking to Trades
-- Purpose: Link trades to their AI evaluations and rationale embeddings for learning

-- 1. Add ai_evaluation_id to trades table
ALTER TABLE trades
ADD COLUMN IF NOT EXISTS ai_evaluation_id uuid REFERENCES ai_trade_evaluations(id) ON DELETE SET NULL;

-- 2. Add index for fast lookups
CREATE INDEX IF NOT EXISTS idx_trades_ai_evaluation_id ON trades(ai_evaluation_id);

-- 3. Add structured_rationale column (JSONB) for quick access without join
ALTER TABLE trades
ADD COLUMN IF NOT EXISTS structured_rationale jsonb;

COMMENT ON COLUMN trades.ai_evaluation_id IS 'Links to the AI evaluation that recommended this trade';
COMMENT ON COLUMN trades.structured_rationale IS 'Full structured rationale from AI (cached for performance)';

-- 4. Create helper function to get rationale embedding ID from trade
CREATE OR REPLACE FUNCTION get_trade_rationale_embedding_id(trade_evaluation_id uuid)
RETURNS uuid AS $$
  SELECT id
  FROM trade_rationale_embeddings
  WHERE trade_evaluation_id = $1
  LIMIT 1;
$$ LANGUAGE sql STABLE;

COMMENT ON FUNCTION get_trade_rationale_embedding_id IS 'Gets the rationale embedding ID for a given trade evaluation';
