// src/app/api/snapshots/summary/route.ts
// Get comprehensive snapshot summary and statistics

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const user_id = searchParams.get('user_id');

    if (!user_id) {
      return NextResponse.json({ error: 'user_id is required' }, { status: 400 });
    }

    // Get snapshot statistics
    const { data: snapshotStats, error: statsError } = await supabase
      .from('trade_snapshots')
      .select('*', { count: 'exact' })
      .eq('user_id', user_id);

    if (statsError) {
      throw statsError;
    }

    const totalSnapshots = snapshotStats?.length || 0;

    // Get snapshot breakdown by trigger type
    const { data: triggerBreakdown } = await supabase
      .from('trade_snapshots')
      .select('snapshot_trigger')
      .eq('user_id', user_id);

    const triggerCounts = (triggerBreakdown || []).reduce((acc: any, s: any) => {
      acc[s.snapshot_trigger] = (acc[s.snapshot_trigger] || 0) + 1;
      return acc;
    }, {});

    // Get behavioral pattern summary from materialized view
    const { data: patterns } = await supabase
      .from('trade_behavioral_patterns')
      .select('*')
      .eq('user_id', user_id);

    const patternsWithSnapshots = (patterns || []).filter(p => p.snapshot_count > 0);

    const avgSnapshotsPerTrade = patternsWithSnapshots.length > 0
      ? patternsWithSnapshots.reduce((sum, p) => sum + p.snapshot_count, 0) / patternsWithSnapshots.length
      : 0;

    // High delta trades
    const highDeltaTrades = (patterns || []).filter(p => p.high_delta_reached).length;

    // Gave back profits trades
    const gaveBackTrades = (patterns || []).filter(p => p.gave_back_profits).length;

    // Get recent snapshots
    const { data: recentSnapshots } = await supabase
      .from('trade_snapshots')
      .select(`
        *,
        trades:trade_id (
          symbol,
          strategy_type,
          status
        )
      `)
      .eq('user_id', user_id)
      .order('snapshot_time', { ascending: false })
      .limit(10);

    return NextResponse.json({
      success: true,
      summary: {
        total_snapshots: totalSnapshots,
        trigger_breakdown: triggerCounts,
        avg_snapshots_per_trade: avgSnapshotsPerTrade.toFixed(1),
        trades_with_snapshots: patternsWithSnapshots.length,
        high_delta_trades: highDeltaTrades,
        gave_back_profits_trades: gaveBackTrades,
      },
      recent_snapshots: recentSnapshots || [],
    });
  } catch (error) {
    console.error('[Snapshot Summary] Error:', error);

    return NextResponse.json(
      {
        error: 'Failed to fetch snapshot summary',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
