-- Dashboard Refresh Jobs Table
-- Tracks background dashboard refresh operations

CREATE TABLE IF NOT EXISTS dashboard_refresh_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Job status
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'completed', 'failed', 'cancelled')),

  -- Progress tracking
  progress JSONB,

  -- Result data
  result JSONB,

  -- Error tracking
  error_message TEXT,
  error_details JSONB,

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,

  -- Metadata
  metadata JSONB
);

-- Indexes for performance
CREATE INDEX idx_dashboard_refresh_jobs_user_id ON dashboard_refresh_jobs(user_id);
CREATE INDEX idx_dashboard_refresh_jobs_status ON dashboard_refresh_jobs(status);
CREATE INDEX idx_dashboard_refresh_jobs_created_at ON dashboard_refresh_jobs(created_at DESC);

-- RLS Policies
ALTER TABLE dashboard_refresh_jobs ENABLE ROW LEVEL SECURITY;

-- Users can view their own jobs
CREATE POLICY "Users can view own dashboard refresh jobs"
  ON dashboard_refresh_jobs
  FOR SELECT
  USING (auth.uid() = user_id);

-- Users can insert their own jobs
CREATE POLICY "Users can create dashboard refresh jobs"
  ON dashboard_refresh_jobs
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can update their own pending/running jobs (for cancellation)
CREATE POLICY "Users can update own dashboard refresh jobs"
  ON dashboard_refresh_jobs
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Service role can do everything (for background workers)
CREATE POLICY "Service role full access to dashboard refresh jobs"
  ON dashboard_refresh_jobs
  FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');

-- Add comment
COMMENT ON TABLE dashboard_refresh_jobs IS 'Background job queue for dashboard refresh operations';
