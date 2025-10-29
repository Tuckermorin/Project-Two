/**
 * IPS Backtesting Engine with Greeks + Sentiment Analysis
 *
 * This service:
 * 1. Uses historical_options_data to simulate trade entries
 * 2. Fetches sentiment data from AlphaVantage for each entry date
 * 3. Evaluates trades against IPS factor criteria
 * 4. Calculates performance metrics (win rate, ROI, Sharpe ratio, etc.)
 * 5. Generates insights for RAG system
 */

import { createClient } from "@/lib/supabase/server-client";
import { getSentimentForDate } from "@/lib/clients/alpha-vantage-sentiment";
import { IPSFactor, FactorValueMap } from "@/lib/types/factors";
import { getTradeContextEnrichmentService, type TradeCandidate, type EnrichedTradeContext } from "./trade-context-enrichment-service";
import { getAITradeEvaluator, type TradeRecommendation, type TradeEvaluationResult } from "./ai-trade-evaluator";
import { getTimeTravelRAGService } from "./time-travel-rag-service";

export interface BacktestConfig {
  ipsId: string;
  ipsName: string;
  ipsConfig: {
    factors: IPSFactor[];
    strategies: string[];
    min_dte: number;
    max_dte: number;
    exit_strategies?: any;
  };
  startDate: Date;
  endDate: Date;
  symbols?: string[]; // If undefined, backtest all available symbols
  includeSentiment?: boolean;
  useAIFiltering?: boolean; // NEW: Use AI to filter trades like live agent
  aiRecommendationThreshold?: TradeRecommendation; // NEW: Minimum AI recommendation to take trade
  minTrades?: number;
  userId: string;
  portfolioSize?: number; // Starting portfolio value (default $25,000)
  riskPerTrade?: number; // Percentage of portfolio to risk per trade (default 2%)
}

export interface BacktestProgress {
  status: "pending" | "running" | "completed" | "failed";
  currentSymbol?: string;
  processedSymbols: number;
  totalSymbols: number;
  tradesAnalyzed: number;
  sentimentFetched: number;
  errorMessage?: string;
}

export interface TradeMatch {
  tradeId: string;
  symbol: string;
  entryDate: Date;
  expirationDate: Date;
  strike: number;
  optionType: "call" | "put";
  strategyType: string;
  delta: number;
  iv: number;
  premium: number;
  dte: number;

  // IPS Evaluation
  ipsScore: number;
  passedIps: boolean;
  factorsPassed: number;
  factorsFailed: number;
  factorScores: Record<string, any>;
  failingFactors?: string[];

  // AI Evaluation (NEW)
  aiRecommendation?: TradeRecommendation;
  aiScore?: number;
  aiConfidence?: string;
  compositeScore?: number;
  wouldTakeTrade?: boolean; // Did AI approve this trade?

  // Sentiment
  sentimentAtEntry?: number;
  sentimentLabel?: string;
  articleCount?: number;
  sentimentContext?: any;

  // Outcome (from historical data or actual trade)
  exitDate?: Date;
  exitPrice?: number;
  realizedPnl?: number;
  realizedRoi?: number;
  daysHeld?: number;
  actualOutcome?: "win" | "loss" | "pending";

  // Portfolio Tracking
  portfolioValueBefore?: number; // Portfolio value before this trade
  portfolioValueAfter?: number; // Portfolio value after this trade
  positionSize?: number; // Number of contracts traded
  capitalAllocated?: number; // Capital used for this trade
}

export interface BacktestResults {
  runId: string;
  ipsId: string;

  // Performance Metrics
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  winRate: number;
  totalPnl: number;
  avgPnl: number;
  medianPnl: number;
  maxWin: number;
  maxLoss: number;
  avgRoi: number;
  medianRoi: number;
  bestRoi: number;
  worstRoi: number;

  // Risk Metrics
  sharpeRatio?: number;
  sortinoRatio?: number;
  maxDrawdown?: number;
  profitFactor?: number;

  // Breakdown
  strategyPerformance: Record<string, any>;
  symbolPerformance: Record<string, any>;
  monthlyPerformance: Record<string, any>;

  // Factor Analysis
  factorCorrelation: Record<string, any>;
  factorImportance: Record<string, any>;

  // Sentiment Analysis
  sentimentCorrelation?: Record<string, any>;
  optimalSentimentRange?: Record<string, any>;

  // Portfolio Metrics
  startingPortfolio?: number;
  endingPortfolio?: number;
  totalReturn?: number; // Total return percentage
  cagr?: number; // Compound Annual Growth Rate
  portfolioMaxDrawdown?: number; // Max drawdown as percentage of portfolio
  equityCurve?: Array<{ date: string; portfolioValue: number }>; // Portfolio value over time

  // Trades
  trades: TradeMatch[];
}

/**
 * Main backtesting engine
 */
export class IPSBacktestingEngine {
  private supabase: any;
  private config: BacktestConfig;
  private runId?: string;
  private progressCallback?: (progress: BacktestProgress) => void;
  private enrichmentService: ReturnType<typeof getTradeContextEnrichmentService>;
  private aiEvaluator: ReturnType<typeof getAITradeEvaluator>;
  private timeTravelRAG: ReturnType<typeof getTimeTravelRAGService>;

  constructor(
    config: BacktestConfig,
    progressCallback?: (progress: BacktestProgress) => void,
    existingRunId?: string
  ) {
    this.config = config;
    this.progressCallback = progressCallback;
    this.runId = existingRunId; // Use provided runId if available
    this.enrichmentService = getTradeContextEnrichmentService();
    this.aiEvaluator = getAITradeEvaluator();
    this.timeTravelRAG = getTimeTravelRAGService();
  }

  /**
   * Execute the backtest
   */
  async run(): Promise<BacktestResults> {
    this.supabase = await createClient();

    // Create backtest run record only if not provided
    if (!this.runId) {
      const runId = await this.createBacktestRun();
      this.runId = runId;
    }

    try {
      await this.updateStatus("running");
      this.emitProgress({
        status: "running",
        processedSymbols: 0,
        totalSymbols: this.config.symbols?.length || 0,
        tradesAnalyzed: 0,
        sentimentFetched: 0,
      });

      // Step 1: Get symbols to backtest
      const symbols = await this.getSymbolsToTest();
      console.log(`[Backtest] Testing ${symbols.length} symbols`);

      // Step 2: For each symbol, find historical trades and evaluate
      const allTradeMatches: TradeMatch[] = [];
      let sentimentFetchCount = 0;

      for (let i = 0; i < symbols.length; i++) {
        const symbol = symbols[i];
        console.log(`[Backtest] Processing ${symbol} (${i + 1}/${symbols.length})...`);

        const symbolMatches = await this.backtestSymbol(symbol);
        allTradeMatches.push(...symbolMatches);

        // Count sentiment data fetched
        sentimentFetchCount += symbolMatches.filter(t => t.sentimentAtEntry !== undefined).length;

        this.emitProgress({
          status: "running",
          currentSymbol: symbol,
          processedSymbols: i + 1,
          totalSymbols: symbols.length,
          tradesAnalyzed: allTradeMatches.length,
          sentimentFetched: sentimentFetchCount,
        });
      }

      console.log(`[Backtest] Analyzed ${allTradeMatches.length} total trades`);

      // Step 3: Save trade matches to database
      await this.saveTradeMatches(allTradeMatches);

      // Step 4: Calculate performance metrics
      const results = await this.calculateResults(allTradeMatches);

      // Step 5: Save results
      await this.saveResults(results);

      // Step 6: Calculate sentiment correlation
      if (this.config.includeSentiment) {
        await this.calculateSentimentCorrelation();
      }

      await this.updateStatus("completed");
      this.emitProgress({
        status: "completed",
        processedSymbols: symbols.length,
        totalSymbols: symbols.length,
        tradesAnalyzed: allTradeMatches.length,
        sentimentFetched: sentimentFetchCount,
      });

      return results;
    } catch (error: any) {
      console.error("[Backtest] Error:", error);
      await this.updateStatus("failed", error.message);
      this.emitProgress({
        status: "failed",
        processedSymbols: 0,
        totalSymbols: 0,
        tradesAnalyzed: 0,
        sentimentFetched: 0,
        errorMessage: error.message,
      });
      throw error;
    }
  }

  /**
   * Backtest a single symbol
   */
  private async backtestSymbol(symbol: string): Promise<TradeMatch[]> {
    const matches: TradeMatch[] = [];

    // Query historical_options_data for this symbol in date range
    const { data: historicalOptions, error } = await this.supabase
      .from("historical_options_data")
      .select("*")
      .eq("symbol", symbol)
      .gte("snapshot_date", this.config.startDate.toISOString().split('T')[0])
      .lte("snapshot_date", this.config.endDate.toISOString().split('T')[0])
      .gte("dte", this.config.ipsConfig.min_dte)
      .lte("dte", this.config.ipsConfig.max_dte)
      .not("delta", "is", null)
      .order("snapshot_date", { ascending: true });

    if (error) {
      console.error(`[Backtest] Error fetching options for ${symbol}:`, error);
      return matches;
    }

    if (!historicalOptions || historicalOptions.length === 0) {
      console.log(`[Backtest] No historical data for ${symbol}`);
      return matches;
    }

    console.log(`[Backtest] Found ${historicalOptions.length} historical options for ${symbol}`);

    // Group by snapshot_date to simulate "daily option chains"
    const optionsByDate = new Map<string, any[]>();
    for (const opt of historicalOptions) {
      const dateKey = opt.snapshot_date;
      if (!optionsByDate.has(dateKey)) {
        optionsByDate.set(dateKey, []);
      }
      optionsByDate.get(dateKey)!.push(opt);
    }

    // Evaluate each day
    for (const [dateStr, dayOptions] of optionsByDate) {
      const entryDate = new Date(dateStr);

      // Fetch sentiment for this date (if enabled)
      let sentiment = null;
      if (this.config.includeSentiment) {
        sentiment = await getSentimentForDate(symbol, entryDate, true);
      }

      // Evaluate each option contract against IPS criteria
      for (const option of dayOptions) {
        const match = await this.evaluateOption(option, sentiment);
        if (match) {
          matches.push(match);
        }
      }
    }

    return matches;
  }

  /**
   * Evaluate a single option contract against IPS factors
   * If AI filtering is enabled, also runs AI evaluation to determine if trade should be taken
   */
  private async evaluateOption(option: any, sentiment: any): Promise<TradeMatch | null> {
    // Build factor value map from option data
    const factorValues: FactorValueMap = {
      option_delta: Math.abs(option.delta),
      delta: Math.abs(option.delta),
      implied_volatility: option.implied_volatility,
      iv: option.implied_volatility,
      dte: option.dte,
      days_to_expiration: option.dte,
      option_premium: option.mark || ((option.bid + option.ask) / 2),
      theta: option.theta,
      vega: option.vega,
      gamma: option.gamma,
      open_interest: option.open_interest,
      volume: option.volume,
    };

    // Add sentiment factors if available
    if (sentiment) {
      factorValues.sentiment_score = sentiment.overall_sentiment_score;
      factorValues.sentiment_label = sentiment.overall_sentiment_label;
      factorValues.article_count = sentiment.article_count;
    }

    // Evaluate against IPS factors
    const { score, passed, factorScores, failingFactors } = this.evaluateFactors(
      this.config.ipsConfig.factors,
      factorValues
    );

    const factorsPassed = Object.values(factorScores).filter((s: any) => s.passed).length;
    const factorsFailed = Object.values(factorScores).filter((s: any) => !s.passed).length;

    // Determine strategy type from option
    const strategyType = this.inferStrategy(option);

    // Check if strategy matches IPS allowed strategies
    if (this.config.ipsConfig.strategies && this.config.ipsConfig.strategies.length > 0) {
      if (!this.config.ipsConfig.strategies.includes(strategyType)) {
        return null; // Skip this trade, wrong strategy
      }
    }

    // === NEW: AI FILTERING LOGIC ===
    let aiEvaluation: TradeEvaluationResult | null = null;
    let wouldTakeTrade = true; // Default: take trade if AI filtering disabled

    if (this.config.useAIFiltering) {
      try {
        // Build trade candidate from option
        const candidate: TradeCandidate = {
          symbol: option.symbol,
          strategy_type: this.mapStrategyType(strategyType),
          short_strike: parseFloat(option.strike),
          long_strike: parseFloat(option.strike) + 5, // Assume $5 spread for credit spreads
          expiration_date: option.expiration_date,
          contract_type: option.option_type === "call" ? "call" : "put",
          credit_received: parseFloat(option.mark || 0) * 100,
          delta: Math.abs(parseFloat(option.delta)),
          iv_rank: parseFloat(option.implied_volatility || 0) * 100,
          dte: option.dte,
          estimated_pop: this.estimatePOP(option.delta),
          current_stock_price: parseFloat(option.underlying_price || 0),
        };

        // Enrich context (limited for backtesting - only use sentiment and IPS)
        const enrichedContext = await this.buildBacktestEnrichedContext(
          candidate,
          sentiment,
          score,
          passed,
          factorScores,
          failingFactors,
          factorsPassed,
          factorsFailed
        );

        // Run AI evaluation
        aiEvaluation = await this.aiEvaluator.evaluateTrade(enrichedContext, {
          useProgressiveWeighting: true,
        });

        // Determine if we would take this trade
        const threshold = this.config.aiRecommendationThreshold || 'buy';
        wouldTakeTrade = this.meetsRecommendationThreshold(
          aiEvaluation.final_recommendation,
          threshold
        );

        console.log(`[Backtest] AI Evaluation for ${option.symbol}: ${aiEvaluation.final_recommendation} (Would take: ${wouldTakeTrade})`);
      } catch (error: any) {
        console.error(`[Backtest] AI evaluation failed for option ${option.id}:`, error.message);
        // On error, fall back to IPS-only evaluation
        wouldTakeTrade = passed;
      }
    }

    // Calculate outcome (simulate trade lifecycle)
    const outcome = await this.calculateOutcome(option);

    const trade: TradeMatch = {
      tradeId: option.id,
      symbol: option.symbol,
      entryDate: new Date(option.snapshot_date),
      expirationDate: new Date(option.expiration_date),
      strike: parseFloat(option.strike),
      optionType: option.option_type === "call" ? "call" : "put",
      strategyType,
      delta: parseFloat(option.delta),
      iv: parseFloat(option.implied_volatility || 0),
      premium: parseFloat(option.mark || 0),
      dte: option.dte,

      ipsScore: score,
      passedIps: passed,
      factorsPassed,
      factorsFailed,
      factorScores,
      failingFactors,

      // AI evaluation fields
      aiRecommendation: aiEvaluation?.final_recommendation,
      aiScore: aiEvaluation?.weighted_score.ai_score,
      aiConfidence: aiEvaluation?.weighted_score.confidence_level,
      compositeScore: aiEvaluation?.weighted_score.composite_score,
      wouldTakeTrade,

      sentimentAtEntry: sentiment?.overall_sentiment_score,
      sentimentLabel: sentiment?.overall_sentiment_label,
      articleCount: sentiment?.article_count,
      sentimentContext: sentiment
        ? {
            top_topics: sentiment.top_topics,
            top_headlines: sentiment.article_summaries.slice(0, 3).map((a: any) => a.title),
          }
        : undefined,

      ...outcome,
    };

    return trade;
  }

  /**
   * Evaluate factors against values
   */
  private evaluateFactors(
    factors: IPSFactor[],
    values: FactorValueMap
  ): {
    score: number;
    passed: boolean;
    factorScores: Record<string, any>;
    failingFactors: string[];
  } {
    const factorScores: Record<string, any> = {};
    const failingFactors: string[] = [];
    let totalScore = 0;
    let totalWeight = 0;
    let passedCount = 0;

    for (const factor of factors) {
      const value = values[factor.key];
      const weight = factor.weight || 0;
      totalWeight += weight;

      if (value === undefined || value === null) {
        factorScores[factor.key] = {
          passed: false,
          score: 0,
          reason: "No data available",
        };
        failingFactors.push(factor.key);
        continue;
      }

      // Evaluate based on target
      const target = factor.target;
      let passed = true;
      let reason = "";

      if (target) {
        if (target.operator) {
          const numValue = typeof value === "number" ? value : parseFloat(String(value));
          const targetValue = typeof target.value === "number" ? target.value : parseFloat(String(target.value || 0));

          switch (target.operator) {
            case "<":
              passed = numValue < targetValue;
              reason = passed ? `${numValue} < ${targetValue}` : `${numValue} >= ${targetValue}`;
              break;
            case "<=":
              passed = numValue <= targetValue;
              reason = passed ? `${numValue} <= ${targetValue}` : `${numValue} > ${targetValue}`;
              break;
            case ">":
              passed = numValue > targetValue;
              reason = passed ? `${numValue} > ${targetValue}` : `${numValue} <= ${targetValue}`;
              break;
            case ">=":
              passed = numValue >= targetValue;
              reason = passed ? `${numValue} >= ${targetValue}` : `${numValue} < ${targetValue}`;
              break;
            case "=":
              passed = numValue === targetValue;
              reason = passed ? `${numValue} = ${targetValue}` : `${numValue} != ${targetValue}`;
              break;
          }
        } else if (target.min !== undefined || target.max !== undefined) {
          const numValue = typeof value === "number" ? value : parseFloat(String(value));
          const min = target.min !== undefined && target.min !== null ? target.min : -Infinity;
          const max = target.max !== undefined && target.max !== null ? target.max : Infinity;

          passed = numValue >= min && numValue <= max;
          reason = passed ? `${numValue} in [${min}, ${max}]` : `${numValue} outside [${min}, ${max}]`;
        }
      }

      if (passed) {
        passedCount++;
        totalScore += weight;
      } else {
        failingFactors.push(factor.key);
      }

      factorScores[factor.key] = {
        passed,
        score: passed ? weight : 0,
        value,
        reason,
      };
    }

    const finalScore = totalWeight > 0 ? (totalScore / totalWeight) * 100 : 0;
    const overallPassed = passedCount === factors.length; // All factors must pass

    return {
      score: finalScore,
      passed: overallPassed,
      factorScores,
      failingFactors,
    };
  }

  /**
   * Infer strategy type from option characteristics
   */
  private inferStrategy(option: any): string {
    // For now, use simple logic. In reality, you'd need more context.
    const absDelta = Math.abs(option.delta);
    if (absDelta < 0.15) return "put-credit-spreads"; // Far OTM
    if (absDelta < 0.35) return "put-credit-spreads";
    if (option.option_type === "call") return "call-credit-spreads";
    return "put-credit-spreads";
  }

  /**
   * Map strategy type string to TradeCandidate format
   */
  private mapStrategyType(strategyType: string): "put_credit_spread" | "call_credit_spread" | "iron_condor" {
    if (strategyType === "call-credit-spreads") return "call_credit_spread";
    if (strategyType === "iron-condor") return "iron_condor";
    return "put_credit_spread";
  }

  /**
   * Estimate probability of profit from delta
   */
  private estimatePOP(delta: number): number {
    // For credit spreads, POP is roughly 1 - |delta|
    return 1 - Math.abs(parseFloat(String(delta)));
  }

  /**
   * Check if AI recommendation meets minimum threshold
   */
  private meetsRecommendationThreshold(
    recommendation: TradeRecommendation,
    threshold: TradeRecommendation
  ): boolean {
    const hierarchy: TradeRecommendation[] = [
      'strong_avoid',
      'avoid',
      'neutral',
      'buy',
      'strong_buy',
    ];

    const recIndex = hierarchy.indexOf(recommendation);
    const thresholdIndex = hierarchy.indexOf(threshold);

    return recIndex >= thresholdIndex;
  }

  /**
   * Build enriched context for backtest with time-travel RAG
   * This is the key to realistic backtesting - we only use data from BEFORE the entry date
   */
  private async buildBacktestEnrichedContext(
    candidate: TradeCandidate,
    sentiment: any,
    ipsScore: number,
    ipsPass: boolean,
    factorScores: any,
    failingFactors: string[],
    factorsPassed: number,
    factorsFailed: number
  ): Promise<EnrichedTradeContext> {
    // Get entry date from candidate
    const entryDate = new Date(candidate.expiration_date);
    entryDate.setDate(entryDate.getDate() - (candidate.dte || 30)); // Approximate entry date

    console.log(`[Backtest] Building time-travel context for ${candidate.symbol} as of ${entryDate.toISOString()}`);

    // Use time-travel RAG to get historical context as of this date
    const [historicalPerformance, similarTrades] = await Promise.all([
      this.timeTravelRAG.getHistoricalPerformanceBeforeDate(
        candidate.symbol,
        entryDate,
        this.config.userId
      ),
      this.timeTravelRAG.getSimilarTradesForContext(
        candidate,
        entryDate,
        this.config.userId
      ),
    ]);

    const hasHistoricalTrades = historicalPerformance.total_trades > 0;
    const hasSimilarTrades = similarTrades.length > 0;

    console.log(`[Backtest] Time-travel context: ${historicalPerformance.total_trades} historical trades, ${similarTrades.length} similar trades`);

    const enrichedContext: EnrichedTradeContext = {
      candidate,
      ips_evaluation: {
        ips_id: this.config.ipsId,
        ips_name: this.config.ipsName,
        passed: ipsPass,
        score: ipsScore,
        max_score: this.config.ipsConfig.factors.reduce((sum, f) => sum + (f.weight || 1) * 100, 0),
        score_percentage: ipsScore,
        failed_factors: failingFactors.map(key => {
          const factor = this.config.ipsConfig.factors.find(f => f.key === key);
          return {
            factor_key: key,
            factor_name: factor?.name || key,
            actual_value: factorScores[key]?.value,
            expected_value: factor?.target,
            weight: factor?.weight || 1,
          };
        }),
        passed_factors: Object.keys(factorScores)
          .filter(key => factorScores[key].passed)
          .map(key => {
            const factor = this.config.ipsConfig.factors.find(f => f.key === key);
            return {
              factor_key: key,
              factor_name: factor?.name || key,
              actual_value: factorScores[key]?.value,
              weight: factor?.weight || 1,
            };
          }),
      },
      multi_source_intelligence: {
        aggregate: sentiment
          ? {
              overall_sentiment: this.mapSentimentLabel(sentiment.overall_sentiment_label),
              sentiment_score: sentiment.overall_sentiment_score || 0,
              data_quality_score: sentiment.article_count > 5 ? 80 : 50,
              key_themes: sentiment.top_topics || [],
            }
          : null,
        external_intelligence: null,
        internal_rag: null,
        tavily_research: null,
        confidence: sentiment && sentiment.article_count > 5 ? 'high' : 'medium',
      },
      live_market_intelligence: null, // Not available for historical backtest
      historical_performance: historicalPerformance, // TIME-TRAVEL: Only trades before entry date
      market_conditions: {
        overall_sentiment: sentiment ? this.mapSentimentLabel(sentiment.overall_sentiment_label) : 'neutral',
        conditions_favorable: true,
        risk_factors: [],
      },
      similar_trades: similarTrades, // TIME-TRAVEL: Only similar trades before entry date
      enrichment_timestamp: entryDate.toISOString(), // Use entry date, not current time
      data_quality: {
        has_external_intelligence: false,
        has_internal_rag: hasSimilarTrades, // We have RAG data if similar trades exist
        has_historical_trades: hasHistoricalTrades,
        has_tavily_research: false,
        has_live_news: !!sentiment,
        overall_confidence:
          hasHistoricalTrades && hasSimilarTrades && sentiment ? 'high' :
          (hasHistoricalTrades || hasSimilarTrades) && sentiment ? 'medium' :
          'low',
      },
    };

    return enrichedContext;
  }

  /**
   * Map sentiment label to standard format
   */
  private mapSentimentLabel(label: string): 'bullish' | 'bearish' | 'neutral' | 'mixed' {
    const lowerLabel = String(label || '').toLowerCase();
    if (lowerLabel.includes('bullish') || lowerLabel.includes('positive')) return 'bullish';
    if (lowerLabel.includes('bearish') || lowerLabel.includes('negative')) return 'bearish';
    if (lowerLabel.includes('mixed')) return 'mixed';
    return 'neutral';
  }

  /**
   * Calculate trade outcome by tracking option price over time
   * Uses historical data to see what happened to this contract
   */
  private async calculateOutcome(option: any): Promise<Partial<TradeMatch>> {
    const entryDate = new Date(option.snapshot_date);
    const expirationDate = new Date(option.expiration_date);
    const entryPremium = option.mark || ((option.bid + option.ask) / 2);

    // For credit spreads, we need to calculate based on max risk
    const spreadWidth = 5; // Assumed $5 spread width
    const netCredit = entryPremium;
    const maxRisk = spreadWidth - netCredit; // Max loss is spread width minus credit received

    // Get exit strategy from IPS config
    const exitStrategies = this.config.ipsConfig.exit_strategies;
    const profitTargetPct = exitStrategies?.profit_target || 50; // Default 50%
    const stopLossPct = exitStrategies?.stop_loss || 200; // Default 200% (of max risk)

    const profitTargetPrice = entryPremium * (1 - profitTargetPct / 100);
    const stopLossPrice = entryPremium * (1 + stopLossPct / 100);

    try {
      // Query historical data to track this option's price over time
      const { data: priceHistory, error } = await this.supabase
        .from("historical_options_data")
        .select("snapshot_date, mark, bid, ask")
        .eq("symbol", option.symbol)
        .eq("strike", option.strike)
        .eq("option_type", option.option_type)
        .eq("expiration_date", option.expiration_date)
        .gte("snapshot_date", option.snapshot_date)
        .lte("snapshot_date", option.expiration_date)
        .order("snapshot_date", { ascending: true });

      if (error || !priceHistory || priceHistory.length === 0) {
        // Fallback to probability-based simulation if no price history
        return this.simulateOutcomeByProbability(option, entryPremium, profitTargetPct, stopLossPct);
      }

      // Track price day by day to see when exit conditions are met
      for (const dailyPrice of priceHistory) {
        const currentPrice = dailyPrice.mark || ((dailyPrice.bid + dailyPrice.ask) / 2);
        const currentDate = new Date(dailyPrice.snapshot_date);
        const daysHeld = Math.floor((currentDate.getTime() - entryDate.getTime()) / (1000 * 60 * 60 * 24));

        // Check profit target (price decreased for credit spread)
        if (currentPrice <= profitTargetPrice) {
          const profit = (entryPremium - currentPrice) * 100; // Profit in dollars
          const roi = (profit / (maxRisk * 100)) * 100; // ROI based on max risk

          return {
            exitDate: currentDate,
            exitPrice: currentPrice,
            realizedPnl: profit,
            realizedRoi: roi,
            daysHeld,
            actualOutcome: "win",
          };
        }

        // Check stop loss (price increased for credit spread)
        if (currentPrice >= stopLossPrice) {
          const loss = (entryPremium - currentPrice) * 100; // Loss in dollars (negative)
          const roi = (loss / (maxRisk * 100)) * 100; // ROI based on max risk

          return {
            exitDate: currentDate,
            exitPrice: currentPrice,
            realizedPnl: loss,
            realizedRoi: roi,
            daysHeld,
            actualOutcome: "loss",
          };
        }
      }

      // If we reach expiration without hitting exit conditions
      const finalPrice = priceHistory[priceHistory.length - 1];
      const finalMark = finalPrice.mark || ((finalPrice.bid + finalPrice.ask) / 2);
      const pnl = (entryPremium - finalMark) * 100; // P&L in dollars
      const roi = (pnl / (maxRisk * 100)) * 100; // ROI based on max risk
      const daysHeld = Math.floor((expirationDate.getTime() - entryDate.getTime()) / (1000 * 60 * 60 * 24));

      return {
        exitDate: expirationDate,
        exitPrice: finalMark,
        realizedPnl: pnl,
        realizedRoi: roi,
        daysHeld,
        actualOutcome: pnl > 0 ? "win" : "loss",
      };
    } catch (error) {
      console.error(`[Backtest] Error calculating outcome for ${option.symbol}:`, error);
      // Fallback to probability-based simulation
      return this.simulateOutcomeByProbability(option, entryPremium, profitTargetPct, stopLossPct);
    }
  }

  /**
   * Fallback simulation based on probability (when price history unavailable)
   * Uses delta-based win probability instead of random
   */
  private simulateOutcomeByProbability(
    option: any,
    entryPremium: number,
    profitTargetPct: number,
    stopLossPct: number
  ): Partial<TradeMatch> {
    // For credit spreads, calculate max risk
    const spreadWidth = 5; // Assumed $5 spread width
    const netCredit = entryPremium;
    const maxRisk = spreadWidth - netCredit;

    // Win probability based on delta (higher delta = lower POP for credit spreads)
    const absDelta = Math.abs(option.delta);
    const winProbability = 1 - absDelta; // Approximate POP for credit spreads

    const won = Math.random() < winProbability;

    if (won) {
      const profitTargetPrice = entryPremium * (1 - profitTargetPct / 100);
      const profit = (entryPremium - profitTargetPrice) * 100;
      const roi = (profit / (maxRisk * 100)) * 100;

      return {
        exitDate: new Date(option.snapshot_date),
        exitPrice: profitTargetPrice,
        realizedPnl: profit,
        realizedRoi: roi,
        daysHeld: Math.floor(option.dte / 2), // Assume exited at 50% DTE
        actualOutcome: "win",
      };
    } else {
      const stopLossPrice = entryPremium * (1 + stopLossPct / 100);
      const loss = (entryPremium - stopLossPrice) * 100;
      const roi = (loss / (maxRisk * 100)) * 100;

      return {
        exitDate: new Date(option.expiration_date),
        exitPrice: stopLossPrice,
        realizedPnl: loss,
        realizedRoi: roi,
        daysHeld: option.dte,
        actualOutcome: "loss",
      };
    }
  }

  /**
   * Calculate performance metrics from trade matches
   */
  private async calculateResults(trades: TradeMatch[]): Promise<BacktestResults> {
    // Filter to only trades we would have actually taken (if AI filtering enabled)
    let tradesToAnalyze = trades;
    if (this.config.useAIFiltering) {
      tradesToAnalyze = trades.filter(t => t.wouldTakeTrade === true);
      console.log(`[Backtest] AI filtered trades: ${tradesToAnalyze.length}/${trades.length} would be taken`);
    }

    const closedTrades = tradesToAnalyze.filter(t => t.actualOutcome && t.actualOutcome !== "pending");
    const winningTrades = closedTrades.filter(t => t.actualOutcome === "win");
    const losingTrades = closedTrades.filter(t => t.actualOutcome === "loss");

    // === PORTFOLIO TRACKING ===
    const portfolioSize = this.config.portfolioSize || 25000; // Default $25k
    const riskPerTrade = this.config.riskPerTrade || 2; // Default 2% risk per trade

    // Sort trades by entry date for chronological portfolio tracking
    const sortedTrades = [...closedTrades].sort((a, b) =>
      a.entryDate.getTime() - b.entryDate.getTime()
    );

    let currentPortfolio = portfolioSize;
    let endingPortfolio = portfolioSize;
    let totalReturn = 0;
    let cagr = 0;
    let maxPortfolioDrawdown = 0;
    const equityCurve: Array<{ date: string; portfolioValue: number }> = [];

    // Only calculate portfolio metrics if we have trades
    if (sortedTrades.length > 0) {
      equityCurve.push({
        date: sortedTrades[0].entryDate.toISOString().split('T')[0],
        portfolioValue: portfolioSize
      });

      let portfolioPeak = portfolioSize;

      // Track portfolio value through each trade
      for (const trade of sortedTrades) {
      const portfolioValueBefore = currentPortfolio;

      // Calculate position size based on portfolio and risk
      const riskAmount = currentPortfolio * (riskPerTrade / 100);

      // For credit spreads: max risk = spread width - credit received
      const spreadWidth = 5; // Assumed $5 spread
      const creditReceived = trade.premium || 0;
      const maxRiskPerContract = (spreadWidth - creditReceived) * 100; // Per contract in dollars

      // How many contracts can we trade with our risk amount?
      const numContracts = maxRiskPerContract > 0
        ? Math.floor(riskAmount / maxRiskPerContract)
        : 1;

      // Actual P&L for this position
      const actualPnl = (trade.realizedPnl || 0) * numContracts;

      // Update portfolio
      currentPortfolio += actualPnl;

      // Track portfolio metrics on this trade
      trade.portfolioValueBefore = portfolioValueBefore;
      trade.portfolioValueAfter = currentPortfolio;
      trade.positionSize = numContracts;
      trade.capitalAllocated = numContracts * maxRiskPerContract;

      // Add to equity curve (use exit date)
      if (trade.exitDate) {
        equityCurve.push({
          date: trade.exitDate.toISOString().split('T')[0],
          portfolioValue: currentPortfolio
        });
      }

      // Track max drawdown
      if (currentPortfolio > portfolioPeak) {
        portfolioPeak = currentPortfolio;
      }
        const currentDrawdown = ((portfolioPeak - currentPortfolio) / portfolioPeak) * 100;
        if (currentDrawdown > maxPortfolioDrawdown) {
          maxPortfolioDrawdown = currentDrawdown;
        }
      }

      endingPortfolio = currentPortfolio;
      totalReturn = ((endingPortfolio - portfolioSize) / portfolioSize) * 100;

      // Calculate CAGR
      const startDate = new Date(this.config.startDate);
      const endDate = new Date(this.config.endDate);
      const years = (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24 * 365.25);
      cagr = years > 0
        ? (Math.pow(endingPortfolio / portfolioSize, 1 / years) - 1) * 100
        : 0;

      console.log(`[Backtest Portfolio] Starting: $${portfolioSize.toFixed(2)}, Ending: $${endingPortfolio.toFixed(2)}`);
      console.log(`[Backtest Portfolio] Total Return: ${totalReturn.toFixed(2)}%, CAGR: ${cagr.toFixed(2)}%`);
      console.log(`[Backtest Portfolio] Max Drawdown: ${maxPortfolioDrawdown.toFixed(2)}%`);
    }

    const totalPnl = closedTrades.reduce((sum, t) => sum + (t.realizedPnl || 0), 0);
    const avgPnl = closedTrades.length > 0 ? totalPnl / closedTrades.length : 0;

    const rois = closedTrades.map(t => t.realizedRoi || 0).sort((a, b) => a - b);
    const medianRoi = rois.length > 0 ? rois[Math.floor(rois.length / 2)] : 0;
    const avgRoi = rois.length > 0 ? rois.reduce((a, b) => a + b, 0) / rois.length : 0;

    const pnls = closedTrades.map(t => t.realizedPnl || 0).sort((a, b) => a - b);
    const medianPnl = pnls.length > 0 ? pnls[Math.floor(pnls.length / 2)] : 0;

    // Strategy breakdown
    const strategyPerformance: Record<string, any> = {};
    for (const strategy of [...new Set(trades.map(t => t.strategyType))]) {
      const stratTrades = closedTrades.filter(t => t.strategyType === strategy);
      const wins = stratTrades.filter(t => t.actualOutcome === "win").length;
      strategyPerformance[strategy] = {
        total: stratTrades.length,
        wins,
        winRate: stratTrades.length > 0 ? (wins / stratTrades.length) * 100 : 0,
        avgRoi: stratTrades.reduce((sum, t) => sum + (t.realizedRoi || 0), 0) / stratTrades.length || 0,
      };
    }

    // Symbol breakdown
    const symbolPerformance: Record<string, any> = {};
    for (const symbol of [...new Set(trades.map(t => t.symbol))]) {
      const symTrades = closedTrades.filter(t => t.symbol === symbol);
      const wins = symTrades.filter(t => t.actualOutcome === "win").length;
      symbolPerformance[symbol] = {
        total: symTrades.length,
        wins,
        winRate: symTrades.length > 0 ? (wins / symTrades.length) * 100 : 0,
        avgRoi: symTrades.reduce((sum, t) => sum + (t.realizedRoi || 0), 0) / symTrades.length || 0,
      };
    }

    return {
      runId: this.runId!,
      ipsId: this.config.ipsId,
      totalTrades: closedTrades.length,
      winningTrades: winningTrades.length,
      losingTrades: losingTrades.length,
      winRate: closedTrades.length > 0 ? (winningTrades.length / closedTrades.length) * 100 : 0,
      totalPnl,
      avgPnl,
      medianPnl,
      maxWin: Math.max(...pnls, 0),
      maxLoss: Math.min(...pnls, 0),
      avgRoi,
      medianRoi,
      bestRoi: Math.max(...rois, 0),
      worstRoi: Math.min(...rois, 0),
      sharpeRatio: this.calculateSharpeRatio(rois),
      sortinoRatio: this.calculateSortinoRatio(rois),
      maxDrawdown: this.calculateMaxDrawdown(closedTrades),
      profitFactor: this.calculateProfitFactor(closedTrades),
      strategyPerformance,
      symbolPerformance,
      monthlyPerformance: {},
      factorCorrelation: {},
      factorImportance: {},
      // Portfolio metrics
      startingPortfolio: portfolioSize,
      endingPortfolio: endingPortfolio,
      totalReturn: totalReturn,
      cagr: cagr,
      portfolioMaxDrawdown: maxPortfolioDrawdown,
      equityCurve: equityCurve,
      trades,
    };
  }

  private calculateSharpeRatio(returns: number[]): number | undefined {
    if (returns.length < 2) return undefined;
    const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
    const variance = returns.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / returns.length;
    const stdDev = Math.sqrt(variance);
    return stdDev > 0 ? (mean - 2) / stdDev : undefined; // Risk-free rate = 2%
  }

  private calculateSortinoRatio(returns: number[]): number | undefined {
    if (returns.length < 2) return undefined;
    const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
    const downsideReturns = returns.filter(r => r < 0);
    if (downsideReturns.length === 0) return undefined;
    const downsideVariance = downsideReturns.reduce((sum, r) => sum + Math.pow(r, 2), 0) / downsideReturns.length;
    const downsideStdDev = Math.sqrt(downsideVariance);
    return downsideStdDev > 0 ? (mean - 2) / downsideStdDev : undefined;
  }

  private calculateMaxDrawdown(trades: TradeMatch[]): number | undefined {
    let peak = 0;
    let maxDD = 0;
    let cumPnl = 0;

    for (const trade of trades) {
      cumPnl += trade.realizedPnl || 0;
      if (cumPnl > peak) peak = cumPnl;
      const dd = peak - cumPnl;
      if (dd > maxDD) maxDD = dd;
    }

    return maxDD;
  }

  private calculateProfitFactor(trades: TradeMatch[]): number | undefined {
    const grossProfit = trades.filter(t => (t.realizedPnl || 0) > 0).reduce((sum, t) => sum + (t.realizedPnl || 0), 0);
    const grossLoss = Math.abs(trades.filter(t => (t.realizedPnl || 0) < 0).reduce((sum, t) => sum + (t.realizedPnl || 0), 0));
    return grossLoss > 0 ? grossProfit / grossLoss : undefined;
  }

  /**
   * Save trade matches to database
   */
  private async saveTradeMatches(matches: TradeMatch[]): Promise<void> {
    if (matches.length === 0) return;

    const records = matches.map(m => ({
      run_id: this.runId,
      trade_id: m.tradeId,
      ips_score: m.ipsScore,
      passed_ips: m.passedIps,
      factors_passed: m.factorsPassed,
      factors_failed: m.factorsFailed,
      factor_scores: m.factorScores,
      trade_status: m.actualOutcome || "pending",
      realized_pnl: m.realizedPnl,
      realized_roi: m.realizedRoi,
      days_held: m.daysHeld,
      would_have_traded: m.wouldTakeTrade ?? m.passedIps, // Use AI decision if available
      actual_outcome: m.actualOutcome || "pending",
      failing_factors: m.failingFactors,
      sentiment_at_entry: m.sentimentAtEntry,
      sentiment_label: m.sentimentLabel,
      article_count: m.articleCount,
      sentiment_context: m.sentimentContext,
      // AI fields
      ai_recommendation: m.aiRecommendation,
      ai_score: m.aiScore,
      ai_confidence: m.aiConfidence,
      composite_score: m.compositeScore,
      // Portfolio tracking
      portfolio_value_before: m.portfolioValueBefore,
      portfolio_value_after: m.portfolioValueAfter,
      position_size: m.positionSize,
      capital_allocated: m.capitalAllocated,
    }));

    const { error } = await this.supabase
      .from("ips_backtest_trade_matches")
      .insert(records);

    if (error) {
      console.error("[Backtest] Error saving trade matches:", error);
      throw error;
    }
  }

  /**
   * Save backtest results
   */
  private async saveResults(results: BacktestResults): Promise<void> {
    console.log(`[Backtest] Saving results for run ${this.runId}...`);
    console.log(`[Backtest] Total trades: ${results.totalTrades}, Win rate: ${results.winRate}%`);

    const { error } = await this.supabase
      .from("ips_backtest_results")
      .insert({
        run_id: this.runId,
        ips_id: this.config.ipsId,
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
        sortino_ratio: results.sortinoRatio,
        max_drawdown: results.maxDrawdown,
        profit_factor: results.profitFactor,
        strategy_performance: results.strategyPerformance,
        symbol_performance: results.symbolPerformance,
        monthly_performance: results.monthlyPerformance,
        factor_correlation: results.factorCorrelation,
        factor_importance: results.factorImportance,
        // Portfolio metrics
        starting_portfolio: results.startingPortfolio,
        ending_portfolio: results.endingPortfolio,
        total_return: results.totalReturn,
        cagr: results.cagr,
        portfolio_max_drawdown: results.portfolioMaxDrawdown,
        equity_curve: results.equityCurve,
      });

    if (error) {
      console.error("[Backtest] Error saving results:", error);
      console.error("[Backtest] Error details:", JSON.stringify(error, null, 2));
      throw error;
    }

    console.log(`[Backtest] ✓ Results saved successfully`);

    // Update run summary
    await this.supabase
      .from("ips_backtest_runs")
      .update({
        total_trades_analyzed: results.totalTrades,
        trades_matched: results.trades.length,
        trades_passed: results.trades.filter(t => t.passedIps).length,
        pass_rate: results.trades.length > 0 ? (results.trades.filter(t => t.passedIps).length / results.trades.length) * 100 : 0,
      })
      .eq("id", this.runId);
  }

  /**
   * Calculate sentiment correlation
   */
  private async calculateSentimentCorrelation(): Promise<void> {
    // Call Postgres function
    const { data, error } = await this.supabase.rpc("calculate_sentiment_correlation", {
      p_run_id: this.runId,
    });

    if (error) {
      console.error("[Backtest] Error calculating sentiment correlation:", error);
      return;
    }

    // Save to results
    await this.supabase
      .from("ips_backtest_results")
      .update({ sentiment_correlation: data })
      .eq("run_id", this.runId);

    // Find optimal range
    const { data: optimalRange } = await this.supabase.rpc("find_optimal_sentiment_range", {
      p_run_id: this.runId,
    });

    if (optimalRange) {
      await this.supabase
        .from("ips_backtest_results")
        .update({ optimal_sentiment_range: optimalRange })
        .eq("run_id", this.runId);
    }
  }

  /**
   * Create backtest run record
   */
  private async createBacktestRun(): Promise<string> {
    const { data, error } = await this.supabase
      .from("ips_backtest_runs")
      .insert({
        ips_id: this.config.ipsId,
        ips_name: this.config.ipsName,
        ips_config: this.config.ipsConfig,
        start_date: this.config.startDate.toISOString().split('T')[0],
        end_date: this.config.endDate.toISOString().split('T')[0],
        symbols: this.config.symbols,
        min_trades: this.config.minTrades || 10,
        include_sentiment: this.config.includeSentiment !== false,
        user_id: this.config.userId,
        status: "pending",
      })
      .select()
      .single();

    if (error || !data) {
      throw new Error(`Failed to create backtest run: ${error?.message}`);
    }

    return data.id;
  }

  /**
   * Update run status
   */
  private async updateStatus(status: string, errorMessage?: string): Promise<void> {
    const updates: any = {
      status,
      updated_at: new Date().toISOString(),
    };

    if (status === "running") {
      updates.started_at = new Date().toISOString();
    } else if (status === "completed" || status === "failed") {
      updates.completed_at = new Date().toISOString();
    }

    if (errorMessage) {
      updates.error_message = errorMessage;
    }

    await this.supabase
      .from("ips_backtest_runs")
      .update(updates)
      .eq("id", this.runId);
  }

  /**
   * Get symbols to test
   */
  private async getSymbolsToTest(): Promise<string[]> {
    if (this.config.symbols && this.config.symbols.length > 0) {
      return this.config.symbols;
    }

    // Get all unique symbols from historical data
    const { data, error } = await this.supabase
      .from("historical_options_data")
      .select("symbol")
      .gte("snapshot_date", this.config.startDate.toISOString().split('T')[0])
      .lte("snapshot_date", this.config.endDate.toISOString().split('T')[0]);

    if (error || !data) {
      return [];
    }

    return [...new Set(data.map((d: any) => d.symbol))];
  }

  /**
   * Emit progress update
   */
  private emitProgress(progress: BacktestProgress): void {
    if (this.progressCallback) {
      this.progressCallback(progress);
    }
  }
}
