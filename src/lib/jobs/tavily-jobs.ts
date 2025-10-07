// src/lib/jobs/tavily-jobs.ts
// Automated jobs for Tavily-powered features

import { CronJob } from 'cron';
import { createClient } from '@supabase/supabase-js';
import { monitorAllActiveTrades } from '@/lib/agent/active-trade-monitor';
import { analyzeTradePostMortem } from '@/lib/agent/trade-postmortem';
import { batchIntelligentResearch } from '@/lib/agent/rag-router';

// Get Supabase client (lazy initialization)
function getSupabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error('Missing Supabase environment variables');
  }

  return createClient(url, key);
}

// ============================================================================
// Job 1: Daily Active Trade Monitoring
// Runs every weekday at 9:00 AM EST (after market open)
// ============================================================================

async function runDailyTradeMonitoring() {
  const startTime = new Date();
  console.log(`[Daily Monitoring] Starting at ${startTime.toISOString()}`);

  try {
    const result = await monitorAllActiveTrades('default-user', {
      daysBack: 7,
      useCache: true,
    });

    console.log(`[Daily Monitoring] Monitored ${result.monitored} trades`);
    console.log(`[Daily Monitoring] Risk summary:`, result.risk_summary);
    console.log(`[Daily Monitoring] Credits used: ${result.total_credits_used}`);

    // Check for critical or high risk trades
    const urgentTrades = result.results.filter(
      (r) => r.risk_alerts.level === 'critical' || r.risk_alerts.level === 'high'
    );

    if (urgentTrades.length > 0) {
      console.log(`[Daily Monitoring] ⚠️ ${urgentTrades.length} URGENT TRADES DETECTED:`);
      urgentTrades.forEach((trade) => {
        console.log(`  - ${trade.symbol}: ${trade.risk_alerts.level.toUpperCase()}`);
        trade.risk_alerts.alerts.forEach((alert) => {
          console.log(`    • ${alert.message}`);
        });
      });

      // TODO: Send email/Slack notification
      // await sendAlert(`${urgentTrades.length} trades need attention`);
    }

    const endTime = new Date();
    const duration = (endTime.getTime() - startTime.getTime()) / 1000;
    console.log(`[Daily Monitoring] Completed in ${duration.toFixed(1)}s`);
  } catch (error) {
    console.error('[Daily Monitoring] Error:', error);
  }
}

// ============================================================================
// Job 2: Auto Post-Mortem on Trade Closure
// Checks every hour for newly closed trades and generates post-mortems
// ============================================================================

async function runAutoPostMortem() {
  const startTime = new Date();
  console.log(`[Auto Post-Mortem] Starting at ${startTime.toISOString()}`);

  try {
    const supabase = getSupabaseClient();

    // Find trades closed in the last 2 hours without post-mortems
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();

    const { data: closedTrades, error } = await supabase
      .from('trades')
      .select('id, symbol, status, closed_at')
      .eq('status', 'closed')
      .gte('closed_at', twoHoursAgo)
      .not('realized_pnl', 'is', null);

    if (error) {
      console.error('[Auto Post-Mortem] Error fetching trades:', error);
      return;
    }

    if (!closedTrades || closedTrades.length === 0) {
      console.log('[Auto Post-Mortem] No newly closed trades found');
      return;
    }

    console.log(`[Auto Post-Mortem] Found ${closedTrades.length} closed trades`);

    // Check which ones don't have post-mortems yet
    for (const trade of closedTrades) {
      const { data: existingPM } = await supabase
        .from('trade_postmortems')
        .select('id')
        .eq('trade_id', trade.id)
        .single();

      if (existingPM) {
        console.log(`[Auto Post-Mortem] ${trade.symbol} already has post-mortem, skipping`);
        continue;
      }

      console.log(`[Auto Post-Mortem] Generating post-mortem for ${trade.symbol}...`);

      try {
        const postMortem = await analyzeTradePostMortem(trade.id, {
          embedToRAG: true,
        });

        console.log(
          `[Auto Post-Mortem] ✓ ${trade.symbol} - ${postMortem.outcome.toUpperCase()} (${postMortem.credits_used} credits)`
        );
        console.log(`  Key insight: ${postMortem.lessons_learned.key_insight}`);
      } catch (error) {
        console.error(`[Auto Post-Mortem] Failed for ${trade.symbol}:`, error);
      }

      // Rate limiting: 5 seconds between analyses
      await new Promise((resolve) => setTimeout(resolve, 5000));
    }

    const endTime = new Date();
    const duration = (endTime.getTime() - startTime.getTime()) / 1000;
    console.log(`[Auto Post-Mortem] Completed in ${duration.toFixed(1)}s`);
  } catch (error) {
    console.error('[Auto Post-Mortem] Fatal error:', error);
  }
}

// ============================================================================
// Job 3: Weekly RAG Enrichment
// Runs every Sunday at 2:00 AM EST (before market week starts)
// ============================================================================

async function runWeeklyRAGEnrichment() {
  const startTime = new Date();
  console.log(`[Weekly RAG Enrichment] Starting at ${startTime.toISOString()}`);

  try {
    const supabase = getSupabaseClient();

    // Get watchlist symbols
    const { data: watchlistItems, error } = await supabase
      .from('watchlist_items')
      .select('symbol')
      .eq('user_id', 'default-user')
      .limit(20); // Limit to 20 to control costs

    if (error) {
      console.error('[Weekly RAG Enrichment] Error fetching watchlist:', error);
      return;
    }

    if (!watchlistItems || watchlistItems.length === 0) {
      console.log('[Weekly RAG Enrichment] No watchlist items found');
      return;
    }

    const symbols = watchlistItems.map((item) => item.symbol);
    console.log(`[Weekly RAG Enrichment] Enriching ${symbols.length} symbols:`, symbols);

    // Enrich with general research context
    const results = await batchIntelligentResearch(symbols, 'general', {
      forceRefresh: false, // Allow RAG hits
      enableHybrid: true, // Combine RAG + fresh Tavily
    });

    // Calculate statistics
    const totalCredits = Object.values(results).reduce(
      (sum, r) => sum + r.credits_used,
      0
    );
    const ragHits = Object.values(results).filter((r) => r.source === 'rag').length;
    const tavilyFetches = Object.values(results).filter(
      (r) => r.source === 'tavily'
    ).length;
    const hybridQueries = Object.values(results).filter(
      (r) => r.source === 'hybrid'
    ).length;
    const cacheHitRate = (ragHits / symbols.length) * 100;

    console.log(`[Weekly RAG Enrichment] Results:`);
    console.log(`  Total credits: ${totalCredits}`);
    console.log(`  RAG hits: ${ragHits} (${cacheHitRate.toFixed(1)}% cache rate)`);
    console.log(`  Tavily fetches: ${tavilyFetches}`);
    console.log(`  Hybrid queries: ${hybridQueries}`);
    console.log(`  Avg credits/symbol: ${(totalCredits / symbols.length).toFixed(1)}`);

    const endTime = new Date();
    const duration = (endTime.getTime() - startTime.getTime()) / 1000;
    console.log(`[Weekly RAG Enrichment] Completed in ${duration.toFixed(1)}s`);
  } catch (error) {
    console.error('[Weekly RAG Enrichment] Fatal error:', error);
  }
}

// ============================================================================
// Job 4: Midday Trade Check
// Runs every weekday at 12:00 PM EST (midday check)
// ============================================================================

async function runMiddayTradeCheck() {
  const startTime = new Date();
  console.log(`[Midday Check] Starting at ${startTime.toISOString()}`);

  try {
    // Quick check with caching - should use 0 credits if morning run was recent
    const result = await monitorAllActiveTrades('default-user', {
      daysBack: 1, // Only check today's news
      useCache: true, // Use cached results from morning
    });

    console.log(`[Midday Check] Checked ${result.monitored} trades`);
    console.log(`[Midday Check] Credits used: ${result.total_credits_used} (should be ~0 if cached)`);

    // Only log if there are new critical alerts
    const criticalTrades = result.results.filter(
      (r) => r.risk_alerts.level === 'critical'
    );

    if (criticalTrades.length > 0) {
      console.log(`[Midday Check] ⚠️ ${criticalTrades.length} CRITICAL TRADES:`);
      criticalTrades.forEach((trade) => {
        console.log(`  - ${trade.symbol}: ${trade.ai_summary}`);
      });
    } else {
      console.log(`[Midday Check] ✓ All trades in good standing`);
    }

    const endTime = new Date();
    const duration = (endTime.getTime() - startTime.getTime()) / 1000;
    console.log(`[Midday Check] Completed in ${duration.toFixed(1)}s`);
  } catch (error) {
    console.error('[Midday Check] Error:', error);
  }
}

// ============================================================================
// Scheduler Setup
// ============================================================================

export function startTavilyJobs() {
  // Check if we're in a server environment
  if (typeof window !== 'undefined') {
    console.log('[Tavily Jobs] Not starting scheduler in browser environment');
    return;
  }

  console.log('[Tavily Jobs] Starting scheduler...');
  console.log('');

  // Job 1: Daily Active Trade Monitoring
  // Every weekday at 9:00 AM EST (after market open)
  const dailyMonitoring = new CronJob(
    '0 9 * * 1-5', // 9:00 AM Mon-Fri
    async () => {
      console.log('[Cron] Triggering daily trade monitoring');
      await runDailyTradeMonitoring();
    },
    null,
    true,
    'America/New_York'
  );

  console.log('[Tavily Jobs] ✓ Daily trade monitoring scheduled');
  console.log('  - Time: 9:00 AM EST');
  console.log('  - Frequency: Monday-Friday');
  console.log('  - Purpose: Deep research on all active trades');
  console.log('  - Est. cost: ~100 credits/day (with caching)');
  console.log('');

  // Job 2: Auto Post-Mortem Generator
  // Every hour, check for newly closed trades
  const autoPostMortem = new CronJob(
    '0 * * * *', // Every hour
    async () => {
      console.log('[Cron] Checking for newly closed trades');
      await runAutoPostMortem();
    },
    null,
    true,
    'America/New_York'
  );

  console.log('[Tavily Jobs] ✓ Auto post-mortem scheduled');
  console.log('  - Time: Every hour');
  console.log('  - Frequency: 24/7');
  console.log('  - Purpose: Generate post-mortem for closed trades');
  console.log('  - Est. cost: ~20-25 credits per trade closure');
  console.log('');

  // Job 3: Weekly RAG Enrichment
  // Every Sunday at 2:00 AM EST (before market week starts)
  const weeklyEnrichment = new CronJob(
    '0 2 * * 0', // 2:00 AM Sunday
    async () => {
      console.log('[Cron] Running weekly RAG enrichment');
      await runWeeklyRAGEnrichment();
    },
    null,
    true,
    'America/New_York'
  );

  console.log('[Tavily Jobs] ✓ Weekly RAG enrichment scheduled');
  console.log('  - Time: 2:00 AM EST Sunday');
  console.log('  - Frequency: Once per week');
  console.log('  - Purpose: Refresh knowledge base with latest research');
  console.log('  - Est. cost: ~60-80 credits per week (with caching)');
  console.log('');

  // Job 4: Midday Trade Check
  // Every weekday at 12:00 PM EST (quick check using cache)
  const middayCheck = new CronJob(
    '0 12 * * 1-5', // 12:00 PM Mon-Fri
    async () => {
      console.log('[Cron] Running midday trade check');
      await runMiddayTradeCheck();
    },
    null,
    true,
    'America/New_York'
  );

  console.log('[Tavily Jobs] ✓ Midday trade check scheduled');
  console.log('  - Time: 12:00 PM EST');
  console.log('  - Frequency: Monday-Friday');
  console.log('  - Purpose: Quick check for new alerts (uses cache)');
  console.log('  - Est. cost: ~0 credits (cached from morning)');
  console.log('');

  console.log('[Tavily Jobs] All jobs started successfully!');
  console.log('');
  console.log('Estimated total cost per month:');
  console.log('  - Daily monitoring: ~2,200 credits (22 days × 100)');
  console.log('  - Post-mortems: ~400 credits (2 closures/day × 20 × 22 days)');
  console.log('  - Weekly enrichment: ~280 credits (4 weeks × 70)');
  console.log('  - Midday checks: ~0 credits (cached)');
  console.log('  - TOTAL: ~2,880 credits/month (well within 4,000 budget)');
  console.log('');

  // Return jobs for cleanup
  return {
    dailyMonitoring,
    autoPostMortem,
    weeklyEnrichment,
    middayCheck,
    stopAll: () => {
      dailyMonitoring.stop();
      autoPostMortem.stop();
      weeklyEnrichment.stop();
      middayCheck.stop();
      console.log('[Tavily Jobs] All jobs stopped');
    },
  };
}

/**
 * Manual triggers for testing
 */
export const manualTriggers = {
  dailyMonitoring: runDailyTradeMonitoring,
  autoPostMortem: runAutoPostMortem,
  weeklyEnrichment: runWeeklyRAGEnrichment,
  middayCheck: runMiddayTradeCheck,
};
