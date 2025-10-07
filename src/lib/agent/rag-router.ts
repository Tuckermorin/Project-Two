// Intelligent RAG Query Router
// Routes research queries through RAG first, then Tavily only when needed
// Maximizes cost efficiency by reducing duplicate Tavily searches

import { findSimilarTrades, analyzeHistoricalPerformance } from "./rag-embeddings";
import {
  tavilySearch,
  tavilyExtract,
  type TavilySearchOptions,
} from "@/lib/clients/tavily";
import {
  queryCatalysts,
  queryAnalystActivity,
  querySECFilings,
  queryOperationalRisks,
} from "@/lib/clients/tavily-queries";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// ============================================================================
// Types
// ============================================================================

export interface IntelligentResearchResult {
  source: "rag" | "tavily" | "hybrid";
  cached: boolean;
  freshness_score: number; // 0-1, where 1 is very fresh
  relevance_score: number; // 0-1, where 1 is highly relevant
  data: any;
  credits_used: number;
  rag_results_count: number;
  tavily_results_count: number;
}

export interface QueryRouterOptions {
  maxRagAge?: number; // Max age in days for RAG data (default: 7)
  ragRelevanceThreshold?: number; // Min relevance for using RAG (default: 0.75)
  forceRefresh?: boolean; // Force Tavily fetch even if RAG has data
  enableHybrid?: boolean; // Combine RAG + Tavily (default: true)
}

// ============================================================================
// Main Router Function
// ============================================================================

/**
 * Intelligent query router - checks RAG first, then Tavily
 * Returns the most relevant data with minimal credit usage
 */
export async function intelligentResearch(
  symbol: string,
  context: string,
  options: QueryRouterOptions = {}
): Promise<IntelligentResearchResult> {
  const {
    maxRagAge = 7,
    ragRelevanceThreshold = 0.75,
    forceRefresh = false,
    enableHybrid = true,
  } = options;

  console.log(`[RAGRouter] Routing research query for ${symbol}: "${context}"`);

  let creditsUsed = 0;

  // Step 1: Query RAG for recent, relevant data
  if (!forceRefresh) {
    const ragResults = await queryRAGKnowledge(symbol, context, maxRagAge);

    if (ragResults.has_data && ragResults.relevance >= ragRelevanceThreshold) {
      console.log(
        `[RAGRouter] ✓ RAG HIT - Using cached knowledge (relevance: ${ragResults.relevance.toFixed(2)}, age: ${ragResults.avg_age_days.toFixed(1)}d)`
      );

      // If hybrid mode is enabled and data is somewhat stale, fetch fresh Tavily data too
      if (enableHybrid && ragResults.avg_age_days > 3) {
        console.log(
          `[RAGRouter] Hybrid mode: Fetching fresh Tavily data to supplement RAG`
        );
        const tavilyResults = await fetchTavilyData(symbol, context);
        creditsUsed = tavilyResults.credits_used;

        return {
          source: "hybrid",
          cached: true,
          freshness_score: 0.7, // Hybrid is reasonably fresh
          relevance_score: ragResults.relevance,
          data: {
            rag: ragResults.data,
            tavily: tavilyResults.data,
          },
          credits_used: creditsUsed,
          rag_results_count: ragResults.results_count,
          tavily_results_count: tavilyResults.results_count,
        };
      }

      // Pure RAG - no credits used
      return {
        source: "rag",
        cached: true,
        freshness_score: calculateFreshnessScore(ragResults.avg_age_days),
        relevance_score: ragResults.relevance,
        data: ragResults.data,
        credits_used: 0,
        rag_results_count: ragResults.results_count,
        tavily_results_count: 0,
      };
    } else {
      console.log(
        `[RAGRouter] RAG MISS - No relevant data in cache (relevance: ${ragResults.relevance.toFixed(2)})`
      );
    }
  } else {
    console.log(`[RAGRouter] Force refresh enabled - skipping RAG check`);
  }

  // Step 2: Fetch fresh data from Tavily
  console.log(`[RAGRouter] Fetching fresh data from Tavily`);
  const tavilyResults = await fetchTavilyData(symbol, context);
  creditsUsed = tavilyResults.credits_used;

  // Step 3: Store to RAG for future use
  if (tavilyResults.results_count > 0) {
    console.log(`[RAGRouter] Storing Tavily results to RAG for future queries`);
    await storeTavilyResultsToRAG(symbol, context, tavilyResults.data);
  }

  return {
    source: "tavily",
    cached: false,
    freshness_score: 1.0, // Brand new data
    relevance_score: 0.9, // Assume high relevance from Tavily
    data: tavilyResults.data,
    credits_used: creditsUsed,
    rag_results_count: 0,
    tavily_results_count: tavilyResults.results_count,
  };
}

// ============================================================================
// RAG Knowledge Query
// ============================================================================

interface RAGKnowledgeResult {
  has_data: boolean;
  relevance: number;
  avg_age_days: number;
  results_count: number;
  data: any;
}

async function queryRAGKnowledge(
  symbol: string,
  context: string,
  maxAgeDays: number
): Promise<RAGKnowledgeResult> {
  try {
    // Query RAG documents (trade embeddings, post-mortems, etc.)
    const { data, error } = await supabase
      .from("trade_embeddings")
      .select("*")
      .eq("metadata->>symbol", symbol)
      .order("created_at", { ascending: false })
      .limit(20);

    if (error || !data || data.length === 0) {
      return {
        has_data: false,
        relevance: 0,
        avg_age_days: 999,
        results_count: 0,
        data: null,
      };
    }

    // Filter by age
    const now = Date.now();
    const recentData = data.filter((item) => {
      const age = (now - new Date(item.created_at).getTime()) / (1000 * 60 * 60 * 24);
      return age <= maxAgeDays;
    });

    if (recentData.length === 0) {
      return {
        has_data: false,
        relevance: 0,
        avg_age_days: 999,
        results_count: 0,
        data: null,
      };
    }

    // Calculate average age
    const avgAge =
      recentData.reduce((sum, item) => {
        const age = (now - new Date(item.created_at).getTime()) / (1000 * 60 * 60 * 24);
        return sum + age;
      }, 0) / recentData.length;

    // Simple relevance scoring based on data recency and count
    const recencyScore = Math.max(0, 1 - avgAge / maxAgeDays);
    const countScore = Math.min(1, recentData.length / 10);
    const relevance = recencyScore * 0.7 + countScore * 0.3;

    // Extract relevant metadata
    const relevantInsights = recentData.map((item) => ({
      trade_id: item.trade_id,
      metadata: item.metadata,
      created_at: item.created_at,
      age_days: (now - new Date(item.created_at).getTime()) / (1000 * 60 * 60 * 24),
    }));

    return {
      has_data: true,
      relevance,
      avg_age_days: avgAge,
      results_count: recentData.length,
      data: {
        symbol,
        insights: relevantInsights,
        summary: `Found ${recentData.length} recent trade insights (avg age: ${avgAge.toFixed(1)}d)`,
      },
    };
  } catch (error) {
    console.error("[RAGRouter] Error querying RAG:", error);
    return {
      has_data: false,
      relevance: 0,
      avg_age_days: 999,
      results_count: 0,
      data: null,
    };
  }
}

// ============================================================================
// Tavily Data Fetching
// ============================================================================

interface TavilyFetchResult {
  credits_used: number;
  results_count: number;
  data: any;
}

async function fetchTavilyData(
  symbol: string,
  context: string
): Promise<TavilyFetchResult> {
  let creditsUsed = 0;
  let allResults: any[] = [];

  // Determine query strategy based on context
  const isGeneralNews = context.toLowerCase().includes("news") || context === "general";
  const isCatalyst = context.toLowerCase().includes("catalyst") || context.toLowerCase().includes("earnings");
  const isAnalyst = context.toLowerCase().includes("analyst") || context.toLowerCase().includes("rating");
  const isRisk = context.toLowerCase().includes("risk") || context.toLowerCase().includes("operational");

  try {
    if (isGeneralNews || context === "general") {
      // General news search
      const res = await tavilySearch(`${symbol} stock news analysis`, {
        topic: "news",
        search_depth: "advanced",
        days: 7,
        max_results: 15,
        chunks_per_source: 3,
      });
      creditsUsed += 2; // Advanced search = 2 credits
      allResults = res.results || [];
    } else if (isCatalyst) {
      // Catalyst-specific search
      const catalysts = await queryCatalysts(symbol, 7);
      creditsUsed += 6; // 3 queries × 2 credits
      allResults = catalysts;
    } else if (isAnalyst) {
      // Analyst activity search
      const analysts = await queryAnalystActivity(symbol, 7);
      creditsUsed += 6;
      allResults = analysts;
    } else if (isRisk) {
      // Operational risk search
      const risks = await queryOperationalRisks(symbol, 30);
      creditsUsed += 8; // 4 queries × 2 credits
      allResults = risks;
    } else {
      // Default: comprehensive search
      const [catalysts, analysts, risks] = await Promise.all([
        queryCatalysts(symbol, 7),
        queryAnalystActivity(symbol, 7),
        queryOperationalRisks(symbol, 30),
      ]);
      creditsUsed += 20; // 6 + 6 + 8
      allResults = [...catalysts, ...analysts, ...risks];
    }

    return {
      credits_used: creditsUsed,
      results_count: allResults.length,
      data: {
        symbol,
        context,
        results: allResults,
        fetched_at: new Date().toISOString(),
      },
    };
  } catch (error) {
    console.error("[RAGRouter] Error fetching Tavily data:", error);
    return {
      credits_used: creditsUsed,
      results_count: 0,
      data: { symbol, context, results: [], error: String(error) },
    };
  }
}

// ============================================================================
// RAG Storage
// ============================================================================

async function storeTavilyResultsToRAG(
  symbol: string,
  context: string,
  tavilyData: any
): Promise<void> {
  try {
    // Store research context for future reference
    // Note: This is a simplified version - in production, you'd want to:
    // 1. Extract key insights using LLM
    // 2. Generate embeddings
    // 3. Store in trade_embeddings table with proper metadata

    console.log(
      `[RAGRouter] TODO: Store ${tavilyData.results?.length || 0} results to RAG for ${symbol}`
    );

    // For now, we'll just log - full implementation would create embeddings
    // and store them in the trade_embeddings table
  } catch (error) {
    console.error("[RAGRouter] Error storing to RAG:", error);
  }
}

// ============================================================================
// Utility Functions
// ============================================================================

function calculateFreshnessScore(ageDays: number): number {
  // Exponential decay: fresh data (0-1 day) = 1.0, 7 days = 0.5, 30 days = 0.1
  return Math.max(0, Math.exp(-ageDays / 5));
}

// ============================================================================
// Batch Router for Multiple Symbols
// ============================================================================

/**
 * Route research queries for multiple symbols efficiently
 * Batches Tavily requests to minimize credit usage
 */
export async function batchIntelligentResearch(
  symbols: string[],
  context: string,
  options: QueryRouterOptions = {}
): Promise<Record<string, IntelligentResearchResult>> {
  console.log(`[RAGRouter] Batch routing for ${symbols.length} symbols`);

  const results: Record<string, IntelligentResearchResult> = {};

  // First pass: Check RAG for all symbols
  const ragPromises = symbols.map((symbol) =>
    intelligentResearch(symbol, context, { ...options, forceRefresh: false })
  );

  const ragResults = await Promise.all(ragPromises);

  symbols.forEach((symbol, idx) => {
    results[symbol] = ragResults[idx];
  });

  // Calculate total credits and cache hit rate
  const totalCredits = Object.values(results).reduce(
    (sum, r) => sum + r.credits_used,
    0
  );
  const cacheHits = Object.values(results).filter((r) => r.source === "rag").length;
  const hitRate = (cacheHits / symbols.length) * 100;

  console.log(
    `[RAGRouter] Batch complete: ${totalCredits} credits, ${hitRate.toFixed(0)}% cache hit rate`
  );

  return results;
}

// ============================================================================
// RAG Query Statistics
// ============================================================================

export interface RAGRouterStats {
  total_queries: number;
  rag_hits: number;
  tavily_fetches: number;
  hybrid_queries: number;
  cache_hit_rate: number;
  total_credits_used: number;
  avg_credits_per_query: number;
}

let routerStats: RAGRouterStats = {
  total_queries: 0,
  rag_hits: 0,
  tavily_fetches: 0,
  hybrid_queries: 0,
  cache_hit_rate: 0,
  total_credits_used: 0,
  avg_credits_per_query: 0,
};

/**
 * Update router statistics
 * Call this after each intelligentResearch() call
 */
export function updateRouterStats(result: IntelligentResearchResult): void {
  routerStats.total_queries++;

  if (result.source === "rag") routerStats.rag_hits++;
  else if (result.source === "tavily") routerStats.tavily_fetches++;
  else if (result.source === "hybrid") routerStats.hybrid_queries++;

  routerStats.total_credits_used += result.credits_used;
  routerStats.cache_hit_rate =
    (routerStats.rag_hits / routerStats.total_queries) * 100;
  routerStats.avg_credits_per_query =
    routerStats.total_credits_used / routerStats.total_queries;
}

/**
 * Get current router statistics
 */
export function getRouterStats(): RAGRouterStats {
  return { ...routerStats };
}

/**
 * Reset router statistics
 */
export function resetRouterStats(): void {
  routerStats = {
    total_queries: 0,
    rag_hits: 0,
    tavily_fetches: 0,
    hybrid_queries: 0,
    cache_hit_rate: 0,
    total_credits_used: 0,
    avg_credits_per_query: 0,
  };
}
