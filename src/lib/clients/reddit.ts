/**
 * Apewisdom API Client
 *
 * Provides social sentiment data aggregated from Reddit (r/wallstreetbets, r/stocks, etc.)
 * - No authentication required
 * - Simple REST API
 * - Caching to minimize API calls
 */

import type {
  ApewisdomTicker,
  ApewisdomResponse,
  RedditSentiment,
  RedditSearchParams,
} from '../types/reddit';

class RedditClient {
  private readonly API_BASE = 'https://apewisdom.io/api/v1.0';
  private cache: Map<string, { data: ApewisdomTicker[]; timestamp: number }> = new Map();
  private readonly CACHE_TTL = 30 * 60 * 1000; // 30 minutes
  private requestCount = 0;
  private requestWindow = Date.now();
  private readonly MAX_REQUESTS_PER_MINUTE = 30; // Conservative rate limit

  constructor() {
    console.log('[Reddit/Apewisdom] Client initialized (no authentication required)');
  }

  /**
   * Always configured (no API keys required)
   */
  isConfigured(): boolean {
    return true;
  }

  /**
   * Rate limiting: Wait if necessary to stay under limit
   */
  private async rateLimit(): Promise<void> {
    const now = Date.now();
    const windowAge = now - this.requestWindow;

    // Reset counter every minute
    if (windowAge >= 60000) {
      this.requestCount = 0;
      this.requestWindow = now;
      return;
    }

    // If we've hit the limit, wait until the window resets
    if (this.requestCount >= this.MAX_REQUESTS_PER_MINUTE) {
      const waitTime = 60000 - windowAge;
      console.log(`[Reddit/Apewisdom] Rate limit reached. Waiting ${waitTime}ms`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
      this.requestCount = 0;
      this.requestWindow = Date.now();
    }

    this.requestCount++;
  }

  /**
   * Fetch all trending stocks from Apewisdom
   */
  private async fetchTrendingStocks(): Promise<ApewisdomTicker[]> {
    // Check cache
    const cached = this.cache.get('all');
    if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
      console.log('[Reddit/Apewisdom] Using cached data');
      return cached.data;
    }

    await this.rateLimit();

    console.log('[Reddit/Apewisdom] Fetching trending stocks');

    const response = await fetch(`${this.API_BASE}/filter/all-stocks`, {
      headers: {
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`Apewisdom API error: ${response.status} ${response.statusText}`);
    }

    const data: ApewisdomResponse = await response.json();

    if (!data.results || !Array.isArray(data.results)) {
      throw new Error('Invalid Apewisdom API response format');
    }

    // Cache the results
    this.cache.set('all', {
      data: data.results,
      timestamp: Date.now(),
    });

    console.log(`[Reddit/Apewisdom] Fetched ${data.results.length} trending stocks`);

    return data.results;
  }

  /**
   * Convert Apewisdom sentiment (Bullish/Bearish/Neutral) to numeric score
   */
  private convertSentiment(sentiment: 'Bullish' | 'Bearish' | 'Neutral', score: number): number {
    // Apewisdom score is 0-100
    // Convert to -1 (bearish) to +1 (bullish) scale
    if (sentiment === 'Bullish') {
      return (score / 100) * 0.8 + 0.2; // 0.2 to 1.0
    } else if (sentiment === 'Bearish') {
      return -(score / 100) * 0.8 - 0.2; // -0.2 to -1.0
    } else {
      // Neutral: slight bias based on score
      return ((score - 50) / 100) * 0.4; // -0.2 to 0.2
    }
  }

  /**
   * Calculate mention velocity from 24h change
   */
  private calculateVelocity(current: number | string, previous: number | string): number {
    const curr = typeof current === 'string' ? parseInt(current) : current;
    const prev = typeof previous === 'string' ? parseInt(previous) : previous;
    if (prev === 0) return curr > 0 ? 100 : 0;
    return Math.round(((curr - prev) / prev) * 100);
  }

  /**
   * Determine confidence based on mention count
   */
  private calculateConfidence(mentions: number | string): 'low' | 'medium' | 'high' {
    const count = typeof mentions === 'string' ? parseInt(mentions) : mentions;
    if (count >= 100) return 'high';
    if (count >= 50) return 'medium';
    return 'low';
  }

  /**
   * Get comprehensive sentiment analysis for a symbol
   */
  async getSentimentAnalysis(params: RedditSearchParams): Promise<RedditSentiment> {
    const { symbol } = params;

    console.log(`[Reddit/Apewisdom] Analyzing sentiment for ${symbol}`);

    try {
      // Fetch all trending stocks
      const trendingStocks = await this.fetchTrendingStocks();

      // Find our symbol in the results
      const ticker = trendingStocks.find(
        t => t.ticker.toUpperCase() === symbol.toUpperCase()
      );

      if (!ticker) {
        console.log(`[Reddit/Apewisdom] ${symbol} not found in trending stocks (no Reddit activity)`);

        // Return minimal sentiment data
        return {
          symbol,
          timestamp: new Date(),
          sentiment_score: 0,
          mention_count: 0,
          trending_rank: null,
          mention_velocity: 0,
          upvotes: 0,
          confidence: 'low',
        };
      }

      // Convert Apewisdom data to our format
      const sentiment_score = this.convertSentiment(ticker.sentiment, ticker.sentiment_score);
      const mention_velocity = this.calculateVelocity(ticker.mentions, ticker.mentions_24h_ago);
      const confidence = this.calculateConfidence(ticker.mentions);

      // Convert string values to numbers
      const mentions = typeof ticker.mentions === 'string' ? parseInt(ticker.mentions) : ticker.mentions;
      const upvotes = typeof ticker.upvotes === 'string' ? parseInt(ticker.upvotes) : ticker.upvotes;

      return {
        symbol: ticker.ticker,
        timestamp: new Date(),
        sentiment_score,
        mention_count: mentions,
        trending_rank: ticker.rank,
        mention_velocity,
        upvotes: upvotes,
        confidence,
      };
    } catch (error: any) {
      console.error(`[Reddit/Apewisdom] Failed to analyze ${symbol}:`, error.message);

      // Return minimal data on error
      return {
        symbol,
        timestamp: new Date(),
        sentiment_score: 0,
        mention_count: 0,
        trending_rank: null,
        mention_velocity: 0,
        upvotes: 0,
        confidence: 'low',
      };
    }
  }

  /**
   * Batch analysis for multiple symbols (more efficient with caching)
   */
  async batchAnalysis(symbols: string[]): Promise<Record<string, RedditSentiment>> {
    console.log(`[Reddit/Apewisdom] Batch analysis for ${symbols.length} symbols`);

    const results: Record<string, RedditSentiment> = {};

    try {
      // Fetch all trending stocks once
      const trendingStocks = await this.fetchTrendingStocks();

      // Process each symbol
      for (const symbol of symbols) {
        const ticker = trendingStocks.find(
          t => t.ticker.toUpperCase() === symbol.toUpperCase()
        );

        if (ticker) {
          const sentiment_score = this.convertSentiment(ticker.sentiment, ticker.sentiment_score);
          const mention_velocity = this.calculateVelocity(ticker.mentions, ticker.mentions_24h_ago);
          const confidence = this.calculateConfidence(ticker.mentions);

          // Convert string values to numbers
          const mentions = typeof ticker.mentions === 'string' ? parseInt(ticker.mentions) : ticker.mentions;
          const upvotes = typeof ticker.upvotes === 'string' ? parseInt(ticker.upvotes) : ticker.upvotes;

          results[symbol] = {
            symbol: ticker.ticker,
            timestamp: new Date(),
            sentiment_score,
            mention_count: mentions,
            trending_rank: ticker.rank,
            mention_velocity,
            upvotes: upvotes,
            confidence,
          };
        } else {
          // Symbol not trending
          results[symbol] = {
            symbol,
            timestamp: new Date(),
            sentiment_score: 0,
            mention_count: 0,
            trending_rank: null,
            mention_velocity: 0,
            upvotes: 0,
            confidence: 'low',
          };
        }
      }

      console.log(`[Reddit/Apewisdom] Batch analysis complete: ${Object.keys(results).length}/${symbols.length} symbols`);
    } catch (error: any) {
      console.error('[Reddit/Apewisdom] Batch analysis failed:', error.message);

      // Return minimal data for all symbols on error
      for (const symbol of symbols) {
        results[symbol] = {
          symbol,
          timestamp: new Date(),
          sentiment_score: 0,
          mention_count: 0,
          trending_rank: null,
          mention_velocity: 0,
          upvotes: 0,
          confidence: 'low',
        };
      }
    }

    return results;
  }

  /**
   * Clear cache (useful for testing or forcing fresh data)
   */
  clearCache(): void {
    this.cache.clear();
    console.log('[Reddit/Apewisdom] Cache cleared');
  }
}

// Singleton instance
let redditClient: RedditClient | null = null;

export const getRedditClient = (): RedditClient => {
  if (!redditClient) {
    redditClient = new RedditClient();
  }
  return redditClient;
};

export default RedditClient;
