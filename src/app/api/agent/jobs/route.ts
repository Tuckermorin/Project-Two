import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server-client';

/**
 * POST /api/agent/jobs
 * Submit a new agent job for background processing
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();

    // Get authenticated user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { ipsId, symbols, mode = 'paper' } = body;

    // Validation
    if (!symbols || !Array.isArray(symbols) || symbols.length === 0) {
      return NextResponse.json(
        { error: 'symbols array is required and must not be empty' },
        { status: 400 }
      );
    }

    if (symbols.length > 100) {
      return NextResponse.json(
        { error: 'Maximum 100 symbols allowed per job' },
        { status: 400 }
      );
    }

    if (!['paper', 'live', 'backtest'].includes(mode)) {
      return NextResponse.json(
        { error: 'mode must be one of: paper, live, backtest' },
        { status: 400 }
      );
    }

    // Create the job
    const { data: job, error: insertError } = await supabase
      .from('agent_jobs')
      .insert({
        user_id: user.id,
        ips_id: ipsId || null,
        symbols,
        mode,
        status: 'pending',
        progress: {
          current_step: 'queued',
          total_steps: 8,
          completed_steps: 0,
          symbols_processed: 0,
          total_symbols: symbols.length,
          message: 'Job queued, waiting for worker...'
        },
        metadata: {
          agent_version: 'v3',
          submitted_at: new Date().toISOString()
        }
      })
      .select()
      .single();

    if (insertError) {
      console.error('[Agent Jobs API] Failed to create job:', insertError);
      return NextResponse.json(
        { error: 'Failed to create job', details: insertError.message },
        { status: 500 }
      );
    }

    console.log(`[Agent Jobs API] Created job ${job.id} for user ${user.id}`);

    // Trigger the worker (we'll implement this later)
    // For now, the worker will poll for pending jobs
    triggerWorker(job.id).catch(err =>
      console.error('Failed to trigger worker:', err)
    );

    return NextResponse.json({
      success: true,
      jobId: job.id,
      status: job.status,
      message: 'Job submitted successfully. Poll /api/agent/jobs/{jobId} for status updates.'
    });

  } catch (error: any) {
    console.error('[Agent Jobs API] Error:', error);
    return NextResponse.json(
      {
        error: 'Failed to submit job',
        message: error.message
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/agent/jobs
 * List all jobs for the current user
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();

    // Get authenticated user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    const limit = parseInt(searchParams.get('limit') || '50', 10);
    const offset = parseInt(searchParams.get('offset') || '0', 10);

    // Build query
    let query = supabase
      .from('agent_jobs')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (status) {
      query = query.eq('status', status);
    }

    query = query.range(offset, offset + limit - 1);

    const { data: jobs, error } = await query;

    if (error) {
      throw error;
    }

    return NextResponse.json({
      success: true,
      jobs,
      count: jobs.length
    });

  } catch (error: any) {
    console.error('[Agent Jobs API] Error:', error);
    return NextResponse.json(
      {
        error: 'Failed to fetch jobs',
        message: error.message
      },
      { status: 500 }
    );
  }
}

/**
 * Trigger the background worker to process the job
 * This is a placeholder - actual implementation depends on your deployment
 */
async function triggerWorker(jobId: string) {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

  // Option 1: If using a polling worker, do nothing (worker will pick it up)
  // Option 2: If using webhooks/serverless, trigger the worker endpoint
  try {
    await fetch(`${baseUrl}/api/agent/worker/process`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jobId })
    });
  } catch (error) {
    // Worker endpoint might not exist yet, that's okay
    console.log('[Agent Jobs API] Worker endpoint not available, job will be picked up by polling');
  }
}
