// Historical Spread Analysis Service
// Analyzes historical options data to find optimal spreads and their outcomes

import { getSupabaseServer } from '../utils/supabase-server';
import { getAlphaVantageClient } from '../api/alpha-vantage';

const supabase = getSupabaseServer();

interface SpreadCandidate {
  symbol: string;
  snapshotDate: string;
  shortStrike: number;
  longStrike: number;
  expirationDate: string;
  strategyType: 'put_credit_spread' | 'call_credit_spread';
  creditReceived: number;
  maxProfit: number;
  maxLoss: number;
  roi: number;
  pop: number;
  delta: number;
  theta: number;
  vega: number;
  gamma: number;
  underlyingPrice: number;
  ivRank: number;
  ipsScore?: number;
}

interface SpreadOutcome {
  actualPL: number;
  actualPLPercent: number;
  exitDate: string;
  exitReason: 'expiration' | 'profit_target' | 'stop_loss' | 'breach';
}

export class HistoricalSpreadAnalyzer {
  /**
   * Find all viable put credit spreads from historical options data
   */
  async findHistoricalSpreads(
    symbol: string,
    snapshotDate: string,
    criteria: {
      minDelta?: number;
      maxDelta?: number;
      minDTE?: number;
      maxDTE?: number;
      minCredit?: number;
      minWidth?: number;
      maxWidth?: number;
    } = {}
  ): Promise<SpreadCandidate[]> {
    const {
      minDelta = 0.08,
      maxDelta = 0.20,
      minDTE = 7,
      maxDTE = 45,
      minCredit = 0.30,
      minWidth = 3,
      maxWidth = 15,
    } = criteria;

    // Get all puts for this snapshot date
    const { data: puts, error } = await supabase
      .from('historical_options_data')
      .select('*')
      .eq('symbol', symbol.toUpperCase())
      .eq('snapshot_date', snapshotDate)
      .eq('option_type', 'put')
      .gte('dte', minDTE)
      .lte('dte', maxDTE)
      .order('strike', { ascending: false });

    if (error || !puts || puts.length === 0) {
      console.log(`No historical options data for ${symbol} on ${snapshotDate}`);
      return [];
    }

    // Get underlying price from daily data
    const { data: stockData } = await supabase
      .from('historical_stock_data')
      .select('close')
      .eq('symbol', symbol.toUpperCase())
      .eq('date', snapshotDate)
      .single();

    const underlyingPrice = stockData?.close || 0;
    if (!underlyingPrice) {
      console.log(`No stock price data for ${symbol} on ${snapshotDate}`);
      return [];
    }

    // Group by expiration
    const expirationGroups = new Map<string, typeof puts>();
    puts.forEach(put => {
      const exp = put.expiration_date;
      if (!expirationGroups.has(exp)) {
        expirationGroups.set(exp, []);
      }
      expirationGroups.get(exp)!.push(put);
    });

    const spreads: SpreadCandidate[] = [];

    // For each expiration, find spread combinations
    for (const [expiration, expPuts] of expirationGroups.entries()) {
      // Filter short leg candidates by delta
      const shortLegCandidates = expPuts.filter(put => {
        const delta = Math.abs(put.delta || 0);
        return delta >= minDelta && delta <= maxDelta && put.bid;
      });

      for (const shortPut of shortLegCandidates) {
        // Find suitable long puts (lower strike)
        const longPutCandidates = expPuts.filter(put => {
          if (!put.ask || !put.strike) return false;
          const width = shortPut.strike - put.strike;
          return width >= minWidth && width <= maxWidth;
        });

        for (const longPut of longPutCandidates) {
          const width = shortPut.strike - longPut.strike;
          const credit = (shortPut.bid || 0) - (longPut.ask || 0);

          if (credit < minCredit) continue;

          const maxProfit = credit;
          const maxLoss = width - credit;
          const roi = (maxProfit / maxLoss) * 100;
          const pop = (1 - Math.abs(shortPut.delta || 0)) * 100;

          // Calculate average IV for IV rank estimation
          const avgIV = ((shortPut.implied_volatility || 0) + (longPut.implied_volatility || 0)) / 2;
          const ivRank = avgIV * 100;

          spreads.push({
            symbol: symbol.toUpperCase(),
            snapshotDate,
            shortStrike: shortPut.strike,
            longStrike: longPut.strike,
            expirationDate: expiration,
            strategyType: 'put_credit_spread',
            creditReceived: credit,
            maxProfit,
            maxLoss,
            roi,
            pop,
            delta: shortPut.delta || 0,
            theta: (shortPut.theta || 0) - (longPut.theta || 0),
            vega: (shortPut.vega || 0) - (longPut.vega || 0),
            gamma: (shortPut.gamma || 0) - (longPut.gamma || 0),
            underlyingPrice,
            ivRank,
          });
        }
      }
    }

    // Sort by quality (ROI and delta in optimal range)
    spreads.sort((a, b) => {
      const aDeltaScore = a.delta >= 0.12 && a.delta <= 0.15 ? 10 : 5;
      const bDeltaScore = b.delta >= 0.12 && b.delta <= 0.15 ? 10 : 5;
      return (bDeltaScore + b.roi) - (aDeltaScore + a.roi);
    });

    return spreads;
  }

  /**
   * Calculate actual outcome of a spread by looking at future data
   */
  async calculateSpreadOutcome(
    spread: SpreadCandidate,
    managementRules: {
      profitTargetPercent?: number; // e.g., 50 = close at 50% profit
      stopLossPercent?: number; // e.g., 200 = close if loss exceeds 200% of credit
    } = {}
  ): Promise<SpreadOutcome | null> {
    const {
      profitTargetPercent = 50,
      stopLossPercent = 200,
    } = managementRules;

    // Get stock prices between entry and expiration
    const { data: priceHistory, error } = await supabase
      .from('historical_stock_data')
      .select('date, close')
      .eq('symbol', spread.symbol)
      .gte('date', spread.snapshotDate)
      .lte('date', spread.expirationDate)
      .order('date', { ascending: true });

    if (error || !priceHistory || priceHistory.length === 0) {
      return null;
    }

    // Check each day for profit target, stop loss, or breach
    for (const day of priceHistory) {
      const currentPrice = day.close;

      // Check for breach (price below long strike)
      if (currentPrice < spread.longStrike) {
        // Maximum loss
        return {
          actualPL: -spread.maxLoss,
          actualPLPercent: -100,
          exitDate: day.date,
          exitReason: 'breach',
        };
      }

      // Check for profit target or stop loss (requires options data)
      // For now, we'll simulate based on intrinsic value

      // If price stays above short strike, profit increases as time passes
      if (currentPrice > spread.shortStrike) {
        // Estimate current spread value
        // As we approach expiration with price above short strike, spread value approaches 0
        const daysToExp = Math.ceil((new Date(spread.expirationDate).getTime() - new Date(day.date).getTime()) / (1000 * 60 * 60 * 24));
        const daysHeld = Math.ceil((new Date(day.date).getTime() - new Date(spread.snapshotDate).getTime()) / (1000 * 60 * 60 * 24));

        if (daysHeld > 0) {
          // Estimate time decay
          const totalDTE = Math.ceil((new Date(spread.expirationDate).getTime() - new Date(spread.snapshotDate).getTime()) / (1000 * 60 * 60 * 24));
          const decayPercent = daysHeld / totalDTE;

          // Estimate P&L as percentage of max profit
          const currentPLPercent = decayPercent * 100;

          if (currentPLPercent >= profitTargetPercent) {
            return {
              actualPL: spread.creditReceived * (profitTargetPercent / 100),
              actualPLPercent: profitTargetPercent,
              exitDate: day.date,
              exitReason: 'profit_target',
            };
          }
        }
      }

      // Check if price between strikes (partial loss scenario)
      if (currentPrice >= spread.longStrike && currentPrice <= spread.shortStrike) {
        const intrinsicValue = spread.shortStrike - currentPrice;
        const currentSpreadValue = intrinsicValue; // Simplified
        const currentPL = spread.creditReceived - currentSpreadValue;
        const currentPLPercent = (currentPL / spread.creditReceived) * 100;

        if (currentPLPercent <= -stopLossPercent) {
          return {
            actualPL: currentPL,
            actualPLPercent: currentPLPercent,
            exitDate: day.date,
            exitReason: 'stop_loss',
          };
        }
      }
    }

    // If we made it to expiration
    const expirationPrice = priceHistory[priceHistory.length - 1].close;

    if (expirationPrice > spread.shortStrike) {
      // Full profit
      return {
        actualPL: spread.maxProfit,
        actualPLPercent: 100,
        exitDate: spread.expirationDate,
        exitReason: 'expiration',
      };
    } else if (expirationPrice < spread.longStrike) {
      // Max loss
      return {
        actualPL: -spread.maxLoss,
        actualPLPercent: -100,
        exitDate: spread.expirationDate,
        exitReason: 'expiration',
      };
    } else {
      // Partial loss
      const intrinsicValue = spread.shortStrike - expirationPrice;
      const actualPL = spread.creditReceived - intrinsicValue;
      const actualPLPercent = (actualPL / spread.creditReceived) * 100;

      return {
        actualPL,
        actualPLPercent,
        exitDate: spread.expirationDate,
        exitReason: 'expiration',
      };
    }
  }

  /**
   * Store analyzed spread with outcome
   */
  async storeHistoricalSpread(spread: SpreadCandidate, outcome?: SpreadOutcome): Promise<void> {
    const row = {
      symbol: spread.symbol,
      snapshot_date: spread.snapshotDate,
      strategy_type: spread.strategyType,
      short_strike: spread.shortStrike,
      long_strike: spread.longStrike,
      expiration_date: spread.expirationDate,
      credit_received: spread.creditReceived,
      max_profit: spread.maxProfit,
      max_loss: spread.maxLoss,
      roi: spread.roi,
      pop: spread.pop,
      delta: spread.delta,
      theta: spread.theta,
      vega: spread.vega,
      gamma: spread.gamma,
      underlying_price: spread.underlyingPrice,
      iv_rank: spread.ivRank,
      ips_score: spread.ipsScore,
      actual_pl: outcome?.actualPL,
      actual_pl_percent: outcome?.actualPLPercent,
      exit_date: outcome?.exitDate,
      exit_reason: outcome?.exitReason,
    };

    const { error } = await supabase
      .from('historical_spread_analysis')
      .upsert(row, {
        onConflict: 'symbol,snapshot_date,short_strike,long_strike,expiration_date',
      });

    if (error) {
      console.error('Failed to store historical spread:', error);
    }
  }

  /**
   * Batch analyze spreads for multiple dates
   */
  async analyzeSymbolHistory(
    symbol: string,
    startDate: string,
    endDate: string,
    sampleInterval: number = 5 // Analyze every Nth trading day
  ): Promise<{ analyzed: number; stored: number }> {
    console.log(`\n=== Analyzing ${symbol} from ${startDate} to ${endDate} ===`);

    // Get all available snapshot dates for this symbol
    const { data: snapshots, error } = await supabase
      .from('historical_options_data')
      .select('snapshot_date')
      .eq('symbol', symbol.toUpperCase())
      .gte('snapshot_date', startDate)
      .lte('snapshot_date', endDate)
      .order('snapshot_date', { ascending: true });

    if (error || !snapshots || snapshots.length === 0) {
      console.log(`No historical data available for ${symbol}`);
      return { analyzed: 0, stored: 0 };
    }

    // Get unique dates and sample
    const uniqueDates = [...new Set(snapshots.map(s => s.snapshot_date))];
    const sampledDates = uniqueDates.filter((_, index) => index % sampleInterval === 0);

    console.log(`Found ${uniqueDates.length} dates, analyzing ${sampledDates.length} samples`);

    let analyzed = 0;
    let stored = 0;

    for (const date of sampledDates) {
      try {
        console.log(`[${date}] Finding spreads...`);

        const spreads = await this.findHistoricalSpreads(symbol, date, {
          minDelta: 0.08,
          maxDelta: 0.20,
          minDTE: 7,
          maxDTE: 45,
          minCredit: 0.30,
        });

        console.log(`[${date}] Found ${spreads.length} spread candidates`);

        // Analyze top 5 spreads
        const topSpreads = spreads.slice(0, 5);

        for (const spread of topSpreads) {
          const outcome = await this.calculateSpreadOutcome(spread);

          if (outcome) {
            await this.storeHistoricalSpread(spread, outcome);
            stored++;
            console.log(`[${date}] $${spread.shortStrike}/${spread.longStrike} → ${outcome.actualPLPercent.toFixed(1)}% (${outcome.exitReason})`);
          } else {
            // Store without outcome
            await this.storeHistoricalSpread(spread);
            stored++;
          }

          analyzed++;
        }

        // Small delay between dates
        await new Promise(resolve => setTimeout(resolve, 100));
      } catch (error) {
        console.error(`[${date}] Analysis failed:`, error);
      }
    }

    console.log(`\n✅ ${symbol}: Analyzed ${analyzed} spreads, stored ${stored} records`);

    return { analyzed, stored };
  }
}

export function getHistoricalSpreadAnalyzer(): HistoricalSpreadAnalyzer {
  return new HistoricalSpreadAnalyzer();
}
