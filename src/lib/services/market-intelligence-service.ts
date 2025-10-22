// Market Intelligence Service
// Queries external database for earnings transcripts, news, and sentiment data
// Provides vector similarity search and context aggregation for trade decisions

import {
  getExternalSupabase,
  EarningsTranscriptEmbedding,
  MarketNewsEmbedding,
  MarketNewsTickerSentiment,
  parseEmbedding,
} from '@/lib/clients/external-supabase';
import { SupabaseClient } from '@supabase/supabase-js';

// ============================================================================
// Types
// ============================================================================

export interface EarningsIntelligence {
  symbol: string;
  transcripts: Array<{
    quarter: string;
    fiscal_year: number;
    fiscal_date_ending: string;
    excerpt: string; // First 500 chars of transcript
    full_text: string;
    similarity?: number; // If query was similarity-based
  }>;
  latest_quarter: {
    quarter: string;
    fiscal_year: number;
    summary: string; // AI-generated summary
  } | null;
}

export interface NewsIntelligence {
  symbol: string;
  articles: Array<{
    title: string;
    summary: string;
    url: string;
    time_published: string;
    source: string;
    sentiment_score: number;
    sentiment_label: string;
    relevance_score: number;
    topics: string[];
    similarity?: number;
  }>;
  aggregate_sentiment: {
    average_score: number;
    label: string; // 'Bullish', 'Neutral', 'Bearish'
    article_count: number;
  };
}

export interface MarketIntelligenceReport {
  symbol: string;
  earnings: EarningsIntelligence | null;
  news: NewsIntelligence | null;
  insider_activity: any | null; // Will integrate with existing insider data later
  confidence: 'high' | 'medium' | 'low';
  data_age_days: number; // How recent is the data?
  sources_available: string[];
}

// ============================================================================
// Main Service Class
// ============================================================================

export class MarketIntelligenceService {
  private externalDb: SupabaseClient;

  constructor() {
    this.externalDb = getExternalSupabase();
  }

  /**
   * Get comprehensive market intelligence for a symbol
   * @param symbol Stock ticker symbol
   * @param options Configuration options
   */
  async getIntelligence(
    symbol: string,
    options: {
      includeEarnings?: boolean;
      includeNews?: boolean;
      maxEarningsQuarters?: number;
      maxNewsArticles?: number;
      newsMaxAgeDays?: number;
    } = {}
  ): Promise<MarketIntelligenceReport> {
    const {
      includeEarnings = true,
      includeNews = true,
      maxEarningsQuarters = 4,
      maxNewsArticles = 20,
      newsMaxAgeDays = 30,
    } = options;

    console.log(`[MarketIntelligence] Fetching intelligence for ${symbol}`);

    const [earnings, news] = await Promise.all([
      includeEarnings
        ? this.getEarningsIntelligence(symbol, maxEarningsQuarters)
        : Promise.resolve(null),
      includeNews
        ? this.getNewsIntelligence(symbol, maxNewsArticles, newsMaxAgeDays)
        : Promise.resolve(null),
    ]);

    // Calculate confidence based on data availability
    const confidence = this.calculateConfidence(earnings, news);

    // Calculate data age
    const dataAgeDays = this.calculateDataAge(earnings, news);

    // Identify available sources
    const sourcesAvailable: string[] = [];
    if (earnings && earnings.transcripts.length > 0) sourcesAvailable.push('earnings_transcripts');
    if (news && news.articles.length > 0) sourcesAvailable.push('market_news');

    return {
      symbol,
      earnings,
      news,
      insider_activity: null, // TODO: Integrate with existing insider data
      confidence,
      data_age_days: dataAgeDays,
      sources_available: sourcesAvailable,
    };
  }

  /**
   * Get earnings transcript intelligence for a symbol
   */
  private async getEarningsIntelligence(
    symbol: string,
    maxQuarters: number
  ): Promise<EarningsIntelligence | null> {
    try {
      console.log(`[MarketIntelligence] Querying earnings transcripts for ${symbol}`);

      const { data, error } = await this.externalDb
        .from('earnings_transcript_embeddings')
        .select('*')
        .eq('symbol', symbol)
        .order('fiscal_year', { ascending: false })
        .order('quarter', { ascending: false })
        .limit(maxQuarters);

      if (error) {
        console.error(`[MarketIntelligence] Error fetching earnings for ${symbol}:`, error);
        return null;
      }

      if (!data || data.length === 0) {
        console.log(`[MarketIntelligence] No earnings transcripts found for ${symbol}`);
        return null;
      }

      console.log(`[MarketIntelligence] Found ${data.length} earnings transcripts for ${symbol}`);

      const transcripts = data.map((t: EarningsTranscriptEmbedding) => ({
        quarter: t.quarter,
        fiscal_year: t.fiscal_year,
        fiscal_date_ending: t.fiscal_date_ending,
        excerpt: t.transcript_text.substring(0, 500) + '...',
        full_text: t.transcript_text,
      }));

      // Get latest quarter summary (will use LLM to generate in future)
      const latestQuarter = data[0]
        ? {
            quarter: data[0].quarter,
            fiscal_year: data[0].fiscal_year,
            summary: data[0].transcript_text.substring(0, 300) + '...', // Placeholder
          }
        : null;

      return {
        symbol,
        transcripts,
        latest_quarter: latestQuarter,
      };
    } catch (error: any) {
      console.error(`[MarketIntelligence] Exception fetching earnings for ${symbol}:`, error);
      return null;
    }
  }

  /**
   * Get news intelligence for a symbol
   */
  private async getNewsIntelligence(
    symbol: string,
    maxArticles: number,
    maxAgeDays: number
  ): Promise<NewsIntelligence | null> {
    try {
      console.log(`[MarketIntelligence] Querying news for ${symbol} (last ${maxAgeDays} days)`);

      // Step 1: Get ticker sentiment records to find relevant article IDs
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - maxAgeDays);

      const { data: sentimentData, error: sentimentError } = await this.externalDb
        .from('market_news_ticker_sentiment')
        .select('article_id, ticker, relevance_score, ticker_sentiment_score, ticker_sentiment_label')
        .eq('ticker', symbol)
        .gte('created_at', cutoffDate.toISOString())
        .order('relevance_score', { ascending: false })
        .limit(maxArticles);

      if (sentimentError) {
        console.error(`[MarketIntelligence] Error fetching sentiment for ${symbol}:`, sentimentError);
        return null;
      }

      if (!sentimentData || sentimentData.length === 0) {
        console.log(`[MarketIntelligence] No news found for ${symbol} in last ${maxAgeDays} days`);
        return null;
      }

      console.log(`[MarketIntelligence] Found ${sentimentData.length} sentiment records for ${symbol}`);

      // Step 2: Fetch full article details for these article IDs
      const articleIds = sentimentData.map((s: MarketNewsTickerSentiment) => s.article_id);

      const { data: articlesData, error: articlesError } = await this.externalDb
        .from('market_news_embeddings')
        .select('*')
        .in('id', articleIds)
        .order('time_published', { ascending: false });

      if (articlesError) {
        console.error(`[MarketIntelligence] Error fetching articles for ${symbol}:`, articlesError);
        return null;
      }

      if (!articlesData || articlesData.length === 0) {
        console.log(`[MarketIntelligence] No articles found for ${symbol}`);
        return null;
      }

      console.log(`[MarketIntelligence] Found ${articlesData.length} articles for ${symbol}`);

      // Step 3: Combine article data with sentiment data
      const articles = articlesData.map((article: MarketNewsEmbedding) => {
        const sentiment = sentimentData.find((s: MarketNewsTickerSentiment) => s.article_id === article.id);

        return {
          title: article.title,
          summary: article.summary,
          url: article.url,
          time_published: article.time_published,
          source: article.source,
          sentiment_score: sentiment?.ticker_sentiment_score || article.overall_sentiment_score,
          sentiment_label: sentiment?.ticker_sentiment_label || article.overall_sentiment_label,
          relevance_score: sentiment?.relevance_score || 0,
          topics: article.topics?.map((t: any) => t.topic) || [],
        };
      });

      // Calculate aggregate sentiment
      const totalSentiment = articles.reduce((sum, a) => sum + a.sentiment_score, 0);
      const avgSentiment = articles.length > 0 ? totalSentiment / articles.length : 0;
      const sentimentLabel =
        avgSentiment > 0.15 ? 'Bullish' :
        avgSentiment < -0.15 ? 'Bearish' :
        'Neutral';

      return {
        symbol,
        articles,
        aggregate_sentiment: {
          average_score: avgSentiment,
          label: sentimentLabel,
          article_count: articles.length,
        },
      };
    } catch (error: any) {
      console.error(`[MarketIntelligence] Exception fetching news for ${symbol}:`, error);
      return null;
    }
  }

  /**
   * Vector similarity search across earnings transcripts
   * @param queryEmbedding The embedding vector to search with
   * @param options Search options
   */
  async searchSimilarTranscripts(
    queryEmbedding: number[],
    options: {
      symbol?: string;
      matchThreshold?: number;
      matchCount?: number;
    } = {}
  ): Promise<Array<EarningsTranscriptEmbedding & { similarity: number }>> {
    const { symbol, matchThreshold = 0.75, matchCount = 5 } = options;

    try {
      // Use RPC function for vector similarity search
      // Note: We'll need to create this function in the external database
      const { data, error } = await this.externalDb.rpc('match_earnings_transcripts', {
        query_embedding: queryEmbedding,
        match_threshold: matchThreshold,
        match_count: matchCount,
        filter_symbol: symbol || null,
      });

      if (error) {
        console.error('[MarketIntelligence] Error searching transcripts:', error);
        return [];
      }

      return data || [];
    } catch (error: any) {
      console.error('[MarketIntelligence] Exception searching transcripts:', error);
      return [];
    }
  }

  /**
   * Vector similarity search across market news
   */
  async searchSimilarNews(
    queryEmbedding: number[],
    options: {
      symbol?: string;
      matchThreshold?: number;
      matchCount?: number;
      maxAgeDays?: number;
    } = {}
  ): Promise<Array<MarketNewsEmbedding & { similarity: number }>> {
    const { symbol, matchThreshold = 0.75, matchCount = 10, maxAgeDays = 30 } = options;

    try {
      // Use RPC function for vector similarity search
      const { data, error } = await this.externalDb.rpc('match_market_news', {
        query_embedding: queryEmbedding,
        match_threshold: matchThreshold,
        match_count: matchCount,
        filter_symbol: symbol || null,
        max_age_days: maxAgeDays,
      });

      if (error) {
        console.error('[MarketIntelligence] Error searching news:', error);
        return [];
      }

      return data || [];
    } catch (error: any) {
      console.error('[MarketIntelligence] Exception searching news:', error);
      return [];
    }
  }

  /**
   * Calculate confidence level based on available data
   */
  private calculateConfidence(
    earnings: EarningsIntelligence | null,
    news: NewsIntelligence | null
  ): 'high' | 'medium' | 'low' {
    let score = 0;

    // Earnings data contribution
    if (earnings && earnings.transcripts.length >= 3) {
      score += 40; // Have 3+ quarters of earnings
    } else if (earnings && earnings.transcripts.length >= 1) {
      score += 20; // Have some earnings
    }

    // News data contribution
    if (news && news.articles.length >= 10) {
      score += 40; // Have 10+ recent articles
    } else if (news && news.articles.length >= 5) {
      score += 20; // Have some news
    }

    // Data recency contribution
    const dataAge = this.calculateDataAge(earnings, news);
    if (dataAge <= 7) {
      score += 20; // Very recent data
    } else if (dataAge <= 30) {
      score += 10; // Reasonably recent
    }

    if (score >= 70) return 'high';
    if (score >= 40) return 'medium';
    return 'low';
  }

  /**
   * Calculate age of most recent data in days
   */
  private calculateDataAge(
    earnings: EarningsIntelligence | null,
    news: NewsIntelligence | null
  ): number {
    const now = Date.now();
    let mostRecentDate: Date | null = null;

    // Check earnings date
    if (earnings && earnings.transcripts.length > 0) {
      const latestEarnings = new Date(earnings.transcripts[0].fiscal_date_ending);
      if (!mostRecentDate || latestEarnings > mostRecentDate) {
        mostRecentDate = latestEarnings;
      }
    }

    // Check news date
    if (news && news.articles.length > 0) {
      const latestNews = new Date(news.articles[0].time_published);
      if (!mostRecentDate || latestNews > mostRecentDate) {
        mostRecentDate = latestNews;
      }
    }

    if (!mostRecentDate) {
      return 999; // No data available
    }

    const ageMs = now - mostRecentDate.getTime();
    return Math.floor(ageMs / (1000 * 60 * 60 * 24));
  }
}

// Singleton instance
let intelligenceService: MarketIntelligenceService | null = null;

export function getMarketIntelligenceService(): MarketIntelligenceService {
  if (!intelligenceService) {
    intelligenceService = new MarketIntelligenceService();
  }
  return intelligenceService;
}
