-- Add user_id column to agent_runs table
-- This allows proper RLS and user filtering for agent runs

-- Add user_id column
ALTER TABLE agent_runs
ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

-- Create index for efficient querying by user_id
CREATE INDEX IF NOT EXISTS agent_runs_user_id_idx ON agent_runs(user_id, finished_at DESC);

-- Enable RLS
ALTER TABLE agent_runs ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Users can view own agent runs" ON agent_runs;
DROP POLICY IF EXISTS "Service role can insert agent runs" ON agent_runs;
DROP POLICY IF EXISTS "Service role can update agent runs" ON agent_runs;

-- Policy: Users can view their own agent runs
CREATE POLICY "Users can view own agent runs"
  ON agent_runs
  FOR SELECT
  USING (auth.uid() = user_id);

-- Policy: Service role can insert agent runs (for background jobs)
CREATE POLICY "Service role can insert agent runs"
  ON agent_runs
  FOR INSERT
  WITH CHECK (true);

-- Policy: Service role can update agent runs (for background jobs)
CREATE POLICY "Service role can update agent runs"
  ON agent_runs
  FOR UPDATE
  USING (true);

-- Update trade_candidates to ensure user_id is set
ALTER TABLE trade_candidates
ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

-- Create index for trade_candidates
CREATE INDEX IF NOT EXISTS trade_candidates_user_id_idx ON trade_candidates(user_id, created_at DESC);

-- Enable RLS on trade_candidates
ALTER TABLE trade_candidates ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Users can view own trade candidates" ON trade_candidates;
DROP POLICY IF EXISTS "Service role can insert trade candidates" ON trade_candidates;
DROP POLICY IF EXISTS "Service role can update trade candidates" ON trade_candidates;

-- Policy: Users can view their own trade candidates
CREATE POLICY "Users can view own trade candidates"
  ON trade_candidates
  FOR SELECT
  USING (auth.uid() = user_id);

-- Policy: Service role can insert trade candidates
CREATE POLICY "Service role can insert trade candidates"
  ON trade_candidates
  FOR INSERT
  WITH CHECK (true);

-- Policy: Service role can update trade candidates
CREATE POLICY "Service role can update trade candidates"
  ON trade_candidates
  FOR UPDATE
  USING (true);
