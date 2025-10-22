// IPS Performance Calculator Service
// High-level service for analyzing and comparing IPS configurations
// Wraps IPSBacktester to provide convenient analysis functions

import { createClient } from '@supabase/supabase-js';
import { IPSBacktester, type BacktestConfig, type BacktestResult } from '../agent/ips-backtester';

// ============================================================================
// Types
// ============================================================================

export interface IPSComparison {
  ips_ids: string[];
  comparison_name?: string;
  start_date: string;
  end_date: string;
  symbols?: string[];
  results: Record<string, BacktestResult>;
  winner: {
    best_win_rate: string;
    best_roi: string;
    best_sharpe: string;
    best_overall: string;
  };
  statistical_significance: {
    win_rate_p_value?: number;
    roi_p_value?: number;
    significant_difference: boolean;
  };
}

export interface IPSRankings {
  rankings: Array<{
    ips_id: string;
    ips_name: string;
    rank: number;
    composite_score: number;
    win_rate: number;
    avg_roi: number;
    sharpe_ratio: number;
    backtest_count: number;
    last_tested: string;
  }>;
  generated_at: string;
}

export interface OptimizationSuggestion {
  ips_id: string;
  current_performance: {
    win_rate: number;
    avg_roi: number;
    sharpe_ratio: number;
  };
  weak_factors: Array<{
    factor_key: string;
    factor_name: string;
    impact: 'high' | 'medium' | 'low';
    suggestion: string;
  }>;
  strong_factors: Array<{
    factor_key: string;
    factor_name: string;
    correlation_with_wins: number;
  }>;
  recommended_adjustments: string[];
}

// ============================================================================
// IPS Performance Calculator Class
// ============================================================================

export class IPSPerformanceCalculator {
  private backtester: IPSBacktester;
  private mainDb: ReturnType<typeof createClient>;

  constructor() {
    this.backtester = new IPSBacktester();
    this.mainDb = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
  }

  /**
   * Compare multiple IPS configurations against same dataset
   */
  async compareIPSConfigurations(
    ipsIds: string[],
    startDate: string,
    endDate: string,
    options: {
      comparisonName?: string;
      symbols?: string[];
      strategyFilter?: string;
    } = {}
  ): Promise<IPSComparison> {
    console.log(`[IPSPerformanceCalculator] Comparing ${ipsIds.length} IPS configurations`);

    // Fetch IPS configurations
    const { data: ipsConfigs, error } = await this.mainDb
      .from('ips_configurations')
      .select('*')
      .in('id', ipsIds);

    if (error) {
      throw new Error(`Failed to fetch IPS configurations: ${error.message}`);
    }

    if (!ipsConfigs || ipsConfigs.length === 0) {
      throw new Error('No IPS configurations found');
    }

    // Run backtests for each IPS
    const results: Record<string, BacktestResult> = {};

    for (const ipsConfig of ipsConfigs) {
      console.log(`[IPSPerformanceCalculator] Running backtest for ${ipsConfig.name}...`);

      // Fetch IPS factors
      const { data: factors } = await this.mainDb
        .from('ips_factors')
        .select('*')
        .eq('ips_id', ipsConfig.id);

      const backtestConfig: BacktestConfig = {
        ipsId: ipsConfig.id,
        ipsName: ipsConfig.name,
        ipsConfig: {
          ...ipsConfig,
          factors: factors || [],
        },
        startDate,
        endDate,
        symbols: options.symbols,
        strategyFilter: options.strategyFilter,
        userId: ipsConfig.user_id,
      };

      const result = await this.backtester.runBacktest(backtestConfig);
      results[ipsConfig.id] = result;
    }

    // Determine winners
    const winner = this.determineWinners(results);

    // Calculate statistical significance
    const statSig = this.calculateStatisticalSignificance(results);

    // Save comparison to database
    const comparisonId = await this.saveComparison({
      ips_ids: ipsIds,
      comparison_name: options.comparisonName,
      start_date: startDate,
      end_date: endDate,
      symbols: options.symbols,
      winner,
      statistical_significance: statSig,
      user_id: ipsConfigs[0].user_id,
    });

    console.log(`[IPSPerformanceCalculator] Comparison complete (ID: ${comparisonId})`);

    return {
      ips_ids: ipsIds,
      comparison_name: options.comparisonName,
      start_date: startDate,
      end_date: endDate,
      symbols: options.symbols,
      results,
      winner,
      statistical_significance: statSig,
    };
  }

  /**
   * Get IPS leaderboard/rankings
   */
  async getIPSRankings(
    options: {
      userId?: string;
      limit?: number;
      minBacktestCount?: number;
    } = {}
  ): Promise<IPSRankings> {
    const { userId, limit = 20, minBacktestCount = 1 } = options;

    console.log('[IPSPerformanceCalculator] Generating IPS rankings...');

    // Query the leaderboard view
    let query = this.mainDb
      .from('v_ips_leaderboard')
      .select('*')
      .gte('backtest_count', minBacktestCount);

    if (limit) {
      query = query.limit(limit);
    }

    const { data, error } = await query;

    if (error) {
      throw new Error(`Failed to fetch IPS rankings: ${error.message}`);
    }

    // Calculate composite scores
    const rankings = (data || []).map((row, index) => {
      // Composite score: weighted combination of metrics
      // 40% Sharpe, 30% Win Rate, 30% ROI
      const sharpeScore = (row.avg_sharpe || 0) * 10; // Scale to 0-100
      const winRateScore = (row.avg_win_rate || 0);
      const roiScore = Math.min(100, (row.avg_roi || 0) * 10);

      const compositeScore =
        sharpeScore * 0.4 + winRateScore * 0.3 + roiScore * 0.3;

      return {
        ips_id: row.ips_id,
        ips_name: row.ips_name,
        rank: index + 1,
        composite_score: Math.round(compositeScore * 100) / 100,
        win_rate: row.avg_win_rate || 0,
        avg_roi: row.avg_roi || 0,
        sharpe_ratio: row.avg_sharpe || 0,
        backtest_count: row.backtest_count || 0,
        last_tested: row.last_tested,
      };
    });

    return {
      rankings,
      generated_at: new Date().toISOString(),
    };
  }

  /**
   * Analyze IPS and suggest optimizations
   */
  async suggestIPSOptimizations(
    ipsId: string,
    backtestRunId?: string
  ): Promise<OptimizationSuggestion> {
    console.log(`[IPSPerformanceCalculator] Analyzing IPS ${ipsId} for optimizations...`);

    // Get most recent backtest if not specified
    if (!backtestRunId) {
      const { data: runs } = await this.mainDb
        .from('ips_backtest_runs')
        .select('id')
        .eq('ips_id', ipsId)
        .eq('status', 'completed')
        .order('created_at', { ascending: false })
        .limit(1);

      if (!runs || runs.length === 0) {
        throw new Error('No completed backtests found for this IPS');
      }

      backtestRunId = runs[0].id;
    }

    // Get backtest results
    const { data: results } = await this.mainDb
      .from('ips_backtest_results')
      .select('*')
      .eq('run_id', backtestRunId)
      .single();

    if (!results) {
      throw new Error('Backtest results not found');
    }

    // Get trade-level evaluations
    const { data: tradeMatches } = await this.mainDb
      .from('ips_backtest_trade_matches')
      .select('*')
      .eq('run_id', backtestRunId);

    if (!tradeMatches || tradeMatches.length === 0) {
      throw new Error('No trade matches found');
    }

    // Analyze factor performance
    const factorAnalysis = this.analyzeFactorPerformance(tradeMatches);

    // Build suggestions
    const weakFactors = factorAnalysis.weak_factors.map((f) => ({
      factor_key: f.factor_key,
      factor_name: f.factor_name,
      impact: f.impact as 'high' | 'medium' | 'low',
      suggestion: f.suggestion,
    }));

    const strongFactors = factorAnalysis.strong_factors.map((f) => ({
      factor_key: f.factor_key,
      factor_name: f.factor_name,
      correlation_with_wins: f.correlation_with_wins,
    }));

    const recommendedAdjustments = this.generateRecommendations(
      results,
      factorAnalysis
    );

    return {
      ips_id: ipsId,
      current_performance: {
        win_rate: results.win_rate,
        avg_roi: results.avg_roi,
        sharpe_ratio: results.sharpe_ratio || 0,
      },
      weak_factors: weakFactors,
      strong_factors: strongFactors,
      recommended_adjustments: recommendedAdjustments,
    };
  }

  /**
   * Get historical performance trend for an IPS
   */
  async getIPSPerformanceTrend(
    ipsId: string,
    options: {
      limit?: number;
      groupBy?: 'day' | 'week' | 'month';
    } = {}
  ): Promise<any> {
    const { limit = 30 } = options;

    console.log(`[IPSPerformanceCalculator] Getting performance trend for IPS ${ipsId}...`);

    // Get all backtest runs for this IPS
    const { data: runs } = await this.mainDb
      .from('ips_backtest_runs')
      .select('id, start_date, end_date, created_at')
      .eq('ips_id', ipsId)
      .eq('status', 'completed')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (!runs || runs.length === 0) {
      return {
        ips_id: ipsId,
        trend_data: [],
        message: 'No completed backtests found',
      };
    }

    // Get performance snapshots for each run
    const trendData = [];
    for (const run of runs) {
      const { data: snapshots } = await this.mainDb
        .from('ips_performance_snapshots')
        .select('*')
        .eq('run_id', run.id)
        .order('snapshot_date', { ascending: true });

      if (snapshots && snapshots.length > 0) {
        trendData.push({
          run_id: run.id,
          test_period: `${run.start_date} to ${run.end_date}`,
          created_at: run.created_at,
          snapshots,
        });
      }
    }

    return {
      ips_id: ipsId,
      trend_data: trendData,
    };
  }

  // ============================================================================
  // Private Helper Methods
  // ============================================================================

  private determineWinners(results: Record<string, BacktestResult>): IPSComparison['winner'] {
    let bestWinRate = { ipsId: '', value: -1 };
    let bestRoi = { ipsId: '', value: -Infinity };
    let bestSharpe = { ipsId: '', value: -Infinity };

    for (const [ipsId, result] of Object.entries(results)) {
      if (result.winRate > bestWinRate.value) {
        bestWinRate = { ipsId, value: result.winRate };
      }
      if (result.avgRoi > bestRoi.value) {
        bestRoi = { ipsId, value: result.avgRoi };
      }
      if ((result.sharpeRatio || 0) > bestSharpe.value) {
        bestSharpe = { ipsId, value: result.sharpeRatio || 0 };
      }
    }

    // Best overall: composite score
    let bestOverall = { ipsId: '', score: -Infinity };
    for (const [ipsId, result] of Object.entries(results)) {
      const score =
        result.winRate * 0.3 +
        result.avgRoi * 0.3 +
        (result.sharpeRatio || 0) * 10 * 0.4;
      if (score > bestOverall.score) {
        bestOverall = { ipsId, score };
      }
    }

    return {
      best_win_rate: bestWinRate.ipsId,
      best_roi: bestRoi.ipsId,
      best_sharpe: bestSharpe.ipsId,
      best_overall: bestOverall.ipsId,
    };
  }

  private calculateStatisticalSignificance(
    results: Record<string, BacktestResult>
  ): IPSComparison['statistical_significance'] {
    // Simplified statistical significance calculation
    // In production, use proper t-test or similar
    const ipsIds = Object.keys(results);

    if (ipsIds.length < 2) {
      return {
        significant_difference: false,
      };
    }

    // Compare first two IPSs (simplified)
    const result1 = results[ipsIds[0]];
    const result2 = results[ipsIds[1]];

    const winRateDiff = Math.abs(result1.winRate - result2.winRate);
    const roiDiff = Math.abs(result1.avgRoi - result2.avgRoi);

    // Simple heuristic: >10% difference is significant
    const significantDifference = winRateDiff > 10 || roiDiff > 10;

    return {
      win_rate_p_value: undefined, // TODO: Implement proper statistical test
      roi_p_value: undefined,
      significant_difference: significantDifference,
    };
  }

  private async saveComparison(data: any): Promise<string> {
    const { data: result, error } = await this.mainDb
      .from('ips_comparison_matrix')
      .insert({
        ips_ids: data.ips_ids,
        comparison_name: data.comparison_name,
        start_date: data.start_date,
        end_date: data.end_date,
        symbols: data.symbols,
        best_win_rate_ips_id: data.winner.best_win_rate,
        best_roi_ips_id: data.winner.best_roi,
        best_sharpe_ips_id: data.winner.best_sharpe,
        best_overall_ips_id: data.winner.best_overall,
        summary_stats: data.results,
        statistical_significance: data.statistical_significance,
        user_id: data.user_id,
      })
      .select('id')
      .single();

    if (error) {
      throw new Error(`Failed to save comparison: ${error.message}`);
    }

    return result.id;
  }

  private analyzeFactorPerformance(tradeMatches: any[]): any {
    // Analyze which factors correlate with wins vs losses
    const factorStats: Record<string, { wins: number; losses: number; count: number }> = {};

    for (const match of tradeMatches) {
      const factorScores = match.factor_scores || {};
      const isWin = match.actual_outcome === 'win';

      for (const [factorKey, score] of Object.entries(factorScores)) {
        if (!factorStats[factorKey]) {
          factorStats[factorKey] = { wins: 0, losses: 0, count: 0 };
        }

        factorStats[factorKey].count++;
        if (isWin) {
          factorStats[factorKey].wins++;
        } else {
          factorStats[factorKey].losses++;
        }
      }
    }

    // Identify weak factors (low win correlation)
    const weakFactors = [];
    const strongFactors = [];

    for (const [factorKey, stats] of Object.entries(factorStats)) {
      const winRate = stats.wins / stats.count;
      const correlation = winRate - 0.5; // Deviation from random

      if (correlation < -0.1) {
        // Negatively correlated
        weakFactors.push({
          factor_key: factorKey,
          factor_name: factorKey.replace(/_/g, ' '),
          impact: correlation < -0.2 ? 'high' : 'medium',
          suggestion: `Consider relaxing or removing ${factorKey} - it may be filtering out profitable trades`,
        });
      } else if (correlation > 0.1) {
        // Positively correlated
        strongFactors.push({
          factor_key: factorKey,
          factor_name: factorKey.replace(/_/g, ' '),
          correlation_with_wins: correlation,
        });
      }
    }

    return { weak_factors: weakFactors, strong_factors: strongFactors };
  }

  private generateRecommendations(results: any, factorAnalysis: any): string[] {
    const recommendations = [];

    // Win rate recommendations
    if (results.win_rate < 50) {
      recommendations.push('Win rate below 50% - consider loosening IPS criteria');
    } else if (results.win_rate > 70) {
      recommendations.push('Win rate above 70% - excellent performance');
    }

    // ROI recommendations
    if (results.avg_roi < 5) {
      recommendations.push('Average ROI below 5% - consider targeting higher-yield opportunities');
    }

    // Sharpe ratio recommendations
    if ((results.sharpe_ratio || 0) < 0.5) {
      recommendations.push('Low Sharpe ratio - consider improving risk-adjusted returns');
    }

    // Factor-specific recommendations
    if (factorAnalysis.weak_factors.length > 0) {
      recommendations.push(
        `${factorAnalysis.weak_factors.length} underperforming factors identified - review and adjust`
      );
    }

    return recommendations;
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let calculatorInstance: IPSPerformanceCalculator | null = null;

export function getIPSPerformanceCalculator(): IPSPerformanceCalculator {
  if (!calculatorInstance) {
    calculatorInstance = new IPSPerformanceCalculator();
  }
  return calculatorInstance;
}

// ============================================================================
// Convenience Functions
// ============================================================================

export async function compareIPSs(
  ipsIds: string[],
  startDate: string,
  endDate: string,
  options?: {
    comparisonName?: string;
    symbols?: string[];
    strategyFilter?: string;
  }
): Promise<IPSComparison> {
  return getIPSPerformanceCalculator().compareIPSConfigurations(
    ipsIds,
    startDate,
    endDate,
    options
  );
}

export async function getIPSLeaderboard(
  options?: {
    userId?: string;
    limit?: number;
    minBacktestCount?: number;
  }
): Promise<IPSRankings> {
  return getIPSPerformanceCalculator().getIPSRankings(options);
}

export async function getIPSOptimizations(
  ipsId: string,
  backtestRunId?: string
): Promise<OptimizationSuggestion> {
  return getIPSPerformanceCalculator().suggestIPSOptimizations(ipsId, backtestRunId);
}
