/**
 * Agent Job Runner with Progress Tracking
 * Wraps the agent execution with progress updates to the database
 */

import { createPooledClient } from '@/lib/supabase/pooled-client';
import { runAgentV3 } from './options-agent-v3';

export interface JobProgress {
  current_step: string;
  total_steps: number;
  completed_steps: number;
  symbols_processed?: number;
  total_symbols?: number;
  candidates_found?: number;
  message: string;
}

/**
 * Update job progress in database
 * Uses service role to bypass RLS since this runs in background
 */
async function updateJobProgress(
  jobId: string,
  updates: Partial<{
    status: string;
    progress: JobProgress;
    result: any;
    error_message: string;
    error_details: any;
    started_at: string;
    completed_at: string;
  }>
) {
  try {
    // Use service role client for background operations
    const { createClient } = await import('@supabase/supabase-js');
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    );

    const { error } = await supabase
      .from('agent_jobs')
      .update(updates)
      .eq('id', jobId);

    if (error) {
      console.error(`[Job Runner] Failed to update job ${jobId}:`, error);
    }
  } catch (error) {
    console.error(`[Job Runner] Error updating job ${jobId}:`, error);
  }
}

/**
 * Run agent job with progress tracking
 */
export async function runAgentJob(jobId: string) {
  console.log(`[Job Runner] Starting job ${jobId}`);

  try {
    // Get job details using service role (bypasses RLS)
    const { createClient } = await import('@supabase/supabase-js');
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    );

    const { data: job, error: fetchError } = await supabase
      .from('agent_jobs')
      .select('*')
      .eq('id', jobId)
      .single();

    if (fetchError || !job) {
      console.error(`[Job Runner] Fetch error:`, fetchError);
      throw new Error(`Job ${jobId} not found: ${fetchError?.message}`);
    }

    // Check if job is already running or completed
    if (job.status !== 'pending') {
      console.log(`[Job Runner] Job ${jobId} is not pending (status: ${job.status}), skipping`);
      return;
    }

    // Mark job as running
    await updateJobProgress(jobId, {
      status: 'running',
      started_at: new Date().toISOString(),
      progress: {
        current_step: 'initializing',
        total_steps: 8,
        completed_steps: 0,
        total_symbols: job.symbols.length,
        symbols_processed: 0,
        message: 'Initializing agent...'
      }
    });

    // Step 1: Fetch IPS
    await updateJobProgress(jobId, {
      progress: {
        current_step: 'fetch_ips',
        total_steps: 8,
        completed_steps: 1,
        total_symbols: job.symbols.length,
        symbols_processed: 0,
        message: 'Loading IPS configuration...'
      }
    });

    // Step 2: Pre-filter
    await updateJobProgress(jobId, {
      progress: {
        current_step: 'prefilter',
        total_steps: 8,
        completed_steps: 2,
        total_symbols: job.symbols.length,
        symbols_processed: 0,
        message: `Pre-filtering ${job.symbols.length} symbols...`
      }
    });

    // Run the actual agent
    const result = await runAgentV3({
      symbols: job.symbols,
      ipsId: job.ips_id,
      mode: job.mode as 'paper' | 'live' | 'backtest',
      userId: job.user_id
    });

    // Step 8: Complete
    await updateJobProgress(jobId, {
      status: 'completed',
      completed_at: new Date().toISOString(),
      result: {
        candidates: result.selected,
        stats: {
          initial_symbols: job.symbols.length,
          surviving_symbols: result.survivingSymbols.length,
          candidates_generated: result.candidates.length,
          final_recommendations: result.selected.length
        }
      },
      progress: {
        current_step: 'completed',
        total_steps: 8,
        completed_steps: 8,
        total_symbols: job.symbols.length,
        symbols_processed: job.symbols.length,
        candidates_found: result.selected.length,
        message: `Agent completed! Found ${result.selected.length} trade recommendations.`
      }
    });

    console.log(`[Job Runner] Job ${jobId} completed successfully with ${result.selected.length} recommendations`);

  } catch (error: any) {
    console.error(`[Job Runner] Job ${jobId} failed:`, error);

    // Mark job as failed
    await updateJobProgress(jobId, {
      status: 'failed',
      completed_at: new Date().toISOString(),
      error_message: error.message || 'Unknown error',
      error_details: {
        stack: error.stack,
        name: error.name
      }
    });

    throw error;
  }
}
