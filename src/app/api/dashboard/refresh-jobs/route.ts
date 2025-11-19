/**
 * Dashboard Refresh Jobs API
 * POST - Create a new dashboard refresh job
 * GET - List recent dashboard refresh jobs
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server-client';

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();

    // Get authenticated user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Create new dashboard refresh job
    const { data: job, error: insertError } = await supabase
      .from('dashboard_refresh_jobs')
      .insert({
        user_id: user.id,
        status: 'pending',
        progress: {
          current_step: 'pending',
          total_steps: 4,
          completed_steps: 0,
          message: 'Waiting to start...'
        }
      })
      .select()
      .single();

    if (insertError) {
      console.error('[Dashboard Refresh Jobs API] Failed to create job:', insertError);
      return NextResponse.json(
        { error: 'Failed to create dashboard refresh job', details: insertError.message },
        { status: 500 }
      );
    }

    console.log(`[Dashboard Refresh Jobs API] Created job ${job.id} for user ${user.id}`);

    // Trigger the worker to process the job directly (no fetch, run inline)
    // This ensures the job actually gets processed instead of relying on fire-and-forget fetch
    try {
      const { runDashboardRefreshJob } = await import('@/lib/dashboard/refresh-job-runner');

      // Process the job in the background (don't await)
      runDashboardRefreshJob(job.id).catch(err => {
        console.error(`[Dashboard Refresh Jobs API] Job ${job.id} failed:`, err.message);
      });

      console.log(`[Dashboard Refresh Jobs API] Job ${job.id} processing started`);
    } catch (triggerError) {
      console.error('[Dashboard Refresh Jobs API] Could not start job processing:', triggerError);
      // Mark job as failed if we can't even start it
      await supabase
        .from('dashboard_refresh_jobs')
        .update({
          status: 'failed',
          error_message: 'Failed to start job processing',
          completed_at: new Date().toISOString()
        })
        .eq('id', job.id);
    }

    return NextResponse.json({
      success: true,
      jobId: job.id,
      job
    });

  } catch (error: any) {
    console.error('[Dashboard Refresh Jobs API] Error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();

    // Get authenticated user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get query parameters
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit') || '10');

    // Fetch recent jobs for this user
    const { data: jobs, error: fetchError } = await supabase
      .from('dashboard_refresh_jobs')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (fetchError) {
      console.error('[Dashboard Refresh Jobs API] Failed to fetch jobs:', fetchError);
      return NextResponse.json(
        { error: 'Failed to fetch jobs', details: fetchError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      jobs: jobs || []
    });

  } catch (error: any) {
    console.error('[Dashboard Refresh Jobs API] Error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
