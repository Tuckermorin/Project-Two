/**
 * Daily Snapshot Service with Tavily News Integration
 *
 * Captures daily snapshots of active trades with:
 * - Current market data and Greeks
 * - Daily news summary from Tavily API
 * - Sentiment analysis
 * - Risk alerts
 *
 * Runs automatically via scheduler at end of trading day
 */

import { createClient } from '@supabase/supabase-js';
import { getTradeSnapshotService } from './trade-snapshot-service';
import { TavilySearchClient, TavilySearchResponse } from '@langchain/community/tools/tavily_search';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Initialize Tavily client
const tavilyClient = process.env.TAVILY_API_KEY
  ? new TavilySearchClient({ apiKey: process.env.TAVILY_API_KEY })
  : null;

// ============================================================================
// Types
// ============================================================================

export interface DailyNewsSummary {
  symbol: string;
  date: string;
  headlines: Array<{
    title: string;
    url: string;
    published_date?: string;
    relevance_score?: number;
  }>;
  summary: string;
  sentiment: 'bullish' | 'bearish' | 'neutral';
  key_topics: string[];
  credits_used: number;
}

// ============================================================================
// News Fetching
// ============================================================================

/**
 * Fetch daily news summary for a symbol using Tavily
 */
async function fetchDailyNews(symbol: string): Promise<DailyNewsSummary | null> {
  if (!tavilyClient) {
    console.warn('[DailySnapshot] Tavily API key not configured');
    return null;
  }

  try {
    const today = new Date().toISOString().split('T')[0];
    const query = `${symbol} stock news today ${today}`;

    console.log(`[DailySnapshot] Fetching news for ${symbol}...`);

    // Search for recent news
    const searchResults = await tavilyClient.call(query, {
      maxResults: 5,
      searchDepth: 'basic',
      includeAnswer: true,
      includeDomains: [
        'reuters.com',
        'bloomberg.com',
        'cnbc.com',
        'marketwatch.com',
        'seekingalpha.com',
        'benzinga.com',
      ],
    });

    // Parse results
    const results = typeof searchResults === 'string'
      ? JSON.parse(searchResults)
      : searchResults;

    if (!results || !results.results || results.results.length === 0) {
      console.log(`[DailySnapshot] No news found for ${symbol}`);
      return {
        symbol,
        date: today,
        headlines: [],
        summary: 'No significant news today.',
        sentiment: 'neutral',
        key_topics: [],
        credits_used: 1, // Tavily charges ~1 credit per search
      };
    }

    // Extract headlines
    const headlines = results.results.map((item: any) => ({
      title: item.title || '',
      url: item.url || '',
      published_date: item.published_date,
      relevance_score: item.score,
    }));

    // Create summary from answer or top headlines
    let summary = results.answer || '';
    if (!summary && headlines.length > 0) {
      summary = headlines.slice(0, 3).map((h: any) => h.title).join('. ');
    }

    // Basic sentiment analysis from headlines
    const text = headlines.map((h: any) => h.title).join(' ').toLowerCase();
    let sentiment: 'bullish' | 'bearish' | 'neutral' = 'neutral';

    const bullishWords = ['surge', 'rally', 'gain', 'rise', 'profit', 'beat', 'growth', 'upgrade'];
    const bearishWords = ['plunge', 'fall', 'decline', 'loss', 'miss', 'downgrade', 'warning'];

    const bullishCount = bullishWords.filter(word => text.includes(word)).length;
    const bearishCount = bearishWords.filter(word => text.includes(word)).length;

    if (bullishCount > bearishCount + 1) {
      sentiment = 'bullish';
    } else if (bearishCount > bullishCount + 1) {
      sentiment = 'bearish';
    }

    // Extract key topics
    const key_topics: string[] = [];
    if (text.includes('earnings')) key_topics.push('earnings');
    if (text.includes('fda') || text.includes('approval')) key_topics.push('regulatory');
    if (text.includes('acquisition') || text.includes('merger')) key_topics.push('M&A');
    if (text.includes('lawsuit') || text.includes('investigation')) key_topics.push('legal');
    if (text.includes('guidance')) key_topics.push('guidance');

    return {
      symbol,
      date: today,
      headlines,
      summary,
      sentiment,
      key_topics,
      credits_used: 1,
    };
  } catch (error: any) {
    console.error(`[DailySnapshot] Error fetching news for ${symbol}:`, error.message);
    return null;
  }
}

// ============================================================================
// Daily Snapshot Capture
// ============================================================================

/**
 * Capture daily snapshots for all active trades with news summaries
 */
export async function captureActiveTradesDailySnapshot(
  userId?: string
): Promise<{
  success: number;
  failed: number;
  total_credits: number;
  trade_summaries: Array<{
    trade_id: string;
    symbol: string;
    snapshot_created: boolean;
    news_fetched: boolean;
    sentiment?: 'bullish' | 'bearish' | 'neutral';
  }>;
}> {
  console.log('\n' + '='.repeat(80));
  console.log('📸 DAILY SNAPSHOT WITH NEWS - Starting...');
  console.log('='.repeat(80) + '\n');

  const snapshotService = getTradeSnapshotService();
  const results = {
    success: 0,
    failed: 0,
    total_credits: 0,
    trade_summaries: [] as Array<{
      trade_id: string;
      symbol: string;
      snapshot_created: boolean;
      news_fetched: boolean;
      sentiment?: 'bullish' | 'bearish' | 'neutral';
    }>,
  };

  try {
    // Fetch all active trades
    let query = supabase
      .from('trades')
      .select('id, symbol, user_id, status, ips_name')
      .eq('status', 'active');

    if (userId) {
      query = query.eq('user_id', userId);
    }

    const { data: activeTrades, error } = await query;

    if (error || !activeTrades) {
      console.error('[DailySnapshot] Error fetching active trades:', error);
      return results;
    }

    console.log(`[DailySnapshot] Found ${activeTrades.length} active trades\n`);

    // Process each trade
    for (const trade of activeTrades) {
      console.log(`[DailySnapshot] Processing ${trade.symbol} (${trade.id})...`);

      const tradeSummary = {
        trade_id: trade.id,
        symbol: trade.symbol,
        snapshot_created: false,
        news_fetched: false,
        sentiment: undefined as 'bullish' | 'bearish' | 'neutral' | undefined,
      };

      try {
        // 1. Capture snapshot with market data
        const snapshot = await snapshotService.captureSnapshot(trade.id, 'scheduled');

        if (snapshot) {
          tradeSummary.snapshot_created = true;
          console.log(`   ✓ Snapshot captured`);
        }

        // 2. Fetch daily news
        const news = await fetchDailyNews(trade.symbol);

        if (news) {
          tradeSummary.news_fetched = true;
          tradeSummary.sentiment = news.sentiment;
          results.total_credits += news.credits_used;

          console.log(`   ✓ News fetched (${news.headlines.length} headlines, ${news.sentiment} sentiment)`);

          // 3. Store news summary in database
          const { error: newsError } = await supabase
            .from('trade_daily_news')
            .upsert({
              trade_id: trade.id,
              user_id: trade.user_id,
              symbol: trade.symbol,
              date: news.date,
              headlines: news.headlines,
              summary: news.summary,
              sentiment: news.sentiment,
              key_topics: news.key_topics,
              created_at: new Date().toISOString(),
            }, {
              onConflict: 'trade_id,date',
            });

          if (newsError) {
            console.warn(`   ⚠️  Failed to store news: ${newsError.message}`);
          } else {
            console.log(`   ✓ News stored in database`);
          }
        }

        results.success++;
        console.log(`   ✅ Complete\n`);
      } catch (error: any) {
        results.failed++;
        console.error(`   ❌ Error: ${error.message}\n`);
      }

      results.trade_summaries.push(tradeSummary);

      // Small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 200));
    }

    console.log('='.repeat(80));
    console.log('📊 DAILY SNAPSHOT SUMMARY');
    console.log('='.repeat(80));
    console.log(`✅ Success: ${results.success}`);
    console.log(`❌ Failed: ${results.failed}`);
    console.log(`💰 Tavily Credits Used: ${results.total_credits}`);
    console.log('='.repeat(80) + '\n');

    return results;
  } catch (error: any) {
    console.error('[DailySnapshot] Fatal error:', error);
    return results;
  }
}

/**
 * Get news history for a trade
 */
export async function getTradeNewsHistory(
  tradeId: string,
  limit: number = 30
): Promise<DailyNewsSummary[]> {
  const { data, error } = await supabase
    .from('trade_daily_news')
    .select('*')
    .eq('trade_id', tradeId)
    .order('date', { ascending: false })
    .limit(limit);

  if (error || !data) {
    console.error('[DailySnapshot] Error fetching news history:', error);
    return [];
  }

  return data as DailyNewsSummary[];
}
