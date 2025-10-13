// src/app/api/jobs/snapshot-sync/route.ts
// Enhanced snapshot job with comprehensive market data capture
import { NextRequest, NextResponse } from 'next/server';
import { getMarketDataService } from '@/lib/services/market-data-service';
import { getTradeSnapshotService } from '@/lib/services/trade-snapshot-service';

export async function POST(request: NextRequest) {
  try {
    // Verify this is a legitimate cron job call
    const authHeader = request.headers.get('authorization');
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const marketDataService = getMarketDataService();
    const snapshotService = getTradeSnapshotService();

    // Get trigger type from request body or default to scheduled
    let trigger: 'scheduled' | 'significant_move' | 'greek_threshold' | 'manual' = 'scheduled';

    try {
      const body = await request.json();
      trigger = body.trigger || 'scheduled';
    } catch {
      // Default to scheduled for cron jobs
      trigger = 'scheduled';
    }

    console.log(`[Snapshot Job] Starting snapshot job (${trigger})`);
    await marketDataService.recordAPISync(`snapshot_${trigger}`, 'in_progress');

    try {
      // Capture comprehensive snapshots for all active trades
      const snapshotCount = await snapshotService.captureAllActiveSnapshots(trigger);

      // Also update watchlist prices during snapshot times
      await marketDataService.updateWatchlist();

      await marketDataService.recordAPISync(`snapshot_${trigger}`, 'success', snapshotCount);

      console.log(`[Snapshot Job] Completed: ${snapshotCount} snapshots captured`);

      return NextResponse.json({
        success: true,
        message: `Snapshot job completed successfully`,
        snapshots_captured: snapshotCount,
        trigger,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      await marketDataService.recordAPISync(
        `snapshot_${trigger}`,
        'error',
        0,
        error instanceof Error ? error.message : 'Unknown error'
      );
      throw error;
    }
  } catch (error) {
    console.error('[Snapshot Job] Failed:', error);

    return NextResponse.json(
      {
        error: 'Snapshot sync failed',
        message: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

// GET endpoint to manually trigger snapshot (for testing)
export async function GET(request: NextRequest) {
  try {
    const snapshotService = getTradeSnapshotService();

    const snapshotCount = await snapshotService.captureAllActiveSnapshots('manual');

    return NextResponse.json({
      success: true,
      message: 'Manual snapshot completed',
      snapshots_captured: snapshotCount,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('[Snapshot Job] Manual snapshot failed:', error);

    return NextResponse.json(
      {
        error: 'Manual snapshot failed',
        message: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}