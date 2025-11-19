/**
 * Dashboard Refresh Job Recovery API
 * POST - Manually trigger processing of stuck pending jobs
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server-client';
import { runDashboardRefreshJob } from '@/lib/dashboard/refresh-job-runner';

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();

    // Get authenticated user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Find stuck pending jobs for this user (older than 1 minute)
    const oneMinuteAgo = new Date(Date.now() - 60000).toISOString();
    const { data: stuckJobs, error: fetchError } = await supabase
      .from('dashboard_refresh_jobs')
      .select('id')
      .eq('user_id', user.id)
      .eq('status', 'pending')
      .lt('created_at', oneMinuteAgo)
      .order('created_at', { ascending: true })
      .limit(1);

    if (fetchError) {
      console.error('[Dashboard Refresh Job Recovery] Failed to fetch stuck jobs:', fetchError);
      return NextResponse.json(
        { error: 'Failed to find stuck jobs', details: fetchError.message },
        { status: 500 }
      );
    }

    if (!stuckJobs || stuckJobs.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No stuck jobs found'
      });
    }

    const jobId = stuckJobs[0].id;
    console.log(`[Dashboard Refresh Job Recovery] Recovering stuck job: ${jobId}`);

    // Process the job directly
    try {
      await runDashboardRefreshJob(jobId);

      return NextResponse.json({
        success: true,
        message: `Successfully recovered and processed job ${jobId}`
      });
    } catch (jobError: any) {
      console.error(`[Dashboard Refresh Job Recovery] Failed to process job ${jobId}:`, jobError);
      return NextResponse.json({
        success: false,
        error: `Failed to process job: ${jobError.message}`
      }, { status: 500 });
    }

  } catch (error: any) {
    console.error('[Dashboard Refresh Job Recovery API] Error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
