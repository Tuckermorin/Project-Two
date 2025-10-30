// src/app/api/jobs/iv-cache-update/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getIVCacheService } from '@/lib/services/iv-cache-service';

/**
 * Daily IV Cache Update Job
 *
 * Updates the vol_regime_daily table with today's IV data for all watchlist symbols
 * This ensures IV rank and percentile calculations stay current
 *
 * Schedule: Runs daily at 4:15 PM ET (after market close, before snapshots)
 * Configured in vercel.json
 */
export async function POST(request: NextRequest) {
  try {
    // Verify this is a legitimate cron job call
    const authHeader = request.headers.get('authorization');
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    console.log('\n' + '='.repeat(80));
    console.log('[IV Cache Update] Starting daily IV cache update job...');
    console.log('='.repeat(80) + '\n');

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const ivCacheService = getIVCacheService();

    // Get all unique symbols from watchlist across all users
    const { data: watchlistItems, error: watchlistError } = await supabase
      .from('watchlist_items')
      .select('symbol')
      .order('symbol');

    if (watchlistError) {
      console.error('[IV Cache Update] Error fetching watchlist:', watchlistError);
      return NextResponse.json(
        {
          success: false,
          error: 'Failed to fetch watchlist',
          message: watchlistError.message
        },
        { status: 500 }
      );
    }

    if (!watchlistItems || watchlistItems.length === 0) {
      console.log('[IV Cache Update] No symbols in watchlist, nothing to update');
      return NextResponse.json({
        success: true,
        message: 'No symbols to update',
        symbols_updated: 0,
        symbols_failed: 0
      });
    }

    // Get unique symbols
    const uniqueSymbols = [...new Set(watchlistItems.map(item => item.symbol))];
    console.log(`[IV Cache Update] Found ${uniqueSymbols.length} unique symbols to update`);

    const results = {
      symbols_updated: 0,
      symbols_failed: 0,
      details: [] as Array<{
        symbol: string;
        success: boolean;
        error?: string;
      }>
    };

    // Update IV cache for each symbol
    for (const symbol of uniqueSymbols) {
      console.log(`\n[IV Cache Update] Processing ${symbol}...`);

      try {
        const result = await ivCacheService.updateIVCache(symbol);

        if (result.success) {
          results.symbols_updated++;
          results.details.push({ symbol, success: true });
          console.log(`[IV Cache Update] ✓ ${symbol} updated successfully`);
        } else {
          results.symbols_failed++;
          results.details.push({
            symbol,
            success: false,
            error: result.error
          });
          console.warn(`[IV Cache Update] ✗ ${symbol} failed: ${result.error}`);
        }

        // Small delay to avoid rate limiting (Premium tier allows ~600 calls/min)
        // 150ms delay = ~400 symbols/min, well within limits
        await new Promise(resolve => setTimeout(resolve, 150));

      } catch (error: any) {
        results.symbols_failed++;
        results.details.push({
          symbol,
          success: false,
          error: error.message
        });
        console.error(`[IV Cache Update] ✗ ${symbol} error:`, error);
      }
    }

    console.log('\n' + '='.repeat(80));
    console.log('[IV Cache Update] Job Complete');
    console.log('='.repeat(80));
    console.log(`✓ Symbols updated: ${results.symbols_updated}`);
    console.log(`✗ Symbols failed: ${results.symbols_failed}`);
    console.log(`Total symbols processed: ${uniqueSymbols.length}`);
    console.log('='.repeat(80) + '\n');

    return NextResponse.json({
      success: true,
      message: `IV cache updated for ${results.symbols_updated}/${uniqueSymbols.length} symbols`,
      ...results,
      timestamp: new Date().toISOString()
    });

  } catch (error: any) {
    console.error('[IV Cache Update] Job failed:', error);

    return NextResponse.json(
      {
        success: false,
        error: 'IV cache update job failed',
        message: error.message
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/jobs/iv-cache-update
 *
 * Check the current state of the IV cache
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Get cache statistics
    const { data: stats } = await supabase.rpc('get_iv_cache_stats').single();

    // Get today's date
    const today = new Date().toISOString().split('T')[0];

    // Check which symbols have been updated today
    const { data: todayUpdates } = await supabase
      .from('vol_regime_daily')
      .select('symbol, iv_atm_30d, iv_rank, created_at')
      .eq('as_of_date', today)
      .order('symbol');

    // Get all watchlist symbols
    const { data: watchlistItems } = await supabase
      .from('watchlist_items')
      .select('symbol');

    const uniqueWatchlistSymbols = watchlistItems
      ? [...new Set(watchlistItems.map(item => item.symbol))]
      : [];

    const symbolsUpdatedToday = todayUpdates?.map(u => u.symbol) || [];
    const symbolsMissingToday = uniqueWatchlistSymbols.filter(
      s => !symbolsUpdatedToday.includes(s)
    );

    return NextResponse.json({
      cache_stats: stats || null,
      today: {
        date: today,
        symbols_updated: symbolsUpdatedToday.length,
        symbols_missing: symbolsMissingToday.length,
        updated_symbols: symbolsUpdatedToday,
        missing_symbols: symbolsMissingToday
      },
      watchlist: {
        total_symbols: uniqueWatchlistSymbols.length,
        symbols: uniqueWatchlistSymbols
      },
      cron_configured: !!process.env.CRON_SECRET
    });

  } catch (error: any) {
    console.error('[IV Cache Update] Status check failed:', error);
    return NextResponse.json(
      {
        error: 'Failed to check IV cache status',
        message: error.message
      },
      { status: 500 }
    );
  }
}
