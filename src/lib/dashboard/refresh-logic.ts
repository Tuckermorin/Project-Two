/**
 * Dashboard Refresh Logic
 * Extracted for reuse by both API route and background jobs
 */

import { getAlphaVantageClient } from '@/lib/api/alpha-vantage';
import { getMarketDataService } from '@/lib/services/market-data-service';
import { computeIpsScore } from '@/lib/services/trade-scoring-service';
import { collectTradeFactors, saveTradeFactors } from '@/lib/services/factor-collection-service';

interface RefreshResult {
  tradeId: string;
  symbol: string;
  success: boolean;
  updates?: {
    currentPrice?: number;
    currentSpreadPrice?: number;
    currentPL?: number;
    currentPLPercent?: number;
    greeks?: any;
    factors?: any;
    ipsScore?: number;
  };
  error?: string;
}

/**
 * Execute the dashboard refresh logic for a specific user
 * Can be called from API routes or background jobs
 */
export async function executeRefreshLogic(supabase: any, userId: string) {
  console.log(`[Refresh Active Trades] Starting refresh for user ${userId}`);

  // Fetch all active trades for the user
  const { data: trades, error: tradesError } = await supabase
    .from('trades')
    .select('*')
    .eq('user_id', userId)
    .eq('status', 'active');

  if (tradesError) {
    throw new Error(`Failed to fetch active trades: ${tradesError.message}`);
  }

  if (!trades || trades.length === 0) {
    return {
      success: true,
      message: 'No active trades to refresh',
      results: [],
      summary: {
        total: 0,
        successful: 0,
        failed: 0
      }
    };
  }

  console.log(`[Refresh Active Trades] Found ${trades.length} active trades`);

  // Group trades by symbol to batch API calls
  const tradesBySymbol = new Map<string, any[]>();
  trades.forEach(trade => {
    const symbol = trade.symbol?.toUpperCase();
    if (symbol) {
      if (!tradesBySymbol.has(symbol)) {
        tradesBySymbol.set(symbol, []);
      }
      tradesBySymbol.get(symbol)!.push(trade);
    }
  });

  console.log(`[Refresh Active Trades] Grouped into ${tradesBySymbol.size} unique symbols`);

  const avClient = getAlphaVantageClient();
  const marketDataService = getMarketDataService();

  // Process all symbols in parallel for maximum performance
  const symbolPromises = Array.from(tradesBySymbol.entries()).map(async ([symbol, symbolTrades]) => {
    try {
      console.log(`[Refresh] Processing ${symbolTrades.length} trades for ${symbol}`);

      // Fetch current stock price (once per symbol) with timeout
      let currentPrice: number | undefined;
      try {
        const quotePromise = avClient.getQuote(symbol);
        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Quote fetch timeout')), 10000)
        );
        const quote = await Promise.race([quotePromise, timeoutPromise]) as any;
        currentPrice = parseFloat(quote['05. price'] ?? '0');
        if (!isFinite(currentPrice) || currentPrice <= 0) {
          currentPrice = undefined;
        }
      } catch (error) {
        console.error(`[Refresh] Failed to fetch quote for ${symbol}:`, error);
      }

      // Process all trades for this symbol in parallel
      const tradePromises = symbolTrades.map(async (trade) => {
        try {
          const updates: RefreshResult['updates'] = {};

          // Update stock price
          if (currentPrice) {
            updates.currentPrice = currentPrice;
          }

          // Fetch spread price if trade has strikes
          const shortStrike = Number(trade.short_strike ?? trade.strike_price_short ?? 0);
          const longStrike = Number(trade.long_strike ?? trade.strike_price_long ?? 0);
          const expiration = trade.expiration_date;
          const contractType = trade.contract_type || trade.strategy_type;

          if (shortStrike && longStrike && expiration && currentPrice) {
            try {
              const isPutSpread = contractType?.toLowerCase().includes('put');
              const optionType: 'put' | 'call' = isPutSpread ? 'put' : 'call';

              // Add timeout to options fetch (30 seconds max)
              const optionsPromise = avClient.getRealtimeOptions(symbol, { requireGreeks: true });
              const timeoutPromise = new Promise((_, reject) =>
                setTimeout(() => reject(new Error('Options fetch timeout')), 30000)
              );
              const allContracts = await Promise.race([optionsPromise, timeoutPromise]) as any;

              const shortLegData = allContracts.find(c =>
                Math.abs((c.strike ?? 0) - shortStrike) < 0.01 &&
                c.expiration === expiration &&
                c.type === optionType
              );

              const longLegData = allContracts.find(c =>
                Math.abs((c.strike ?? 0) - longStrike) < 0.01 &&
                c.expiration === expiration &&
                c.type === optionType
              );

              if (shortLegData && longLegData) {
                const shortBid = shortLegData.bid ?? 0;
                const shortAsk = shortLegData.ask ?? 0;
                const longBid = longLegData.bid ?? 0;
                const longAsk = longLegData.ask ?? 0;

                const spreadAsk = shortAsk - longBid;
                const spreadBid = shortBid - longAsk;
                const spreadMid = (spreadAsk + spreadBid) / 2;
                const spreadPrice = spreadMid < 0 ? 0 : spreadMid;

                updates.currentSpreadPrice = spreadPrice;

                const creditReceived = Number(trade.credit_received ?? 0);
                const contracts = Number(trade.number_of_contracts ?? trade.contracts ?? 1);

                if (creditReceived > 0 && contracts > 0) {
                  const plPerContract = creditReceived - spreadPrice;
                  const totalPL = plPerContract * contracts * 100;
                  const plPercent = (plPerContract / creditReceived) * 100;

                  updates.currentPL = totalPL;
                  updates.currentPLPercent = plPercent;
                }

                updates.greeks = {
                  delta: shortLegData.delta,
                  gamma: shortLegData.gamma,
                  theta: shortLegData.theta,
                  vega: shortLegData.vega,
                  rho: shortLegData.rho,
                  impliedVolatility: shortLegData.impliedVolatility
                };

                updates.factors = {
                  openInterest: shortLegData.openInterest,
                  bidAskSpread: shortLegData.ask && shortLegData.bid ? shortLegData.ask - shortLegData.bid : null
                };
              }
            } catch (optError) {
              console.error(`[Refresh] Failed to fetch options data for ${symbol} trade ${trade.id}:`, optError);
            }
          }

          // Recalculate IPS score
          let newIpsScore: number | undefined;
          if (trade.ips_id) {
            try {
              const { factors, errors } = await collectTradeFactors(
                supabase,
                {
                  id: trade.id,
                  symbol: trade.symbol,
                  ips_id: trade.ips_id,
                  short_strike: shortStrike,
                  long_strike: longStrike,
                  expiration_date: expiration,
                  contract_type: contractType,
                  current_price: currentPrice
                },
                {
                  greeks: updates.greeks,
                  bidAskSpread: updates.factors?.bidAskSpread,
                  openInterest: updates.factors?.openInterest
                }
              );

              const factorValues: Record<string, number | null> = {};
              factors.forEach(f => {
                if (f.value !== null) {
                  factorValues[f.factorName] = f.value;
                }
              });

              await saveTradeFactors(supabase, trade.id, userId, factors);

              const scoreResult = await computeIpsScore(supabase, trade.ips_id, factorValues);
              newIpsScore = scoreResult.finalScore;
              updates.ipsScore = newIpsScore;
            } catch (scoreError) {
              console.error(`[Refresh] Failed to recalculate IPS score for ${symbol}:`, scoreError);
            }
          }

          // Update the trade in database
          if (Object.keys(updates).length > 0) {
            const updatePayload: any = {
              current_price: updates.currentPrice,
              current_spread_price: updates.currentSpreadPrice,
              spread_price_updated_at: new Date().toISOString(),
              delta_short_leg: updates.greeks?.delta,
              theta: updates.greeks?.theta,
              vega: updates.greeks?.vega,
              iv_at_entry: updates.greeks?.impliedVolatility,
              updated_at: new Date().toISOString()
            };

            if (newIpsScore !== undefined) {
              updatePayload.ips_score = newIpsScore;
            }

            const { error: updateError } = await supabase
              .from('trades')
              .update(updatePayload)
              .eq('id', trade.id);

            if (updateError) {
              throw new Error(`Database update failed: ${updateError.message}`);
            }
          }

          return {
            tradeId: trade.id,
            symbol,
            success: true,
            updates
          } as RefreshResult;

        } catch (tradeError) {
          console.error(`[Refresh] Failed to process trade ${trade.id}:`, tradeError);
          return {
            tradeId: trade.id,
            symbol,
            success: false,
            error: tradeError instanceof Error ? tradeError.message : 'Unknown error'
          } as RefreshResult;
        }
      });

      // Wait for all trades for this symbol to complete
      const tradeResults = await Promise.allSettled(tradePromises);
      const results = tradeResults.map(r => r.status === 'fulfilled' ? r.value : {
        tradeId: 'unknown',
        symbol,
        success: false,
        error: 'Promise rejected'
      } as RefreshResult);

      return results;

    } catch (symbolError) {
      console.error(`[Refresh] Failed to process symbol ${symbol}:`, symbolError);
      return symbolTrades.map(trade => ({
        tradeId: trade.id,
        symbol,
        success: false,
        error: symbolError instanceof Error ? symbolError.message : 'Unknown error'
      } as RefreshResult));
    }
  });

  // Execute all symbol processing in parallel
  console.log(`[Refresh Active Trades] Processing ${symbolPromises.length} symbols in parallel...`);
  const allResults = await Promise.allSettled(symbolPromises);
  const results = allResults.flatMap(r =>
    r.status === 'fulfilled' ? r.value : []
  );

  const summary = {
    total: results.length,
    successful: results.filter(r => r.success).length,
    failed: results.filter(r => !r.success).length,
  };

  console.log(`[Refresh Active Trades] Complete (parallelized):`, summary);
  console.log(`[Refresh Active Trades] Performance: Processed ${tradesBySymbol.size} symbols with ${results.length} trades in parallel`);

  return {
    success: true,
    message: `Refreshed ${summary.successful} of ${summary.total} trades`,
    results,
    summary,
    timestamp: new Date().toISOString()
  };
}
