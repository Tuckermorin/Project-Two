// src/lib/services/daily-market-context-service.ts
// Service to capture and analyze daily economic/political news for RAG-enhanced trading

import { createClient } from '@supabase/supabase-js';
import { tavilySearch } from '@/lib/clients/tavily';
import { OpenAI } from 'openai';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
});

// ============================================================================
// Types
// ============================================================================

export interface DailyMarketContext {
  as_of_date: string;
  summary: string;
  key_themes: {
    themes: string[];
  };
  overall_market_sentiment: 'bullish' | 'bearish' | 'neutral' | 'mixed';
  sentiment_score: number;
  economic_indicators?: Record<string, string>;
  political_events?: Array<{ event: string; impact: string }>;
  sector_themes?: Record<string, string>;
  source_count: number;
  source_urls: string[];
  source_domains: string[];
  search_queries: string[];
  embedding?: number[];
  generated_by: string;
  generation_cost_cents?: number;
  processing_time_seconds?: number;
}

interface NewsArticle {
  title: string;
  url: string;
  snippet: string;
  publishedAt?: string;
  source?: string;
}

// ============================================================================
// Main Service
// ============================================================================

export class DailyMarketContextService {
  /**
   * Generate daily market context summary using Tavily + GPT-4
   * This is the main entry point called by the EOD job
   */
  async generateDailyContext(
    asOfDate: string = new Date().toISOString().split('T')[0]
  ): Promise<DailyMarketContext | null> {
    const startTime = Date.now();
    console.log(`[Market Context] Generating context for ${asOfDate}`);

    try {
      // Step 1: Check if context already exists for this date
      const existing = await this.getExistingContext(asOfDate);
      if (existing) {
        console.log(`[Market Context] Context already exists for ${asOfDate}, skipping`);
        return existing;
      }

      // Step 2: Gather news from multiple economic/political topics
      const articles = await this.gatherNews();
      console.log(`[Market Context] Gathered ${articles.length} articles`);

      if (articles.length === 0) {
        console.warn('[Market Context] No articles found, skipping context generation');
        return null;
      }

      // Step 3: Generate AI summary and analysis
      const analysis = await this.analyzeNews(articles);
      console.log('[Market Context] AI analysis complete');

      // Step 4: Generate embedding for RAG retrieval
      const embedding = await this.generateEmbedding(analysis.summary);
      console.log('[Market Context] Generated embedding');

      // Step 5: Build context object
      const context: DailyMarketContext = {
        as_of_date: asOfDate,
        summary: analysis.summary,
        key_themes: { themes: analysis.key_themes },
        overall_market_sentiment: analysis.overall_sentiment,
        sentiment_score: analysis.sentiment_score,
        economic_indicators: analysis.economic_indicators,
        political_events: analysis.political_events,
        sector_themes: analysis.sector_themes,
        source_count: articles.length,
        source_urls: articles.map(a => a.url),
        source_domains: this.extractDomains(articles),
        search_queries: this.getSearchQueries(),
        embedding,
        generated_by: 'tavily-gpt4',
        processing_time_seconds: (Date.now() - startTime) / 1000,
      };

      // Step 6: Store in database
      await this.storeContext(context);
      console.log(`[Market Context] Stored context for ${asOfDate}`);

      return context;
    } catch (error) {
      console.error('[Market Context] Failed to generate context:', error);
      throw error;
    }
  }

  /**
   * Gather news articles from Tavily on economic/political topics
   */
  private async gatherNews(): Promise<NewsArticle[]> {
    const queries = this.getSearchQueries();
    const allArticles: NewsArticle[] = [];

    // Use Tavily's news search with 1-day recency
    for (const query of queries) {
      try {
        const result = await tavilySearch(query, {
          topic: 'news',
          days: 1,  // Last 24 hours
          search_depth: 'advanced',  // Better quality snippets (2 credits vs 1)
          max_results: 5,
          include_domains: this.getTrustedNewsDomains(),
        });

        if (result.results && result.results.length > 0) {
          allArticles.push(
            ...result.results.map(r => ({
              title: r.title,
              url: r.url,
              snippet: r.snippet,
              publishedAt: r.publishedAt,
              source: this.extractDomain(r.url),
            }))
          );
        }
      } catch (error) {
        console.error(`[Market Context] Failed to search "${query}":`, error);
        // Continue with other queries
      }
    }

    // Deduplicate by URL
    const uniqueArticles = Array.from(
      new Map(allArticles.map(a => [a.url, a])).values()
    );

    return uniqueArticles;
  }

  /**
   * Analyze news articles using GPT-4 to generate comprehensive summary
   */
  private async analyzeNews(articles: NewsArticle[]): Promise<{
    summary: string;
    key_themes: string[];
    overall_sentiment: 'bullish' | 'bearish' | 'neutral' | 'mixed';
    sentiment_score: number;
    economic_indicators?: Record<string, string>;
    political_events?: Array<{ event: string; impact: string }>;
    sector_themes?: Record<string, string>;
  }> {
    // Prepare articles for GPT
    const articlesText = articles
      .map((a, i) => `${i + 1}. [${a.source}] ${a.title}\n   ${a.snippet}`)
      .join('\n\n');

    const prompt = `You are an expert financial analyst. Analyze today's economic and political news and provide a comprehensive summary for options traders.

NEWS ARTICLES (${articles.length} articles):
${articlesText}

Provide your analysis in the following JSON format:
{
  "summary": "A comprehensive 3-4 paragraph summary of the day's economic and political news, focusing on market implications. Include key data points, policy changes, geopolitical events, and their potential impact on different sectors.",

  "key_themes": ["theme1", "theme2", "theme3"],  // 3-5 major themes (e.g., "Fed rate policy", "Tech sector earnings", "Inflation concerns")

  "overall_sentiment": "bullish|bearish|neutral|mixed",

  "sentiment_score": 0.0,  // -1.0 (very bearish) to +1.0 (very bullish)

  "economic_indicators": {
    // Extract any specific economic data mentioned
    "inflation": "2.7%",
    "unemployment": "3.8%",
    // etc.
  },

  "political_events": [
    {
      "event": "Brief description of political/regulatory event",
      "impact": "Potential market impact (e.g., 'Positive for energy sector', 'Negative for tech regulations')"
    }
  ],

  "sector_themes": {
    "technology": "Brief theme for tech sector",
    "financials": "Brief theme for financial sector",
    "energy": "Brief theme for energy sector",
    // Only include sectors with significant news
  }
}

IMPORTANT:
- Focus on information relevant to options trading decisions
- Highlight volatility catalysts
- Note any sector rotation signals
- Identify risk events on the horizon
- Be objective and data-driven
- Return ONLY valid JSON, no markdown formatting`;

    try {
      const completion = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.3,  // Lower temperature for more consistent output
        max_tokens: 2000,
      });

      const content = completion.choices[0]?.message?.content;
      if (!content) {
        throw new Error('No response from GPT-4');
      }

      // Parse JSON response
      const analysis = JSON.parse(content);

      // Validate required fields
      if (!analysis.summary || !analysis.key_themes || !analysis.overall_sentiment) {
        throw new Error('Invalid analysis format from GPT-4');
      }

      return analysis;
    } catch (error) {
      console.error('[Market Context] Failed to analyze news with GPT-4:', error);

      // Fallback: basic analysis
      return {
        summary: this.generateFallbackSummary(articles),
        key_themes: this.extractBasicThemes(articles),
        overall_sentiment: 'neutral',
        sentiment_score: 0,
      };
    }
  }

  /**
   * Generate embedding for the summary text (for RAG retrieval)
   */
  private async generateEmbedding(text: string): Promise<number[]> {
    try {
      const response = await openai.embeddings.create({
        model: 'text-embedding-ada-002',
        input: text,
      });

      return response.data[0].embedding;
    } catch (error) {
      console.error('[Market Context] Failed to generate embedding:', error);
      throw error;
    }
  }

  /**
   * Store context in database
   */
  private async storeContext(context: DailyMarketContext): Promise<void> {
    const { error } = await supabase.from('daily_market_context').insert({
      as_of_date: context.as_of_date,
      summary: context.summary,
      key_themes: context.key_themes,
      overall_market_sentiment: context.overall_market_sentiment,
      sentiment_score: context.sentiment_score,
      economic_indicators: context.economic_indicators || null,
      political_events: context.political_events || null,
      sector_themes: context.sector_themes || null,
      source_count: context.source_count,
      source_urls: context.source_urls,
      source_domains: context.source_domains,
      search_queries: context.search_queries,
      embedding: context.embedding ? `[${context.embedding.join(',')}]` : null,
      generated_by: context.generated_by,
      processing_time_seconds: context.processing_time_seconds,
    });

    if (error) {
      console.error('[Market Context] Failed to store context:', error);
      throw error;
    }
  }

  /**
   * Get existing context for a date
   */
  private async getExistingContext(asOfDate: string): Promise<DailyMarketContext | null> {
    const { data, error } = await supabase
      .from('daily_market_context')
      .select('*')
      .eq('as_of_date', asOfDate)
      .single();

    if (error || !data) {
      return null;
    }

    return data as unknown as DailyMarketContext;
  }

  /**
   * Get recent market context (for RAG augmentation)
   */
  async getRecentContext(days: number = 7): Promise<DailyMarketContext[]> {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const { data, error } = await supabase
      .from('daily_market_context')
      .select('*')
      .gte('as_of_date', startDate.toISOString().split('T')[0])
      .order('as_of_date', { ascending: false });

    if (error || !data) {
      console.error('[Market Context] Failed to fetch recent context:', error);
      return [];
    }

    return data as unknown as DailyMarketContext[];
  }

  /**
   * Search for similar historical context using vector similarity
   */
  async searchSimilarContext(
    query: string,
    limit: number = 5
  ): Promise<DailyMarketContext[]> {
    try {
      // Generate embedding for query
      const queryEmbedding = await this.generateEmbedding(query);

      // Use Supabase vector search
      const { data, error } = await supabase.rpc('match_market_context', {
        query_embedding: `[${queryEmbedding.join(',')}]`,
        match_threshold: 0.7,
        match_count: limit,
      });

      if (error) {
        console.error('[Market Context] Vector search failed:', error);
        return [];
      }

      return (data || []) as DailyMarketContext[];
    } catch (error) {
      console.error('[Market Context] Failed to search similar context:', error);
      return [];
    }
  }

  // ============================================================================
  // Helper Methods
  // ============================================================================

  /**
   * Get search queries for Tavily
   */
  private getSearchQueries(): string[] {
    return [
      'Federal Reserve interest rates monetary policy',
      'inflation CPI consumer prices economic data',
      'US jobs report employment unemployment',
      'stock market volatility VIX trading',
      'economic recession GDP growth forecast',
      'geopolitical events international trade tensions',
      'US political news regulation policy changes',
      'technology sector earnings tech stocks',
      'energy sector oil prices commodities',
      'financial sector banking earnings',
    ];
  }

  /**
   * Get trusted news domains for filtering
   */
  private getTrustedNewsDomains(): string[] {
    return [
      'reuters.com',
      'bloomberg.com',
      'wsj.com',
      'ft.com',
      'cnbc.com',
      'marketwatch.com',
      'barrons.com',
      'investing.com',
      'seekingalpha.com',
      'yahoo.com',
    ];
  }

  /**
   * Extract domain from URL
   */
  private extractDomain(url: string): string {
    try {
      return new URL(url).hostname.replace('www.', '');
    } catch {
      return 'unknown';
    }
  }

  /**
   * Extract unique domains from articles
   */
  private extractDomains(articles: NewsArticle[]): string[] {
    const domains = new Set(articles.map(a => this.extractDomain(a.url)));
    return Array.from(domains);
  }

  /**
   * Fallback summary generation (if GPT-4 fails)
   */
  private generateFallbackSummary(articles: NewsArticle[]): string {
    const topArticles = articles.slice(0, 5);
    return `Market Summary: Analysis of ${articles.length} articles covering economic and political developments. Key headlines include: ${topArticles.map(a => a.title).join('; ')}. Full AI analysis unavailable.`;
  }

  /**
   * Extract basic themes from article titles (fallback)
   */
  private extractBasicThemes(articles: NewsArticle[]): string[] {
    const themes = new Set<string>();
    const keywords = ['inflation', 'rate', 'fed', 'jobs', 'earnings', 'gdp', 'recession', 'trade'];

    articles.forEach(article => {
      const text = (article.title + ' ' + article.snippet).toLowerCase();
      keywords.forEach(keyword => {
        if (text.includes(keyword)) {
          themes.add(keyword);
        }
      });
    });

    return Array.from(themes).slice(0, 5);
  }
}

// ============================================================================
// Singleton
// ============================================================================

let serviceInstance: DailyMarketContextService;

export const getDailyMarketContextService = (): DailyMarketContextService => {
  if (!serviceInstance) {
    serviceInstance = new DailyMarketContextService();
  }
  return serviceInstance;
};
