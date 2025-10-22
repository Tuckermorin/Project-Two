// src/lib/services/trade-snapshot-service.ts
// Comprehensive trade snapshot capture service for temporal pattern analysis

import { createClient } from '@supabase/supabase-js';
import { getMarketDataService } from './market-data-service';
import { getAlphaVantageClient } from '@/lib/api/alpha-vantage';
import { computeIpsScore } from './trade-scoring-service';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const alphaVantage = getAlphaVantageClient();
const marketData = getMarketDataService();

// ============================================================================
// Types
// ============================================================================

export interface TradeSnapshotInput {
  trade_id: string;
  user_id: string;
  snapshot_trigger: 'scheduled' | 'significant_move' | 'greek_threshold' | 'manual';

  // Market Data
  current_stock_price?: number;
  current_spread_price?: number;

  // Greeks
  delta_short_leg?: number;
  delta_long_leg?: number;
  delta_spread?: number;
  theta?: number;
  vega?: number;
  gamma?: number;
  rho?: number;

  // P&L
  unrealized_pnl?: number;
  unrealized_pnl_percent?: number;
  days_to_expiration?: number;
  days_in_trade?: number;

  // IV & Volatility
  iv_short_strike?: number;
  iv_long_strike?: number;
  iv_rank?: number;
  iv_percentile?: number;
  hv_20?: number;
  hv_30?: number;

  // Risk Metrics
  probability_of_profit?: number;
  probability_itm?: number;
  break_even_price?: number;

  // Market Context
  spy_price?: number;
  spy_change_percent?: number;
  vix_level?: number;
  vix_change_percent?: number;
  sector_performance?: number;

  // IPS Factor Data (all factors - let AI discover patterns)
  ips_factor_data?: Record<string, any>;
  ips_score?: number;
  ips_targets_met?: number;
  ips_target_percentage?: number;
  raw_data?: Record<string, any>;
}

interface Trade {
  id: string;
  user_id: string;
  ips_id?: string;
  symbol: string;
  strategy_type: string;
  contract_type: string;
  entry_date: string;
  expiration_date: string;
  short_strike: number;
  long_strike: number;
  credit_received: number;
  number_of_contracts: number;
  status: string;
  current_price?: number;
  sector?: string;
}

// ============================================================================
// Main Snapshot Service
// ============================================================================

export class TradeSnapshotService {
  /**
   * Capture snapshot for a single trade
   */
  async captureSnapshot(
    tradeId: string,
    trigger: 'scheduled' | 'significant_move' | 'greek_threshold' | 'manual' = 'scheduled'
  ): Promise<TradeSnapshotInput | null> {
    console.log(`[Snapshot] Capturing snapshot for trade ${tradeId} (${trigger})`);

    try {
      // Fetch trade
      const { data: trade, error } = await supabase
        .from('trades')
        .select('*')
        .eq('id', tradeId)
        .single();

      if (error || !trade) {
        console.error(`[Snapshot] Trade ${tradeId} not found`);
        return null;
      }

      const typedTrade = trade as Trade;

      // Build snapshot
      const snapshot = await this.buildSnapshot(typedTrade, trigger);

      // Store snapshot
      await this.storeSnapshot(snapshot);

      // Check if we should trigger event-based actions
      await this.checkSnapshotThresholds(snapshot, typedTrade);

      return snapshot;
    } catch (error) {
      console.error(`[Snapshot] Error capturing snapshot for ${tradeId}:`, error);
      return null;
    }
  }

  /**
   * Capture snapshots for all active trades
   */
  async captureAllActiveSnapshots(
    trigger: 'scheduled' | 'significant_move' | 'greek_threshold' | 'manual' = 'scheduled'
  ): Promise<number> {
    console.log(`[Snapshot] Capturing snapshots for all active trades (${trigger})`);

    const { data: activeTrades, error } = await supabase
      .from('trades')
      .select('*')
      .eq('status', 'active');

    if (error || !activeTrades) {
      console.error('[Snapshot] Failed to fetch active trades:', error);
      return 0;
    }

    console.log(`[Snapshot] Found ${activeTrades.length} active trades`);

    let successCount = 0;
    for (const trade of activeTrades) {
      try {
        await this.captureSnapshot(trade.id, trigger);
        successCount++;
      } catch (error) {
        console.error(`[Snapshot] Failed to capture snapshot for ${trade.id}:`, error);
      }
    }

    console.log(`[Snapshot] Successfully captured ${successCount}/${activeTrades.length} snapshots`);
    return successCount;
  }

  /**
   * Build a complete snapshot from market data + IPS factors
   */
  private async buildSnapshot(
    trade: Trade,
    trigger: 'scheduled' | 'significant_move' | 'greek_threshold' | 'manual'
  ): Promise<TradeSnapshotInput> {
    // Get current stock price
    const stockData = await marketData.getUnifiedStockData(trade.symbol, true); // Include fundamentals
    const currentStockPrice = stockData.currentPrice;

    // Fetch ALL IPS factors for this trade's IPS configuration
    const ipsFactorData = await this.fetchIPSFactorData(trade, stockData);

    // Calculate current IPS score with updated factor values
    let ipsScore: number | undefined;
    let ipsTargetsMet: number | undefined;
    let ipsTargetPercentage: number | undefined;

    if (trade.ips_id && Object.keys(ipsFactorData).length > 0) {
      try {
        // Build factor values from the fetched data
        const factorValues: Record<string, any> = {};

        for (const [key, data] of Object.entries(ipsFactorData)) {
          if (typeof data === 'object' && data.value !== undefined) {
            factorValues[key] = data.value;
          } else {
            factorValues[key] = data;
          }
        }

        console.log(`[Snapshot] Calculating IPS score for trade ${trade.id} with ${Object.keys(factorValues).length} factors`);

        const scoreResult = await computeIpsScore(supabase, trade.ips_id, factorValues);
        ipsScore = scoreResult.finalScore;
        ipsTargetsMet = scoreResult.targetsMetCount;
        ipsTargetPercentage = scoreResult.targetPercentage;

        console.log(`[Snapshot] IPS score: ${ipsScore.toFixed(1)}/100 (${ipsTargetsMet}/${scoreResult.factorScores.length} targets met)`);
      } catch (error) {
        console.error(`[Snapshot] Failed to calculate IPS score:`, error);
      }
    }

    // Get options data for both legs
    const shortLegData = await marketData.getOptionsData(
      trade.symbol,
      trade.short_strike,
      trade.expiration_date,
      trade.contract_type === 'put' ? 'put' : 'call',
      true // force refresh
    );

    const longLegData = await marketData.getOptionsData(
      trade.symbol,
      trade.long_strike,
      trade.expiration_date,
      trade.contract_type === 'put' ? 'put' : 'call',
      true
    );

    // Calculate spread price (current market value)
    const shortLegPrice = shortLegData?.ask || 0; // What we'd pay to buy back short
    const longLegPrice = longLegData?.bid || 0;   // What we'd get selling long
    const currentSpreadPrice = shortLegPrice - longLegPrice;

    // Calculate P&L
    const creditReceived = trade.credit_received || 0;
    const unrealizedPnl = (creditReceived - currentSpreadPrice) * trade.number_of_contracts * 100;
    const unrealizedPnlPercent = creditReceived > 0
      ? (unrealizedPnl / (creditReceived * trade.number_of_contracts * 100)) * 100
      : 0;

    // Calculate days
    const entryDate = new Date(trade.entry_date);
    const expirationDate = new Date(trade.expiration_date);
    const now = new Date();
    const daysInTrade = Math.floor((now.getTime() - entryDate.getTime()) / (1000 * 60 * 60 * 24));
    const daysToExpiration = Math.floor((expirationDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

    // Greeks
    const deltaShortLeg = shortLegData?.greeks?.delta || null;
    const deltaLongLeg = longLegData?.greeks?.delta || null;
    const deltaSpread = (deltaShortLeg && deltaLongLeg)
      ? deltaShortLeg + deltaLongLeg  // For credit spreads, short delta is negative
      : null;

    const theta = shortLegData?.greeks?.theta || null;
    const vega = shortLegData?.greeks?.vega || null;
    const gamma = shortLegData?.greeks?.gamma || null;

    // IV data
    const ivShortStrike = shortLegData?.greeks?.impliedVolatility || null;
    const ivLongStrike = longLegData?.greeks?.impliedVolatility || null;

    // Get IV Rank/Percentile from cache
    const { data: ivCache } = await supabase
      .from('iv_cache')
      .select('iv_rank, iv_percentile')
      .eq('symbol', trade.symbol)
      .order('cached_at', { ascending: false })
      .limit(1)
      .single();

    const ivRank = ivCache?.iv_rank || null;
    const ivPercentile = ivCache?.iv_percentile || null;

    // Get historical volatility
    const hv20 = await this.calculateHV20(trade.symbol);

    // Risk metrics (simplified calculations - can be enhanced)
    const probabilityOfProfit = this.calculateProbabilityOfProfit(
      currentStockPrice,
      trade.short_strike,
      trade.long_strike,
      ivShortStrike,
      daysToExpiration,
      trade.contract_type
    );

    const probabilityItm = this.calculateProbabilityITM(
      currentStockPrice,
      trade.short_strike,
      ivShortStrike,
      daysToExpiration,
      trade.contract_type
    );

    const breakEvenPrice = this.calculateBreakEven(
      trade.short_strike,
      creditReceived,
      trade.contract_type
    );

    // Market context
    const spyPrice = await this.getSPYPrice();
    const vixLevel = await this.getVIXLevel();
    const sectorPerformance = await this.getSectorPerformance(trade.sector);

    const snapshot: TradeSnapshotInput = {
      trade_id: trade.id,
      user_id: trade.user_id,
      snapshot_trigger: trigger,
      current_stock_price: currentStockPrice,
      current_spread_price: currentSpreadPrice,
      delta_short_leg: deltaShortLeg,
      delta_long_leg: deltaLongLeg,
      delta_spread: deltaSpread,
      theta,
      vega,
      gamma,
      rho: shortLegData?.greeks?.rho || null,
      unrealized_pnl: unrealizedPnl,
      unrealized_pnl_percent: unrealizedPnlPercent,
      days_to_expiration: daysToExpiration,
      days_in_trade: daysInTrade,
      iv_short_strike: ivShortStrike,
      iv_long_strike: ivLongStrike,
      iv_rank: ivRank,
      iv_percentile: ivPercentile,
      hv_20: hv20,
      probability_of_profit: probabilityOfProfit,
      probability_itm: probabilityItm,
      break_even_price: breakEvenPrice,
      spy_price: spyPrice,
      vix_level: vixLevel,
      sector_performance: sectorPerformance,

      // IPS Factor Data - all factors that went into the IPS calculation
      ips_factor_data: ipsFactorData,
      ips_score: ipsScore,
      ips_targets_met: ipsTargetsMet,
      ips_target_percentage: ipsTargetPercentage,

      // Raw data - store complete snapshot for AI analysis
      raw_data: {
        stock_data: {
          current_price: currentStockPrice,
          previous_close: stockData.previousClose,
          volume: stockData.volume,
          fundamentals: stockData.fundamentals
        },
        options_data: {
          short_leg: shortLegData,
          long_leg: longLegData
        },
        trade_state: {
          entry_date: trade.entry_date,
          expiration_date: trade.expiration_date,
          strategy_type: trade.strategy_type,
          contract_type: trade.contract_type
        }
      }
    };

    return snapshot;
  }

  /**
   * Store snapshot in database
   */
  private async storeSnapshot(snapshot: TradeSnapshotInput): Promise<void> {
    const { error } = await supabase
      .from('trade_snapshots')
      .insert(snapshot);

    if (error) {
      console.error('[Snapshot] Failed to store snapshot:', error);
      throw error;
    }

    console.log(`[Snapshot] Stored snapshot for trade ${snapshot.trade_id}`);
  }

  /**
   * Check snapshot against thresholds and trigger events if needed
   */
  private async checkSnapshotThresholds(
    snapshot: TradeSnapshotInput,
    trade: Trade
  ): Promise<void> {
    // Check delta threshold
    if (snapshot.delta_spread && Math.abs(snapshot.delta_spread) > 0.40) {
      console.log(`[Snapshot] HIGH DELTA ALERT: Trade ${trade.id} has delta ${snapshot.delta_spread.toFixed(3)}`);
      // Could trigger notification or auto-adjustment here
    }

    // Check P&L threshold
    if (snapshot.unrealized_pnl_percent && snapshot.unrealized_pnl_percent > 50) {
      console.log(`[Snapshot] PROFIT TARGET: Trade ${trade.id} at ${snapshot.unrealized_pnl_percent.toFixed(1)}% profit`);
      // Could trigger take-profit notification
    }

    if (snapshot.unrealized_pnl_percent && snapshot.unrealized_pnl_percent < -50) {
      console.log(`[Snapshot] LOSS ALERT: Trade ${trade.id} at ${snapshot.unrealized_pnl_percent.toFixed(1)}% loss`);
      // Could trigger stop-loss notification
    }
  }

  /**
   * Monitor for significant changes and trigger snapshot if needed
   */
  async monitorSignificantChanges(tradeId: string): Promise<boolean> {
    const { data: latestSnapshot } = await supabase
      .from('trade_snapshots')
      .select('*')
      .eq('trade_id', tradeId)
      .order('snapshot_time', { ascending: false })
      .limit(1)
      .single();

    if (!latestSnapshot) {
      // No previous snapshot, always capture
      await this.captureSnapshot(tradeId, 'significant_move');
      return true;
    }

    // Get current metrics (would need to build lightweight version)
    const { data: trade } = await supabase
      .from('trades')
      .select('*')
      .eq('id', tradeId)
      .single();

    if (!trade) return false;

    // Simplified check - in production, fetch current greeks
    // and compare against thresholds
    const timeSinceLastSnapshot = Date.now() - new Date(latestSnapshot.snapshot_time).getTime();
    const hoursSinceLastSnapshot = timeSinceLastSnapshot / (1000 * 60 * 60);

    // If more than 4 hours since last snapshot during market hours, capture new one
    if (hoursSinceLastSnapshot > 4) {
      await this.captureSnapshot(tradeId, 'significant_move');
      return true;
    }

    return false;
  }

  // ============================================================================
  // Helper Calculation Methods
  // ============================================================================

  private calculateProbabilityOfProfit(
    stockPrice: number,
    shortStrike: number,
    longStrike: number,
    iv: number | null,
    dte: number,
    contractType: string
  ): number | null {
    if (!iv || !stockPrice || !shortStrike || dte <= 0) return null;

    // Simplified Black-Scholes approximation
    // For a put credit spread, profit if stock stays above short strike
    const stdDev = iv * Math.sqrt(dte / 365);
    const zScore = (stockPrice - shortStrike) / (stockPrice * stdDev);

    // Normal CDF approximation
    const prob = 0.5 * (1 + this.erf(zScore / Math.sqrt(2)));

    return contractType === 'put' ? prob * 100 : (1 - prob) * 100;
  }

  private calculateProbabilityITM(
    stockPrice: number,
    strike: number,
    iv: number | null,
    dte: number,
    contractType: string
  ): number | null {
    if (!iv || !stockPrice || !strike || dte <= 0) return null;

    const stdDev = iv * Math.sqrt(dte / 365);
    const zScore = (stockPrice - strike) / (stockPrice * stdDev);
    const prob = 0.5 * (1 + this.erf(zScore / Math.sqrt(2)));

    return contractType === 'put' ? (1 - prob) * 100 : prob * 100;
  }

  private calculateBreakEven(
    shortStrike: number,
    creditReceived: number,
    contractType: string
  ): number {
    // For put credit spread: short strike - credit received
    // For call credit spread: short strike + credit received
    return contractType === 'put'
      ? shortStrike - creditReceived
      : shortStrike + creditReceived;
  }

  private async calculateHV20(symbol: string): Promise<number | null> {
    try {
      // Fetch daily price data to calculate 20-day historical volatility
      const timeSeries = await alphaVantage.getDailyAdjustedSeries(symbol, 'compact');

      if (!timeSeries) return null;

      // Convert the object to an array of [date, data] pairs and sort by date descending
      const sortedDates = Object.keys(timeSeries).sort().reverse();

      if (sortedDates.length < 21) return null;

      // Calculate daily returns using the most recent 21 days (to get 20 returns)
      const returns: number[] = [];
      for (let i = 0; i < 20; i++) {
        const currentDate = sortedDates[i];
        const previousDate = sortedDates[i + 1];

        const currentClose = parseFloat(timeSeries[currentDate]['5. adjusted close']);
        const previousClose = parseFloat(timeSeries[previousDate]['5. adjusted close']);

        if (isNaN(currentClose) || isNaN(previousClose) || previousClose === 0) continue;

        const dailyReturn = Math.log(currentClose / previousClose);
        returns.push(dailyReturn);
      }

      if (returns.length < 20) return null;

      // Calculate standard deviation
      const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
      const variance = returns.reduce((sum, ret) => sum + Math.pow(ret - mean, 2), 0) / returns.length;
      const stdDev = Math.sqrt(variance);

      // Annualize (252 trading days)
      const hv20 = stdDev * Math.sqrt(252) * 100;

      return hv20;
    } catch (error) {
      console.error(`[Snapshot] Failed to calculate HV20 for ${symbol}:`, error);
      return null;
    }
  }

  private async getSPYPrice(): Promise<number | null> {
    try {
      const stockData = await marketData.getUnifiedStockData('SPY', false);
      return stockData.currentPrice;
    } catch (error) {
      console.error('[Snapshot] Failed to get SPY price:', error);
      return null;
    }
  }

  private async getVIXLevel(): Promise<number | null> {
    try {
      const stockData = await marketData.getUnifiedStockData('VIX', false);
      return stockData.currentPrice;
    } catch (error) {
      console.error('[Snapshot] Failed to get VIX level:', error);
      return null;
    }
  }

  private async getSectorPerformance(sector: string | null | undefined): Promise<number | null> {
    if (!sector) return null;

    try {
      // Map sector to ETF
      const sectorETFMap: Record<string, string> = {
        'Technology': 'XLK',
        'Healthcare': 'XLV',
        'Financials': 'XLF',
        'Energy': 'XLE',
        'Consumer Discretionary': 'XLY',
        'Industrials': 'XLI',
        'Materials': 'XLB',
        'Real Estate': 'XLRE',
        'Utilities': 'XLU',
        'Consumer Staples': 'XLP',
        'Communication Services': 'XLC',
      };

      const etf = sectorETFMap[sector];
      if (!etf) return null;

      const stockData = await marketData.getUnifiedStockData(etf, false);
      return stockData.priceChangePercent;
    } catch (error) {
      console.error(`[Snapshot] Failed to get sector performance for ${sector}:`, error);
      return null;
    }
  }

  // Error function for normal distribution calculations
  private erf(x: number): number {
    const sign = x >= 0 ? 1 : -1;
    x = Math.abs(x);

    const a1 = 0.254829592;
    const a2 = -0.284496736;
    const a3 = 1.421413741;
    const a4 = -1.453152027;
    const a5 = 1.061405429;
    const p = 0.3275911;

    const t = 1.0 / (1.0 + p * x);
    const y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);

    return sign * y;
  }

  /**
   * Fetch ALL IPS factor data for the trade
   * No hard-coded filtering - capture everything for AI analysis
   */
  private async fetchIPSFactorData(
    trade: Trade,
    stockData: any
  ): Promise<Record<string, any>> {
    try {
      // Get the IPS configuration for this trade
      if (!trade.ips_id) {
        console.log('[Snapshot] No IPS configuration for trade, skipping factor fetch');
        return {};
      }

      // Fetch all factors configured for this IPS
      const { data: ipsFactors, error } = await supabase
        .from('ips_factors')
        .select('*')
        .eq('ips_id', trade.ips_id);

      if (error || !ipsFactors) {
        console.error('[Snapshot] Failed to fetch IPS factors:', error);
        return {};
      }

      console.log(`[Snapshot] Fetching ${ipsFactors.length} IPS factors for snapshot`);

      const factorData: Record<string, any> = {};

      // For each factor, fetch its current value
      for (const factor of ipsFactors) {
        try {
          let value = null;

          // Map factor to data source
          if (factor.factor_key) {
            // Try to get from stock fundamentals first
            value = this.getFactorFromStockData(factor.factor_key, stockData);
          }

          // Store factor with its metadata
          factorData[factor.factor_key || factor.factor_name] = {
            value,
            weight: factor.weight,
            threshold: factor.threshold,
            direction: factor.direction,
            enabled: factor.enabled,
            category: factor.category,
            factor_scope: factor.factor_scope
          };
        } catch (error) {
          console.error(`[Snapshot] Failed to fetch factor ${factor.factor_name}:`, error);
        }
      }

      return factorData;
    } catch (error) {
      console.error('[Snapshot] Error fetching IPS factor data:', error);
      return {};
    }
  }

  /**
   * Extract factor value from stock data
   */
  private getFactorFromStockData(factorKey: string, stockData: any): any {
    const key = factorKey.toLowerCase();

    // Market data
    if (key.includes('price') || key === 'current_price') return stockData.currentPrice;
    if (key.includes('volume')) return stockData.volume;
    if (key.includes('change')) return stockData.priceChangePercent;

    // Fundamentals
    if (!stockData.fundamentals) return null;

    const fundamentals = stockData.fundamentals;

    if (key.includes('pe') || key.includes('p_e')) return fundamentals.pbRatio;
    if (key.includes('beta')) return fundamentals.beta;
    if (key.includes('market_cap') || key.includes('marketcap')) return fundamentals.marketCap;
    if (key.includes('revenue')) return fundamentals.revenue;
    if (key.includes('eps')) return fundamentals.eps;
    if (key.includes('roe') || key.includes('return_on_equity')) return fundamentals.roe;
    if (key.includes('roa') || key.includes('return_on_assets')) return fundamentals.roa;
    if (key.includes('margin')) {
      if (key.includes('gross')) return fundamentals.grossMargin;
      if (key.includes('operating')) return fundamentals.operatingMargin;
      if (key.includes('net')) return fundamentals.netMargin;
    }
    if (key.includes('growth')) {
      if (key.includes('revenue')) return fundamentals.revenueGrowth;
      if (key.includes('earnings')) return fundamentals.earningsGrowth;
    }

    return null;
  }
}

// Singleton instance
let snapshotService: TradeSnapshotService;

export const getTradeSnapshotService = (): TradeSnapshotService => {
  if (!snapshotService) {
    snapshotService = new TradeSnapshotService();
  }
  return snapshotService;
};
