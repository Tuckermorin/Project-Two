// src/app/api/jobs/snapshot-sync/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getMarketDataService } from '@/lib/services/market-data-service';

export async function POST(request: NextRequest) {
  try {
    // Verify this is a legitimate cron job call
    const authHeader = request.headers.get('authorization');
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const marketDataService = getMarketDataService();
    
    // Get snapshot type from request body or determine from time
    let snapshotType: 'market_open' | 'midday' | 'market_close';
    
    try {
      const body = await request.json();
      snapshotType = body.snapshotType;
    } catch {
      // If no body, determine from current time (for Vercel cron)
      const now = new Date();
      const hour = now.getHours(); // EST time
      
      if (hour >= 14 && hour < 16) snapshotType = 'market_open';
      else if (hour >= 18 && hour < 20) snapshotType = 'midday'; 
      else snapshotType = 'market_close';
    }
    
    if (!snapshotType) {
      return NextResponse.json({ error: 'Missing snapshotType' }, { status: 400 });
    }

    console.log(`Starting ${snapshotType} snapshot job`);
    await marketDataService.recordAPISync(`snapshot_${snapshotType}`, 'in_progress');

    try {
      // Create trade snapshots
      await marketDataService.createTradeSnapshots(snapshotType);
      
      // Also update watchlist prices during snapshot times
      await marketDataService.updateWatchlist();
      
      await marketDataService.recordAPISync(`snapshot_${snapshotType}`, 'success');
      
      return NextResponse.json({ 
        success: true, 
        message: `${snapshotType} snapshot completed successfully`,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      await marketDataService.recordAPISync(
        `snapshot_${snapshotType}`, 
        'error', 
        0, 
        error instanceof Error ? error.message : 'Unknown error'
      );
      throw error;
    }
  } catch (error) {
    console.error('Snapshot sync job failed:', error);
    
    return NextResponse.json(
      { 
        error: 'Snapshot sync failed', 
        message: error instanceof Error ? error.message : 'Unknown error' 
      },
      { status: 500 }
    );
  }
}