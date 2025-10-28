// Enhanced Trade Recommendation Service
// Unified service that orchestrates the complete AI-enhanced recommendation flow:
// 1. Enriches trade context with multi-source data
// 2. Evaluates with AI using progressive weighting
// 3. Provides explainable recommendations
// 4. Saves evaluation results for learning

import { createClient } from '@supabase/supabase-js';
import {
  getTradeContextEnrichmentService,
  type TradeCandidate,
  type EnrichedTradeContext
} from './trade-context-enrichment-service';
import {
  getAITradeEvaluator,
  type TradeEvaluationResult,
  type TradeRecommendation
} from './ai-trade-evaluator';

// ============================================================================
// Types
// ============================================================================

export interface RecommendationRequest {
  candidate: TradeCandidate;
  ips_id: string;
  user_id: string;
  options?: {
    save_evaluation?: boolean;
    include_external_intelligence?: boolean;
    include_internal_rag?: boolean;
    include_tavily?: boolean;
    include_live_news?: boolean;
    force_weighting?: { ips: number; ai: number };
  };
}

export interface SavedRecommendation {
  id: string;
  trade_candidate_id?: string;
  user_id: string;
  symbol: string;
  strategy_type: string;
  ips_id: string;
  ips_passed: boolean;
  ips_score: number;
  ai_recommendation: TradeRecommendation;
  ai_confidence: string;
  ai_score: number;
  composite_score: number;
  ips_weight: number;
  ai_weight: number;
  final_recommendation: TradeRecommendation;
  evaluation_context: any;
  explainability: any;
  created_at: string;
}

export interface RecommendationHistory {
  symbol: string;
  total_recommendations: number;
  avg_composite_score: number;
  recommendation_distribution: Record<TradeRecommendation, number>;
  recent_recommendations: SavedRecommendation[];
}

// ============================================================================
// Enhanced Trade Recommendation Service
// ============================================================================

export class EnhancedTradeRecommendationService {
  private mainDb: ReturnType<typeof createClient>;
  private enrichmentService: ReturnType<typeof getTradeContextEnrichmentService>;
  private aiEvaluator: ReturnType<typeof getAITradeEvaluator>;

  constructor() {
    this.mainDb = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
    this.enrichmentService = getTradeContextEnrichmentService();
    this.aiEvaluator = getAITradeEvaluator();
  }

  /**
   * Main entry point: Get AI-enhanced recommendation for a trade candidate
   */
  async getRecommendation(request: RecommendationRequest): Promise<TradeEvaluationResult> {
    const { candidate, ips_id, user_id, options = {} } = request;
    const {
      save_evaluation = true,
      include_external_intelligence = true,
      include_internal_rag = true,
      include_tavily = true,
      include_live_news = true,
      force_weighting,
    } = options;

    console.log(`[EnhancedTradeRecommendation] Processing recommendation request for ${candidate.symbol}`);

    // Step 1: Enrich trade context
    console.log(`[EnhancedTradeRecommendation] Step 1: Enriching trade context...`);
    const enrichedContext = await this.enrichmentService.enrichTradeCandidate(
      candidate,
      ips_id,
      {
        includeExternalIntelligence: include_external_intelligence,
        includeInternalRAG: include_internal_rag,
        includeTavily: include_tavily,
        includeLiveNews: include_live_news,
        includeHistoricalPerformance: true,
        includeSimilarTrades: true,
      }
    );

    // Step 2: Get AI evaluation
    console.log(`[EnhancedTradeRecommendation] Step 2: Getting AI evaluation...`);
    const evaluation = await this.aiEvaluator.evaluateTrade(enrichedContext, {
      useProgressiveWeighting: true,
      forceWeighting: force_weighting,
    });

    // Step 3: Save evaluation if requested and get the ID
    let evaluationId: string | undefined;
    if (save_evaluation) {
      console.log(`[EnhancedTradeRecommendation] Step 3: Saving evaluation...`);
      evaluationId = await this.saveEvaluation(evaluation, user_id);

      // Step 4: Generate and save enhanced rationale with embedding (now that we have evaluation ID)
      if (evaluationId && evaluation.structured_rationale) {
        console.log(`[EnhancedTradeRecommendation] Step 4: Saving rationale embedding...`);
        try {
          const { getEnhancedRationaleGenerator } = await import('./enhanced-rationale-generator');
          const rationaleGen = getEnhancedRationaleGenerator();
          await rationaleGen.createRationaleEmbedding(
            evaluation.structured_rationale,
            enrichedContext,
            evaluationId,
            user_id
          );
        } catch (error) {
          console.warn(`[EnhancedTradeRecommendation] Failed to save rationale embedding:`, error);
          // Non-critical, continue
        }
      }
    }

    console.log(`[EnhancedTradeRecommendation] Recommendation complete`);
    console.log(`  Final: ${evaluation.final_recommendation}`);
    console.log(`  Composite Score: ${evaluation.weighted_score.composite_score.toFixed(2)}`);
    console.log(`  Confidence: ${evaluation.weighted_score.confidence_level}`);
    if (evaluationId) {
      console.log(`  Evaluation ID: ${evaluationId}`);
    }

    return evaluation;
  }

  /**
   * Batch process multiple trade candidates
   */
  async getBatchRecommendations(
    candidates: TradeCandidate[],
    ips_id: string,
    user_id: string,
    options?: RecommendationRequest['options']
  ): Promise<TradeEvaluationResult[]> {
    console.log(`[EnhancedTradeRecommendation] Processing batch of ${candidates.length} candidates`);

    const results: TradeEvaluationResult[] = [];

    // Process in parallel (but limit concurrency to avoid rate limits)
    const batchSize = 3;
    for (let i = 0; i < candidates.length; i += batchSize) {
      const batch = candidates.slice(i, i + batchSize);
      const batchResults = await Promise.all(
        batch.map((candidate) =>
          this.getRecommendation({
            candidate,
            ips_id,
            user_id,
            options,
          })
        )
      );
      results.push(...batchResults);
    }

    console.log(`[EnhancedTradeRecommendation] Batch processing complete`);
    return results;
  }

  /**
   * Get recommendation history for a symbol
   */
  async getRecommendationHistory(
    symbol: string,
    user_id: string,
    limit: number = 20
  ): Promise<RecommendationHistory> {
    const { data: recommendations, error } = await this.mainDb
      .from('ai_trade_evaluations')
      .select('*')
      .eq('symbol', symbol)
      .eq('user_id', user_id)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      console.error(`[EnhancedTradeRecommendation] Error fetching history: ${error.message}`);
      throw new Error(`Failed to fetch recommendation history: ${error.message}`);
    }

    if (!recommendations || recommendations.length === 0) {
      return {
        symbol,
        total_recommendations: 0,
        avg_composite_score: 0,
        recommendation_distribution: {} as any,
        recent_recommendations: [],
      };
    }

    // Calculate statistics
    const avgScore =
      recommendations.reduce((sum, r) => sum + (r.composite_score || 0), 0) /
      recommendations.length;

    const distribution: Record<TradeRecommendation, number> = {
      strong_buy: 0,
      buy: 0,
      neutral: 0,
      avoid: 0,
      strong_avoid: 0,
    };

    for (const rec of recommendations) {
      const finalRec = rec.final_recommendation as TradeRecommendation;
      if (finalRec in distribution) {
        distribution[finalRec]++;
      }
    }

    return {
      symbol,
      total_recommendations: recommendations.length,
      avg_composite_score: avgScore,
      recommendation_distribution: distribution,
      recent_recommendations: recommendations as SavedRecommendation[],
    };
  }

  /**
   * Compare current recommendation against historical outcomes
   */
  async compareWithHistory(
    evaluation: TradeEvaluationResult,
    user_id: string
  ): Promise<{
    similar_past_recommendations: number;
    avg_outcome_roi: number;
    win_rate: number;
    recommendation_accuracy: number;
  }> {
    // Find similar past recommendations
    const { data: similar, error } = await this.mainDb
      .from('ai_trade_evaluations')
      .select('*')
      .eq('symbol', evaluation.candidate.symbol)
      .eq('user_id', user_id)
      .eq('strategy_type', evaluation.candidate.strategy_type)
      .gte('composite_score', evaluation.weighted_score.composite_score - 10)
      .lte('composite_score', evaluation.weighted_score.composite_score + 10);

    if (error || !similar || similar.length === 0) {
      return {
        similar_past_recommendations: 0,
        avg_outcome_roi: 0,
        win_rate: 0,
        recommendation_accuracy: 0,
      };
    }

    // TODO: Join with actual trade outcomes to calculate accuracy
    // For now, return placeholder metrics
    return {
      similar_past_recommendations: similar.length,
      avg_outcome_roi: 0,
      win_rate: 0,
      recommendation_accuracy: 0,
    };
  }

  /**
   * Get top recommended trades from a list of candidates
   */
  async getTopRecommendations(
    candidates: TradeCandidate[],
    ips_id: string,
    user_id: string,
    topN: number = 5,
    options?: RecommendationRequest['options']
  ): Promise<TradeEvaluationResult[]> {
    console.log(`[EnhancedTradeRecommendation] Finding top ${topN} recommendations from ${candidates.length} candidates`);

    // Get all recommendations
    const allRecommendations = await this.getBatchRecommendations(
      candidates,
      ips_id,
      user_id,
      options
    );

    // Sort by composite score (descending)
    const sorted = allRecommendations.sort(
      (a, b) => b.weighted_score.composite_score - a.weighted_score.composite_score
    );

    // Return top N
    const topRecommendations = sorted.slice(0, topN);

    console.log(`[EnhancedTradeRecommendation] Top ${topN} recommendations:`);
    topRecommendations.forEach((rec, idx) => {
      console.log(`  ${idx + 1}. ${rec.candidate.symbol}: ${rec.weighted_score.composite_score.toFixed(2)} (${rec.final_recommendation})`);
    });

    return topRecommendations;
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  /**
   * Save evaluation to database (including structured rationale with embedding)
   */
  private async saveEvaluation(
    evaluation: TradeEvaluationResult,
    user_id: string
  ): Promise<string> {
    const { error, data } = await this.mainDb
      .from('ai_trade_evaluations')
      .insert({
        user_id,
        symbol: evaluation.candidate.symbol,
        strategy_type: evaluation.candidate.strategy_type,
        ips_id: evaluation.ips_evaluation.ips_id,
        ips_passed: evaluation.ips_evaluation.passed,
        ips_score: evaluation.ips_evaluation.score_percentage,
        ai_recommendation: evaluation.ai_evaluation.recommendation,
        ai_confidence: evaluation.ai_evaluation.confidence,
        ai_score: evaluation.ai_evaluation.ai_score,
        composite_score: evaluation.weighted_score.composite_score,
        ips_weight: evaluation.weighted_score.ips_weight,
        ai_weight: evaluation.weighted_score.ai_weight,
        final_recommendation: evaluation.final_recommendation,
        evaluation_context: {
          candidate: evaluation.candidate,
          ips_evaluation: evaluation.ips_evaluation,
          ai_evaluation: evaluation.ai_evaluation,
          weighted_score: evaluation.weighted_score,
          enriched_context: evaluation.enriched_context, // Include full context with live news
          structured_rationale: evaluation.structured_rationale, // Include enhanced rationale
        },
        explainability: evaluation.explainability,
      })
      .select('id')
      .single();

    if (error) {
      console.error(`[EnhancedTradeRecommendation] Error saving evaluation: ${error.message}`);
      throw new Error(`Failed to save evaluation: ${error.message}`);
    }

    return data.id;
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let recommendationServiceInstance: EnhancedTradeRecommendationService | null = null;

export function getEnhancedTradeRecommendationService(): EnhancedTradeRecommendationService {
  if (!recommendationServiceInstance) {
    recommendationServiceInstance = new EnhancedTradeRecommendationService();
  }
  return recommendationServiceInstance;
}

// ============================================================================
// Convenience Functions
// ============================================================================

export async function getTradeRecommendation(
  request: RecommendationRequest
): Promise<TradeEvaluationResult> {
  return getEnhancedTradeRecommendationService().getRecommendation(request);
}

export async function getTopTradeRecommendations(
  candidates: TradeCandidate[],
  ips_id: string,
  user_id: string,
  topN?: number,
  options?: RecommendationRequest['options']
): Promise<TradeEvaluationResult[]> {
  return getEnhancedTradeRecommendationService().getTopRecommendations(
    candidates,
    ips_id,
    user_id,
    topN,
    options
  );
}
