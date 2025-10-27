-- Agent Jobs Queue System
-- Created: 2025-10-27
-- Purpose: Enable background processing of agent runs with progress tracking

-- ============================================================================
-- 1. Create agent_jobs table
-- ============================================================================

CREATE TABLE IF NOT EXISTS agent_jobs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Job configuration
  ips_id UUID REFERENCES ips_configurations(id) ON DELETE SET NULL,
  symbols TEXT[] NOT NULL, -- Array of symbols to process
  mode TEXT NOT NULL DEFAULT 'paper', -- 'paper', 'live', 'backtest'

  -- Job status
  status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'running', 'completed', 'failed', 'cancelled'

  -- Progress tracking
  progress JSONB DEFAULT '{}'::jsonb, -- Detailed progress information
  -- Example progress structure:
  -- {
  --   "current_step": "prefilter",
  --   "total_steps": 8,
  --   "completed_steps": 2,
  --   "symbols_processed": 10,
  --   "total_symbols": 50,
  --   "candidates_found": 25,
  --   "message": "Processing symbols in parallel..."
  -- }

  -- Results
  result JSONB, -- Final candidates and trade recommendations
  error_message TEXT,
  error_details JSONB,

  -- Timing
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,

  -- Metadata
  metadata JSONB DEFAULT '{}'::jsonb -- Additional job metadata
);

-- ============================================================================
-- 2. Create indexes
-- ============================================================================

-- Index for finding pending jobs (worker query)
CREATE INDEX agent_jobs_status_created_idx
  ON agent_jobs(status, created_at)
  WHERE status IN ('pending', 'running');

-- Index for user's jobs (dashboard query)
CREATE INDEX agent_jobs_user_created_idx
  ON agent_jobs(user_id, created_at DESC);

-- Index for active/recent jobs
CREATE INDEX agent_jobs_user_status_idx
  ON agent_jobs(user_id, status, created_at DESC);

-- ============================================================================
-- 3. Enable Row Level Security (RLS)
-- ============================================================================

ALTER TABLE agent_jobs ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view their own jobs
CREATE POLICY "Users can view own agent jobs"
  ON agent_jobs
  FOR SELECT
  USING (auth.uid() = user_id);

-- Policy: Users can create their own jobs
CREATE POLICY "Users can create own agent jobs"
  ON agent_jobs
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Policy: Users can update their own jobs (for cancellation)
CREATE POLICY "Users can update own agent jobs"
  ON agent_jobs
  FOR UPDATE
  USING (auth.uid() = user_id);

-- Policy: Service role can update any job (for worker)
CREATE POLICY "Service role can update any agent job"
  ON agent_jobs
  FOR UPDATE
  USING (auth.role() = 'service_role');

-- ============================================================================
-- 4. Create helper functions
-- ============================================================================

-- Function to clean up old completed jobs (older than 30 days)
CREATE OR REPLACE FUNCTION cleanup_old_agent_jobs()
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM agent_jobs
  WHERE status IN ('completed', 'failed', 'cancelled')
    AND completed_at < NOW() - INTERVAL '30 days';

  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get job statistics
CREATE OR REPLACE FUNCTION get_agent_job_stats(p_user_id UUID DEFAULT NULL)
RETURNS TABLE (
  total_jobs BIGINT,
  pending_jobs BIGINT,
  running_jobs BIGINT,
  completed_jobs BIGINT,
  failed_jobs BIGINT,
  avg_duration_minutes NUMERIC
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    COUNT(*)::BIGINT as total_jobs,
    COUNT(*) FILTER (WHERE status = 'pending')::BIGINT as pending_jobs,
    COUNT(*) FILTER (WHERE status = 'running')::BIGINT as running_jobs,
    COUNT(*) FILTER (WHERE status = 'completed')::BIGINT as completed_jobs,
    COUNT(*) FILTER (WHERE status = 'failed')::BIGINT as failed_jobs,
    AVG(
      EXTRACT(EPOCH FROM (completed_at - started_at)) / 60
    ) FILTER (WHERE completed_at IS NOT NULL AND started_at IS NOT NULL) as avg_duration_minutes
  FROM agent_jobs
  WHERE p_user_id IS NULL OR user_id = p_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- 5. Add comments for documentation
-- ============================================================================

COMMENT ON TABLE agent_jobs IS
  'Queue system for background agent execution with progress tracking';

COMMENT ON COLUMN agent_jobs.progress IS
  'JSONB object containing current execution progress, step info, and counts';

COMMENT ON COLUMN agent_jobs.result IS
  'JSONB object containing final trade candidates and recommendations';

COMMENT ON COLUMN agent_jobs.metadata IS
  'Additional metadata like agent version, configuration, etc.';

-- ============================================================================
-- 6. Grant permissions
-- ============================================================================

-- Allow authenticated users to access their jobs
GRANT SELECT, INSERT, UPDATE ON agent_jobs TO authenticated;

-- Allow service role full access (for worker)
GRANT ALL ON agent_jobs TO service_role;
