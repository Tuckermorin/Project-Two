/**
 * Dashboard Refresh Job Worker
 * Processes pending dashboard refresh jobs
 */

import { NextRequest, NextResponse } from 'next/server';
import { runDashboardRefreshJob } from '@/lib/dashboard/refresh-job-runner';

export const maxDuration = 300; // 5 minutes max

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { jobId } = body;

    if (jobId) {
      // Process specific job
      console.log(`[Dashboard Refresh Worker] Processing specific job: ${jobId}`);
      await runDashboardRefreshJob(jobId);

      return NextResponse.json({
        success: true,
        message: `Job ${jobId} processed`
      });
    }

    // Otherwise, look for pending jobs
    console.log('[Dashboard Refresh Worker] Looking for pending jobs...');

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

    // Find the oldest pending job
    const { data: pendingJobs, error } = await supabase
      .from('dashboard_refresh_jobs')
      .select('id')
      .eq('status', 'pending')
      .order('created_at', { ascending: true })
      .limit(1);

    if (error) {
      throw new Error(`Failed to fetch pending jobs: ${error.message}`);
    }

    if (!pendingJobs || pendingJobs.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No pending jobs to process'
      });
    }

    const pendingJob = pendingJobs[0];
    console.log(`[Dashboard Refresh Worker] Processing pending job: ${pendingJob.id}`);

    // Process the job
    await runDashboardRefreshJob(pendingJob.id);

    return NextResponse.json({
      success: true,
      message: `Processed job ${pendingJob.id}`
    });

  } catch (error: any) {
    console.error('[Dashboard Refresh Worker] Error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Worker process failed'
      },
      { status: 500 }
    );
  }
}
