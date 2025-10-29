/**
 * Enhanced Rationale Generator
 * Generates detailed, structured trade rationales with learning capabilities
 * Includes semantic embedding for pattern recognition and outcome-based learning
 */

import OpenAI from 'openai';
import { createClient } from '@supabase/supabase-js';
import type { EnrichedTradeContext } from './trade-context-enrichment-service';
import type { AIEvaluation } from './ai-trade-evaluator';
import { generateEmbedding } from './embedding-service';

// ============================================================================
// Types
// ============================================================================

export interface StructuredRationale {
  // Executive Summary
  summary: {
    recommendation: 'strong_buy' | 'buy' | 'neutral' | 'avoid' | 'strong_avoid';
    confidence_level: 'very_high' | 'high' | 'medium' | 'low' | 'very_low';
    one_sentence_thesis: string;
    key_strengths: string[];
    key_concerns: string[];
  };

  // Detailed Analysis
  analysis: {
    // IPS Alignment
    ips_analysis: {
      overall_score: number;
      passing_factors: Array<{
        factor: string;
        value: number | string;
        why_positive: string;
      }>;
      failing_factors: Array<{
        factor: string;
        value: number | string;
        impact: 'critical' | 'moderate' | 'minor';
        recommendation: string;
      }>;
    };

    // Market Context
    market_context: {
      sentiment_summary: string;
      news_catalyst_analysis: string[];
      macro_environment: string;
      technical_setup: string;
    };

    // Historical Pattern Recognition
    historical_insights: {
      similar_trades_found: boolean;
      pattern_description: string;
      historical_outcome: string;
      lessons_learned: string[];
      confidence_in_pattern: 'high' | 'medium' | 'low';
    };

    // Risk Assessment
    risk_assessment: {
      primary_risks: Array<{
        risk: string;
        probability: 'high' | 'medium' | 'low';
        impact: 'severe' | 'moderate' | 'minor';
        mitigation: string;
      }>;
      worst_case_scenario: string;
      best_case_scenario: string;
      most_likely_outcome: string;
    };

    // Trade Mechanics
    trade_mechanics: {
      entry_quality: string;
      greeks_analysis: string;
      liquidity_assessment: string;
      timing_consideration: string;
    };
  };

  // Decision Logic
  decision_logic: {
    weighted_factors: Array<{
      factor: string;
      weight: number;
      score: number;
      justification: string;
    }>;
    ips_vs_ai_alignment: 'aligned' | 'partial' | 'divergent';
    why_this_recommendation: string;
    what_would_change_mind: string[];
  };

  // Forward-Looking
  forward_looking: {
    expected_outcome: string;
    key_milestones: string[];
    exit_criteria: {
      profit_target: string;
      stop_loss: string;
      time_based: string;
    };
    monitoring_checklist: string[];
  };

  // Metadata for Learning
  metadata: {
    data_quality_score: number;
    sources_used: string[];
    areas_of_uncertainty: string[];
    follow_up_research_needed: string[];
    generated_at: string;
    embedding_ready: boolean;
  };
}

export interface RationaleEmbedding {
  id: string;
  trade_evaluation_id: string;
  rationale_embedding: number[]; // 2000 dimensions (Ollama qwen3-embedding)
  rationale_text: string;
  trade_details: {
    symbol: string;
    strategy_type: string;
    dte: number;
    delta: number;
    iv_rank: number;
  };
  outcome?: {
    actual_outcome: 'win' | 'loss' | 'break_even';
    actual_roi: number;
    days_held: number;
    exit_reason: string;
  };
  created_at: string;
  outcome_recorded_at?: string;
}

// ============================================================================
// Enhanced Rationale Generator
// ============================================================================

export class EnhancedRationaleGenerator {
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
   * Generate comprehensive, structured rationale for a trade
   */
  async generateRationale(
    context: EnrichedTradeContext,
    aiEvaluation: AIEvaluation,
    evaluationId?: string
  ): Promise<StructuredRationale> {
    console.log(`[RationaleGenerator] Generating enhanced rationale for ${context.candidate.symbol}`);

    // Step 1: Find similar past trades for pattern recognition
    const similarTrades = await this.findSimilarTrades(context);

    // Step 2: Build comprehensive prompt
    const prompt = this.buildEnhancedPrompt(context, aiEvaluation, similarTrades);

    // Step 3: Get detailed rationale from GPT-4
    const rationale = await this.generateWithAI(prompt, context);

    // Step 4: Create embedding for future similarity search
    const embedding = await this.createRationaleEmbedding(rationale, context, evaluationId);

    console.log(`[RationaleGenerator] Rationale generated with ${rationale.analysis.historical_insights.similar_trades_found ? 'historical' : 'no'} pattern matches`);

    return rationale;
  }

  /**
   * Find similar past trades using semantic search
   */
  private async findSimilarTrades(context: EnrichedTradeContext): Promise<any[]> {
    try {
      // Create query embedding from current trade characteristics
      const queryText = this.buildTradeQueryText(context);
      const queryEmbedding = await this.createEmbedding(queryText);

      // Search for similar past rationales
      const { data, error } = await this.supabase.rpc('match_trade_rationales', {
        query_embedding: queryEmbedding,
        match_threshold: 0.75,
        match_count: 5
      });

      if (error) {
        console.warn(`[RationaleGenerator] Error finding similar trades:`, error);
        return [];
      }

      return data || [];
    } catch (error) {
      console.warn(`[RationaleGenerator] Failed to find similar trades:`, error);
      return [];
    }
  }

  /**
   * Build enhanced prompt with all context
   */
  private buildEnhancedPrompt(
    context: EnrichedTradeContext,
    aiEvaluation: AIEvaluation,
    similarTrades: any[]
  ): string {
    const { candidate, ips_evaluation, live_market_intelligence, historical_performance } = context;

    let prompt = `You are an expert options trading analyst. Provide a COMPREHENSIVE, STRUCTURED analysis for this trade.

CRITICAL INSTRUCTIONS:
1. Be SPECIFIC and DATA-DRIVEN - cite actual numbers and factors
2. Explain the "WHY" behind every point - don't just list facts
3. Connect the dots between different factors
4. Provide ACTIONABLE insights, not generic observations
5. Be honest about uncertainties and data quality issues
6. Think like a professional trader reviewing this for a fund

TRADE DETAILS:
Symbol: ${candidate.symbol}
Strategy: ${candidate.strategy_type}
Strikes: ${candidate.short_strike}/${candidate.long_strike}
Expiration: ${candidate.expiration_date} (${candidate.dte} DTE)
Credit: $${candidate.credit_received?.toFixed(2)}
Delta: ${candidate.delta?.toFixed(3)}
IV Rank: ${candidate.iv_rank}
Estimated POP: ${candidate.estimated_pop ? (candidate.estimated_pop * 100).toFixed(1) + '%' : 'N/A'}

IPS EVALUATION:
Score: ${ips_evaluation.score_percentage.toFixed(1)}%
Passed: ${ips_evaluation.passed ? 'YES' : 'NO'}
Factors Passing: ${ips_evaluation.passed_factors.length}/${ips_evaluation.passed_factors.length + ips_evaluation.failed_factors.length}
`;

    // Add failing factors with context
    if (ips_evaluation.failed_factors.length > 0) {
      prompt += `\nFAILING FACTORS (analyze impact of each):\n`;
      ips_evaluation.failed_factors.forEach(f => {
        prompt += `- ${f.factor_name}: ${f.actual_value} (expected ${f.expected_value})\n`;
      });
    }

    // Add live news if available
    if (live_market_intelligence?.news_sentiment) {
      const news = live_market_intelligence.news_sentiment;
      prompt += `\nLIVE MARKET NEWS (${news.articles.length} recent articles):
Overall Sentiment: ${news.aggregate_sentiment.label} (${news.aggregate_sentiment.average_score.toFixed(3)})
Distribution: ${news.aggregate_sentiment.bullish_count} bullish, ${news.aggregate_sentiment.bearish_count} bearish, ${news.aggregate_sentiment.neutral_count} neutral

TOP HEADLINES:
`;
      news.articles.slice(0, 3).forEach((article, idx) => {
        const tickerSent = article.ticker_sentiment.find(ts => ts.ticker === candidate.symbol);
        const sentimentLabel = tickerSent?.ticker_sentiment_label || article.overall_sentiment_label || 'N/A';
        const sentimentScore = tickerSent?.ticker_sentiment_score ?? article.overall_sentiment_score;

        // Safely convert to number and format
        let scoreText = 'N/A';
        if (sentimentScore !== null && sentimentScore !== undefined) {
          const numScore = typeof sentimentScore === 'number' ? sentimentScore : parseFloat(sentimentScore);
          if (!isNaN(numScore)) {
            scoreText = numScore.toFixed(3);
          }
        }

        prompt += `${idx + 1}. "${article.title}"
   Published: ${new Date(article.time_published).toLocaleString()}
   Sentiment: ${sentimentLabel} (${scoreText})
   Summary: ${article.summary.substring(0, 200)}...

`;
      });
    }

    // Add historical context
    if (historical_performance.total_trades > 0) {
      prompt += `\nHISTORICAL PERFORMANCE (${candidate.symbol}):
Total Trades: ${historical_performance.total_trades}
Win Rate: ${historical_performance.win_rate.toFixed(1)}%
Average ROI: ${historical_performance.avg_roi.toFixed(2)}%
Recent Trends: ${historical_performance.recent_trades.slice(0, 3).map(t => `${t.realized_pl_percent > 0 ? '+' : ''}${t.realized_pl_percent.toFixed(1)}%`).join(', ')}
`;
    }

    // Add similar trade patterns if found
    if (similarTrades.length > 0) {
      prompt += `\nSIMILAR PAST TRADES FOUND (learn from these):\n`;
      similarTrades.forEach((trade, idx) => {
        prompt += `${idx + 1}. ${trade.symbol} - ${trade.outcome?.actual_outcome || 'ongoing'}
   Similarity: ${(trade.similarity * 100).toFixed(1)}%
   ROI: ${trade.outcome?.actual_roi ? trade.outcome.actual_roi.toFixed(2) + '%' : 'N/A'}
   Exit Reason: ${trade.outcome?.exit_reason || 'N/A'}
   Original Rationale: ${trade.rationale_text.substring(0, 200)}...

`;
      });
    }

    prompt += `\nOUTPUT FORMAT (JSON):
{
  "summary": {
    "recommendation": "strong_buy|buy|neutral|avoid|strong_avoid",
    "confidence_level": "very_high|high|medium|low|very_low",
    "one_sentence_thesis": "Clear, specific thesis for why this trade makes sense (or doesn't)",
    "key_strengths": ["3-5 specific strengths with numbers"],
    "key_concerns": ["3-5 specific concerns with numbers"]
  },
  "analysis": {
    "ips_analysis": {
      "overall_score": ${ips_evaluation.score_percentage},
      "passing_factors": [
        {
          "factor": "factor name",
          "value": "actual value",
          "why_positive": "Explain WHY this is good for the trade"
        }
      ],
      "failing_factors": [
        {
          "factor": "factor name",
          "value": "actual value",
          "impact": "critical|moderate|minor",
          "recommendation": "What should we do about this?"
        }
      ]
    },
    "market_context": {
      "sentiment_summary": "Synthesize ALL sentiment data into one coherent view",
      "news_catalyst_analysis": ["Identify specific catalysts or concerns from news"],
      "macro_environment": "How does macro context affect this trade?",
      "technical_setup": "What do the technicals (delta, IV, etc.) tell us?"
    },
    "historical_insights": {
      "similar_trades_found": ${similarTrades.length > 0},
      "pattern_description": "Describe the pattern if found",
      "historical_outcome": "What happened to similar trades?",
      "lessons_learned": ["Key lessons from past trades"],
      "confidence_in_pattern": "high|medium|low"
    },
    "risk_assessment": {
      "primary_risks": [
        {
          "risk": "Specific risk",
          "probability": "high|medium|low",
          "impact": "severe|moderate|minor",
          "mitigation": "How to handle this risk"
        }
      ],
      "worst_case_scenario": "What's the worst that could happen?",
      "best_case_scenario": "What's the best outcome?",
      "most_likely_outcome": "What do we actually expect?"
    },
    "trade_mechanics": {
      "entry_quality": "Is this a good entry price/timing?",
      "greeks_analysis": "What do delta, theta, vega tell us?",
      "liquidity_assessment": "Can we get in/out easily?",
      "timing_consideration": "Is this the right time for this trade?"
    }
  },
  "decision_logic": {
    "weighted_factors": [
      {
        "factor": "Most important factor",
        "weight": 0.3,
        "score": 85,
        "justification": "Why this factor matters"
      }
    ],
    "ips_vs_ai_alignment": "aligned|partial|divergent",
    "why_this_recommendation": "Clear explanation of the final call",
    "what_would_change_mind": ["What would make you reverse this decision?"]
  },
  "forward_looking": {
    "expected_outcome": "Our specific prediction",
    "key_milestones": ["Events to watch"],
    "exit_criteria": {
      "profit_target": "When to take profits",
      "stop_loss": "When to cut losses",
      "time_based": "Time-based exit rules"
    },
    "monitoring_checklist": ["What to monitor daily/weekly"]
  },
  "metadata": {
    "data_quality_score": 0-100,
    "sources_used": ["List of data sources"],
    "areas_of_uncertainty": ["What we're not sure about"],
    "follow_up_research_needed": ["What else should we research?"],
    "generated_at": "${new Date().toISOString()}",
    "embedding_ready": true
  }
}

REMEMBER:
- Be SPECIFIC and use NUMBERS
- Explain the WHY, not just the WHAT
- Be honest about data quality and uncertainties
- Think critically - challenge assumptions
- Provide actionable insights`;

    return prompt;
  }

  /**
   * Generate rationale using AI
   */
  private async generateWithAI(
    prompt: string,
    context: EnrichedTradeContext
  ): Promise<StructuredRationale> {
    try {
      const completion = await this.openai.chat.completions.create({
        model: 'gpt-4-turbo-preview',
        messages: [
          {
            role: 'system',
            content: `You are a professional options trading analyst with 15+ years of experience.
You specialize in credit spreads and provide detailed, data-driven analysis.
Your analyses are known for being thorough, honest, and actionable.
You never provide generic advice - every insight is specific to the trade at hand.`
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.4, // Slightly higher for more nuanced analysis
        response_format: { type: 'json_object' },
        max_tokens: 3000
      });

      const response = completion.choices[0]?.message?.content;
      if (!response) {
        throw new Error('No response from AI');
      }

      const rationale = JSON.parse(response) as StructuredRationale;
      return rationale;
    } catch (error: any) {
      console.error(`[RationaleGenerator] AI generation failed:`, error);
      throw error;
    }
  }

  /**
   * Create embedding for rationale
   */
  async createRationaleEmbedding(
    rationale: StructuredRationale,
    context: EnrichedTradeContext,
    evaluationId?: string,
    userId?: string
  ): Promise<string | null> {
    if (!evaluationId || !userId) {
      console.warn('[RationaleGenerator] Skipping embedding save - missing evaluationId or userId');
      return null;
    }

    try {
      // Create condensed text representation for embedding
      const embeddingText = this.buildEmbeddingText(rationale, context);

      // Generate embedding
      const embedding = await this.createEmbedding(embeddingText);

      // Save to database
      const { data, error } = await this.supabase
        .from('trade_rationale_embeddings')
        .insert({
          trade_evaluation_id: evaluationId,
          user_id: userId,
          rationale_embedding: embedding,
          rationale_text: JSON.stringify(rationale),
          trade_details: {
            symbol: context.candidate.symbol,
            strategy_type: context.candidate.strategy_type,
            dte: context.candidate.dte,
            delta: context.candidate.delta,
            iv_rank: context.candidate.iv_rank
          }
        })
        .select()
        .single();

      if (error) {
        console.error(`[RationaleGenerator] Failed to save embedding:`, error);
        return null;
      }

      console.log(`[RationaleGenerator] Rationale embedding saved: ${data.id}`);
      return data.id;
    } catch (error) {
      console.error(`[RationaleGenerator] Embedding creation failed:`, error);
      return null;
    }
  }

  /**
   * Build condensed text for embedding (captures key aspects)
   */
  private buildEmbeddingText(
    rationale: StructuredRationale,
    context: EnrichedTradeContext
  ): string {
    const parts: string[] = [];

    // Trade basics
    parts.push(`${context.candidate.symbol} ${context.candidate.strategy_type}`);
    parts.push(`DTE: ${context.candidate.dte}, Delta: ${context.candidate.delta?.toFixed(3)}`);
    parts.push(`IV Rank: ${context.candidate.iv_rank}`);

    // Thesis
    parts.push(rationale.summary.one_sentence_thesis);

    // Key factors
    parts.push('Strengths: ' + rationale.summary.key_strengths.join('; '));
    parts.push('Concerns: ' + rationale.summary.key_concerns.join('; '));

    // Market context
    parts.push(rationale.analysis.market_context.sentiment_summary);
    parts.push(rationale.analysis.market_context.technical_setup);

    // Risk assessment
    parts.push(rationale.analysis.risk_assessment.most_likely_outcome);

    // Decision logic
    parts.push(rationale.decision_logic.why_this_recommendation);

    return parts.join(' | ');
  }

  /**
   * Build query text for finding similar trades
   */
  private buildTradeQueryText(context: EnrichedTradeContext): string {
    const parts: string[] = [];

    parts.push(`${context.candidate.symbol} ${context.candidate.strategy_type}`);
    parts.push(`DTE around ${context.candidate.dte} days`);
    parts.push(`Delta approximately ${context.candidate.delta?.toFixed(2)}`);
    parts.push(`IV Rank ${context.candidate.iv_rank}`);

    return parts.join(' | ');
  }

  /**
   * Create embedding using Ollama qwen3-embedding (2000 dimensions)
   */
  private async createEmbedding(text: string): Promise<number[]> {
    return generateEmbedding(text);
  }

  /**
   * Record trade outcome for learning
   */
  async recordTradeOutcome(
    evaluationId: string,
    outcome: {
      actual_outcome: 'win' | 'loss' | 'break_even';
      actual_roi: number;
      days_held: number;
      exit_reason: string;
    }
  ): Promise<void> {
    try {
      // Update the ai_trade_evaluations table
      await this.supabase
        .from('ai_trade_evaluations')
        .update({
          actual_outcome: outcome.actual_outcome,
          actual_roi: outcome.actual_roi,
          trade_was_executed: true
        })
        .eq('id', evaluationId);

      // Update the rationale embedding with outcome
      await this.supabase
        .from('trade_rationale_embeddings')
        .update({
          outcome,
          outcome_recorded_at: new Date().toISOString()
        })
        .eq('trade_evaluation_id', evaluationId);

      console.log(`[RationaleGenerator] Outcome recorded for evaluation ${evaluationId}`);
    } catch (error) {
      console.error(`[RationaleGenerator] Failed to record outcome:`, error);
      throw error;
    }
  }
}

// Singleton instance
let rationaleGenerator: EnhancedRationaleGenerator;

export function getEnhancedRationaleGenerator(): EnhancedRationaleGenerator {
  if (!rationaleGenerator) {
    rationaleGenerator = new EnhancedRationaleGenerator();
  }
  return rationaleGenerator;
}
