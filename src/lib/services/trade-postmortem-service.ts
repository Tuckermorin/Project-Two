/**
 * Trade Post-Mortem Analysis Service
 *
 * AI analyzes closed trades to understand:
 * - What worked and what didn't
 * - How accurate the original thesis was
 * - Which IPS factors actually mattered
 * - Lessons learned for future trades
 *
 * This runs asynchronously via cron job, separate from trade closing
 */

import OpenAI from 'openai';
import { createClient } from '@supabase/supabase-js';
import { generateEmbedding } from './embedding-service';

// ============================================================================
// Types
// ============================================================================

export interface PostMortemAnalysis {
  executive_summary: {
    overall_assessment: 'strong_success' | 'success' | 'neutral' | 'failure' | 'strong_failure';
    one_sentence_verdict: string;
    what_went_right: string[];
    what_went_wrong: string[];
  };

  original_thesis_review: {
    original_recommendation: string;
    original_confidence: string;
    original_key_factors: string[];
    thesis_accuracy: 'highly_accurate' | 'mostly_accurate' | 'partially_accurate' | 'inaccurate';
    factors_that_played_out: Array<{
      factor: string;
      how_it_played_out: string;
    }>;
    factors_that_didnt: Array<{
      factor: string;
      what_actually_happened: string;
    }>;
  };

  performance_analysis: {
    vs_expectations: 'exceeded' | 'met' | 'underperformed' | 'failed';
    key_performance_drivers: string[];
    unexpected_developments: string[];
    risk_factors_realized: string[];
    opportunities_captured: string[];
  };

  ips_factor_retrospective: {
    factors_that_mattered_most: Array<{
      factor: string;
      why_it_mattered: string;
    }>;
    factors_that_didnt_matter: string[];
    missing_factors_identified: string[];
    factor_weight_recommendations: Array<{
      factor: string;
      current_weight: number;
      recommended_weight: number;
      reasoning: string;
    }>;
  };

  lessons_learned: {
    key_insights: string[];
    pattern_recognition: string;
    future_recommendations: string[];
    similar_setups_to_watch_for: string[];
    similar_setups_to_avoid: string[];
  };

  market_context_review: {
    market_environment_during_trade: string;
    how_market_affected_outcome: string;
    sector_performance: string;
    macro_events_impact: string[];
  };

  decision_quality_vs_outcome: {
    was_decision_quality_good: boolean;
    was_outcome_lucky_or_skillful: 'skill' | 'luck' | 'unlucky';
    would_make_same_decision_again: boolean;
    what_would_change: string[];
  };
}

interface TradeData {
  id: string;
  user_id: string;
  symbol: string;
  strategy_type: string;
  entry_date: string;
  closed_at: string;
  expiration_date: string;
  short_strike: number;
  long_strike: number;
  credit_received: number;
  realized_pl_percent: number;
  exit_notes?: string;
  ai_evaluation_id?: string;
  structured_rationale?: any;
}

// ============================================================================
// Trade Post-Mortem Service
// ============================================================================

export class TradePostMortemService {
  private openai: OpenAI;
  private supabase: ReturnType<typeof createClient>;

  constructor() {
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY!,
    });

    this.supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
  }

  /**
   * Analyze a single closed trade
   */
  async analyzeClosedTrade(tradeId: string): Promise<string | null> {
    try {
      console.log(`[PostMortem] Starting analysis for trade ${tradeId}`);

      // 1. Get trade data with original evaluation
      const { data: trade, error: tradeError } = await this.supabase
        .from('trades')
        .select('*')
        .eq('id', tradeId)
        .single();

      if (tradeError || !trade) {
        console.error(`[PostMortem] Trade not found: ${tradeId}`);
        return null;
      }

      if (trade.status !== 'closed') {
        console.error(`[PostMortem] Trade ${tradeId} is not closed`);
        return null;
      }

      // 2. Check if post-mortem already exists
      const { data: existing } = await this.supabase
        .from('trade_postmortem_analysis')
        .select('id')
        .eq('trade_id', tradeId)
        .single();

      if (existing) {
        console.log(`[PostMortem] Analysis already exists for trade ${tradeId}`);
        return existing.id;
      }

      // 3. Get original AI evaluation if it exists
      let originalEvaluation = null;
      if (trade.ai_evaluation_id) {
        const { data: evalData } = await this.supabase
          .from('ai_trade_evaluations')
          .select('*')
          .eq('id', trade.ai_evaluation_id)
          .single();

        originalEvaluation = evalData;
      }

      // 4. Get trade snapshots for intraday analysis
      const { data: snapshots } = await this.supabase
        .from('trade_snapshots')
        .select('*')
        .eq('trade_id', tradeId)
        .order('snapshot_time', { ascending: true });

      // 5. Build performance summary
      const performanceSummary = this.buildPerformanceSummary(trade, snapshots || []);

      // 6. Generate AI post-mortem analysis
      const postmortemAnalysis = await this.generatePostMortem(
        trade,
        originalEvaluation,
        performanceSummary,
        snapshots || []
      );

      // 7. Create embedding of post-mortem
      const embedding = await this.createPostMortemEmbedding(postmortemAnalysis);

      // 8. Save to database
      const { data: saved, error: saveError } = await this.supabase
        .from('trade_postmortem_analysis')
        .insert({
          trade_id: tradeId,
          user_id: trade.user_id,
          original_evaluation_id: trade.ai_evaluation_id,
          performance_summary: performanceSummary,
          postmortem_analysis: postmortemAnalysis,
          postmortem_embedding: embedding,
          analysis_confidence: this.calculateAnalysisConfidence(trade, originalEvaluation),
          data_quality_score: this.calculateDataQuality(trade, snapshots || [])
        })
        .select()
        .single();

      if (saveError) {
        console.error(`[PostMortem] Failed to save analysis:`, saveError);
        return null;
      }

      console.log(`[PostMortem] Analysis complete for trade ${tradeId}: ${saved.id}`);
      return saved.id;

    } catch (error: any) {
      console.error(`[PostMortem] Error analyzing trade ${tradeId}:`, error);
      return null;
    }
  }

  /**
   * Build performance summary from trade data
   */
  private buildPerformanceSummary(trade: TradeData, snapshots: any[]): any {
    const daysHeld = trade.entry_date && trade.closed_at
      ? Math.floor(
          (new Date(trade.closed_at).getTime() - new Date(trade.entry_date).getTime()) /
          (1000 * 60 * 60 * 24)
        )
      : 0;

    // Calculate max unrealized gain/loss from snapshots
    let maxUnrealizedGain = 0;
    let maxUnrealizedLoss = 0;

    if (snapshots.length > 0) {
      const pnls = snapshots.map(s => s.unrealized_pnl || 0);
      maxUnrealizedGain = Math.max(...pnls, 0);
      maxUnrealizedLoss = Math.min(...pnls, 0);
    }

    const outcome =
      trade.realized_pl_percent > 0.5 ? 'win' :
      trade.realized_pl_percent < -0.5 ? 'loss' :
      'break_even';

    return {
      symbol: trade.symbol,
      strategy_type: trade.strategy_type,
      entry_date: trade.entry_date,
      exit_date: trade.closed_at,
      days_held: daysHeld,
      realized_pl_percent: trade.realized_pl_percent,
      outcome,
      exit_reason: trade.exit_notes || 'Normal exit',
      max_unrealized_gain: maxUnrealizedGain,
      max_unrealized_loss: maxUnrealizedLoss,
      short_strike: trade.short_strike,
      long_strike: trade.long_strike,
      credit_received: trade.credit_received
    };
  }

  /**
   * Generate AI post-mortem analysis
   */
  private async generatePostMortem(
    trade: TradeData,
    originalEvaluation: any | null,
    performanceSummary: any,
    snapshots: any[]
  ): Promise<PostMortemAnalysis> {
    const prompt = this.buildPostMortemPrompt(trade, originalEvaluation, performanceSummary, snapshots);

    const completion = await this.openai.chat.completions.create({
      model: 'gpt-4-turbo-preview',
      messages: [
        {
          role: 'system',
          content: `You are an expert options trading analyst conducting a post-mortem analysis.
Your job is to analyze completed trades with brutal honesty and extract actionable lessons.
Focus on understanding WHY the trade succeeded or failed, not just describing what happened.
Identify patterns that can improve future decision-making.`
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      temperature: 0.3,
      response_format: { type: 'json_object' },
      max_tokens: 4000
    });

    const response = completion.choices[0]?.message?.content;
    if (!response) {
      throw new Error('No response from AI');
    }

    return JSON.parse(response) as PostMortemAnalysis;
  }

  /**
   * Build comprehensive prompt for post-mortem analysis
   */
  private buildPostMortemPrompt(
    trade: TradeData,
    originalEvaluation: any | null,
    performanceSummary: any,
    snapshots: any[]
  ): string {
    let prompt = `# TRADE POST-MORTEM ANALYSIS

Analyze this CLOSED trade with full access to the outcome. Your goal is to extract lessons learned.

## PERFORMANCE RESULTS
Symbol: ${trade.symbol}
Strategy: ${trade.strategy_type}
Entry: ${performanceSummary.entry_date}
Exit: ${performanceSummary.exit_date}
Days Held: ${performanceSummary.days_held}
Realized P&L: ${performanceSummary.realized_pl_percent.toFixed(2)}%
Outcome: ${performanceSummary.outcome.toUpperCase()}
Exit Reason: ${performanceSummary.exit_reason}

Strikes: ${performanceSummary.short_strike}/${performanceSummary.long_strike}
Credit: $${performanceSummary.credit_received?.toFixed(2)}
Max Unrealized Gain: $${performanceSummary.max_unrealized_gain?.toFixed(2)}
Max Unrealized Loss: $${performanceSummary.max_unrealized_loss?.toFixed(2)}
`;

    // Add original evaluation if available
    if (originalEvaluation && trade.structured_rationale) {
      const rationale = trade.structured_rationale;
      prompt += `\n## ORIGINAL AI RECOMMENDATION
Recommendation: ${rationale.summary?.recommendation || 'N/A'}
Confidence: ${rationale.summary?.confidence_level || 'N/A'}
Thesis: ${rationale.summary?.one_sentence_thesis || 'N/A'}

Key Strengths Identified:
${rationale.summary?.key_strengths?.map((s: string) => `- ${s}`).join('\n') || 'N/A'}

Key Concerns Identified:
${rationale.summary?.key_concerns?.map((c: string) => `- ${c}`).join('\n') || 'N/A'}

Expected Outcome: ${rationale.forward_looking?.expected_outcome || 'N/A'}
`;
    }

    // Add snapshot analysis if available
    if (snapshots.length > 0) {
      const entrySnapshot = snapshots[0];
      const midSnapshot = snapshots[Math.floor(snapshots.length / 2)];
      const exitSnapshot = snapshots[snapshots.length - 1];

      prompt += `\n## TRADE EVOLUTION
Entry: Delta=${entrySnapshot.delta_spread?.toFixed(3)}, IV Rank=${entrySnapshot.iv_rank}, Days Left=${entrySnapshot.days_to_expiration}
Midpoint: Delta=${midSnapshot.delta_spread?.toFixed(3)}, Unrealized P&L=${midSnapshot.unrealized_pnl_percent?.toFixed(1)}%
Exit: Delta=${exitSnapshot.delta_spread?.toFixed(3)}, Days Left=${exitSnapshot.days_to_expiration}
`;
    }

    prompt += `\n## YOUR TASK

Provide a COMPREHENSIVE post-mortem analysis in JSON format:

{
  "executive_summary": {
    "overall_assessment": "strong_success|success|neutral|failure|strong_failure",
    "one_sentence_verdict": "Concise verdict on the trade",
    "what_went_right": ["Specific factor 1", "Specific factor 2"],
    "what_went_wrong": ["Specific issue 1", "Specific issue 2"]
  },
  "original_thesis_review": {
    "original_recommendation": "${trade.structured_rationale?.summary?.recommendation || 'unknown'}",
    "original_confidence": "${trade.structured_rationale?.summary?.confidence_level || 'unknown'}",
    "original_key_factors": [...],
    "thesis_accuracy": "highly_accurate|mostly_accurate|partially_accurate|inaccurate",
    "factors_that_played_out": [
      {
        "factor": "Factor name",
        "how_it_played_out": "Detailed explanation"
      }
    ],
    "factors_that_didnt": [
      {
        "factor": "Factor name",
        "what_actually_happened": "What happened instead"
      }
    ]
  },
  "performance_analysis": {
    "vs_expectations": "exceeded|met|underperformed|failed",
    "key_performance_drivers": ["What drove the outcome"],
    "unexpected_developments": ["Things we didn't anticipate"],
    "risk_factors_realized": ["Risks that actually materialized"],
    "opportunities_captured": ["Opportunities we capitalized on"]
  },
  "ips_factor_retrospective": {
    "factors_that_mattered_most": [
      {
        "factor": "Factor name",
        "why_it_mattered": "Explanation"
      }
    ],
    "factors_that_didnt_matter": ["Factors that turned out irrelevant"],
    "missing_factors_identified": ["Factors we should have considered"],
    "factor_weight_recommendations": [
      {
        "factor": "Factor name",
        "current_weight": 0.15,
        "recommended_weight": 0.25,
        "reasoning": "Why adjust the weight"
      }
    ]
  },
  "lessons_learned": {
    "key_insights": ["Actionable insight 1", "Actionable insight 2"],
    "pattern_recognition": "What pattern does this trade represent?",
    "future_recommendations": ["Recommendation 1", "Recommendation 2"],
    "similar_setups_to_watch_for": ["Setup 1", "Setup 2"],
    "similar_setups_to_avoid": ["Setup to avoid 1"]
  },
  "market_context_review": {
    "market_environment_during_trade": "Overall market context",
    "how_market_affected_outcome": "Specific market impact",
    "sector_performance": "How the sector performed",
    "macro_events_impact": ["Event 1", "Event 2"]
  },
  "decision_quality_vs_outcome": {
    "was_decision_quality_good": true|false,
    "was_outcome_lucky_or_skillful": "skill|luck|unlucky",
    "would_make_same_decision_again": true|false,
    "what_would_change": ["Change 1", "Change 2"]
  }
}

CRITICAL INSTRUCTIONS:
1. Be BRUTALLY HONEST - don't sugarcoat failures or overstate successes
2. Focus on CAUSATION not just correlation - why did things happen?
3. Separate DECISION QUALITY from OUTCOME - good decisions can have bad outcomes due to luck
4. Identify SPECIFIC, ACTIONABLE lessons - no generic advice
5. Consider what you DIDN'T know at entry time - don't use hindsight bias unfairly
6. Think about PATTERNS - does this fit a known setup? What's the broader lesson?
`;

    return prompt;
  }

  /**
   * Create embedding of post-mortem for similarity search using Ollama qwen3-embedding (2000 dimensions)
   */
  private async createPostMortemEmbedding(analysis: PostMortemAnalysis): Promise<number[]> {
    // Build condensed text for embedding
    const parts: string[] = [];

    parts.push(analysis.executive_summary.one_sentence_verdict);
    parts.push(`What worked: ${analysis.executive_summary.what_went_right.join('; ')}`);
    parts.push(`What didn't: ${analysis.executive_summary.what_went_wrong.join('; ')}`);
    parts.push(`Thesis accuracy: ${analysis.original_thesis_review.thesis_accuracy}`);
    parts.push(`Key insights: ${analysis.lessons_learned.key_insights.join('; ')}`);
    parts.push(`Pattern: ${analysis.lessons_learned.pattern_recognition}`);
    parts.push(`Decision quality: ${analysis.decision_quality_vs_outcome.was_outcome_lucky_or_skillful}`);

    const embeddingText = parts.join(' | ');

    return generateEmbedding(embeddingText);
  }

  /**
   * Calculate analysis confidence based on available data
   */
  private calculateAnalysisConfidence(trade: TradeData, originalEval: any | null): number {
    let confidence = 0.5; // Base

    if (originalEval) confidence += 0.2; // Had original AI evaluation
    if (trade.structured_rationale) confidence += 0.15; // Had structured rationale
    if (trade.exit_notes) confidence += 0.1; // Had exit notes
    if (trade.entry_date && trade.closed_at) confidence += 0.05; // Complete dates

    return Math.min(confidence, 1.0);
  }

  /**
   * Calculate data quality score
   */
  private calculateDataQuality(trade: TradeData, snapshots: any[]): number {
    let score = 50; // Base score

    if (trade.ai_evaluation_id) score += 20;
    if (trade.structured_rationale) score += 15;
    if (snapshots.length >= 5) score += 10;
    if (trade.exit_notes) score += 5;

    return Math.min(score, 100);
  }

  /**
   * Batch process trades for post-mortem analysis
   */
  async processBatch(batchSize: number = 10, userId?: string): Promise<{
    processed: number;
    succeeded: number;
    failed: number;
    analysisIds: string[];
  }> {
    console.log(`[PostMortem] Processing batch of up to ${batchSize} trades${userId ? ` for user ${userId}` : ''}`);

    // Get trades needing analysis
    const { data: trades, error } = await this.supabase
      .rpc('get_trades_for_postmortem_batch', {
        batch_size: batchSize,
        filter_user_id: userId || null
      });

    if (error || !trades || trades.length === 0) {
      console.log('[PostMortem] No trades to process');
      return { processed: 0, succeeded: 0, failed: 0, analysisIds: [] };
    }

    console.log(`[PostMortem] Found ${trades.length} trades to analyze`);

    const results = {
      processed: trades.length,
      succeeded: 0,
      failed: 0,
      analysisIds: [] as string[]
    };

    for (const trade of trades) {
      try {
        const analysisId = await this.analyzeClosedTrade(trade.trade_id);
        if (analysisId) {
          results.succeeded++;
          results.analysisIds.push(analysisId);
        } else {
          results.failed++;
        }
      } catch (error) {
        console.error(`[PostMortem] Failed to analyze trade ${trade.trade_id}:`, error);
        results.failed++;
      }

      // Small delay to avoid rate limits
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    console.log(`[PostMortem] Batch complete: ${results.succeeded} succeeded, ${results.failed} failed`);
    return results;
  }
}

// Singleton instance
let postMortemService: TradePostMortemService;

export function getTradePostMortemService(): TradePostMortemService {
  if (!postMortemService) {
    postMortemService = new TradePostMortemService();
  }
  return postMortemService;
}
