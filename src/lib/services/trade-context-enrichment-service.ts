// Trade Context Enrichment Service
// Gathers comprehensive context for trade candidates by combining:
// 1. Multi-source RAG (internal trades, external intelligence, Tavily)
// 2. IPS evaluation and backtest results
// 3. Current market conditions
// 4. Stock-specific historical performance

import { createClient } from '@supabase/supabase-js';
import { queryMultiSource, type MultiSourceQuery, type MultiSourceResult } from '../agent/multi-source-rag-orchestrator';
import { getIntelligenceCacheService } from './intelligence-cache-service';
import { getLiveMarketIntelligenceService, type LiveMarketIntelligence } from './live-market-intelligence-service';

// ============================================================================
// Types
// ============================================================================

export interface TradeCandidate {
  symbol: string;
  strategy_type: 'put_credit_spread' | 'call_credit_spread' | 'iron_condor';
  short_strike: number;
  long_strike: number;
  expiration_date: string;
  contract_type: 'put' | 'call';
  credit_received?: number;
  delta?: number;
  iv_rank?: number;
  dte?: number;
  estimated_pop?: number;
  current_stock_price?: number;
  // IPS evaluation from agent (if already evaluated)
  ips_evaluation?: IPSEvaluation;
  // IPS factors from agent (for AI prompt context)
  ips_factors?: Array<{
    factor_name: string;
    actual_value: any;
    target_value?: any;
    passed: boolean;
    weight?: number;
  }>;
}

export interface IPSEvaluation {
  ips_id: string;
  ips_name: string;
  passed: boolean;
  score: number;
  max_score: number;
  score_percentage: number;
  ai_weight?: number; // AI weight percentage (0-100) from IPS configuration
  failed_factors: Array<{
    factor_key: string;
    factor_name: string;
    actual_value: any;
    expected_value: any;
    weight: number;
  }>;
  passed_factors: Array<{
    factor_key: string;
    factor_name: string;
    actual_value: any;
    weight: number;
  }>;
}

export interface HistoricalPerformance {
  symbol: string;
  total_trades: number;
  winning_trades: number;
  losing_trades: number;
  win_rate: number;
  avg_roi: number;
  avg_dte: number;
  strategy_breakdown: Record<string, {
    count: number;
    win_rate: number;
    avg_roi: number;
  }>;
  recent_trades: Array<{
    id: string;
    strategy_type: string;
    realized_pl: number;
    realized_pl_percent: number;
    created_at: string;
    closed_at: string;
  }>;
}

export interface MarketConditions {
  overall_sentiment: 'bullish' | 'bearish' | 'neutral' | 'mixed';
  vix_level?: number;
  spy_trend?: 'up' | 'down' | 'sideways';
  sector_performance?: Record<string, number>;
  conditions_favorable: boolean;
  risk_factors: string[];
}

export interface EnrichedTradeContext {
  candidate: TradeCandidate;
  ips_evaluation: IPSEvaluation;
  multi_source_intelligence: MultiSourceResult;
  live_market_intelligence: LiveMarketIntelligence | null;
  historical_performance: HistoricalPerformance;
  market_conditions: MarketConditions;
  similar_trades: Array<{
    similarity_score: number;
    trade_id: string;
    outcome: 'win' | 'loss';
    realized_pl_percent: number;
    context_summary: string;
  }>;
  enrichment_timestamp: string;
  data_quality: {
    has_external_intelligence: boolean;
    has_internal_rag: boolean;
    has_historical_trades: boolean;
    has_tavily_research: boolean;
    has_live_news: boolean;
    overall_confidence: 'high' | 'medium' | 'low';
  };
}

// ============================================================================
// Trade Context Enrichment Service
// ============================================================================

export class TradeContextEnrichmentService {
  private mainDb: ReturnType<typeof createClient>;
  private cacheService: ReturnType<typeof getIntelligenceCacheService>;
  private liveIntelligenceService: ReturnType<typeof getLiveMarketIntelligenceService>;

  constructor() {
    this.mainDb = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
    this.cacheService = getIntelligenceCacheService();
    this.liveIntelligenceService = getLiveMarketIntelligenceService();
  }

  /**
   * Main entry point: Enriches a trade candidate with all available context
   */
  async enrichTradeCandidate(
    candidate: TradeCandidate,
    ipsId: string,
    options: {
      includeExternalIntelligence?: boolean;
      includeInternalRAG?: boolean;
      includeTavily?: boolean;
      includeLiveNews?: boolean;
      includeHistoricalPerformance?: boolean;
      includeSimilarTrades?: boolean;
    } = {}
  ): Promise<EnrichedTradeContext> {
    const {
      includeExternalIntelligence = true,
      includeInternalRAG = true,
      includeTavily = true,
      includeLiveNews = true,
      includeHistoricalPerformance = true,
      includeSimilarTrades = true,
    } = options;

    console.log(`[TradeContextEnrichment] Enriching trade candidate for ${candidate.symbol}`);

    // Run enrichment tasks in parallel for performance
    const [
      ipsEvaluation,
      multiSourceIntel,
      liveIntelligence,
      historicalPerf,
      marketConditions,
      similarTrades,
    ] = await Promise.all([
      // Use provided IPS evaluation if available, otherwise evaluate
      candidate.ips_evaluation
        ? Promise.resolve(candidate.ips_evaluation)
        : this.evaluateAgainstIPS(candidate, ipsId),
      this.gatherMultiSourceIntelligence(candidate, {
        includeExternalIntelligence,
        includeInternalRAG,
        includeTavily,
      }),
      includeLiveNews
        ? this.liveIntelligenceService.getLiveIntelligence(candidate.symbol, {
            includeNews: true,
            includeInsiderActivity: false,
            newsLimit: 20,
            useCache: true,
          })
        : Promise.resolve(null),
      includeHistoricalPerformance
        ? this.fetchHistoricalPerformance(candidate.symbol)
        : Promise.resolve(this.getEmptyHistoricalPerformance()),
      this.assessMarketConditions(candidate.symbol),
      includeSimilarTrades
        ? this.findSimilarTrades(candidate)
        : Promise.resolve([]),
    ]);

    // Calculate data quality
    const dataQuality = this.assessDataQuality(
      multiSourceIntel,
      liveIntelligence,
      historicalPerf,
      similarTrades
    );

    const enrichedContext: EnrichedTradeContext = {
      candidate,
      ips_evaluation: ipsEvaluation,
      multi_source_intelligence: multiSourceIntel,
      live_market_intelligence: liveIntelligence,
      historical_performance: historicalPerf,
      market_conditions: marketConditions,
      similar_trades: similarTrades,
      enrichment_timestamp: new Date().toISOString(),
      data_quality: dataQuality,
    };

    console.log(`[TradeContextEnrichment] Enrichment complete for ${candidate.symbol}`);
    console.log(`  IPS Passed: ${ipsEvaluation.passed}`);
    console.log(`  Data Quality: ${dataQuality.overall_confidence}`);
    console.log(`  Historical Trades: ${historicalPerf.total_trades}`);
    console.log(`  Live News Articles: ${liveIntelligence?.news_sentiment?.articles.length || 0}`);
    console.log(`  Similar Trades Found: ${similarTrades.length}`);

    return enrichedContext;
  }

  /**
   * Evaluate trade candidate against IPS configuration
   */
  private async evaluateAgainstIPS(
    candidate: TradeCandidate,
    ipsId: string
  ): Promise<IPSEvaluation> {
    // Fetch IPS configuration
    const { data: ipsConfig, error: ipsError } = await this.mainDb
      .from('ips_configurations')
      .select('*')
      .eq('id', ipsId)
      .single();

    if (ipsError || !ipsConfig) {
      throw new Error(`Failed to fetch IPS configuration: ${ipsError?.message}`);
    }

    // Fetch IPS factors
    const { data: factors, error: factorsError } = await this.mainDb
      .from('ips_factors')
      .select('*')
      .eq('ips_id', ipsId)
      .eq('enabled', true);

    if (factorsError) {
      throw new Error(`Failed to fetch IPS factors: ${factorsError.message}`);
    }

    if (!factors || factors.length === 0) {
      return {
        ips_id: ipsId,
        ips_name: ipsConfig.name,
        passed: true,
        score: 0,
        max_score: 0,
        score_percentage: 100,
        ai_weight: ipsConfig.ai_weight ?? 20,
        failed_factors: [],
        passed_factors: [],
      };
    }

    // Evaluate each factor
    const failedFactors: IPSEvaluation['failed_factors'] = [];
    const passedFactors: IPSEvaluation['passed_factors'] = [];
    let totalScore = 0;
    let maxScore = 0;

    for (const factor of factors) {
      const weight = factor.weight || 1;
      maxScore += weight * 100;

      const actualValue = this.extractFactorValue(candidate, factor.factor_key);
      const passed = this.evaluateFactor(actualValue, factor);

      if (passed) {
        totalScore += weight * 100;
        passedFactors.push({
          factor_key: factor.factor_key,
          factor_name: factor.display_name || factor.factor_key,
          actual_value: actualValue,
          weight,
        });
      } else {
        failedFactors.push({
          factor_key: factor.factor_key,
          factor_name: factor.display_name || factor.factor_key,
          actual_value: actualValue,
          expected_value: factor.target_value || factor.threshold,
          weight,
        });
      }
    }

    const scorePercentage = maxScore > 0 ? (totalScore / maxScore) * 100 : 0;
    const passed = failedFactors.length === 0;

    return {
      ips_id: ipsId,
      ips_name: ipsConfig.name,
      passed,
      score: totalScore,
      max_score: maxScore,
      score_percentage: scorePercentage,
      ai_weight: ipsConfig.ai_weight ?? 20,
      failed_factors: failedFactors,
      passed_factors: passedFactors,
    };
  }

  /**
   * Extract factor value from trade candidate
   */
  private extractFactorValue(candidate: TradeCandidate, factorKey: string): any {
    const mapping: Record<string, any> = {
      delta: candidate.delta,
      iv_rank: candidate.iv_rank,
      dte: candidate.dte,
      credit_received: candidate.credit_received,
      estimated_pop: candidate.estimated_pop,
      current_stock_price: candidate.current_stock_price,
      strategy_type: candidate.strategy_type,
      // Add more mappings as needed
    };

    return mapping[factorKey] ?? null;
  }

  /**
   * Evaluate a single factor
   */
  private evaluateFactor(actualValue: any, factor: any): boolean {
    if (actualValue === null || actualValue === undefined) {
      return false;
    }

    const operator = factor.target_operator || '>=';
    const threshold = factor.threshold || factor.target_value;

    if (threshold === null || threshold === undefined) {
      return true; // No threshold means automatic pass
    }

    switch (operator) {
      case '>=':
        return actualValue >= threshold;
      case '<=':
        return actualValue <= threshold;
      case '>':
        return actualValue > threshold;
      case '<':
        return actualValue < threshold;
      case '==':
      case '=':
        return actualValue === threshold;
      case '!=':
        return actualValue !== threshold;
      default:
        return true;
    }
  }

  /**
   * Gather intelligence from multiple sources
   */
  private async gatherMultiSourceIntelligence(
    candidate: TradeCandidate,
    options: {
      includeExternalIntelligence: boolean;
      includeInternalRAG: boolean;
      includeTavily: boolean;
    }
  ): Promise<MultiSourceResult> {
    const query: MultiSourceQuery = {
      symbol: candidate.symbol,
      context: `Evaluating ${candidate.strategy_type} trade: ${candidate.short_strike}/${candidate.long_strike} expiring ${candidate.expiration_date}`,
      includeExternalIntelligence: options.includeExternalIntelligence,
      includeInternalRAG: options.includeInternalRAG,
      includeTavily: options.includeTavily,
      externalIntelligenceOptions: {
        includeEarnings: true,
        includeNews: true,
        maxEarningsQuarters: 2,
        maxNewsArticles: 10,
        newsMaxAgeDays: 7,
      },
    };

    return await queryMultiSource(query);
  }

  /**
   * Fetch historical performance for symbol
   */
  private async fetchHistoricalPerformance(symbol: string): Promise<HistoricalPerformance> {
    // Get all closed trades for this symbol
    const { data: trades, error } = await this.mainDb
      .from('trades')
      .select('*')
      .eq('symbol', symbol)
      .eq('status', 'closed')
      .order('closed_at', { ascending: false });

    if (error) {
      console.error(`[TradeContextEnrichment] Error fetching historical trades: ${error.message}`);
      return this.getEmptyHistoricalPerformance();
    }

    if (!trades || trades.length === 0) {
      return this.getEmptyHistoricalPerformance();
    }

    const winningTrades = trades.filter((t) => (t.realized_pl || 0) > 0);
    const losingTrades = trades.filter((t) => (t.realized_pl || 0) < 0);
    const winRate = (winningTrades.length / trades.length) * 100;

    const avgRoi =
      trades.reduce((sum, t) => sum + (t.realized_pl_percent || 0), 0) / trades.length;

    // Calculate average DTE
    const avgDte =
      trades
        .filter((t) => t.created_at && t.closed_at)
        .reduce((sum, t) => {
          const days = Math.floor(
            (new Date(t.closed_at).getTime() - new Date(t.created_at).getTime()) /
              (1000 * 60 * 60 * 24)
          );
          return sum + days;
        }, 0) / trades.length;

    // Strategy breakdown
    const strategyBreakdown: HistoricalPerformance['strategy_breakdown'] = {};
    for (const trade of trades) {
      const strategy = trade.strategy_type || 'unknown';
      if (!strategyBreakdown[strategy]) {
        strategyBreakdown[strategy] = { count: 0, win_rate: 0, avg_roi: 0 };
      }
      strategyBreakdown[strategy].count++;
    }

    // Calculate metrics for each strategy
    for (const [strategy, stats] of Object.entries(strategyBreakdown)) {
      const strategyTrades = trades.filter((t) => t.strategy_type === strategy);
      const strategyWins = strategyTrades.filter((t) => (t.realized_pl || 0) > 0);
      stats.win_rate = (strategyWins.length / strategyTrades.length) * 100;
      stats.avg_roi =
        strategyTrades.reduce((sum, t) => sum + (t.realized_pl_percent || 0), 0) /
        strategyTrades.length;
    }

    // Recent trades (last 5)
    const recentTrades = trades.slice(0, 5).map((t) => ({
      id: t.id,
      strategy_type: t.strategy_type || 'unknown',
      realized_pl: t.realized_pl || 0,
      realized_pl_percent: t.realized_pl_percent || 0,
      created_at: t.created_at,
      closed_at: t.closed_at,
    }));

    return {
      symbol,
      total_trades: trades.length,
      winning_trades: winningTrades.length,
      losing_trades: losingTrades.length,
      win_rate: winRate,
      avg_roi: avgRoi,
      avg_dte: avgDte || 0,
      strategy_breakdown: strategyBreakdown,
      recent_trades: recentTrades,
    };
  }

  /**
   * Assess current market conditions
   */
  private async assessMarketConditions(symbol: string): Promise<MarketConditions> {
    // TODO: Implement real market conditions assessment
    // For now, return neutral conditions
    return {
      overall_sentiment: 'neutral',
      conditions_favorable: true,
      risk_factors: [],
    };
  }

  /**
   * Find similar historical trades using vector similarity
   */
  private async findSimilarTrades(candidate: TradeCandidate): Promise<EnrichedTradeContext['similar_trades']> {
    // TODO: Implement vector similarity search
    // For now, return empty array
    return [];
  }

  /**
   * Assess overall data quality
   */
  private assessDataQuality(
    multiSource: MultiSourceResult,
    liveIntelligence: LiveMarketIntelligence | null,
    historical: HistoricalPerformance,
    similarTrades: any[]
  ): EnrichedTradeContext['data_quality'] {
    const hasExternalIntel = !!multiSource.external_intelligence;
    const hasInternalRAG = !!multiSource.internal_rag;
    const hasTavily = !!multiSource.tavily_research;
    const hasLiveNews = !!liveIntelligence?.news_sentiment && (liveIntelligence.news_sentiment.articles.length > 0);
    const hasHistorical = historical.total_trades > 0;

    const dataPoints = [
      hasExternalIntel,
      hasInternalRAG,
      hasTavily,
      hasLiveNews,
      hasHistorical,
    ].filter(Boolean).length;

    let confidence: 'high' | 'medium' | 'low';
    if (dataPoints >= 4) {
      confidence = 'high';
    } else if (dataPoints >= 2) {
      confidence = 'medium';
    } else {
      confidence = 'low';
    }

    return {
      has_external_intelligence: hasExternalIntel,
      has_internal_rag: hasInternalRAG,
      has_historical_trades: hasHistorical,
      has_tavily_research: hasTavily,
      has_live_news: hasLiveNews,
      overall_confidence: confidence,
    };
  }

  /**
   * Get empty historical performance structure
   */
  private getEmptyHistoricalPerformance(): HistoricalPerformance {
    return {
      symbol: '',
      total_trades: 0,
      winning_trades: 0,
      losing_trades: 0,
      win_rate: 0,
      avg_roi: 0,
      avg_dte: 0,
      strategy_breakdown: {},
      recent_trades: [],
    };
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let enrichmentServiceInstance: TradeContextEnrichmentService | null = null;

export function getTradeContextEnrichmentService(): TradeContextEnrichmentService {
  if (!enrichmentServiceInstance) {
    enrichmentServiceInstance = new TradeContextEnrichmentService();
  }
  return enrichmentServiceInstance;
}

// ============================================================================
// Convenience Function
// ============================================================================

export async function enrichTradeCandidate(
  candidate: TradeCandidate,
  ipsId: string,
  options?: Parameters<TradeContextEnrichmentService['enrichTradeCandidate']>[2]
): Promise<EnrichedTradeContext> {
  return getTradeContextEnrichmentService().enrichTradeCandidate(candidate, ipsId, options);
}
