// scripts/seed-watchlist-iv-cache.ts
// Run this script to seed IV cache for all existing watchlist symbols

import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { getIVCacheService } from '../src/lib/services/iv-cache-service';

// Load environment variables
dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function seedWatchlistIVCache() {
  console.log('[Seed IV Cache] Starting...\n');

  try {
    // Fetch all watchlist symbols
    const { data: watchlistItems, error } = await supabase
      .from('watchlist_items')
      .select('symbol')
      .order('symbol');

    if (error) {
      throw new Error(`Failed to fetch watchlist: ${error.message}`);
    }

    if (!watchlistItems || watchlistItems.length === 0) {
      console.log('[Seed IV Cache] No symbols in watchlist');
      return;
    }

    const symbols = Array.from(new Set(watchlistItems.map(item => item.symbol)));
    console.log(`[Seed IV Cache] Found ${symbols.length} unique symbols:`);
    console.log(symbols.join(', '));
    console.log();

    const ivCacheService = getIVCacheService();
    const results: Array<{ symbol: string; success: boolean; daysAdded: number; error?: string }> = [];

    // Process each symbol
    for (let i = 0; i < symbols.length; i++) {
      const symbol = symbols[i];
      console.log(`\n[${i + 1}/${symbols.length}] Processing ${symbol}...`);
      console.log('='.repeat(60));

      try {
        const result = await ivCacheService.cacheHistoricalIVForSymbol(symbol, 252);
        results.push({ symbol, ...result });

        if (result.success) {
          console.log(`✅ ${symbol}: Cached ${result.daysAdded} days`);
        } else {
          console.log(`❌ ${symbol}: ${result.error}`);
        }
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Unknown error';
        console.error(`❌ ${symbol}: ${errorMsg}`);
        results.push({ symbol, success: false, daysAdded: 0, error: errorMsg });
      }

      // Progress update
      const completed = i + 1;
      const remaining = symbols.length - completed;
      console.log(`\nProgress: ${completed}/${symbols.length} (${remaining} remaining)`);
    }

    // Summary
    console.log('\n' + '='.repeat(60));
    console.log('SUMMARY');
    console.log('='.repeat(60));

    const successful = results.filter(r => r.success);
    const failed = results.filter(r => !r.success);
    const totalDays = results.reduce((sum, r) => sum + r.daysAdded, 0);

    console.log(`\nTotal Symbols: ${results.length}`);
    console.log(`Successful: ${successful.length}`);
    console.log(`Failed: ${failed.length}`);
    console.log(`Total Days Cached: ${totalDays}`);

    if (successful.length > 0) {
      console.log('\n✅ Successfully cached:');
      successful.forEach(r => {
        console.log(`   ${r.symbol}: ${r.daysAdded} days`);
      });
    }

    if (failed.length > 0) {
      console.log('\n❌ Failed:');
      failed.forEach(r => {
        console.log(`   ${r.symbol}: ${r.error}`);
      });
    }

    console.log('\n[Seed IV Cache] Complete!');

  } catch (error) {
    console.error('[Seed IV Cache] Fatal error:', error);
    process.exit(1);
  }
}

// Run the script
seedWatchlistIVCache()
  .then(() => process.exit(0))
  .catch(error => {
    console.error('Unhandled error:', error);
    process.exit(1);
  });
