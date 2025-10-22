// IPS Backtesting Engine
// Runs historical analysis of IPS configurations to determine which perform best
// Evaluates past trades against IPS criteria and calculates performance metrics

import { createClient } from '@supabase/supabase-js';
import { v4 as uuidv4 } from 'uuid';

// ============================================================================
// Types
// ============================================================================

export interface BacktestConfig {
  ipsId: string;
  ipsName: string;
  ipsConfig: any; // Full IPS configuration

  // Date range
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD

  // Filters
  symbols?: string[]; // Specific symbols (null = all)
  strategyFilter?: string; // Strategy type filter
  minTrades?: number; // Minimum trades required

  // User
  userId: string;
}

export interface BacktestResult {
  runId: string;
  ipsId: string;

  // Summary
  totalTradesAnalyzed: number;
  tradesMatched: number; // Trades that fit the strategy
  tradesPassed: number; // Trades that passed IPS
  passRate: number; // Percentage

  // Performance
  winRate: number;
  avgRoi: number;
  sharpeRatio: number | null;
  maxDrawdown: number | null;

  // Details
  detailedResults: BacktestDetailedResults;
}

export interface BacktestDetailedResults {
  // Win/Loss
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;

  // P&L
  totalPnl: number;
  avgPnl: number;
  medianPnl: number | null;
  maxWin: number | null;
  maxLoss: number | null;

  // ROI
  avgRoi: number;
  medianRoi: number | null;
  bestRoi: number | null;
  worstRoi: number | null;

  // Risk
  sharpeRatio: number | null;
  maxDrawdown: number | null;
  profitFactor: number | null;

  // Consistency
  winStreakMax: number;
  lossStreakMax: number;

  // Time
  avgDaysHeld: number | null;
}

export interface TradeEvaluation {
  tradeId: string;
  ipsScore: number;
  passedIps: boolean;
  factorsPassed: number;
  factorsFailed: number;
  factorScores: Record<string, any>;
  failingFactors: string[];
  outcome: 'win' | 'loss' | 'pending';
  realizedPnl: number | null;
  realizedRoi: number | null;
}

// ============================================================================
// Backtesting Engine Class
// ============================================================================

export class IPSBacktester {
  private db: ReturnType<typeof createClient>;

  constructor() {
    this.db = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
  }

  /**
   * Run a complete backtest of an IPS configuration
   */
  async runBacktest(config: BacktestConfig): Promise<BacktestResult> {
    console.log(`[IPSBacktester] Starting backtest for ${config.ipsName}`);
    console.log(`[IPSBacktester] Date range: ${config.startDate} to ${config.endDate}`);

    // Step 1: Create backtest run record
    const runId = await this.createBacktestRun(config);

    try {
      // Step 2: Fetch historical trades
      const trades = await this.fetchHistoricalTrades(config);
      console.log(`[IPSBacktester] Found ${trades.length} historical trades`);

      if (trades.length === 0) {
        throw new Error('No historical trades found for the specified criteria');
      }

      // Step 3: Evaluate each trade against IPS
      const evaluations = await this.evaluateTrades(trades, config.ipsConfig);
      console.log(`[IPSBacktester] Evaluated ${evaluations.length} trades`);

      // Step 4: Save trade-level results
      await this.saveTradeEvaluations(runId, evaluations);

      // Step 5: Calculate performance metrics
      const results = this.calculatePerformanceMetrics(evaluations);
      console.log(`[IPSBacktester] Win Rate: ${results.winRate.toFixed(2)}%`);
      console.log(`[IPSBacktester] Avg ROI: ${results.avgRoi.toFixed(2)}%`);

      // Step 6: Save backtest results
      await this.saveBacktestResults(runId, config.ipsId, results);

      // Step 7: Update run status
      await this.updateRunStatus(runId, 'completed', trades.length, evaluations.length);

      console.log(`[IPSBacktester] Backtest complete!`);

      return {
        runId,
        ipsId: config.ipsId,
        totalTradesAnalyzed: trades.length,
        tradesMatched: evaluations.length,
        tradesPassed: evaluations.filter((e) => e.passedIps).length,
        passRate:
          evaluations.length > 0
            ? (evaluations.filter((e) => e.passedIps).length / evaluations.length) * 100
            : 0,
        winRate: results.winRate,
        avgRoi: results.avgRoi,
        sharpeRatio: results.sharpeRatio,
        maxDrawdown: results.maxDrawdown,
        detailedResults: results,
      };
    } catch (error: any) {
      console.error(`[IPSBacktester] Backtest failed:`, error);
      await this.updateRunStatus(runId, 'failed', 0, 0, error.message);
      throw error;
    }
  }

  /**
   * Create a backtest run record in database
   */
  private async createBacktestRun(config: BacktestConfig): Promise<string> {
    const runId = uuidv4();

    const { error } = await this.db.from('ips_backtest_runs').insert({
      id: runId,
      ips_id: config.ipsId,
      ips_name: config.ipsName,
      ips_config: config.ipsConfig,
      start_date: config.startDate,
      end_date: config.endDate,
      symbols: config.symbols || null,
      strategy_filter: config.strategyFilter || null,
      min_trades: config.minTrades || 10,
      status: 'running',
      started_at: new Date().toISOString(),
      user_id: config.userId,
    });

    if (error) {
      throw new Error(`Failed to create backtest run: ${error.message}`);
    }

    console.log(`[IPSBacktester] Created backtest run: ${runId}`);
    return runId;
  }

  /**
   * Fetch historical trades for the backtest period
   */
  private async fetchHistoricalTrades(config: BacktestConfig): Promise<any[]> {
    let query = this.db
      .from('trades')
      .select('*')
      .in('status', ['closed', 'expired']) // Only completed trades
      .gte('entry_date', config.startDate)
      .lte('entry_date', config.endDate)
      .not('realized_pl', 'is', null); // Must have actual outcome

    // Apply symbol filter if specified
    if (config.symbols && config.symbols.length > 0) {
      query = query.in('symbol', config.symbols);
    }

    // Apply strategy filter if specified
    if (config.strategyFilter) {
      query = query.eq('strategy_type', config.strategyFilter);
    }

    query = query.order('entry_date', { ascending: true });

    const { data, error } = await query;

    if (error) {
      throw new Error(`Failed to fetch historical trades: ${error.message}`);
    }

    return data || [];
  }

  /**
   * Evaluate each trade against IPS criteria
   */
  private async evaluateTrades(trades: any[], ipsConfig: any): Promise<TradeEvaluation[]> {
    const evaluations: TradeEvaluation[] = [];

    for (const trade of trades) {
      const evaluation = this.evaluateSingleTrade(trade, ipsConfig);
      evaluations.push(evaluation);
    }

    return evaluations;
  }

  /**
   * Evaluate a single trade against IPS
   */
  private evaluateSingleTrade(trade: any, ipsConfig: any): TradeEvaluation {
    const factorScores: Record<string, any> = {};
    const failingFactors: string[] = [];
    let factorsPassed = 0;
    let factorsFailed = 0;
    let totalScore = 0;
    let totalWeight = 0;

    // Evaluate each IPS factor
    for (const factor of ipsConfig.factors || []) {
      if (!factor.enabled) continue;

      const factorResult = this.evaluateFactor(trade, factor);
      factorScores[factor.factor_key] = factorResult;

      if (factorResult.passed) {
        factorsPassed++;
        totalScore += factorResult.score * factor.weight;
      } else {
        factorsFailed++;
        failingFactors.push(factor.factor_key);
      }

      totalWeight += factor.weight;
    }

    // Calculate IPS score (0-100)
    const ipsScore = totalWeight > 0 ? (totalScore / totalWeight) * 100 : 0;

    // Determine if trade passed IPS (all enabled factors must pass)
    const passedIps = factorsFailed === 0;

    // Determine actual outcome
    const outcome: 'win' | 'loss' | 'pending' =
      trade.realized_pl > 0 ? 'win' : trade.realized_pl < 0 ? 'loss' : 'pending';

    return {
      tradeId: trade.id,
      ipsScore,
      passedIps,
      factorsPassed,
      factorsFailed,
      factorScores,
      failingFactors,
      outcome,
      realizedPnl: trade.realized_pl,
      realizedRoi: trade.realized_pl_percent,
    };
  }

  /**
   * Evaluate a single IPS factor for a trade
   */
  private evaluateFactor(
    trade: any,
    factor: any
  ): { passed: boolean; score: number; value: any; target: any } {
    const factorKey = factor.factor_key;
    let value: any = null;
    let passed = false;
    let score = 0;

    // Extract value based on factor key
    // This is a simplified version - in production, you'd have more sophisticated factor extraction
    switch (factorKey) {
      case 'iv_rank':
        value = trade.iv_rank || null;
        if (value !== null && factor.threshold !== null) {
          passed = value >= factor.threshold;
          score = passed ? 100 : Math.max(0, (value / factor.threshold) * 100);
        }
        break;

      case 'delta_max':
        value = Math.abs(trade.delta_short_leg || 0);
        if (factor.threshold !== null) {
          passed = value <= factor.threshold;
          score = passed ? 100 : Math.max(0, 100 - ((value - factor.threshold) / factor.threshold) * 100);
        }
        break;

      case 'dte_min':
      case 'dte_max':
        value = trade.dte || null;
        if (value !== null && factor.threshold !== null) {
          if (factorKey === 'dte_min') {
            passed = value >= factor.threshold;
          } else {
            passed = value <= factor.threshold;
          }
          score = passed ? 100 : 50;
        }
        break;

      default:
        // Try to get value from trade directly
        value = trade[factorKey] || null;
        if (value !== null && factor.threshold !== null) {
          if (factor.direction === 'gte') {
            passed = value >= factor.threshold;
          } else {
            passed = value <= factor.threshold;
          }
          score = passed ? 100 : 0;
        }
    }

    return {
      passed,
      score,
      value,
      target: factor.threshold,
    };
  }

  /**
   * Calculate performance metrics from evaluations
   */
  private calculatePerformanceMetrics(evaluations: TradeEvaluation[]): BacktestDetailedResults & { winRate: number } {
    // Filter to only trades that passed IPS
    const passedTrades = evaluations.filter((e) => e.passedIps && e.outcome !== 'pending');

    if (passedTrades.length === 0) {
      return this.getEmptyResults();
    }

    const winningTrades = passedTrades.filter((e) => e.outcome === 'win');
    const losingTrades = passedTrades.filter((e) => e.outcome === 'loss');

    // P&L metrics
    const pnls = passedTrades.map((e) => e.realizedPnl || 0);
    const totalPnl = pnls.reduce((sum, p) => sum + p, 0);
    const avgPnl = totalPnl / passedTrades.length;
    const medianPnl = this.calculateMedian(pnls);
    const maxWin = Math.max(...pnls);
    const maxLoss = Math.min(...pnls);

    // ROI metrics
    const rois = passedTrades.map((e) => e.realizedRoi || 0);
    const avgRoi = rois.reduce((sum, r) => sum + r, 0) / rois.length;
    const medianRoi = this.calculateMedian(rois);
    const bestRoi = Math.max(...rois);
    const worstRoi = Math.min(...rois);

    // Win rate
    const winRate = (winningTrades.length / passedTrades.length) * 100;

    // Risk metrics
    const sharpeRatio = this.calculateSharpeRatio(rois);
    const maxDrawdown = this.calculateMaxDrawdown(pnls);
    const profitFactor = this.calculateProfitFactor(passedTrades);

    // Consistency metrics
    const { maxWinStreak, maxLossStreak } = this.calculateStreaks(passedTrades);

    return {
      totalTrades: passedTrades.length,
      winningTrades: winningTrades.length,
      losingTrades: losingTrades.length,
      winRate,
      totalPnl,
      avgPnl,
      medianPnl,
      maxWin,
      maxLoss,
      avgRoi,
      medianRoi,
      bestRoi,
      worstRoi,
      sharpeRatio,
      maxDrawdown,
      profitFactor,
      winStreakMax: maxWinStreak,
      lossStreakMax: maxLossStreak,
      avgDaysHeld: null, // TODO: Calculate from trade data
    };
  }

  /**
   * Get empty results structure
   */
  private getEmptyResults(): BacktestDetailedResults & { winRate: number } {
    return {
      totalTrades: 0,
      winningTrades: 0,
      losingTrades: 0,
      winRate: 0,
      totalPnl: 0,
      avgPnl: 0,
      medianPnl: null,
      maxWin: null,
      maxLoss: null,
      avgRoi: 0,
      medianRoi: null,
      bestRoi: null,
      worstRoi: null,
      sharpeRatio: null,
      maxDrawdown: null,
      profitFactor: null,
      winStreakMax: 0,
      lossStreakMax: 0,
      avgDaysHeld: null,
    };
  }

  /**
   * Calculate median of an array
   */
  private calculateMedian(values: number[]): number | null {
    if (values.length === 0) return null;

    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);

    return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
  }

  /**
   * Calculate Sharpe ratio
   */
  private calculateSharpeRatio(returns: number[]): number | null {
    if (returns.length < 2) return null;

    const avgReturn = returns.reduce((sum, r) => sum + r, 0) / returns.length;
    const variance =
      returns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / (returns.length - 1);
    const stdDev = Math.sqrt(variance);

    if (stdDev === 0) return null;

    // Assuming risk-free rate of 2% annual
    const riskFreeRate = 0.02;
    return (avgReturn / 100 - riskFreeRate) / (stdDev / 100);
  }

  /**
   * Calculate maximum drawdown
   */
  private calculateMaxDrawdown(pnls: number[]): number | null {
    if (pnls.length === 0) return null;

    let peak = 0;
    let maxDrawdown = 0;
    let cumulative = 0;

    for (const pnl of pnls) {
      cumulative += pnl;
      peak = Math.max(peak, cumulative);
      const drawdown = peak - cumulative;
      maxDrawdown = Math.max(maxDrawdown, drawdown);
    }

    return maxDrawdown;
  }

  /**
   * Calculate profit factor (gross profit / gross loss)
   */
  private calculateProfitFactor(evaluations: TradeEvaluation[]): number | null {
    const grossProfit = evaluations
      .filter((e) => e.outcome === 'win')
      .reduce((sum, e) => sum + (e.realizedPnl || 0), 0);

    const grossLoss = Math.abs(
      evaluations
        .filter((e) => e.outcome === 'loss')
        .reduce((sum, e) => sum + (e.realizedPnl || 0), 0)
    );

    if (grossLoss === 0) return null;

    return grossProfit / grossLoss;
  }

  /**
   * Calculate win and loss streaks
   */
  private calculateStreaks(evaluations: TradeEvaluation[]): {
    maxWinStreak: number;
    maxLossStreak: number;
  } {
    let currentWinStreak = 0;
    let currentLossStreak = 0;
    let maxWinStreak = 0;
    let maxLossStreak = 0;

    for (const evaluation of evaluations) {
      if (evaluation.outcome === 'win') {
        currentWinStreak++;
        currentLossStreak = 0;
        maxWinStreak = Math.max(maxWinStreak, currentWinStreak);
      } else if (evaluation.outcome === 'loss') {
        currentLossStreak++;
        currentWinStreak = 0;
        maxLossStreak = Math.max(maxLossStreak, currentLossStreak);
      }
    }

    return { maxWinStreak, maxLossStreak };
  }

  /**
   * Save trade-level evaluations to database
   */
  private async saveTradeEvaluations(
    runId: string,
    evaluations: TradeEvaluation[]
  ): Promise<void> {
    const records = evaluations.map((e) => ({
      run_id: runId,
      trade_id: e.tradeId,
      ips_score: e.ipsScore,
      passed_ips: e.passedIps,
      factors_passed: e.factorsPassed,
      factors_failed: e.factorsFailed,
      factor_scores: e.factorScores,
      trade_status: e.outcome === 'pending' ? 'pending' : 'closed',
      realized_pnl: e.realizedPnl,
      realized_roi: e.realizedRoi,
      would_have_traded: e.passedIps,
      actual_outcome: e.outcome,
      failing_factors: e.failingFactors,
      marginal_factors: {}, // TODO: Identify factors close to threshold
    }));

    // Insert in batches of 100
    const batchSize = 100;
    for (let i = 0; i < records.length; i += batchSize) {
      const batch = records.slice(i, i + batchSize);
      const { error } = await this.db.from('ips_backtest_trade_matches').insert(batch);

      if (error) {
        console.error(`[IPSBacktester] Failed to save trade evaluations:`, error);
        throw error;
      }
    }

    console.log(`[IPSBacktester] Saved ${evaluations.length} trade evaluations`);
  }

  /**
   * Save backtest results to database
   */
  private async saveBacktestResults(
    runId: string,
    ipsId: string,
    results: BacktestDetailedResults & { winRate: number }
  ): Promise<void> {
    const { error } = await this.db.from('ips_backtest_results').insert({
      run_id: runId,
      ips_id: ipsId,
      total_trades: results.totalTrades,
      winning_trades: results.winningTrades,
      losing_trades: results.losingTrades,
      win_rate: results.winRate,
      total_pnl: results.totalPnl,
      avg_pnl: results.avgPnl,
      median_pnl: results.medianPnl,
      max_win: results.maxWin,
      max_loss: results.maxLoss,
      avg_roi: results.avgRoi,
      median_roi: results.medianRoi,
      best_roi: results.bestRoi,
      worst_roi: results.worstRoi,
      sharpe_ratio: results.sharpeRatio,
      max_drawdown: results.maxDrawdown,
      profit_factor: results.profitFactor,
      win_streak_max: results.winStreakMax,
      loss_streak_max: results.lossStreakMax,
      avg_days_held: results.avgDaysHeld,
    });

    if (error) {
      throw new Error(`Failed to save backtest results: ${error.message}`);
    }

    console.log(`[IPSBacktester] Saved backtest results`);
  }

  /**
   * Update backtest run status
   */
  private async updateRunStatus(
    runId: string,
    status: 'running' | 'completed' | 'failed',
    totalTrades: number,
    tradesPassed: number,
    errorMessage?: string
  ): Promise<void> {
    const { error } = await this.db
      .from('ips_backtest_runs')
      .update({
        status,
        error_message: errorMessage || null,
        total_trades_analyzed: totalTrades,
        trades_passed: tradesPassed,
        pass_rate: totalTrades > 0 ? (tradesPassed / totalTrades) * 100 : 0,
        completed_at: status !== 'running' ? new Date().toISOString() : null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', runId);

    if (error) {
      console.error(`[IPSBacktester] Failed to update run status:`, error);
    }
  }
}

// ============================================================================
// Convenience Functions
// ============================================================================

export async function runIPSBacktest(config: BacktestConfig): Promise<BacktestResult> {
  const backtester = new IPSBacktester();
  return backtester.runBacktest(config);
}
