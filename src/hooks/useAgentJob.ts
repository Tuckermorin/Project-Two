/**
 * React hook for managing agent job lifecycle
 * Handles job submission, status polling, and real-time updates
 */

import { useState, useEffect, useCallback, useRef } from 'react';

export interface JobProgress {
  current_step: string;
  total_steps: number;
  completed_steps: number;
  symbols_processed?: number;
  total_symbols?: number;
  candidates_found?: number;
  message: string;
}

export interface AgentJob {
  id: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  mode: string;
  progress: JobProgress;
  result?: any;
  error_message?: string;
  error_details?: any;
  created_at: string;
  started_at?: string;
  completed_at?: string;
  duration_seconds?: number;
  estimated_seconds_remaining?: number;
  symbols_count: number;
}

export function useAgentJob(jobId: string | null, options?: { pollInterval?: number; enabled?: boolean }) {
  const [job, setJob] = useState<AgentJob | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pollInterval = options?.pollInterval || 5000; // Default: poll every 5 seconds
  const enabled = options?.enabled !== false;
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  const fetchJobStatus = useCallback(async () => {
    if (!jobId || !enabled) return;

    try {
      const response = await fetch(`/api/agent/jobs/${jobId}`);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to fetch job status');
      }

      setJob(data.job);
      setError(null);

      // Stop polling if job is in terminal state
      if (['completed', 'failed', 'cancelled'].includes(data.job.status)) {
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
        }
      }
    } catch (err: any) {
      console.error('Error fetching job status:', err);
      setError(err.message);
    }
  }, [jobId, enabled]);

  // Initial fetch
  useEffect(() => {
    if (jobId && enabled) {
      setLoading(true);
      fetchJobStatus().finally(() => setLoading(false));
    }
  }, [jobId, enabled, fetchJobStatus]);

  // Set up polling for running jobs
  useEffect(() => {
    if (!jobId || !enabled || !job) return;

    // Only poll if job is pending or running
    if (job.status === 'pending' || job.status === 'running') {
      intervalRef.current = setInterval(fetchJobStatus, pollInterval);
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [jobId, enabled, job?.status, pollInterval, fetchJobStatus]);

  const cancelJob = useCallback(async () => {
    if (!jobId) return;

    try {
      const response = await fetch(`/api/agent/jobs/${jobId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'cancel' })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to cancel job');
      }

      // Refresh job status
      await fetchJobStatus();
    } catch (err: any) {
      console.error('Error cancelling job:', err);
      setError(err.message);
      throw err;
    }
  }, [jobId, fetchJobStatus]);

  const deleteJob = useCallback(async () => {
    if (!jobId) return;

    try {
      const response = await fetch(`/api/agent/jobs/${jobId}`, {
        method: 'DELETE'
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to delete job');
      }

      setJob(null);
    } catch (err: any) {
      console.error('Error deleting job:', err);
      setError(err.message);
      throw err;
    }
  }, [jobId]);

  return {
    job,
    loading,
    error,
    cancelJob,
    deleteJob,
    refresh: fetchJobStatus
  };
}

/**
 * Hook for submitting new agent jobs
 */
export function useSubmitAgentJob() {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submitJob = useCallback(async (params: {
    ipsId?: string;
    symbols: string[];
    mode?: 'paper' | 'live' | 'backtest';
  }) => {
    setSubmitting(true);
    setError(null);

    try {
      const response = await fetch('/api/agent/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params)
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to submit job');
      }

      return data.jobId;
    } catch (err: any) {
      console.error('Error submitting job:', err);
      setError(err.message);
      throw err;
    } finally {
      setSubmitting(false);
    }
  }, []);

  return {
    submitJob,
    submitting,
    error
  };
}

/**
 * Hook for fetching job list/history
 */
export function useAgentJobList(options?: { status?: string; limit?: number }) {
  const [jobs, setJobs] = useState<AgentJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchJobs = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      if (options?.status) params.set('status', options.status);
      if (options?.limit) params.set('limit', options.limit.toString());

      const response = await fetch(`/api/agent/jobs?${params.toString()}`);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to fetch jobs');
      }

      setJobs(data.jobs || []);
    } catch (err: any) {
      console.error('Error fetching jobs:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [options?.status, options?.limit]);

  useEffect(() => {
    fetchJobs();
  }, [fetchJobs]);

  return {
    jobs,
    loading,
    error,
    refresh: fetchJobs
  };
}
