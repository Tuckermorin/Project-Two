/**
 * Unified Intelligence Service
 *
 * Priority-based data fetching to minimize Tavily credit usage:
 * 1. External Supabase (AI_AGENT database) - FREE, pre-populated
 * 2. Alpha Vantage News & Transcripts - FREE (600 calls/min)
 * 3. Tavily - LAST RESORT (costs credits)
 *
 * This service replaces direct Tavily queries for:
 * - News/Catalysts
 * - Analyst activity
 * - Operational risks
 * - Earnings context
 *
 * Tavily is ONLY used for:
 * - SEC filings (AV doesn't have these)
 * - Emergency fallback when other sources fail
 */

import { getExternalSupabase } from '@/lib/clients/external-supabase';
import { getAlphaVantageClient } from '@/lib/api/alpha-vantage';
import { tavilySearch, TavilySearchOptions } from '@/lib/clients/tavily';

// Reusable article format for consistency
export interface IntelligenceArticle {
  title: string;
  url: string;
  snippet: string;
  publishedAt: string;
  score: number;
  relevance?: number;
  sentiment?: string;
  source: string;
  sourceType: 'external_db' | 'alpha_vantage' | 'tavily';
}

/**
 * Get catalysts (earnings, guidance, product launches)
 * Priority: External DB > Alpha Vantage > Tavily
 */
export async function getCatalysts(
  symbol: string,
  daysBack: number = 7
): Promise<IntelligenceArticle[]> {
  console.log(`[UnifiedIntel] Getting catalysts for ${symbol} (${daysBack} days back)`);

  // Try External Supabase first (free, instant)
  try {
    const externalDB = getExternalSupabase();
    const fromDate = new Date();
    fromDate.setDate(fromDate.getDate() - daysBack);

    // Query market_news_embeddings for catalyst-related news
    const { data: newsData, error: newsError } = await externalDB
      .from('market_news_embeddings')
      .select('*')
      .ilike('content', `%${symbol}%`)
      .or('content.ilike.%earnings%,content.ilike.%guidance%,content.ilike.%product launch%')
      .gte('published_at', fromDate.toISOString())
      .order('published_at', { ascending: false })
      .limit(20);

    if (!newsError && newsData && newsData.length > 0) {
      console.log(`[UnifiedIntel] ✓ Found ${newsData.length} catalysts from External DB (0 credits)`);
      return newsData.map(item => ({
        title: item.title || 'Untitled',
        url: item.url || '',
        snippet: item.content?.substring(0, 200) || '',
        publishedAt: item.published_at || '',
        score: 0.8, // High confidence from curated DB
        source: item.source || 'External DB',
        sourceType: 'external_db' as const
      }));
    }
  } catch (error) {
    console.log(`[UnifiedIntel] External DB failed, trying Alpha Vantage...`, error);
  }

  // Fall back to Alpha Vantage News API
  try {
    const av = getAlphaVantageClient();
    const timeFrom = new Date();
    timeFrom.setDate(timeFrom.getDate() - daysBack);

    const result = await av.getNewsSentiment(symbol, 50, {
      topics: ['earnings', 'ipo', 'mergers_and_acquisitions'],
      time_from: timeFrom.toISOString().split('T')[0] + 'T0000'
    });

    if (result.raw_articles && result.raw_articles.length > 0) {
      console.log(`[UnifiedIntel] ✓ Found ${result.raw_articles.length} catalysts from Alpha Vantage (0 credits)`);
      return result.raw_articles.map(article => ({
        title: article.title,
        url: article.url,
        snippet: article.summary?.substring(0, 200) || '',
        publishedAt: article.time_published,
        score: Math.abs(article.overall_sentiment_score || 0),
        relevance: article.ticker_sentiment?.find((t: any) => t.ticker === symbol.toUpperCase())?.relevance_score,
        sentiment: article.overall_sentiment_label,
        source: article.source,
        sourceType: 'alpha_vantage' as const
      }));
    }
  } catch (error) {
    console.log(`[UnifiedIntel] Alpha Vantage failed, falling back to Tavily...`, error);
  }

  // Last resort: Tavily (costs credits)
  console.warn(`[UnifiedIntel] ⚠️ Using Tavily for catalysts (will cost credits)`);
  const query = `${symbol} (earnings OR guidance OR "product launch" OR announcement)`;
  const result = await tavilySearch(query, {
    topic: 'news',
    search_depth: 'advanced',
    max_results: 10,
    days: daysBack
  });

  return result.results.map(r => ({
    title: r.title,
    url: r.url,
    snippet: r.content?.substring(0, 200) || '',
    publishedAt: r.publishedAt || new Date().toISOString(),
    score: r.score || 0,
    source: new URL(r.url).hostname,
    sourceType: 'tavily' as const
  }));
}

/**
 * Get analyst activity (upgrades, downgrades, price targets)
 * Priority: External DB > Alpha Vantage > Tavily
 */
export async function getAnalystActivity(
  symbol: string,
  daysBack: number = 7
): Promise<IntelligenceArticle[]> {
  console.log(`[UnifiedIntel] Getting analyst activity for ${symbol} (${daysBack} days back)`);

  // Try External Supabase first
  try {
    const externalDB = getExternalSupabase();
    const fromDate = new Date();
    fromDate.setDate(fromDate.getDate() - daysBack);

    const { data: newsData, error: newsError } = await externalDB
      .from('market_news_embeddings')
      .select('*')
      .ilike('content', `%${symbol}%`)
      .or('content.ilike.%analyst%,content.ilike.%price target%,content.ilike.%upgrade%,content.ilike.%downgrade%')
      .gte('published_at', fromDate.toISOString())
      .order('published_at', { ascending: false })
      .limit(20);

    if (!newsError && newsData && newsData.length > 0) {
      console.log(`[UnifiedIntel] ✓ Found ${newsData.length} analyst articles from External DB (0 credits)`);
      return newsData.map(item => ({
        title: item.title || 'Untitled',
        url: item.url || '',
        snippet: item.content?.substring(0, 200) || '',
        publishedAt: item.published_at || '',
        score: 0.8,
        source: item.source || 'External DB',
        sourceType: 'external_db' as const
      }));
    }
  } catch (error) {
    console.log(`[UnifiedIntel] External DB failed, trying Alpha Vantage...`, error);
  }

  // Fall back to Alpha Vantage
  try {
    const av = getAlphaVantageClient();
    const timeFrom = new Date();
    timeFrom.setDate(timeFrom.getDate() - daysBack);

    const result = await av.getNewsSentiment(symbol, 50, {
      topics: ['financial_markets'],
      time_from: timeFrom.toISOString().split('T')[0] + 'T0000'
    });

    // Filter for analyst-specific content
    const analystArticles = result.raw_articles?.filter(article => {
      const text = `${article.title} ${article.summary}`.toLowerCase();
      return text.includes('analyst') ||
             text.includes('price target') ||
             text.includes('upgrade') ||
             text.includes('downgrade') ||
             text.includes('rating');
    }) || [];

    if (analystArticles.length > 0) {
      console.log(`[UnifiedIntel] ✓ Found ${analystArticles.length} analyst articles from Alpha Vantage (0 credits)`);
      return analystArticles.map(article => ({
        title: article.title,
        url: article.url,
        snippet: article.summary?.substring(0, 200) || '',
        publishedAt: article.time_published,
        score: Math.abs(article.overall_sentiment_score || 0),
        relevance: article.ticker_sentiment?.find((t: any) => t.ticker === symbol.toUpperCase())?.relevance_score,
        sentiment: article.overall_sentiment_label,
        source: article.source,
        sourceType: 'alpha_vantage' as const
      }));
    }
  } catch (error) {
    console.log(`[UnifiedIntel] Alpha Vantage failed, falling back to Tavily...`, error);
  }

  // Last resort: Tavily
  console.warn(`[UnifiedIntel] ⚠️ Using Tavily for analyst activity (will cost credits)`);
  const query = `${symbol} (analyst OR "price target" OR upgrade OR downgrade OR rating)`;
  const result = await tavilySearch(query, {
    topic: 'news',
    search_depth: 'advanced',
    max_results: 10,
    days: daysBack
  });

  return result.results.map(r => ({
    title: r.title,
    url: r.url,
    snippet: r.content?.substring(0, 200) || '',
    publishedAt: r.publishedAt || new Date().toISOString(),
    score: r.score || 0,
    source: new URL(r.url).hostname,
    sourceType: 'tavily' as const
  }));
}

/**
 * Get operational risks (supply chain, margins, competition)
 * Priority: Alpha Vantage > Tavily
 */
export async function getOperationalRisks(
  symbol: string,
  daysBack: number = 30
): Promise<IntelligenceArticle[]> {
  console.log(`[UnifiedIntel] Getting operational risks for ${symbol} (${daysBack} days back)`);

  // Try Alpha Vantage first
  try {
    const av = getAlphaVantageClient();
    const timeFrom = new Date();
    timeFrom.setDate(timeFrom.getDate() - daysBack);

    const result = await av.getNewsSentiment(symbol, 100, {
      topics: ['technology', 'manufacturing', 'finance', 'economy_monetary'],
      time_from: timeFrom.toISOString().split('T')[0] + 'T0000'
    });

    // Filter for risk keywords
    const riskArticles = result.raw_articles?.filter(article => {
      const text = `${article.title} ${article.summary}`.toLowerCase();
      return text.includes('supply chain') ||
             text.includes('margin') ||
             text.includes('competition') ||
             text.includes('regulatory') ||
             text.includes('investigation') ||
             text.includes('risk') ||
             text.includes('threat');
    }) || [];

    if (riskArticles.length > 0) {
      console.log(`[UnifiedIntel] ✓ Found ${riskArticles.length} risk articles from Alpha Vantage (0 credits)`);
      return riskArticles.map(article => ({
        title: article.title,
        url: article.url,
        snippet: article.summary?.substring(0, 200) || '',
        publishedAt: article.time_published,
        score: Math.abs(article.overall_sentiment_score || 0),
        relevance: article.ticker_sentiment?.find((t: any) => t.ticker === symbol.toUpperCase())?.relevance_score,
        sentiment: article.overall_sentiment_label,
        source: article.source,
        sourceType: 'alpha_vantage' as const
      }));
    }
  } catch (error) {
    console.log(`[UnifiedIntel] Alpha Vantage failed, falling back to Tavily...`, error);
  }

  // Last resort: Tavily
  console.warn(`[UnifiedIntel] ⚠️ Using Tavily for operational risks (will cost credits)`);
  const query = `${symbol} ("supply chain" OR margin OR competition OR regulatory OR investigation OR threat)`;
  const result = await tavilySearch(query, {
    topic: 'news',
    search_depth: 'advanced',
    max_results: 10,
    days: daysBack
  });

  return result.results.map(r => ({
    title: r.title,
    url: r.url,
    snippet: r.content?.substring(0, 200) || '',
    publishedAt: r.publishedAt || new Date().toISOString(),
    score: r.score || 0,
    source: new URL(r.url).hostname,
    sourceType: 'tavily' as const
  }));
}

/**
 * Get earnings context (transcripts from External DB or Alpha Vantage)
 */
export async function getEarningsContext(
  symbol: string,
  options?: { year?: string; quarter?: string }
): Promise<{ content: string; source: string; sourceType: string }> {
  console.log(`[UnifiedIntel] Getting earnings context for ${symbol}`);

  // Try External Supabase first (pre-populated transcripts)
  try {
    const externalDB = getExternalSupabase();

    let query = externalDB
      .from('earnings_transcript_embeddings')
      .select('*')
      .eq('symbol', symbol.toUpperCase());

    if (options?.year) query = query.eq('year', options.year);
    if (options?.quarter) query = query.eq('quarter', options.quarter);

    const { data, error } = await query
      .order('year', { ascending: false })
      .order('quarter', { ascending: false })
      .limit(1);

    if (!error && data && data.length > 0) {
      console.log(`[UnifiedIntel] ✓ Found earnings transcript from External DB (0 credits)`);
      return {
        content: data[0].content || data[0].transcript || '',
        source: 'External Database',
        sourceType: 'external_db'
      };
    }
  } catch (error) {
    console.log(`[UnifiedIntel] External DB failed, trying Alpha Vantage...`, error);
  }

  // Fall back to Alpha Vantage transcript API
  try {
    const av = getAlphaVantageClient();
    const transcript = await av.getEarningsCallTranscript(symbol, options);

    if (transcript.transcript) {
      console.log(`[UnifiedIntel] ✓ Found earnings transcript from Alpha Vantage (0 credits)`);
      return {
        content: transcript.transcript,
        source: 'Alpha Vantage',
        sourceType: 'alpha_vantage'
      };
    }
  } catch (error) {
    console.log(`[UnifiedIntel] Alpha Vantage transcript failed:`, error);
  }

  return {
    content: '',
    source: 'none',
    sourceType: 'none'
  };
}

/**
 * Get comprehensive intelligence summary
 * Calls all sources and aggregates results
 */
export async function getComprehensiveIntelligence(
  symbol: string,
  daysBack: number = 7
): Promise<{
  catalysts: IntelligenceArticle[];
  analystActivity: IntelligenceArticle[];
  operationalRisks: IntelligenceArticle[];
  earningsContext: { content: string; source: string; sourceType: string };
  summary: {
    totalArticles: number;
    sourceBreakdown: Record<string, number>;
    tavilyCreditsUsed: number;
  };
}> {
  console.log(`[UnifiedIntel] Getting comprehensive intelligence for ${symbol}`);

  const [catalysts, analystActivity, operationalRisks, earningsContext] = await Promise.all([
    getCatalysts(symbol, daysBack),
    getAnalystActivity(symbol, daysBack),
    getOperationalRisks(symbol, 30), // Longer lookback for risks
    getEarningsContext(symbol)
  ]);

  // Calculate source breakdown
  const allArticles = [...catalysts, ...analystActivity, ...operationalRisks];
  const sourceBreakdown: Record<string, number> = {};
  let tavilyCreditsUsed = 0;

  for (const article of allArticles) {
    sourceBreakdown[article.sourceType] = (sourceBreakdown[article.sourceType] || 0) + 1;
    if (article.sourceType === 'tavily') {
      tavilyCreditsUsed += 2; // Estimate 2 credits per Tavily query
    }
  }

  console.log(`[UnifiedIntel] Intelligence summary for ${symbol}:`, {
    totalArticles: allArticles.length,
    sourceBreakdown,
    tavilyCreditsUsed
  });

  return {
    catalysts,
    analystActivity,
    operationalRisks,
    earningsContext,
    summary: {
      totalArticles: allArticles.length,
      sourceBreakdown,
      tavilyCreditsUsed
    }
  };
}
