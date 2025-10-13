// src/app/api/trades/monitor-snapshots/route.ts
// Monitor active trades and trigger snapshots when thresholds are breached

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getTradeSnapshotService } from '@/lib/services/trade-snapshot-service';
import { getMarketDataService } from '@/lib/services/market-data-service';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

interface ThresholdConfig {
  delta_threshold?: number; // Absolute change in delta to trigger snapshot
  pnl_threshold?: number; // Percentage change in P&L to trigger snapshot
  time_threshold_hours?: number; // Hours since last snapshot to trigger
}

export async function POST(request: NextRequest) {
  try {
    // Verify authorization (can be cron or authenticated user)
    const authHeader = request.headers.get('authorization');
    const isCron = authHeader === `Bearer ${process.env.CRON_SECRET}`;

    if (!isCron) {
      // For now, allow without auth for testing
      // In production, add proper auth check
      console.log('[Monitor] Running without cron auth - ensure proper security in production');
    }

    const body = await request.json().catch(() => ({}));
    const config: ThresholdConfig = {
      delta_threshold: body.delta_threshold || 0.05, // 5% delta change
      pnl_threshold: body.pnl_threshold || 10, // 10% P&L change
      time_threshold_hours: body.time_threshold_hours || 4, // 4 hours
    };

    console.log('[Monitor] Starting threshold monitoring for active trades');

    const snapshotService = getTradeSnapshotService();
    const marketDataService = getMarketDataService();

    // Get all active trades
    const { data: activeTrades, error: tradesError } = await supabase
      .from('trades')
      .select('*')
      .eq('status', 'active');

    if (tradesError || !activeTrades) {
      throw new Error(`Failed to fetch active trades: ${tradesError?.message}`);
    }

    console.log(`[Monitor] Monitoring ${activeTrades.length} active trades`);

    const results = {
      total_trades: activeTrades.length,
      snapshots_triggered: 0,
      delta_triggers: 0,
      pnl_triggers: 0,
      time_triggers: 0,
      errors: 0,
    };

    for (const trade of activeTrades) {
      try {
        const shouldSnapshot = await checkThresholds(
          trade,
          config,
          snapshotService,
          marketDataService
        );

        if (shouldSnapshot.triggered) {
          await snapshotService.captureSnapshot(trade.id, shouldSnapshot.reason);
          results.snapshots_triggered++;

          if (shouldSnapshot.reason === 'greek_threshold') results.delta_triggers++;
          if (shouldSnapshot.reason === 'significant_move') results.pnl_triggers++;
          if (shouldSnapshot.reason === 'scheduled') results.time_triggers++;

          console.log(
            `[Monitor] Snapshot triggered for ${trade.symbol} (${shouldSnapshot.reason})`
          );
        }
      } catch (error) {
        console.error(`[Monitor] Error checking trade ${trade.id}:`, error);
        results.errors++;
      }
    }

    console.log('[Monitor] Monitoring complete:', results);

    return NextResponse.json({
      success: true,
      ...results,
      config,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[Monitor] Monitoring failed:', error);

    return NextResponse.json(
      {
        error: 'Monitoring failed',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

// GET endpoint for status
export async function GET() {
  try {
    // Get last monitoring run
    const { data: lastSync } = await supabase
      .from('api_syncs')
      .select('*')
      .eq('dataType', 'snapshot_monitor')
      .order('lastSyncAt', { ascending: false })
      .limit(1)
      .single();

    // Get active trades count
    const { count: activeCount } = await supabase
      .from('trades')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'active');

    // Get total snapshots today
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const { count: snapshotsToday } = await supabase
      .from('trade_snapshots')
      .select('*', { count: 'exact', head: true })
      .gte('snapshot_time', today.toISOString());

    return NextResponse.json({
      success: true,
      active_trades: activeCount || 0,
      snapshots_today: snapshotsToday || 0,
      last_monitoring_run: lastSync
        ? {
            timestamp: lastSync.lastSyncAt,
            status: lastSync.syncStatus,
            records_processed: lastSync.recordsProcessed,
          }
        : null,
    });
  } catch (error) {
    console.error('[Monitor] Status check failed:', error);

    return NextResponse.json(
      {
        error: 'Status check failed',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

// ============================================================================
// Helper Functions
// ============================================================================

async function checkThresholds(
  trade: any,
  config: ThresholdConfig,
  snapshotService: any,
  marketDataService: any
): Promise<{ triggered: boolean; reason: 'greek_threshold' | 'significant_move' | 'scheduled' }> {
  // Get latest snapshot for this trade
  const { data: latestSnapshot } = await supabase
    .from('trade_snapshots')
    .select('*')
    .eq('trade_id', trade.id)
    .order('snapshot_time', { ascending: false })
    .limit(1)
    .single();

  if (!latestSnapshot) {
    // No snapshot exists, trigger one
    return { triggered: true, reason: 'scheduled' };
  }

  // Check time threshold
  const timeSinceLastSnapshot =
    Date.now() - new Date(latestSnapshot.snapshot_time).getTime();
  const hoursSinceLastSnapshot = timeSinceLastSnapshot / (1000 * 60 * 60);

  if (hoursSinceLastSnapshot >= (config.time_threshold_hours || 4)) {
    return { triggered: true, reason: 'scheduled' };
  }

  // Get current market data (lightweight check)
  try {
    const stockData = await marketDataService.getUnifiedStockData(trade.symbol, false);
    const shortLegData = await marketDataService.getOptionsData(
      trade.symbol,
      trade.short_strike,
      trade.expiration_date,
      trade.contract_type === 'put' ? 'put' : 'call',
      false // use cache
    );

    if (shortLegData && shortLegData.greeks) {
      // Check delta threshold
      const currentDelta = Math.abs(shortLegData.greeks.delta || 0);
      const lastDelta = Math.abs(latestSnapshot.delta_short_leg || 0);
      const deltaChange = Math.abs(currentDelta - lastDelta);

      if (deltaChange >= (config.delta_threshold || 0.05)) {
        console.log(
          `[Monitor] Delta threshold breached: ${lastDelta.toFixed(3)} -> ${currentDelta.toFixed(3)}`
        );
        return { triggered: true, reason: 'greek_threshold' };
      }

      // Check P&L threshold (if we can calculate it quickly)
      const shortLegPrice = shortLegData.ask || 0;
      const longLegData = await marketDataService.getOptionsData(
        trade.symbol,
        trade.long_strike,
        trade.expiration_date,
        trade.contract_type === 'put' ? 'put' : 'call',
        false
      );
      const longLegPrice = longLegData?.bid || 0;
      const currentSpreadPrice = shortLegPrice - longLegPrice;

      const creditReceived = trade.credit_received || 0;
      const unrealizedPnlPercent = creditReceived > 0
        ? ((creditReceived - currentSpreadPrice) / creditReceived) * 100
        : 0;

      const lastPnlPercent = latestSnapshot.unrealized_pnl_percent || 0;
      const pnlChange = Math.abs(unrealizedPnlPercent - lastPnlPercent);

      if (pnlChange >= (config.pnl_threshold || 10)) {
        console.log(
          `[Monitor] P&L threshold breached: ${lastPnlPercent.toFixed(1)}% -> ${unrealizedPnlPercent.toFixed(1)}%`
        );
        return { triggered: true, reason: 'significant_move' };
      }
    }
  } catch (error) {
    console.error(`[Monitor] Error checking current data for ${trade.symbol}:`, error);
  }

  return { triggered: false, reason: 'scheduled' };
}
