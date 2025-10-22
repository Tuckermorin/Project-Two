// Live Market Intelligence Service
// Fetches real-time news and sentiment from Alpha Vantage API
// Supplements cached external intelligence with fresh live data

import { createClient } from '@supabase/supabase-js';

// ============================================================================
// Types
// ============================================================================

export interface LiveNewsArticle {
  title: string;
  url: string;
  time_published: string; // ISO format
  authors: string[];
  summary: string;
  source: string;
  category_within_source: string;
  source_domain: string;
  topics: Array<{
    topic: string;
    relevance_score: string;
  }>;
  overall_sentiment_score: number; // -1 to 1
  overall_sentiment_label: string; // Bullish, Neutral, Bearish
  ticker_sentiment: Array<{
    ticker: string;
    relevance_score: string;
    ticker_sentiment_score: string;
    ticker_sentiment_label: string;
  }>;
}

export interface LiveNewsSentiment {
  symbol: string;
  articles: LiveNewsArticle[];
  aggregate_sentiment: {
    average_score: number; // -1 to 1
    label: 'Bullish' | 'Somewhat-Bullish' | 'Neutral' | 'Somewhat-Bearish' | 'Bearish';
    article_count: number;
    bullish_count: number;
    bearish_count: number;
    neutral_count: number;
  };
  time_range: {
    from: string;
    to: string;
  };
  freshness: 'real-time'; // Always real-time from API
}

export interface LiveInsiderTransaction {
  symbol: string;
  insider_name: string;
  transaction_type: string; // 'Purchase' | 'Sale'
  transaction_date: string;
  shares: number;
  price_per_share: number;
  total_value: number;
  shares_owned_after: number;
}

export interface LiveInsiderActivity {
  symbol: string;
  transactions: LiveInsiderTransaction[];
  summary: {
    total_transactions: number;
    purchases: number;
    sales: number;
    net_shares: number; // positive = buying, negative = selling
    total_value: number;
    sentiment: 'bullish' | 'bearish' | 'neutral';
  };
  time_range: string;
}

export interface LiveMarketIntelligence {
  symbol: string;
  news_sentiment: LiveNewsSentiment | null;
  insider_activity: LiveInsiderActivity | null;
  fetched_at: string;
  data_quality: {
    has_news: boolean;
    has_insider_activity: boolean;
    overall_confidence: 'high' | 'medium' | 'low';
  };
}

// ============================================================================
// Live Market Intelligence Service
// ============================================================================

export class LiveMarketIntelligenceService {
  private apiKey: string;
  private baseUrl: string = 'https://www.alphavantage.co/query';
  private mainDb: ReturnType<typeof createClient>;
  private cache: Map<string, { data: LiveMarketIntelligence; timestamp: number }>;
  private cacheTTL: number = 5 * 60 * 1000; // 5 minutes

  constructor() {
    this.apiKey = process.env.ALPHA_VANTAGE_API_KEY || process.env.NEXT_PUBLIC_ALPHA_VANTAGE_API_KEY || '';

    if (!this.apiKey) {
      console.warn('[LiveMarketIntelligence] No Alpha Vantage API key found');
    }

    this.mainDb = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    this.cache = new Map();
  }

  /**
   * Get live market intelligence for a symbol
   */
  async getLiveIntelligence(
    symbol: string,
    options: {
      includeNews?: boolean;
      includeInsiderActivity?: boolean;
      newsLimit?: number;
      useCache?: boolean;
    } = {}
  ): Promise<LiveMarketIntelligence> {
    const {
      includeNews = true,
      includeInsiderActivity = false,
      newsLimit = 50,
      useCache = true,
    } = options;

    console.log(`[LiveMarketIntelligence] Fetching live intelligence for ${symbol}`);

    // Check cache first
    if (useCache) {
      const cached = this.getFromCache(symbol);
      if (cached) {
        console.log(`[LiveMarketIntelligence] Returning cached data for ${symbol}`);
        return cached;
      }
    }

    // Fetch fresh data
    const [newsSentiment, insiderActivity] = await Promise.all([
      includeNews ? this.fetchNewsSentiment(symbol, newsLimit) : Promise.resolve(null),
      includeInsiderActivity ? this.fetchInsiderActivity(symbol) : Promise.resolve(null),
    ]);

    const intelligence: LiveMarketIntelligence = {
      symbol,
      news_sentiment: newsSentiment,
      insider_activity: insiderActivity,
      fetched_at: new Date().toISOString(),
      data_quality: {
        has_news: !!newsSentiment && newsSentiment.articles.length > 0,
        has_insider_activity: !!insiderActivity && insiderActivity.transactions.length > 0,
        overall_confidence: this.calculateConfidence(newsSentiment, insiderActivity),
      },
    };

    // Cache the result
    if (useCache) {
      this.setCache(symbol, intelligence);
    }

    console.log(`[LiveMarketIntelligence] Fetched live intelligence for ${symbol}`);
    console.log(`  News articles: ${newsSentiment?.articles.length || 0}`);
    console.log(`  Insider transactions: ${insiderActivity?.transactions.length || 0}`);

    return intelligence;
  }

  /**
   * Fetch real-time news and sentiment from Alpha Vantage
   */
  private async fetchNewsSentiment(
    symbol: string,
    limit: number = 50
  ): Promise<LiveNewsSentiment | null> {
    if (!this.apiKey) {
      console.warn('[LiveMarketIntelligence] Cannot fetch news: No API key');
      return null;
    }

    try {
      const url = new URL(this.baseUrl);
      url.searchParams.append('function', 'NEWS_SENTIMENT');
      url.searchParams.append('tickers', symbol);
      url.searchParams.append('limit', limit.toString());
      url.searchParams.append('apikey', this.apiKey);

      console.log(`[LiveMarketIntelligence] Fetching news sentiment from Alpha Vantage...`);

      const response = await fetch(url.toString());
      const data = await response.json();

      // Check for API errors
      if (data['Error Message'] || data['Note']) {
        console.error('[LiveMarketIntelligence] Alpha Vantage API error:', data['Error Message'] || data['Note']);
        return null;
      }

      if (!data.feed || data.feed.length === 0) {
        console.log(`[LiveMarketIntelligence] No news articles found for ${symbol}`);
        return null;
      }

      // Parse articles
      const articles: LiveNewsArticle[] = data.feed.map((item: any) => ({
        title: item.title,
        url: item.url,
        time_published: item.time_published,
        authors: item.authors || [],
        summary: item.summary,
        source: item.source,
        category_within_source: item.category_within_source,
        source_domain: item.source_domain,
        topics: item.topics || [],
        overall_sentiment_score: parseFloat(item.overall_sentiment_score),
        overall_sentiment_label: item.overall_sentiment_label,
        ticker_sentiment: item.ticker_sentiment || [],
      }));

      // Calculate aggregate sentiment for this specific ticker
      const tickerSentiments = articles
        .flatMap(article => article.ticker_sentiment)
        .filter(ts => ts.ticker === symbol)
        .map(ts => parseFloat(ts.ticker_sentiment_score))
        .filter(score => !isNaN(score));

      const avgSentiment = tickerSentiments.length > 0
        ? tickerSentiments.reduce((sum, s) => sum + s, 0) / tickerSentiments.length
        : 0;

      // Count sentiment labels
      const sentimentLabels = articles
        .flatMap(article => article.ticker_sentiment)
        .filter(ts => ts.ticker === symbol)
        .map(ts => ts.ticker_sentiment_label);

      const bullishCount = sentimentLabels.filter(l => l.includes('Bullish')).length;
      const bearishCount = sentimentLabels.filter(l => l.includes('Bearish')).length;
      const neutralCount = sentimentLabels.filter(l => l === 'Neutral').length;

      // Determine aggregate label
      let aggregateLabel: LiveNewsSentiment['aggregate_sentiment']['label'] = 'Neutral';
      if (avgSentiment > 0.15) aggregateLabel = 'Bullish';
      else if (avgSentiment > 0.05) aggregateLabel = 'Somewhat-Bullish';
      else if (avgSentiment < -0.15) aggregateLabel = 'Bearish';
      else if (avgSentiment < -0.05) aggregateLabel = 'Somewhat-Bearish';

      // Get time range
      const times = articles.map(a => new Date(a.time_published)).filter(d => !isNaN(d.getTime()));
      const from = times.length > 0 ? new Date(Math.min(...times.map(d => d.getTime()))).toISOString() : new Date().toISOString();
      const to = times.length > 0 ? new Date(Math.max(...times.map(d => d.getTime()))).toISOString() : new Date().toISOString();

      return {
        symbol,
        articles,
        aggregate_sentiment: {
          average_score: avgSentiment,
          label: aggregateLabel,
          article_count: articles.length,
          bullish_count: bullishCount,
          bearish_count: bearishCount,
          neutral_count: neutralCount,
        },
        time_range: { from, to },
        freshness: 'real-time',
      };
    } catch (error: any) {
      console.error(`[LiveMarketIntelligence] Error fetching news sentiment: ${error.message}`);
      return null;
    }
  }

  /**
   * Fetch insider transactions from database (already collected separately)
   */
  private async fetchInsiderActivity(symbol: string): Promise<LiveInsiderActivity | null> {
    try {
      // Fetch insider transactions from last 6 months
      const sixMonthsAgo = new Date();
      sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

      const { data: transactions, error } = await this.mainDb
        .from('insider_transactions')
        .select('*')
        .eq('symbol', symbol)
        .gte('transaction_date', sixMonthsAgo.toISOString())
        .order('transaction_date', { ascending: false })
        .limit(50);

      if (error) {
        console.error(`[LiveMarketIntelligence] Error fetching insider activity: ${error.message}`);
        return null;
      }

      if (!transactions || transactions.length === 0) {
        return null;
      }

      // Parse transactions
      const parsedTransactions: LiveInsiderTransaction[] = transactions.map((t: any) => ({
        symbol: t.symbol,
        insider_name: t.insider_name,
        transaction_type: t.transaction_type,
        transaction_date: t.transaction_date,
        shares: t.shares || 0,
        price_per_share: t.price_per_share || 0,
        total_value: t.total_value || 0,
        shares_owned_after: t.shares_owned_after || 0,
      }));

      // Calculate summary
      const purchases = parsedTransactions.filter(t => t.transaction_type === 'Purchase').length;
      const sales = parsedTransactions.filter(t => t.transaction_type === 'Sale').length;

      const netShares = parsedTransactions.reduce((sum, t) => {
        return sum + (t.transaction_type === 'Purchase' ? t.shares : -t.shares);
      }, 0);

      const totalValue = parsedTransactions.reduce((sum, t) => sum + Math.abs(t.total_value), 0);

      let sentiment: 'bullish' | 'bearish' | 'neutral' = 'neutral';
      if (netShares > 0 && purchases > sales * 1.5) sentiment = 'bullish';
      else if (netShares < 0 && sales > purchases * 1.5) sentiment = 'bearish';

      return {
        symbol,
        transactions: parsedTransactions,
        summary: {
          total_transactions: parsedTransactions.length,
          purchases,
          sales,
          net_shares: netShares,
          total_value: totalValue,
          sentiment,
        },
        time_range: 'last 6 months',
      };
    } catch (error: any) {
      console.error(`[LiveMarketIntelligence] Error fetching insider activity: ${error.message}`);
      return null;
    }
  }

  /**
   * Calculate overall data quality confidence
   */
  private calculateConfidence(
    news: LiveNewsSentiment | null,
    insider: LiveInsiderActivity | null
  ): 'high' | 'medium' | 'low' {
    const hasNews = news && news.articles.length > 0;
    const hasInsider = insider && insider.transactions.length > 0;
    const hasRecentNews = news && news.articles.length >= 5;

    if (hasNews && hasRecentNews) return 'high';
    if (hasNews || hasInsider) return 'medium';
    return 'low';
  }

  /**
   * Cache management
   */
  private getFromCache(symbol: string): LiveMarketIntelligence | null {
    const cached = this.cache.get(symbol);
    if (!cached) return null;

    const age = Date.now() - cached.timestamp;
    if (age > this.cacheTTL) {
      this.cache.delete(symbol);
      return null;
    }

    return cached.data;
  }

  private setCache(symbol: string, data: LiveMarketIntelligence): void {
    this.cache.set(symbol, {
      data,
      timestamp: Date.now(),
    });
  }

  /**
   * Clear cache for a symbol
   */
  public clearCache(symbol?: string): void {
    if (symbol) {
      this.cache.delete(symbol);
    } else {
      this.cache.clear();
    }
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let liveIntelligenceInstance: LiveMarketIntelligenceService | null = null;

export function getLiveMarketIntelligenceService(): LiveMarketIntelligenceService {
  if (!liveIntelligenceInstance) {
    liveIntelligenceInstance = new LiveMarketIntelligenceService();
  }
  return liveIntelligenceInstance;
}

// ============================================================================
// Convenience Function
// ============================================================================

export async function getLiveMarketIntelligence(
  symbol: string,
  options?: Parameters<LiveMarketIntelligenceService['getLiveIntelligence']>[1]
): Promise<LiveMarketIntelligence> {
  return getLiveMarketIntelligenceService().getLiveIntelligence(symbol, options);
}
