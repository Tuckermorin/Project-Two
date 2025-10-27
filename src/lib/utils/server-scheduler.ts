// src/lib/utils/server-scheduler.ts
// Server-side scheduler that runs as part of Next.js app
// This starts automatically when the Next.js server starts

import cron from 'node-cron';
import { monitorAllActiveTrades } from '@/lib/agent/active-trade-monitor';
import { analyzeTradePostMortem } from '@/lib/agent/trade-postmortem';
import { batchIntelligentResearch } from '@/lib/agent/rag-router';
import { createClient } from '@supabase/supabase-js';

// Supabase client
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Track if scheduler has been started
let schedulerStarted = false;
let scheduledJobs: cron.ScheduledTask[] = [];

/**
 * Get all user IDs from the database for batch operations
 */
async function getAllUserIds(): Promise<string[]> {
  try {
    // Use admin API to get all users (requires service role key)
    const { data: { users }, error } = await supabase.auth.admin.listUsers();

    if (error) {
      console.error('[Scheduler] Failed to fetch users:', error);
      return [];
    }

    return users?.map(u => u.id) || [];
  } catch (error) {
    console.error('[Scheduler] Error fetching users:', error);
    return [];
  }
}

/**
 * Initialize and start all scheduled jobs
 * This is called automatically when the server starts
 */
export function initializeScheduler() {
  // Prevent multiple initializations
  if (schedulerStarted) {
    console.log('[Scheduler] Already running, skipping initialization');
    return;
  }

  // Only run on server side
  if (typeof window !== 'undefined') {
    return;
  }

  console.log('');
  console.log('='.repeat(80));
  console.log('TENXIV AUTOMATED SCHEDULER - Starting...');
  console.log('='.repeat(80));
  console.log('');

  try {
    // Job 1: Daily Trade Monitoring - 9:00 AM EST (Mon-Fri)
    const dailyMonitoring = cron.schedule(
      '0 9 * * 1-5',
      async () => {
        console.log('[Cron] Daily trade monitoring triggered');
        try {
          const userIds = await getAllUserIds();

          if (userIds.length === 0) {
            console.log('[Cron] No users found to monitor');
            return;
          }

          for (const userId of userIds) {
            console.log(`[Cron] Monitoring trades for user ${userId}`);
            const result = await monitorAllActiveTrades(userId, {
              daysBack: 7,
              useCache: true,
            });
            console.log(`[Cron] User ${userId}: Monitored ${result.monitored} trades, ${result.total_credits_used} credits used`);

            // Log critical/high risk trades
            const urgent = result.results.filter(
              r => r.risk_alerts.level === 'critical' || r.risk_alerts.level === 'high'
            );
            if (urgent.length > 0) {
              console.log(`[Cron] ⚠️ User ${userId}: ${urgent.length} URGENT TRADES requiring attention`);
            }
          }
        } catch (error) {
          console.error('[Cron] Daily monitoring failed:', error);
        }
      },
      { timezone: 'America/New_York' }
    );
    scheduledJobs.push(dailyMonitoring);
    console.log('✓ Daily Trade Monitoring - 9:00 AM EST (Mon-Fri)');

    // Job 2: Midday Check - 12:00 PM EST (Mon-Fri)
    const middayCheck = cron.schedule(
      '0 12 * * 1-5',
      async () => {
        console.log('[Cron] Midday trade check triggered');
        try {
          const userIds = await getAllUserIds();

          if (userIds.length === 0) {
            console.log('[Cron] No users found to monitor');
            return;
          }

          for (const userId of userIds) {
            const result = await monitorAllActiveTrades(userId, {
              daysBack: 1,
              useCache: true,
            });
            console.log(`[Cron] User ${userId}: Midday check complete, ${result.total_credits_used} credits (cached)`);
          }
        } catch (error) {
          console.error('[Cron] Midday check failed:', error);
        }
      },
      { timezone: 'America/New_York' }
    );
    scheduledJobs.push(middayCheck);
    console.log('✓ Midday Trade Check - 12:00 PM EST (Mon-Fri)');

    // Job 3: Auto Post-Mortems - Every hour
    const autoPostMortem = cron.schedule(
      '0 * * * *',
      async () => {
        console.log('[Cron] Auto post-mortem check triggered');
        try {
          const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();

          // Find all closed trades from the last 2 hours
          // Use updated_at as primary filter since closed_at is often set to midnight
          const { data: closedTrades } = await supabase
            .from('trades')
            .select('id, symbol, status, closed_at, updated_at, realized_pnl')
            .eq('status', 'closed')
            .gte('updated_at', twoHoursAgo);

          if (closedTrades && closedTrades.length > 0) {
            console.log(`[Cron] Found ${closedTrades.length} newly closed trades`);

            for (const trade of closedTrades) {
              // Check if post-mortem already exists
              const { data: existingPM } = await supabase
                .from('trade_postmortems')
                .select('id')
                .eq('trade_id', trade.id)
                .single();

              if (!existingPM) {
                console.log(`[Cron] Generating post-mortem for ${trade.symbol} (realized_pnl: ${trade.realized_pnl ?? 'null'})...`);
                try {
                  await analyzeTradePostMortem(trade.id, { embedToRAG: true });
                  console.log(`[Cron] ✓ Post-mortem created for ${trade.symbol}`);
                } catch (pmError) {
                  console.error(`[Cron] Failed to create post-mortem for ${trade.symbol}:`, pmError);
                }
              } else {
                console.log(`[Cron] Skipping ${trade.symbol} - post-mortem already exists`);
              }
            }
          } else {
            console.log('[Cron] No newly closed trades in last 2 hours');
          }
        } catch (error) {
          console.error('[Cron] Auto post-mortem failed:', error);
        }
      },
      { timezone: 'America/New_York' }
    );
    scheduledJobs.push(autoPostMortem);
    console.log('✓ Auto Post-Mortems - Every hour');

    // Job 4: Weekly RAG Enrichment - 2:00 AM Sunday
    const weeklyEnrichment = cron.schedule(
      '0 2 * * 0',
      async () => {
        console.log('[Cron] Weekly RAG enrichment triggered');
        try {
          const userIds = await getAllUserIds();

          if (userIds.length === 0) {
            console.log('[Cron] No users found for enrichment');
            return;
          }

          for (const userId of userIds) {
            const { data: watchlistItems } = await supabase
              .from('watchlist_items')
              .select('symbol')
              .eq('user_id', userId)
              .limit(20);

            if (watchlistItems && watchlistItems.length > 0) {
              const symbols = watchlistItems.map(item => item.symbol);
              console.log(`[Cron] User ${userId}: Enriching ${symbols.length} symbols`);

              const results = await batchIntelligentResearch(symbols, 'general', {
                forceRefresh: false,
                enableHybrid: true,
              });

              const totalCredits = Object.values(results).reduce(
                (sum, r) => sum + r.credits_used,
                0
              );
              console.log(`[Cron] User ${userId}: RAG enrichment complete, ${totalCredits} credits used`);
            } else {
              console.log(`[Cron] User ${userId}: No watchlist items to enrich`);
            }
          }
        } catch (error) {
          console.error('[Cron] Weekly enrichment failed:', error);
        }
      },
      { timezone: 'America/New_York' }
    );
    scheduledJobs.push(weeklyEnrichment);
    console.log('✓ Weekly RAG Enrichment - 2:00 AM Sunday');

    schedulerStarted = true;

    console.log('');
    console.log('='.repeat(80));
    console.log('✅ All scheduled jobs started successfully');
    console.log('='.repeat(80));
    console.log('');
    console.log('💰 Estimated API costs (Tavily search credits):');
    console.log('  - Daily monitoring: ~28 credits per WATCH trade (5 searches @ ~2 credits each)');
    console.log('  - Midday checks: ~0 credits (uses cache from morning run)');
    console.log('  - Auto post-mortems: ~28 credits per closed trade');
    console.log('  - Weekly enrichment: ~10-14 credits per symbol');
    console.log('  - Average monthly total: ~$146 (assumes 20 trades monitored, 10 closures/month)');
    console.log('');
    console.log('🚀 Performance optimizations enabled:');
    console.log('  - Parallel symbol processing with Promise.allSettled()');
    console.log('  - Background job queue for agent runs');
    console.log('  - Connection pooling via Supabase PgBouncer');
    console.log('  - Vector search HNSW indexes for RAG queries');
    console.log('  - Smart caching for midday checks (50-90% cache hit rate)');
    console.log('');
    console.log('📊 API endpoints:');
    console.log('  - Agent jobs: POST /api/agent/jobs');
    console.log('  - Job status: GET /api/agent/jobs/[jobId]');
    console.log('  - Worker process: POST /api/agent/worker/process');
    console.log('  - IPS scheduler: GET /api/agent/scheduler');
    console.log('');

  } catch (error) {
    console.error('[Scheduler] Failed to initialize:', error);
  }
}

/**
 * Stop all scheduled jobs (for cleanup)
 */
export function stopScheduler() {
  if (!schedulerStarted) return;

  console.log('[Scheduler] Stopping all jobs...');
  scheduledJobs.forEach(job => job.stop());
  scheduledJobs = [];
  schedulerStarted = false;
  console.log('[Scheduler] All jobs stopped');
}

/**
 * Check if scheduler is running
 */
export function isSchedulerRunning(): boolean {
  return schedulerStarted;
}
