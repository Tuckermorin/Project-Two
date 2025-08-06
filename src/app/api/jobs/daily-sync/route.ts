// src/app/api/jobs/daily-sync/route.ts
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
    
    console.log('Starting daily sync job');
    await marketDataService.recordAPISync('daily_sync', 'in_progress');

    try {
      // Update watchlist (this includes fundamental data updates)
      await marketDataService.updateWatchlist();
      
      await marketDataService.recordAPISync('daily_sync', 'success');
      
      return NextResponse.json({ 
        success: true, 
        message: 'Daily sync completed successfully',
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      await marketDataService.recordAPISync(
        'daily_sync', 
        'error', 
        0, 
        error instanceof Error ? error.message : 'Unknown error'
      );
      throw error;
    }
  } catch (error) {
    console.error('Daily sync job failed:', error);
    
    return NextResponse.json(
      { 
        error: 'Daily sync failed', 
        message: error instanceof Error ? error.message : 'Unknown error' 
      },
      { status: 500 }
    );
  }
}