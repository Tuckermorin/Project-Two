// src/lib/services/pattern-detection-service.ts
// Detect and analyze behavioral patterns from trade snapshots

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// ============================================================================
// Types
// ============================================================================

export interface PatternQuery {
  // Greek thresholds
  delta_min?: number;
  delta_max?: number;
  theta_min?: number;
  theta_max?: number;
  gamma_min?: number;
  gamma_max?: number;

  // P&L thresholds
  pnl_min?: number;
  pnl_max?: number;

  // IV thresholds
  iv_rank_min?: number;
  iv_rank_max?: number;

  // Time thresholds
  days_in_trade_min?: number;
  days_in_trade_max?: number;
  dte_min?: number;
  dte_max?: number;

  // Market context
  vix_min?: number;
  vix_max?: number;

  // Filter options
  symbol?: string;
  strategy?: string;
  user_id?: string;
}

export interface PatternAnalysis {
  pattern_description: string;
  total_snapshots: number;
  snapshots_with_outcomes: number;
  wins: number;
  losses: number;
  win_rate: number;
  avg_final_pnl_percent: number;
  avg_days_in_trade: number;
  avg_days_to_expiration: number;
  confidence: 'high' | 'medium' | 'low';
  insight: string;
}

// ============================================================================
// Pattern Detection Service
// ============================================================================

export class PatternDetectionService {
  /**
   * Analyze pattern using database function
   */
  async analyzePattern(query: PatternQuery): Promise<PatternAnalysis> {
    console.log('[Pattern] Analyzing pattern:', query);

    const { data, error } = await supabase.rpc('analyze_snapshot_pattern', {
      p_user_id: query.user_id,
      p_delta_min: query.delta_min,
      p_delta_max: query.delta_max,
      p_pnl_min: query.pnl_min,
      p_pnl_max: query.pnl_max,
      p_iv_rank_min: query.iv_rank_min,
      p_iv_rank_max: query.iv_rank_max,
    });

    if (error) {
      console.error('[Pattern] Error analyzing pattern:', error);
      throw error;
    }

    const result = data?.[0] || {};

    const totalSnapshots = result.total_snapshots || 0;
    const snapshotsWithOutcomes = result.snapshots_with_outcomes || 0;
    const wins = result.wins || 0;
    const losses = result.losses || 0;
    const winRate = result.win_rate || 0;
    const avgFinalPnl = result.avg_final_pnl_percent || 0;
    const avgDaysInTrade = result.avg_days_in_trade || 0;
    const avgDaysToExpiration = result.avg_days_to_expiration || 0;

    // Determine confidence based on sample size
    const confidence: 'high' | 'medium' | 'low' =
      snapshotsWithOutcomes >= 20 ? 'high' :
      snapshotsWithOutcomes >= 10 ? 'medium' :
      'low';

    // Generate insight
    const insight = this.generateInsight(query, {
      winRate,
      avgFinalPnl,
      totalSnapshots: snapshotsWithOutcomes,
      avgDaysInTrade,
    });

    const patternDescription = this.buildPatternDescription(query);

    return {
      pattern_description: patternDescription,
      total_snapshots: totalSnapshots,
      snapshots_with_outcomes: snapshotsWithOutcomes,
      wins,
      losses,
      win_rate: winRate,
      avg_final_pnl_percent: avgFinalPnl,
      avg_days_in_trade: avgDaysInTrade,
      avg_days_to_expiration: avgDaysToExpiration,
      confidence,
      insight,
    };
  }

  /**
   * Analyze delta threshold patterns
   * Example: "When delta > 0.40, what happens?"
   */
  async analyzeDeltaThreshold(
    threshold: number,
    options: { user_id?: string; above?: boolean } = {}
  ): Promise<PatternAnalysis> {
    const { user_id, above = true } = options;

    const query: PatternQuery = {
      user_id,
      ...(above ? { delta_min: threshold } : { delta_max: threshold }),
    };

    return this.analyzePattern(query);
  }

  /**
   * Analyze P&L milestone patterns
   * Example: "When trades reach 50% profit, what happens next?"
   */
  async analyzePnLMilestone(
    pnlThreshold: number,
    options: { user_id?: string; above?: boolean } = {}
  ): Promise<PatternAnalysis> {
    const { user_id, above = true } = options;

    const query: PatternQuery = {
      user_id,
      ...(above ? { pnl_min: pnlThreshold } : { pnl_max: pnlThreshold }),
    };

    return this.analyzePattern(query);
  }

  /**
   * Analyze IV environment patterns
   * Example: "How do trades perform when IV Rank > 70?"
   */
  async analyzeIVEnvironment(
    ivRankMin: number,
    options: { user_id?: string } = {}
  ): Promise<PatternAnalysis> {
    const { user_id } = options;

    const query: PatternQuery = {
      user_id,
      iv_rank_min: ivRankMin,
    };

    return this.analyzePattern(query);
  }

  /**
   * Get common patterns (pre-defined queries)
   */
  async getCommonPatterns(user_id: string): Promise<PatternAnalysis[]> {
    console.log('[Pattern] Fetching common patterns');

    const patterns = await Promise.all([
      // Delta thresholds
      this.analyzeDeltaThreshold(0.30, { user_id }),
      this.analyzeDeltaThreshold(0.40, { user_id }),
      this.analyzeDeltaThreshold(0.50, { user_id }),

      // P&L milestones
      this.analyzePnLMilestone(50, { user_id }),
      this.analyzePnLMilestone(75, { user_id }),
      this.analyzePnLMilestone(-25, { user_id, above: false }),
      this.analyzePnLMilestone(-50, { user_id, above: false }),

      // IV environments
      this.analyzeIVEnvironment(70, { user_id }),
      this.analyzeIVEnvironment(50, { user_id }),
    ]);

    // Filter out patterns with insufficient data
    return patterns.filter(p => p.snapshots_with_outcomes >= 5);
  }

  /**
   * Advanced pattern: "Gave back profits" analysis
   * Trades that were profitable but ended as losses
   */
  async analyzeGaveBackProfits(user_id: string): Promise<{
    total_trades: number;
    gave_back_count: number;
    gave_back_rate: number;
    avg_peak_pnl: number;
    avg_final_pnl: number;
    common_characteristics: string[];
  }> {
    console.log('[Pattern] Analyzing "gave back profits" pattern');

    const { data, error } = await supabase
      .from('trade_behavioral_patterns')
      .select('*')
      .eq('user_id', user_id)
      .eq('gave_back_profits', true);

    if (error) {
      console.error('[Pattern] Error:', error);
      throw error;
    }

    const gaveBackTrades = data || [];
    const { count: totalCount } = await supabase
      .from('trade_behavioral_patterns')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user_id);

    const total = totalCount || 0;
    const gaveBack = gaveBackTrades.length;
    const gaveBackRate = total > 0 ? (gaveBack / total) * 100 : 0;

    const avgPeakPnl = gaveBackTrades.length > 0
      ? gaveBackTrades.reduce((sum, t) => sum + (t.peak_unrealized_pnl_percent || 0), 0) / gaveBackTrades.length
      : 0;

    const avgFinalPnl = gaveBackTrades.length > 0
      ? gaveBackTrades.reduce((sum, t) => sum + (t.realized_pl_percent || 0), 0) / gaveBackTrades.length
      : 0;

    // Analyze common characteristics
    const characteristics: string[] = [];

    const highDeltaCount = gaveBackTrades.filter(t => t.high_delta_reached).length;
    if (highDeltaCount / gaveBackTrades.length > 0.6) {
      characteristics.push(`${((highDeltaCount / gaveBackTrades.length) * 100).toFixed(0)}% reached high delta (>0.40)`);
    }

    const avgDaysHeld = gaveBackTrades.length > 0
      ? gaveBackTrades.reduce((sum, t) => sum + (t.days_held || 0), 0) / gaveBackTrades.length
      : 0;

    if (avgDaysHeld > 21) {
      characteristics.push(`Avg ${avgDaysHeld.toFixed(0)} days held (theta decay risk)`);
    }

    return {
      total_trades: total,
      gave_back_count: gaveBack,
      gave_back_rate: gaveBackRate,
      avg_peak_pnl: avgPeakPnl,
      avg_final_pnl: avgFinalPnl,
      common_characteristics: characteristics,
    };
  }

  // ============================================================================
  // Helper Methods
  // ============================================================================

  private buildPatternDescription(query: PatternQuery): string {
    const parts: string[] = [];

    if (query.delta_min != null || query.delta_max != null) {
      if (query.delta_min != null && query.delta_max == null) {
        parts.push(`Delta ≥ ${query.delta_min.toFixed(2)}`);
      } else if (query.delta_min == null && query.delta_max != null) {
        parts.push(`Delta ≤ ${query.delta_max.toFixed(2)}`);
      } else {
        parts.push(`Delta between ${query.delta_min?.toFixed(2)} and ${query.delta_max?.toFixed(2)}`);
      }
    }

    if (query.pnl_min != null || query.pnl_max != null) {
      if (query.pnl_min != null && query.pnl_max == null) {
        parts.push(`P&L ≥ ${query.pnl_min.toFixed(0)}%`);
      } else if (query.pnl_min == null && query.pnl_max != null) {
        parts.push(`P&L ≤ ${query.pnl_max.toFixed(0)}%`);
      } else {
        parts.push(`P&L between ${query.pnl_min?.toFixed(0)}% and ${query.pnl_max?.toFixed(0)}%`);
      }
    }

    if (query.iv_rank_min != null) {
      parts.push(`IV Rank ≥ ${query.iv_rank_min.toFixed(0)}%`);
    }

    if (query.days_in_trade_min != null) {
      parts.push(`≥ ${query.days_in_trade_min} days in trade`);
    }

    if (query.dte_min != null || query.dte_max != null) {
      if (query.dte_min != null && query.dte_max == null) {
        parts.push(`≥ ${query.dte_min} DTE`);
      } else if (query.dte_min == null && query.dte_max != null) {
        parts.push(`≤ ${query.dte_max} DTE`);
      }
    }

    if (query.symbol) {
      parts.push(`Symbol: ${query.symbol}`);
    }

    if (query.strategy) {
      parts.push(`Strategy: ${query.strategy}`);
    }

    return parts.length > 0 ? parts.join(', ') : 'All trades';
  }

  private generateInsight(
    query: PatternQuery,
    stats: {
      winRate: number;
      avgFinalPnl: number;
      totalSnapshots: number;
      avgDaysInTrade: number;
    }
  ): string {
    const { winRate, avgFinalPnl, totalSnapshots, avgDaysInTrade } = stats;

    if (totalSnapshots < 5) {
      return 'Insufficient data for reliable insight. Need more historical trades matching this pattern.';
    }

    const insights: string[] = [];

    // Delta-based insights
    if (query.delta_min != null && query.delta_min >= 0.40) {
      const lossRate = 100 - winRate;
      insights.push(
        `When delta reaches ${query.delta_min.toFixed(2)} or higher, trades have a ${lossRate.toFixed(0)}% loss rate. ` +
        `Consider closing positions or adjusting when delta exceeds this threshold.`
      );
    } else if (query.delta_min != null && query.delta_min >= 0.30) {
      insights.push(
        `Trades with delta ≥ ${query.delta_min.toFixed(2)} show ${winRate.toFixed(0)}% win rate. ` +
        `Monitor closely for delta expansion - it often precedes adverse price movement.`
      );
    }

    // P&L-based insights
    if (query.pnl_min != null && query.pnl_min >= 50) {
      if (winRate < 70) {
        insights.push(
          `Only ${winRate.toFixed(0)}% of trades that reach ${query.pnl_min}% profit close profitably. ` +
          `Strong exit signal: take profits when reaching this milestone rather than holding for max gain.`
        );
      } else {
        insights.push(
          `${winRate.toFixed(0)}% of trades reaching ${query.pnl_min}% profit close profitably. ` +
          `Consider this a good take-profit target.`
        );
      }
    }

    if (query.pnl_max != null && query.pnl_max <= -25) {
      insights.push(
        `Trades declining to ${query.pnl_max}% loss have ${winRate.toFixed(0)}% recovery rate. ` +
        `${winRate < 30 ? 'Strong stop-loss signal - cut losses early.' : 'Some recovery potential, but monitor risk carefully.'}`
      );
    }

    // IV-based insights
    if (query.iv_rank_min != null && query.iv_rank_min >= 70) {
      insights.push(
        `High IV environment (IV Rank ≥ ${query.iv_rank_min}%) shows ${winRate.toFixed(0)}% win rate. ` +
        `${winRate > 60 ? 'Favorable for premium selling.' : 'Increased risk - IV expansion can indicate volatility spikes.'}`
      );
    }

    // Time-based insights
    if (avgDaysInTrade > 21) {
      insights.push(
        `Trades held avg ${avgDaysInTrade.toFixed(0)} days. ` +
        `Extended hold times increase theta decay benefits but also exposure risk.`
      );
    }

    // General insight if no specific pattern
    if (insights.length === 0) {
      if (winRate >= 70) {
        insights.push(`Strong pattern: ${winRate.toFixed(0)}% win rate with avg ${avgFinalPnl.toFixed(1)}% return.`);
      } else if (winRate >= 50) {
        insights.push(`Moderate pattern: ${winRate.toFixed(0)}% win rate. Review risk management.`);
      } else {
        insights.push(`Weak pattern: ${winRate.toFixed(0)}% win rate. Avoid this setup or adjust criteria.`);
      }
    }

    return insights.join(' ');
  }
}

// Singleton
let patternService: PatternDetectionService;

export const getPatternDetectionService = (): PatternDetectionService => {
  if (!patternService) {
    patternService = new PatternDetectionService();
  }
  return patternService;
};
