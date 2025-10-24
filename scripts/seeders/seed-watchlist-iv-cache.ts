// scripts/seed-watchlist-iv-cache.ts
// Run this script to seed IV cache for all existing watchlist symbols
// Designed to run continuously, respecting Alpha Vantage's 600 calls/minute premium limit

import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { getIVCacheService } from '../src/lib/services/iv-cache-service';

// Load environment variables
dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

interface SymbolProgress {
  symbol: string;
  totalDays: number;
  cachedDays: number;
  remaining: number;
  percentComplete: number;
}

async function getSymbolProgress(symbol: string, lookbackDays: number = 252): Promise<SymbolProgress> {
  // Count how many days already have IV data
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - lookbackDays);

  const { count } = await supabase
    .from('vol_regime_daily')
    .select('*', { count: 'exact', head: true })
    .eq('symbol', symbol.toUpperCase())
    .gte('as_of_date', cutoffDate.toISOString().split('T')[0])
    .not('iv_atm_30d', 'is', null);

  const cachedDays = count || 0;
  const remaining = lookbackDays - cachedDays;
  const percentComplete = (cachedDays / lookbackDays) * 100;

  return {
    symbol,
    totalDays: lookbackDays,
    cachedDays,
    remaining,
    percentComplete
  };
}

async function seedWatchlistIVCache(continuous: boolean = false) {
  console.log('[Seed IV Cache] Starting...\n');
  console.log(`Mode: ${continuous ? 'Continuous (will run until complete)' : 'Single Pass'}`);
  console.log(`Rate Limit: 600 calls/minute (100ms per call)\n`);

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

    // Get initial progress for all symbols
    console.log('Checking current progress...\n');
    const progressList: SymbolProgress[] = [];
    for (const symbol of symbols) {
      const progress = await getSymbolProgress(symbol);
      progressList.push(progress);
    }

    // Display initial progress
    console.log('Current Status:');
    console.log('─'.repeat(80));
    progressList.forEach(p => {
      const bar = '█'.repeat(Math.floor(p.percentComplete / 5)) +
                  '░'.repeat(20 - Math.floor(p.percentComplete / 5));
      console.log(`${p.symbol.padEnd(6)} [${bar}] ${p.percentComplete.toFixed(1)}% (${p.cachedDays}/${p.totalDays})`);
    });
    console.log('─'.repeat(80));
    console.log();

    const ivCacheService = getIVCacheService();
    let roundNumber = 0;

    do {
      roundNumber++;
      console.log(`\n${'='.repeat(80)}`);
      console.log(`ROUND ${roundNumber} - ${new Date().toLocaleTimeString()}`);
      console.log('='.repeat(80));

      const results: Array<{ symbol: string; success: boolean; daysAdded: number; error?: string }> = [];

      // Process each symbol
      for (let i = 0; i < symbols.length; i++) {
        const symbol = symbols[i];
        const progress = progressList[i];

        // Skip if already complete
        if (progress.remaining === 0) {
          console.log(`\n[${i + 1}/${symbols.length}] ${symbol} - Already Complete ✓`);
          results.push({ symbol, success: true, daysAdded: 0 });
          continue;
        }

        console.log(`\n[${i + 1}/${symbols.length}] Processing ${symbol}...`);
        console.log(`Current: ${progress.cachedDays}/${progress.totalDays} days (${progress.remaining} remaining)`);

        try {
          const result = await ivCacheService.cacheHistoricalIVForSymbol(symbol, 252);
          results.push({ symbol, ...result });

          if (result.success) {
            console.log(`✅ ${symbol}: Added ${result.daysAdded} days`);
            // Update progress
            progress.cachedDays += result.daysAdded;
            progress.remaining -= result.daysAdded;
            progress.percentComplete = (progress.cachedDays / progress.totalDays) * 100;
          } else {
            console.log(`❌ ${symbol}: ${result.error}`);
          }
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : 'Unknown error';
          console.error(`❌ ${symbol}: ${errorMsg}`);
          results.push({ symbol, success: false, daysAdded: 0, error: errorMsg });
        }
      }

      // Round Summary
      console.log('\n' + '─'.repeat(80));
      console.log(`ROUND ${roundNumber} SUMMARY`);
      console.log('─'.repeat(80));

      const successful = results.filter(r => r.success);
      const failed = results.filter(r => !r.success);
      const totalDaysThisRound = results.reduce((sum, r) => sum + r.daysAdded, 0);

      console.log(`\nSymbols Processed: ${results.length}`);
      console.log(`Successful: ${successful.length}`);
      console.log(`Failed: ${failed.length}`);
      console.log(`Days Added This Round: ${totalDaysThisRound}`);

      // Overall progress
      const totalCached = progressList.reduce((sum, p) => sum + p.cachedDays, 0);
      const totalPossible = progressList.reduce((sum, p) => sum + p.totalDays, 0);
      const overallPercent = (totalCached / totalPossible) * 100;

      console.log(`\nOverall Progress: ${totalCached}/${totalPossible} (${overallPercent.toFixed(1)}%)`);

      // Progress bars
      console.log('\nSymbol Progress:');
      progressList.forEach(p => {
        const bar = '█'.repeat(Math.floor(p.percentComplete / 5)) +
                    '░'.repeat(20 - Math.floor(p.percentComplete / 5));
        const status = p.remaining === 0 ? '✓' : `${p.remaining} left`;
        console.log(`${p.symbol.padEnd(6)} [${bar}] ${p.percentComplete.toFixed(1)}% ${status}`);
      });

      // Check if all complete
      const allComplete = progressList.every(p => p.remaining === 0);
      if (allComplete) {
        console.log('\n🎉 All symbols complete!');
        break;
      }

      if (continuous) {
        console.log('\n⏳ Waiting 5 seconds before next round...');
        await new Promise(resolve => setTimeout(resolve, 5000));
      }

    } while (continuous);

    console.log('\n[Seed IV Cache] Complete!');

  } catch (error) {
    console.error('[Seed IV Cache] Fatal error:', error);
    process.exit(1);
  }
}

// Parse command line args
const continuous = process.argv.includes('--continuous') || process.argv.includes('-c');

// Run the script
seedWatchlistIVCache(continuous)
  .then(() => process.exit(0))
  .catch(error => {
    console.error('Unhandled error:', error);
    process.exit(1);
  });
