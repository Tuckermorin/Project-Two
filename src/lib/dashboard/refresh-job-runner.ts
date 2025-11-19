/**
 * Dashboard Refresh Job Runner with Progress Tracking
 * Wraps the dashboard refresh with progress updates to the database
 */

export interface DashboardRefreshProgress {
  current_step: string;
  total_steps: number;
  completed_steps: number;
  symbols_processed?: number;
  total_symbols?: number;
  trades_updated?: number;
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
    progress: DashboardRefreshProgress;
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
      .from('dashboard_refresh_jobs')
      .update(updates)
      .eq('id', jobId);

    if (error) {
      console.error(`[Dashboard Refresh Job] Failed to update job ${jobId}:`, error);
    }
  } catch (error) {
    console.error(`[Dashboard Refresh Job] Error updating job ${jobId}:`, error);
  }
}

/**
 * Run dashboard refresh job with progress tracking
 */
export async function runDashboardRefreshJob(jobId: string) {
  console.log(`[Dashboard Refresh Job] Starting job ${jobId}`);

  // Create a timeout promise (4 minutes - before the 5min maxDuration hits)
  const timeoutMs = 4 * 60 * 1000;
  const timeoutPromise = new Promise((_, reject) => {
    setTimeout(() => reject(new Error('Job execution timeout after 4 minutes')), timeoutMs);
  });

  try {
    // Race the job execution against the timeout
    await Promise.race([
      executeJobLogic(jobId),
      timeoutPromise
    ]);
  } catch (error: any) {
    console.error(`[Dashboard Refresh Job] Job ${jobId} failed:`, error);

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

/**
 * Execute the actual job logic (separated for timeout handling)
 */
async function executeJobLogic(jobId: string) {
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

    const { data: job, error: jobError } = await supabase
      .from('dashboard_refresh_jobs')
      .select('*')
      .eq('id', jobId)
      .single();

    if (jobError || !job) {
      throw new Error(`Job ${jobId} not found: ${jobError?.message}`);
    }

    // Check if job is already running or completed
    if (job.status !== 'pending') {
      console.log(`[Dashboard Refresh Job] Job ${jobId} is not pending (status: ${job.status}), skipping`);
      return;
    }

    // Mark job as running
    await updateJobProgress(jobId, {
      status: 'running',
      started_at: new Date().toISOString(),
      progress: {
        current_step: 'initializing',
        total_steps: 4,
        completed_steps: 0,
        message: '🚀 Starting dashboard refresh...'
      }
    });

    // Step 1: Fetch active trades
    await updateJobProgress(jobId, {
      progress: {
        current_step: 'fetching_trades',
        total_steps: 4,
        completed_steps: 1,
        message: '📊 Fetching active trades...'
      }
    });

    const { data: trades, error: tradesError } = await supabase
      .from('trades')
      .select('*')
      .eq('user_id', job.user_id)
      .eq('status', 'active');

    if (tradesError) {
      throw new Error(`Failed to fetch trades: ${tradesError.message}`);
    }

    if (!trades || trades.length === 0) {
      await updateJobProgress(jobId, {
        status: 'completed',
        completed_at: new Date().toISOString(),
        progress: {
          current_step: 'completed',
          total_steps: 4,
          completed_steps: 4,
          trades_updated: 0,
          message: '✅ No active trades to refresh'
        },
        result: {
          total: 0,
          successful: 0,
          failed: 0
        }
      });
      return;
    }

    // Step 2: Execute refresh directly (inline to avoid auth issues)
    await updateJobProgress(jobId, {
      progress: {
        current_step: 'refreshing_data',
        total_steps: 4,
        completed_steps: 2,
        message: `🔄 Refreshing ${trades.length} trades...`
      }
    });

    // Import and execute refresh logic directly with service role
    const { executeRefreshLogic } = await import('@/lib/dashboard/refresh-logic');
    const refreshResult = await executeRefreshLogic(supabase, job.user_id);

    // Step 3: Process results
    await updateJobProgress(jobId, {
      progress: {
        current_step: 'processing_results',
        total_steps: 4,
        completed_steps: 3,
        trades_updated: refreshResult.summary?.successful || 0,
        message: `✨ Processed ${refreshResult.summary?.successful || 0} trades`
      }
    });

    // Step 4: Complete
    await updateJobProgress(jobId, {
      status: 'completed',
      completed_at: new Date().toISOString(),
      progress: {
        current_step: 'completed',
        total_steps: 4,
        completed_steps: 4,
        trades_updated: refreshResult.summary?.successful || 0,
        message: `✅ Dashboard refresh complete - ${refreshResult.summary?.successful || 0}/${refreshResult.summary?.total || 0} trades updated`
      },
      result: refreshResult
    });

    console.log(`[Dashboard Refresh Job] Job ${jobId} completed successfully`);

  } catch (error: any) {
    // Re-throw error to be caught by outer handler
    throw error;
  }
}
