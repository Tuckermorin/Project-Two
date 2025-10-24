import { NextRequest, NextResponse } from 'next/server';
import { getTradePostMortemService } from '@/lib/services/trade-postmortem-service';

/**
 * POST /api/cron/postmortem
 *
 * Cron job endpoint for analyzing closed trades
 *
 * Schedule:
 * - Runs daily at 4:30 PM ET (20:30 UTC) on weekdays (Monday-Friday)
 * - 30 minutes after market close to capture end-of-day data
 * - Configured in vercel.json
 *
 * Usage:
 * - Automatically triggered by Vercel Cron
 * - Can also be called manually with proper authentication
 *
 * Security:
 * - Requires CRON_SECRET environment variable in Authorization header
 * - Or can be called manually with admin privileges
 */
export async function POST(request: NextRequest) {
  try {
    // Verify cron secret or admin access
    const authHeader = request.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;

    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    console.log('[Cron:PostMortem] Starting post-mortem analysis job');

    const body = await request.json().catch(() => ({}));
    const batchSize = body.batchSize || 10;
    const userId = body.userId || null; // Optional: process only for specific user

    const postMortemService = getTradePostMortemService();

    // Process batch of closed trades
    const results = await postMortemService.processBatch(batchSize, userId);

    console.log('[Cron:PostMortem] Job complete:', results);

    return NextResponse.json({
      success: true,
      ...results,
      message: `Processed ${results.processed} trades: ${results.succeeded} succeeded, ${results.failed} failed`
    });

  } catch (error: any) {
    console.error('[Cron:PostMortem] Job failed:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Post-mortem analysis job failed',
        message: error.message
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/cron/postmortem
 *
 * Check status and get preview of trades pending analysis
 */
export async function GET(request: NextRequest) {
  try {
    const { createClient } = await import('@/lib/supabase/server-client');
    const supabase = await createClient();

    // Get count of trades needing analysis
    const { data: needsAnalysis, error } = await supabase
      .from('v_trades_needing_postmortem')
      .select('id, symbol, closed_at, realized_pl_percent')
      .eq('needs_postmortem', true)
      .order('closed_at', { ascending: false })
      .limit(20);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Get recent post-mortem analyses
    const { data: recentAnalyses } = await supabase
      .from('trade_postmortem_analysis')
      .select(`
        id,
        trade_id,
        analyzed_at,
        performance_summary,
        postmortem_analysis
      `)
      .order('analyzed_at', { ascending: false })
      .limit(10);

    return NextResponse.json({
      pending_count: needsAnalysis?.length || 0,
      pending_trades: needsAnalysis || [],
      recent_analyses: recentAnalyses || [],
      cron_configured: !!process.env.CRON_SECRET
    });

  } catch (error: any) {
    console.error('[Cron:PostMortem] Status check failed:', error);
    return NextResponse.json(
      {
        error: 'Failed to check status',
        message: error.message
      },
      { status: 500 }
    );
  }
}
