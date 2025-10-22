// Multi-Source RAG Orchestrator
// Intelligently combines data from multiple sources:
// 1. Internal RAG (trade_embeddings - historical trade patterns)
// 2. External Market Intelligence (earnings transcripts, news, sentiment)
// 3. Tavily (real-time web search)
//
// Prioritizes sources based on:
// - Data freshness
// - Relevance to query
// - Cost (prefer cached/free sources)
// - Confidence scores

import { findSimilarTrades, analyzeHistoricalPerformance } from "./rag-embeddings";
import {
  getMarketIntelligenceService,
  type MarketIntelligenceReport,
  type EarningsIntelligence,
  type NewsIntelligence,
} from "@/lib/services/market-intelligence-service";
import {
  intelligentResearch,
  type IntelligentResearchResult,
  type QueryRouterOptions,
} from "./rag-router";

// ============================================================================
// Types
// ============================================================================

export interface MultiSourceQuery {
  symbol: string;
  context?: string; // Optional context for query
  includeInternalRAG?: boolean; // Default: true
  includeExternalIntelligence?: boolean; // Default: true
  includeTavily?: boolean; // Default: false (cost-conscious)
  maxNewsArticles?: number; // Default: 20
  maxEarningsQuarters?: number; // Default: 4
  newsMaxAgeDays?: number; // Default: 30
}

export interface MultiSourceResult {
  symbol: string;
  confidence: 'high' | 'medium' | 'low';
  data_sources_used: string[];
  total_fetch_time_ms: number;
  credits_used: number;

  // Internal RAG results
  internal_rag: {
    has_data: boolean;
    similar_trades_count: number;
    win_rate?: number;
    avg_roi?: number;
    insights?: any[];
  };

  // External market intelligence
  external_intelligence: {
    has_data: boolean;
    earnings?: EarningsIntelligence;
    news?: NewsIntelligence;
    confidence: 'high' | 'medium' | 'low';
    data_age_days: number;
  };

  // Tavily results (if included)
  tavily: {
    has_data: boolean;
    results_count: number;
    results?: any[];
  };

  // Aggregated insights
  aggregate: {
    overall_sentiment: 'bullish' | 'neutral' | 'bearish' | 'unknown';
    sentiment_score: number; // -1 to +1
    data_quality_score: number; // 0-100
    recommendation_strength: 'strong' | 'moderate' | 'weak';
  };
}

// ============================================================================
// Main Orchestrator Function
// ============================================================================

/**
 * Query multiple data sources and combine results intelligently
 */
export async function queryMultiSource(
  query: MultiSourceQuery
): Promise<MultiSourceResult> {
  const startTime = Date.now();
  const {
    symbol,
    context = 'general',
    includeInternalRAG = true,
    includeExternalIntelligence = true,
    includeTavily = false,
    maxNewsArticles = 20,
    maxEarningsQuarters = 4,
    newsMaxAgeDays = 30,
  } = query;

  console.log(`[MultiSourceRAG] Orchestrating query for ${symbol} (context: ${context})`);

  const sourcesUsed: string[] = [];
  let totalCredits = 0;

  // Parallel fetch from all sources
  const [internalRAG, externalIntel, tavilyResults] = await Promise.all([
    includeInternalRAG ? queryInternalRAG(symbol) : Promise.resolve(null),
    includeExternalIntelligence
      ? queryExternalIntelligence(symbol, maxNewsArticles, maxEarningsQuarters, newsMaxAgeDays)
      : Promise.resolve(null),
    includeTavily
      ? intelligentResearch(symbol, context, {
          forceRefresh: false,
          enableHybrid: false,
        })
      : Promise.resolve(null),
  ]);

  // Track sources used
  if (internalRAG?.has_data) sourcesUsed.push('internal_rag');
  if (externalIntel?.has_data) sourcesUsed.push('external_intelligence');
  if (tavilyResults?.tavily_results_count > 0) {
    sourcesUsed.push('tavily');
    totalCredits += tavilyResults.credits_used;
  }

  // Calculate aggregate insights
  const aggregate = calculateAggregateInsights(internalRAG, externalIntel, tavilyResults);

  // Calculate overall confidence
  const confidence = calculateOverallConfidence(internalRAG, externalIntel, tavilyResults);

  const fetchTime = Date.now() - startTime;

  console.log(
    `[MultiSourceRAG] Complete: ${sourcesUsed.length} sources, ${fetchTime}ms, ${totalCredits} credits`
  );

  return {
    symbol,
    confidence,
    data_sources_used: sourcesUsed,
    total_fetch_time_ms: fetchTime,
    credits_used: totalCredits,

    internal_rag: {
      has_data: internalRAG?.has_data || false,
      similar_trades_count: internalRAG?.similar_trades_count || 0,
      win_rate: internalRAG?.win_rate,
      avg_roi: internalRAG?.avg_roi,
      insights: internalRAG?.insights,
    },

    external_intelligence: {
      has_data: externalIntel?.has_data || false,
      earnings: externalIntel?.earnings || undefined,
      news: externalIntel?.news || undefined,
      confidence: externalIntel?.confidence || 'low',
      data_age_days: externalIntel?.data_age_days || 999,
    },

    tavily: {
      has_data: tavilyResults?.tavily_results_count > 0 || false,
      results_count: tavilyResults?.tavily_results_count || 0,
      results: tavilyResults?.data?.results || [],
    },

    aggregate,
  };
}

// ============================================================================
// Internal RAG Query
// ============================================================================

interface InternalRAGResult {
  has_data: boolean;
  similar_trades_count: number;
  win_rate?: number;
  avg_roi?: number;
  insights?: any[];
}

async function queryInternalRAG(symbol: string): Promise<InternalRAGResult> {
  try {
    console.log(`[MultiSourceRAG] Querying internal RAG for ${symbol}`);

    // Use existing RAG embeddings function
    const historicalPerformance = await analyzeHistoricalPerformance({
      symbol,
      strategy_type: 'put_credit_spread', // Default strategy
      dte: 30,
      delta: 0.20,
    });

    if (!historicalPerformance.has_data) {
      console.log(`[MultiSourceRAG] No internal RAG data for ${symbol}`);
      return {
        has_data: false,
        similar_trades_count: 0,
      };
    }

    console.log(
      `[MultiSourceRAG] Found ${historicalPerformance.trade_count} similar trades for ${symbol}`
    );

    return {
      has_data: true,
      similar_trades_count: historicalPerformance.trade_count,
      win_rate: historicalPerformance.win_rate,
      avg_roi: historicalPerformance.avg_roi,
      insights: historicalPerformance.similar_trades || [],
    };
  } catch (error: any) {
    console.error(`[MultiSourceRAG] Error querying internal RAG:`, error);
    return {
      has_data: false,
      similar_trades_count: 0,
    };
  }
}

// ============================================================================
// External Intelligence Query
// ============================================================================

interface ExternalIntelResult {
  has_data: boolean;
  earnings?: EarningsIntelligence;
  news?: NewsIntelligence;
  confidence: 'high' | 'medium' | 'low';
  data_age_days: number;
}

async function queryExternalIntelligence(
  symbol: string,
  maxNewsArticles: number,
  maxEarningsQuarters: number,
  newsMaxAgeDays: number
): Promise<ExternalIntelResult> {
  try {
    console.log(`[MultiSourceRAG] Querying external intelligence for ${symbol}`);

    const service = getMarketIntelligenceService();
    const intel = await service.getIntelligence(symbol, {
      includeEarnings: true,
      includeNews: true,
      maxEarningsQuarters,
      maxNewsArticles,
      newsMaxAgeDays,
    });

    if (intel.sources_available.length === 0) {
      console.log(`[MultiSourceRAG] No external intelligence for ${symbol}`);
      return {
        has_data: false,
        confidence: 'low',
        data_age_days: 999,
      };
    }

    console.log(
      `[MultiSourceRAG] External intelligence: ${intel.sources_available.join(', ')} (confidence: ${intel.confidence})`
    );

    return {
      has_data: true,
      earnings: intel.earnings || undefined,
      news: intel.news || undefined,
      confidence: intel.confidence,
      data_age_days: intel.data_age_days,
    };
  } catch (error: any) {
    console.error(`[MultiSourceRAG] Error querying external intelligence:`, error);
    return {
      has_data: false,
      confidence: 'low',
      data_age_days: 999,
    };
  }
}

// ============================================================================
// Aggregate Insights Calculation
// ============================================================================

function calculateAggregateInsights(
  internalRAG: InternalRAGResult | null,
  externalIntel: ExternalIntelResult | null,
  tavilyResults: IntelligentResearchResult | null
): MultiSourceResult['aggregate'] {
  let sentimentScore = 0;
  let sentimentCount = 0;
  let dataQualityScore = 0;

  // Factor in internal RAG
  if (internalRAG?.has_data && internalRAG.win_rate !== undefined) {
    // Convert win rate to sentiment: >60% = bullish, <40% = bearish
    if (internalRAG.win_rate > 0.6) {
      sentimentScore += 0.5;
      sentimentCount++;
    } else if (internalRAG.win_rate < 0.4) {
      sentimentScore -= 0.5;
      sentimentCount++;
    }
    dataQualityScore += 30; // Internal RAG is valuable
  }

  // Factor in external news sentiment
  if (externalIntel?.has_data && externalIntel.news) {
    const newsScore = externalIntel.news.aggregate_sentiment.average_score;
    sentimentScore += newsScore;
    sentimentCount++;
    dataQualityScore += 40; // News is very valuable
  }

  // Factor in earnings data
  if (externalIntel?.has_data && externalIntel.earnings) {
    dataQualityScore += 30; // Earnings transcripts are valuable
  }

  // Average sentiment score
  const avgSentiment = sentimentCount > 0 ? sentimentScore / sentimentCount : 0;

  // Determine overall sentiment label
  let overallSentiment: 'bullish' | 'neutral' | 'bearish' | 'unknown';
  if (sentimentCount === 0) {
    overallSentiment = 'unknown';
  } else if (avgSentiment > 0.15) {
    overallSentiment = 'bullish';
  } else if (avgSentiment < -0.15) {
    overallSentiment = 'bearish';
  } else {
    overallSentiment = 'neutral';
  }

  // Determine recommendation strength
  let recommendationStrength: 'strong' | 'moderate' | 'weak';
  if (dataQualityScore >= 70 && Math.abs(avgSentiment) > 0.3) {
    recommendationStrength = 'strong';
  } else if (dataQualityScore >= 40 && Math.abs(avgSentiment) > 0.15) {
    recommendationStrength = 'moderate';
  } else {
    recommendationStrength = 'weak';
  }

  return {
    overall_sentiment: overallSentiment,
    sentiment_score: avgSentiment,
    data_quality_score: dataQualityScore,
    recommendation_strength: recommendationStrength,
  };
}

// ============================================================================
// Overall Confidence Calculation
// ============================================================================

function calculateOverallConfidence(
  internalRAG: InternalRAGResult | null,
  externalIntel: ExternalIntelResult | null,
  tavilyResults: IntelligentResearchResult | null
): 'high' | 'medium' | 'low' {
  let confidenceScore = 0;

  // Internal RAG contribution
  if (internalRAG?.has_data) {
    if (internalRAG.similar_trades_count >= 10) {
      confidenceScore += 30;
    } else if (internalRAG.similar_trades_count >= 3) {
      confidenceScore += 15;
    }
  }

  // External intelligence contribution
  if (externalIntel?.has_data) {
    if (externalIntel.confidence === 'high') {
      confidenceScore += 40;
    } else if (externalIntel.confidence === 'medium') {
      confidenceScore += 20;
    }
  }

  // Tavily contribution
  if (tavilyResults && tavilyResults.tavily_results_count > 0) {
    confidenceScore += 15;
  }

  // Recency bonus
  if (externalIntel && externalIntel.data_age_days <= 7) {
    confidenceScore += 15;
  }

  // Determine final confidence
  if (confidenceScore >= 70) return 'high';
  if (confidenceScore >= 40) return 'medium';
  return 'low';
}

// ============================================================================
// Batch Multi-Source Query
// ============================================================================

/**
 * Query multiple symbols efficiently with multi-source data
 */
export async function batchQueryMultiSource(
  queries: MultiSourceQuery[]
): Promise<Record<string, MultiSourceResult>> {
  console.log(`[MultiSourceRAG] Batch querying ${queries.length} symbols`);

  const results = await Promise.all(queries.map((query) => queryMultiSource(query)));

  const resultMap: Record<string, MultiSourceResult> = {};
  results.forEach((result) => {
    resultMap[result.symbol] = result;
  });

  const totalCredits = results.reduce((sum, r) => sum + r.credits_used, 0);
  const avgFetchTime =
    results.reduce((sum, r) => sum + r.total_fetch_time_ms, 0) / results.length;

  console.log(
    `[MultiSourceRAG] Batch complete: ${totalCredits} credits, ${avgFetchTime.toFixed(0)}ms avg`
  );

  return resultMap;
}

// ============================================================================
// Utility: Source Priority Ranking
// ============================================================================

/**
 * Rank sources by priority for a given query
 * Returns ordered list of sources to query
 */
export function rankSourcePriority(
  queryType: 'earnings' | 'news' | 'historical' | 'general'
): string[] {
  switch (queryType) {
    case 'earnings':
      return ['external_intelligence', 'tavily', 'internal_rag'];
    case 'news':
      return ['external_intelligence', 'tavily'];
    case 'historical':
      return ['internal_rag', 'external_intelligence'];
    case 'general':
    default:
      return ['internal_rag', 'external_intelligence', 'tavily'];
  }
}
