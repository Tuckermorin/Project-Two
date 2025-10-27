/**
 * React hooks for managing dashboard refresh jobs
 */

import { useState, useEffect, useCallback } from 'react';

export interface DashboardRefreshJob {
  id: string;
  user_id: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  progress?: {
    current_step: string;
    total_steps: number;
    completed_steps: number;
    symbols_processed?: number;
    total_symbols?: number;
    trades_updated?: number;
    message: string;
  };
  result?: any;
  error_message?: string;
  error_details?: any;
  created_at: string;
  started_at?: string;
  completed_at?: string;
  duration_seconds?: number;
  estimated_seconds_remaining?: number;
}

/**
 * Hook to submit a new dashboard refresh job
 */
export function useSubmitDashboardRefreshJob() {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submitJob = useCallback(async (): Promise<string> => {
    setSubmitting(true);
    setError(null);

    try {
      const response = await fetch('/api/dashboard/refresh-jobs', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to submit dashboard refresh job');
      }

      const data = await response.json();
      return data.jobId;
    } catch (err: any) {
      setError(err.message);
      throw err;
    } finally {
      setSubmitting(false);
    }
  }, []);

  return { submitJob, submitting, error };
}

/**
 * Hook to poll a specific dashboard refresh job for status updates
 */
export function useDashboardRefreshJob(
  jobId: string | null,
  options: {
    pollInterval?: number;
    enabled?: boolean;
  } = {}
) {
  const { pollInterval = 5000, enabled = true } = options;
  const [job, setJob] = useState<DashboardRefreshJob | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchJobStatus = useCallback(async () => {
    if (!jobId || !enabled) return;

    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/dashboard/refresh-jobs/${jobId}`);

      if (!response.ok) {
        throw new Error('Failed to fetch job status');
      }

      const data = await response.json();
      setJob(data.job);

      // Stop polling if job is in a terminal state
      if (data.job.status === 'completed' || data.job.status === 'failed' || data.job.status === 'cancelled') {
        return 'stop';
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [jobId, enabled]);

  // Auto-poll for job status
  useEffect(() => {
    if (!jobId || !enabled) return;

    // Initial fetch
    fetchJobStatus();

    // Set up polling interval
    const interval = setInterval(async () => {
      const result = await fetchJobStatus();
      if (result === 'stop') {
        clearInterval(interval);
      }
    }, pollInterval);

    return () => clearInterval(interval);
  }, [jobId, enabled, pollInterval, fetchJobStatus]);

  return { job, loading, error, refresh: fetchJobStatus };
}

/**
 * Hook to fetch list of recent dashboard refresh jobs
 */
export function useDashboardRefreshJobList(options: { limit?: number } = {}) {
  const { limit = 5 } = options;
  const [jobs, setJobs] = useState<DashboardRefreshJob[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchJobs = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/dashboard/refresh-jobs?limit=${limit}`);

      if (!response.ok) {
        throw new Error('Failed to fetch jobs');
      }

      const data = await response.json();
      setJobs(data.jobs || []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [limit]);

  useEffect(() => {
    fetchJobs();
  }, [fetchJobs]);

  return { jobs, loading, error, refresh: fetchJobs };
}
