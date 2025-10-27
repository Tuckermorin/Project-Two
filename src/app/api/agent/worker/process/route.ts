import { NextRequest, NextResponse } from 'next/server';
import { runAgentJob } from '@/lib/agent/job-runner';

/**
 * POST /api/agent/worker/process
 * Processes the next pending agent job in the queue
 *
 * This endpoint can be:
 * 1. Called via cron job (e.g., every minute)
 * 2. Triggered when a new job is submitted
 * 3. Run manually for testing
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const { jobId } = body;

    if (jobId) {
      // Process specific job
      console.log(`[Worker] Processing specific job: ${jobId}`);
      await runAgentJob(jobId);

      return NextResponse.json({
        success: true,
        message: `Job ${jobId} processed`
      });
    } else {
      // Find and process next pending job
      console.log('[Worker] Looking for pending jobs...');

      const { createPooledClient } = await import('@/lib/supabase/pooled-client');
      const supabase = await createPooledClient();

      const { data: pendingJob } = await supabase
        .from('agent_jobs')
        .select('id')
        .eq('status', 'pending')
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle();

      if (!pendingJob) {
        return NextResponse.json({
          success: true,
          message: 'No pending jobs found'
        });
      }

      console.log(`[Worker] Processing pending job: ${pendingJob.id}`);
      await runAgentJob(pendingJob.id);

      return NextResponse.json({
        success: true,
        message: `Job ${pendingJob.id} processed`
      });
    }

  } catch (error: any) {
    console.error('[Worker] Error processing job:', error);

    return NextResponse.json(
      {
        success: false,
        error: 'Failed to process job',
        message: error.message
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/agent/worker/process
 * Alias for POST (useful for cron jobs that only support GET)
 */
export async function GET(request: NextRequest) {
  return POST(request);
}
