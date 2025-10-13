// src/app/api/trades/[id]/snapshot/route.ts
// On-demand and event-triggered snapshot capture for individual trades

import { NextRequest, NextResponse } from 'next/server';
import { getTradeSnapshotService } from '@/lib/services/trade-snapshot-service';

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id: tradeId } = params;
    const body = await request.json().catch(() => ({}));

    const trigger = (body.trigger as 'scheduled' | 'significant_move' | 'greek_threshold' | 'manual') || 'manual';

    const snapshotService = getTradeSnapshotService();

    console.log(`[Snapshot API] Capturing snapshot for trade ${tradeId} (${trigger})`);

    const snapshot = await snapshotService.captureSnapshot(tradeId, trigger);

    if (!snapshot) {
      return NextResponse.json(
        { error: 'Failed to capture snapshot - trade may not exist or is not active' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      snapshot,
      message: 'Snapshot captured successfully'
    });
  } catch (error) {
    console.error('[Snapshot API] Error:', error);

    return NextResponse.json(
      {
        error: 'Failed to capture snapshot',
        message: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

// GET endpoint to retrieve snapshots for a trade
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id: tradeId } = params;
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit') || '50');

    const { createClient } = await import('@supabase/supabase-js');
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const { data: snapshots, error } = await supabase
      .from('trade_snapshots')
      .select('*')
      .eq('trade_id', tradeId)
      .order('snapshot_time', { ascending: false })
      .limit(limit);

    if (error) {
      throw error;
    }

    return NextResponse.json({
      success: true,
      snapshots: snapshots || [],
      count: snapshots?.length || 0
    });
  } catch (error) {
    console.error('[Snapshot API] Error fetching snapshots:', error);

    return NextResponse.json(
      {
        error: 'Failed to fetch snapshots',
        message: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
