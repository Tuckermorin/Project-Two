/**
 * Dashboard Refresh Job Status API
 * GET - Get status of a specific dashboard refresh job
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server-client';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  try {
    const { jobId } = await params;
    const supabase = await createClient();

    // Get authenticated user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Fetch job
    const { data: job, error: fetchError } = await supabase
      .from('dashboard_refresh_jobs')
      .select('*')
      .eq('id', jobId)
      .eq('user_id', user.id) // Security: only allow users to see their own jobs
      .single();

    if (fetchError || !job) {
      return NextResponse.json(
        { error: 'Job not found' },
        { status: 404 }
      );
    }

    // Calculate duration
    let duration_seconds: number | null = null;
    let estimated_seconds_remaining: number | null = null;

    if (job.started_at) {
      const startTime = new Date(job.started_at).getTime();
      const endTime = job.completed_at ? new Date(job.completed_at).getTime() : Date.now();
      duration_seconds = Math.floor((endTime - startTime) / 1000);

      // Estimate remaining time based on progress
      if (job.status === 'running' && job.progress) {
        const progress = job.progress as any;
        const percentComplete = (progress.completed_steps / progress.total_steps) * 100;
        if (percentComplete > 0 && percentComplete < 100) {
          const estimatedTotal = duration_seconds / (percentComplete / 100);
          estimated_seconds_remaining = Math.max(0, Math.floor(estimatedTotal - duration_seconds));
        }
      }
    }

    return NextResponse.json({
      success: true,
      job: {
        id: job.id,
        user_id: job.user_id,
        status: job.status,
        progress: job.progress,
        result: job.result,
        error_message: job.error_message,
        error_details: job.error_details,
        created_at: job.created_at,
        started_at: job.started_at,
        completed_at: job.completed_at,
        duration_seconds,
        estimated_seconds_remaining
      }
    });

  } catch (error: any) {
    console.error('[Dashboard Refresh Job Status API] Error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
