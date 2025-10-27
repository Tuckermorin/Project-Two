import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server-client';

/**
 * GET /api/agent/jobs/[jobId]
 * Get status and progress of a specific job
 */
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

    // Fetch the job (RLS ensures user can only see their own jobs)
    const { data: job, error } = await supabase
      .from('agent_jobs')
      .select('*')
      .eq('id', jobId)
      .single();

    if (error || !job) {
      return NextResponse.json(
        { error: 'Job not found' },
        { status: 404 }
      );
    }

    // Calculate duration if applicable
    let duration_seconds = null;
    if (job.started_at) {
      const endTime = job.completed_at ? new Date(job.completed_at) : new Date();
      const startTime = new Date(job.started_at);
      duration_seconds = Math.floor((endTime.getTime() - startTime.getTime()) / 1000);
    }

    // Calculate estimated time remaining (rough estimate)
    let estimated_seconds_remaining = null;
    if (job.status === 'running' && job.progress && duration_seconds) {
      const progress_percent =
        (job.progress.completed_steps || 0) / (job.progress.total_steps || 1);
      if (progress_percent > 0) {
        const estimated_total = duration_seconds / progress_percent;
        estimated_seconds_remaining = Math.max(0, Math.floor(estimated_total - duration_seconds));
      }
    }

    return NextResponse.json({
      success: true,
      job: {
        id: job.id,
        status: job.status,
        mode: job.mode,
        progress: job.progress,
        result: job.result,
        error_message: job.error_message,
        error_details: job.error_details,
        created_at: job.created_at,
        started_at: job.started_at,
        completed_at: job.completed_at,
        duration_seconds,
        estimated_seconds_remaining,
        symbols_count: job.symbols?.length || 0
      }
    });

  } catch (error: any) {
    console.error('[Agent Jobs API] Error fetching job:', error);
    return NextResponse.json(
      {
        error: 'Failed to fetch job',
        message: error.message
      },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/agent/jobs/[jobId]
 * Update job (currently only supports cancellation)
 */
export async function PATCH(
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

    const body = await request.json();
    const { action } = body;

    if (action === 'cancel') {
      // Cancel the job
      const { data: job, error } = await supabase
        .from('agent_jobs')
        .update({
          status: 'cancelled',
          completed_at: new Date().toISOString(),
          error_message: 'Cancelled by user'
        })
        .eq('id', jobId)
        .eq('user_id', user.id) // Ensure user owns the job
        .in('status', ['pending', 'running']) // Can only cancel pending/running jobs
        .select()
        .single();

      if (error || !job) {
        return NextResponse.json(
          { error: 'Failed to cancel job. Job may not exist or is already completed.' },
          { status: 400 }
        );
      }

      return NextResponse.json({
        success: true,
        message: 'Job cancelled successfully',
        job: {
          id: job.id,
          status: job.status
        }
      });
    }

    return NextResponse.json(
      { error: 'Invalid action. Supported actions: cancel' },
      { status: 400 }
    );

  } catch (error: any) {
    console.error('[Agent Jobs API] Error updating job:', error);
    return NextResponse.json(
      {
        error: 'Failed to update job',
        message: error.message
      },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/agent/jobs/[jobId]
 * Delete a completed/failed job
 */
export async function DELETE(
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

    // Delete the job (can only delete completed/failed/cancelled jobs)
    const { error } = await supabase
      .from('agent_jobs')
      .delete()
      .eq('id', jobId)
      .eq('user_id', user.id)
      .in('status', ['completed', 'failed', 'cancelled']);

    if (error) {
      return NextResponse.json(
        { error: 'Failed to delete job. Job may not exist or is still running.' },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Job deleted successfully'
    });

  } catch (error: any) {
    console.error('[Agent Jobs API] Error deleting job:', error);
    return NextResponse.json(
      {
        error: 'Failed to delete job',
        message: error.message
      },
      { status: 500 }
    );
  }
}
