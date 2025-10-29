/**
 * AlphaVantage News Sentiment API Client
 *
 * Fetches historical and real-time sentiment data for backtesting and AI training
 * Includes caching to minimize API calls (AlphaVantage has rate limits)
 */

import { http } from "./http";
import { createClient } from "@/lib/supabase/server-client";

const API = "https://www.alphavantage.co/query";
const API_KEY = process.env.ALPHA_VANTAGE_API_KEY || process.env.NEXT_PUBLIC_ALPHA_VANTAGE_API_KEY;

// AlphaVantage sentiment labels
export type SentimentLabel =
  | "Bearish"
  | "Somewhat-Bearish"
  | "Neutral"
  | "Somewhat-Bullish"
  | "Bullish";

export interface SentimentArticle {
  title: string;
  url?: string;
  published_at: string;
  summary: string;
  source: string;
  sentiment_score: number; // -1 to 1
  sentiment_label: SentimentLabel;
  relevance_score: number; // 0 to 1
  topics: string[];
}

export interface SentimentData {
  symbol: string;
  analysis_date: Date;
  overall_sentiment_score: number; // -1 (bearish) to 1 (bullish)
  overall_sentiment_label: SentimentLabel;
  article_count: number;
  bullish_articles: number;
  bearish_articles: number;
  neutral_articles: number;
  sentiment_distribution: {
    bullish: number;
    bearish: number;
    neutral: number;
  };
  top_topics: string[];
  news_sources: string[];
  article_summaries: SentimentArticle[];
}

interface AlphaVantageNewsItem {
  title: string;
  url?: string;
  time_published: string;
  summary: string;
  source: string;
  overall_sentiment_score: number;
  overall_sentiment_label: SentimentLabel;
  ticker_sentiment: Array<{
    ticker: string;
    relevance_score: string;
    ticker_sentiment_score: string;
    ticker_sentiment_label: SentimentLabel;
  }>;
  topics?: Array<{
    topic: string;
    relevance_score: string;
  }>;
}

interface AlphaVantageResponse {
  items?: string; // API returns article count as string
  sentiment_score_definition?: string;
  relevance_score_definition?: string;
  feed: AlphaVantageNewsItem[];
}

/**
 * Fetch sentiment data for a symbol on a specific date
 * Checks cache first, then fetches from API if needed
 */
export async function getSentimentForDate(
  symbol: string,
  date: Date,
  useCache = true
): Promise<SentimentData | null> {
  const supabase = await createClient();
  const dateStr = date.toISOString().split('T')[0];

  // Check cache first
  if (useCache) {
    const cached = await getCachedSentiment(symbol, dateStr);
    if (cached) {
      console.log(`[Sentiment] Cache hit for ${symbol} on ${dateStr}`);
      return cached;
    }
  }

  // Fetch from API
  console.log(`[Sentiment] Fetching from AlphaVantage for ${symbol} on ${dateStr}`);

  try {
    const sentimentData = await fetchSentimentFromAPI(symbol, date);

    if (sentimentData) {
      // Cache the result
      await cacheSentiment(sentimentData);
    }

    return sentimentData;
  } catch (error) {
    console.error(`[Sentiment] Error fetching sentiment for ${symbol}:`, error);
    return null;
  }
}

/**
 * Detect AlphaVantage delay based on environment
 */
function getAlphaVantageDelayMs(): number {
  // Check if user has explicitly set the delay (preferred)
  if (process.env.ALPHA_VANTAGE_MIN_DELAY_MS) {
    return parseInt(process.env.ALPHA_VANTAGE_MIN_DELAY_MS, 10);
  }

  // Fallback to tier-based detection
  const tier = process.env.ALPHA_VANTAGE_TIER || 'premium';

  // Delay mapping (with safety buffer):
  // - Free: 5 RPM → 12000ms (12s)
  // - Premium: 75 RPM → 800ms
  // - Enterprise: 600 RPM → 100ms
  const delays = {
    free: 12000,
    premium: 800,
    enterprise: 100,
  };

  return delays[tier as keyof typeof delays] || delays.enterprise;
}

/**
 * Batch fetch sentiment for multiple dates (with rate limiting)
 */
export async function getBatchSentiment(
  symbol: string,
  dates: Date[],
  delayMs = getAlphaVantageDelayMs() // Auto-detect based on tier
): Promise<Map<string, SentimentData>> {
  const results = new Map<string, SentimentData>();

  for (let i = 0; i < dates.length; i++) {
    const date = dates[i];
    const dateStr = date.toISOString().split('T')[0];

    try {
      const sentiment = await getSentimentForDate(symbol, date);
      if (sentiment) {
        results.set(dateStr, sentiment);
      }

      // Rate limiting (skip delay for last item)
      if (i < dates.length - 1) {
        console.log(`[Sentiment] Waiting ${delayMs}ms before next call (rate limit protection)...`);
        await sleep(delayMs);
      }
    } catch (error) {
      console.error(`[Sentiment] Error fetching ${symbol} on ${dateStr}:`, error);
      // Continue with next date
    }
  }

  return results;
}

/**
 * Fetch sentiment from AlphaVantage API
 */
async function fetchSentimentFromAPI(
  symbol: string,
  date: Date
): Promise<SentimentData | null> {
  if (!API_KEY) {
    throw new Error("ALPHA_VANTAGE_API_KEY not configured");
  }

  // AlphaVantage time format: YYYYMMDDTHHMM
  const timeFrom = formatAlphaVantageDate(date, 0, 0); // Start of day
  const timeTo = formatAlphaVantageDate(date, 23, 59); // End of day

  try {
    const response = await http(API, {
      params: {
        function: "NEWS_SENTIMENT",
        tickers: symbol,
        time_from: timeFrom,
        time_to: timeTo,
        limit: 200, // Maximum per request
        sort: "RELEVANCE",
        apikey: API_KEY,
      },
    }) as AlphaVantageResponse;

    if (!response.feed || response.feed.length === 0) {
      console.log(`[Sentiment] No articles found for ${symbol} on ${date.toISOString()}`);
      return null;
    }

    return parseAlphaVantageResponse(response, symbol, date);
  } catch (error) {
    console.error(`[Sentiment] API error:`, error);
    throw error;
  }
}

/**
 * Parse AlphaVantage response into our SentimentData format
 */
function parseAlphaVantageResponse(
  response: AlphaVantageResponse,
  symbol: string,
  date: Date
): SentimentData {
  const articles: SentimentArticle[] = [];
  const sources = new Set<string>();
  const topics = new Set<string>();

  let totalSentiment = 0;
  let bullishCount = 0;
  let bearishCount = 0;
  let neutralCount = 0;

  for (const item of response.feed) {
    // Find ticker-specific sentiment
    const tickerSentiment = item.ticker_sentiment?.find(
      ts => ts.ticker === symbol
    );

    const sentimentScore = tickerSentiment
      ? parseFloat(tickerSentiment.ticker_sentiment_score)
      : item.overall_sentiment_score;

    const sentimentLabel = tickerSentiment
      ? tickerSentiment.ticker_sentiment_label
      : item.overall_sentiment_label;

    const relevanceScore = tickerSentiment
      ? parseFloat(tickerSentiment.relevance_score)
      : 0.5;

    // Categorize sentiment
    if (sentimentLabel.includes("Bullish")) {
      bullishCount++;
    } else if (sentimentLabel.includes("Bearish")) {
      bearishCount++;
    } else {
      neutralCount++;
    }

    totalSentiment += sentimentScore;
    sources.add(item.source);

    // Extract topics
    item.topics?.forEach(t => topics.add(t.topic));

    articles.push({
      title: item.title,
      url: item.url,
      published_at: item.time_published,
      summary: item.summary,
      source: item.source,
      sentiment_score: sentimentScore,
      sentiment_label: sentimentLabel,
      relevance_score: relevanceScore,
      topics: item.topics?.map(t => t.topic) || [],
    });
  }

  const articleCount = articles.length;
  const avgSentiment = articleCount > 0 ? totalSentiment / articleCount : 0;

  return {
    symbol,
    analysis_date: date,
    overall_sentiment_score: avgSentiment,
    overall_sentiment_label: scoreToLabel(avgSentiment),
    article_count: articleCount,
    bullish_articles: bullishCount,
    bearish_articles: bearishCount,
    neutral_articles: neutralCount,
    sentiment_distribution: {
      bullish: articleCount > 0 ? bullishCount / articleCount : 0,
      bearish: articleCount > 0 ? bearishCount / articleCount : 0,
      neutral: articleCount > 0 ? neutralCount / articleCount : 0,
    },
    top_topics: Array.from(topics).slice(0, 10),
    news_sources: Array.from(sources),
    article_summaries: articles.slice(0, 20), // Store top 20 for RAG context
  };
}

/**
 * Convert sentiment score to label
 */
function scoreToLabel(score: number): SentimentLabel {
  if (score >= 0.35) return "Bullish";
  if (score >= 0.15) return "Somewhat-Bullish";
  if (score <= -0.35) return "Bearish";
  if (score <= -0.15) return "Somewhat-Bearish";
  return "Neutral";
}

/**
 * Format date for AlphaVantage API (YYYYMMDDTHHMM)
 */
function formatAlphaVantageDate(date: Date, hour: number, minute: number): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const h = String(hour).padStart(2, '0');
  const m = String(minute).padStart(2, '0');
  return `${year}${month}${day}T${h}${m}`;
}

/**
 * Get cached sentiment from database
 */
async function getCachedSentiment(
  symbol: string,
  dateStr: string
): Promise<SentimentData | null> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("historical_sentiment_cache")
    .select("*")
    .eq("symbol", symbol)
    .eq("analysis_date", dateStr)
    .single();

  if (error || !data) {
    return null;
  }

  return {
    symbol: data.symbol,
    analysis_date: new Date(data.analysis_date),
    overall_sentiment_score: data.overall_sentiment_score,
    overall_sentiment_label: data.overall_sentiment_label as SentimentLabel,
    article_count: data.article_count,
    bullish_articles: data.bullish_articles,
    bearish_articles: data.bearish_articles,
    neutral_articles: data.neutral_articles,
    sentiment_distribution: data.sentiment_distribution,
    top_topics: data.top_topics,
    news_sources: data.news_sources,
    article_summaries: data.article_summaries,
  };
}

/**
 * Cache sentiment data to database
 */
async function cacheSentiment(sentiment: SentimentData): Promise<void> {
  const supabase = await createClient();
  const dateStr = sentiment.analysis_date.toISOString().split('T')[0];

  const { error } = await supabase
    .from("historical_sentiment_cache")
    .upsert({
      symbol: sentiment.symbol,
      analysis_date: dateStr,
      overall_sentiment_score: sentiment.overall_sentiment_score,
      overall_sentiment_label: sentiment.overall_sentiment_label,
      article_count: sentiment.article_count,
      bullish_articles: sentiment.bullish_articles,
      bearish_articles: sentiment.bearish_articles,
      neutral_articles: sentiment.neutral_articles,
      sentiment_distribution: sentiment.sentiment_distribution,
      top_topics: sentiment.top_topics,
      news_sources: sentiment.news_sources,
      article_summaries: sentiment.article_summaries,
      fetched_at: new Date().toISOString(),
    }, {
      onConflict: "symbol,analysis_date"
    });

  if (error) {
    console.error("[Sentiment] Error caching sentiment:", error);
  }
}

/**
 * Utility: Sleep for rate limiting
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Pre-warm sentiment cache for a symbol and date range
 * Useful for preparing data before backtesting
 */
export async function prefetchSentimentRange(
  symbol: string,
  startDate: Date,
  endDate: Date,
  delayMs = getAlphaVantageDelayMs()
): Promise<void> {
  console.log(`[Sentiment] Pre-fetching sentiment for ${symbol} from ${startDate.toISOString()} to ${endDate.toISOString()}`);

  const dates: Date[] = [];
  const current = new Date(startDate);

  while (current <= endDate) {
    dates.push(new Date(current));
    current.setDate(current.getDate() + 1);
  }

  console.log(`[Sentiment] Total dates to fetch: ${dates.length}`);

  await getBatchSentiment(symbol, dates, delayMs);

  console.log(`[Sentiment] Pre-fetch complete for ${symbol}`);
}
