import { NextRequest, NextResponse } from 'next/server';
import { createPooledClient } from '@/lib/supabase/pooled-client';

/**
 * GET /api/agent/scheduler
 * Checks for due scheduled IPS runs and submits agent jobs
 *
 * This endpoint should be called by a cron job every 1-5 minutes
 *
 * Setup instructions:
 * 1. Use a cron service (cron-job.org, EasyCron, GitHub Actions)
 * 2. Call: GET https://your-domain.com/api/agent/scheduler
 * 3. Frequency: Every 1-5 minutes
 *
 * Or use vercel.json:
 * {
 *   "crons": [{
 *     "path": "/api/agent/scheduler",
 *     "schedule": "*\/5 * * * *"
 *   }]
 * }
 */
export async function GET(request: NextRequest) {
  try {
    console.log('[Scheduler] Checking for due scheduled IPS runs...');

    const supabase = await createPooledClient();

    // Get all IPSs that are due to run
    const { data: dueIPSs, error } = await supabase
      .rpc('get_due_scheduled_ips');

    if (error) {
      console.error('[Scheduler] Error fetching due IPSs:', error);
      throw error;
    }

    if (!dueIPSs || dueIPSs.length === 0) {
      console.log('[Scheduler] No IPSs due to run');
      return NextResponse.json({
        success: true,
        message: 'No scheduled runs due',
        processed: 0
      });
    }

    console.log(`[Scheduler] Found ${dueIPSs.length} IPS(s) due to run`);

    const results = [];

    for (const ips of dueIPSs) {
      try {
        console.log(`[Scheduler] Processing IPS: ${ips.ips_name} (${ips.ips_id})`);

        // Get watchlist symbols if none specified in IPS
        let symbols = ips.symbols || [];

        if (symbols.length === 0) {
          // Load from user's watchlist
          const { data: watchlistData } = await supabase
            .from('watchlist')
            .select('symbol')
            .eq('user_id', ips.user_id);

          symbols = watchlistData?.map((w: any) => w.symbol) || [];
        }

        if (symbols.length === 0) {
          console.warn(`[Scheduler] No symbols for IPS ${ips.ips_name}, skipping`);
          results.push({
            ips_id: ips.ips_id,
            ips_name: ips.ips_name,
            success: false,
            error: 'No symbols to analyze'
          });
          continue;
        }

        // Create agent job
        const { data: job, error: jobError } = await supabase
          .from('agent_jobs')
          .insert({
            user_id: ips.user_id,
            ips_id: ips.ips_id,
            symbols,
            mode: 'paper',
            status: 'pending',
            progress: {
              current_step: 'queued',
              total_steps: 8,
              completed_steps: 0,
              symbols_processed: 0,
              total_symbols: symbols.length,
              message: 'Scheduled job queued...'
            },
            metadata: {
              agent_version: 'v3',
              scheduled: true,
              schedule_time: new Date().toISOString()
            }
          })
          .select()
          .single();

        if (jobError) {
          console.error(`[Scheduler] Failed to create job for IPS ${ips.ips_name}:`, jobError);
          results.push({
            ips_id: ips.ips_id,
            ips_name: ips.ips_name,
            success: false,
            error: jobError.message
          });
          continue;
        }

        // Mark IPS as run (updates last_run and calculates next_run)
        await supabase.rpc('mark_ips_as_run', { p_ips_id: ips.ips_id });

        console.log(`[Scheduler] Created job ${job.id} for IPS ${ips.ips_name}`);

        results.push({
          ips_id: ips.ips_id,
          ips_name: ips.ips_name,
          job_id: job.id,
          symbols_count: symbols.length,
          success: true
        });

        // Trigger worker to process the job
        try {
          const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
          await fetch(`${baseUrl}/api/agent/worker/process`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ jobId: job.id })
          });
        } catch (workerError) {
          console.warn('[Scheduler] Failed to trigger worker, job will be picked up by polling');
        }

      } catch (err: any) {
        console.error(`[Scheduler] Error processing IPS ${ips.ips_name}:`, err);
        results.push({
          ips_id: ips.ips_id,
          ips_name: ips.ips_name,
          success: false,
          error: err.message
        });
      }
    }

    const successCount = results.filter(r => r.success).length;
    console.log(`[Scheduler] Processed ${successCount}/${dueIPSs.length} IPSs successfully`);

    return NextResponse.json({
      success: true,
      message: `Processed ${successCount}/${dueIPSs.length} scheduled runs`,
      processed: dueIPSs.length,
      results
    });

  } catch (error: any) {
    console.error('[Scheduler] Error:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to process scheduled runs',
        message: error.message
      },
      { status: 500 }
    );
  }
}

/**
 * POST /api/agent/scheduler
 * Alias for GET (some cron services only support POST)
 */
export async function POST(request: NextRequest) {
  return GET(request);
}
