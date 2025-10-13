// API Route: Refresh All Active Trades
// POST /api/trades/refresh-active - Updates all active trades with current market data

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server-client";
import { getAlphaVantageClient } from "@/lib/api/alpha-vantage";
import { getMarketDataService } from "@/lib/services/market-data-service";

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
  };
  error?: string;
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();

    // Get authenticated user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    console.log(`[Refresh Active Trades] Starting refresh for user ${user.id}`);

    // Fetch all active trades for the user
    const { data: trades, error: tradesError } = await supabase
      .from('trades')
      .select('*')
      .eq('user_id', user.id)
      .eq('status', 'active');

    if (tradesError) {
      throw new Error(`Failed to fetch active trades: ${tradesError.message}`);
    }

    if (!trades || trades.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No active trades to refresh',
        results: [],
        summary: {
          total: 0,
          successful: 0,
          failed: 0
        }
      });
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
    const results: RefreshResult[] = [];

    // Process each symbol group
    for (const [symbol, symbolTrades] of tradesBySymbol.entries()) {
      try {
        console.log(`[Refresh] Processing ${symbolTrades.length} trades for ${symbol}`);

        // Fetch current stock price (once per symbol)
        let currentPrice: number | undefined;
        try {
          const quote = await avClient.getQuote(symbol);
          currentPrice = parseFloat(quote['05. price'] ?? '0');
          if (!isFinite(currentPrice) || currentPrice <= 0) {
            currentPrice = undefined;
          }
        } catch (error) {
          console.error(`[Refresh] Failed to fetch quote for ${symbol}:`, error);
        }

        // Process each trade for this symbol
        for (const trade of symbolTrades) {
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
                // Determine put or call based on contract type
                const isPutSpread = contractType?.toLowerCase().includes('put');
                const optionType: 'put' | 'call' = isPutSpread ? 'put' : 'call';

                console.log(`[Refresh] Fetching options for ${symbol}: shortStrike=${shortStrike}, longStrike=${longStrike}, expiration=${expiration}, type=${optionType}`);

                // Fetch options data once and filter
                const allContracts = await avClient.getRealtimeOptions(symbol, { requireGreeks: true });

                console.log(`[Refresh] Received ${allContracts.length} contracts for ${symbol}`);

                // Log a sample to see the data format
                if (allContracts.length > 0) {
                  console.log(`[Refresh] Sample contract:`, JSON.stringify(allContracts[0], null, 2));
                }

                // Find matching contracts with some tolerance for strike prices
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

                console.log(`[Refresh] ${symbol} short leg found:`, !!shortLegData, shortLegData ? `strike=${shortLegData.strike}, bid=${shortLegData.bid}, ask=${shortLegData.ask}` : 'not found');
                console.log(`[Refresh] ${symbol} long leg found:`, !!longLegData, longLegData ? `strike=${longLegData.strike}, bid=${longLegData.bid}, ask=${longLegData.ask}` : 'not found');

                // Calculate spread price for credit spreads
                if (shortLegData && longLegData) {
                  const shortBid = shortLegData.bid ?? 0;
                  const shortAsk = shortLegData.ask ?? 0;
                  const longBid = longLegData.bid ?? 0;
                  const longAsk = longLegData.ask ?? 0;

                  // For credit spreads (you sold the spread, now want to buy it back to close):
                  // Spread Ask = what you PAY to buy back the spread (conservative)
                  // Spread Bid = what you GET if you sell the spread (liberal)
                  // We use the mid price for realistic valuation
                  const spreadAsk = shortAsk - longBid;  // Pay ask for short, get bid for long
                  const spreadBid = shortBid - longAsk;  // Get bid for short, pay ask for long
                  const spreadMid = (spreadAsk + spreadBid) / 2;

                  // If spread mid is negative, the spread is inverted (long worth more than short)
                  // This means the position has achieved max profit (spread collapsed to zero)
                  const spreadPrice = spreadMid < 0 ? 0 : spreadMid;

                  console.log(`[Refresh] ${symbol} spread: bid=${spreadBid.toFixed(2)}, ask=${spreadAsk.toFixed(2)}, mid=${spreadMid.toFixed(2)}, final=${spreadPrice.toFixed(2)}`);

                  updates.currentSpreadPrice = spreadPrice;

                  // Calculate P/L
                  const creditReceived = Number(trade.credit_received ?? 0);
                  const contracts = Number(trade.number_of_contracts ?? trade.contracts ?? 1);

                  if (creditReceived > 0 && contracts > 0) {
                    const plPerContract = creditReceived - spreadPrice;
                    const totalPL = plPerContract * contracts * 100;
                    const plPercent = (plPerContract / creditReceived) * 100;

                    updates.currentPL = totalPL;
                    updates.currentPLPercent = plPercent;

                    console.log(`[Refresh] ${symbol} P/L: credit=${creditReceived}, spread=${spreadPrice}, plPerContract=${plPerContract}, totalPL=${totalPL}, plPercent=${plPercent}%`);
                  }

                  // Store greeks from short leg
                  updates.greeks = {
                    delta: shortLegData.delta,
                    gamma: shortLegData.gamma,
                    theta: shortLegData.theta,
                    vega: shortLegData.vega,
                    rho: shortLegData.rho,
                    impliedVolatility: shortLegData.impliedVolatility
                  };
                } else {
                  console.warn(`[Refresh] ${symbol} Could not find both legs - shortLeg: ${!!shortLegData}, longLeg: ${!!longLegData}`);
                  // Log available strikes to help debug
                  const availableStrikes = allContracts
                    .filter(c => c.type === optionType && c.expiration === expiration)
                    .map(c => c.strike)
                    .filter((v, i, a) => a.indexOf(v) === i)
                    .sort((a, b) => (a ?? 0) - (b ?? 0));
                  console.warn(`[Refresh] ${symbol} Available ${optionType} strikes for ${expiration}:`, availableStrikes);
                }
              } catch (optError) {
                console.error(`[Refresh] Failed to fetch options data for ${symbol} trade ${trade.id}:`, optError);
              }
            }

            // Update the trade in database
            if (Object.keys(updates).length > 0) {
              const { error: updateError } = await supabase
                .from('trades')
                .update({
                  current_price: updates.currentPrice,
                  current_spread_price: updates.currentSpreadPrice,
                  spread_price_updated_at: new Date().toISOString(),
                  delta_short_leg: updates.greeks?.delta,
                  theta: updates.greeks?.theta,
                  vega: updates.greeks?.vega,
                  iv_at_entry: updates.greeks?.impliedVolatility,
                  updated_at: new Date().toISOString()
                })
                .eq('id', trade.id);

              if (updateError) {
                throw new Error(`Database update failed: ${updateError.message}`);
              }
            }

            results.push({
              tradeId: trade.id,
              symbol,
              success: true,
              updates
            });

          } catch (tradeError) {
            console.error(`[Refresh] Failed to process trade ${trade.id}:`, tradeError);
            results.push({
              tradeId: trade.id,
              symbol,
              success: false,
              error: tradeError instanceof Error ? tradeError.message : 'Unknown error'
            });
          }
        }

        // Small delay between symbols to respect rate limits
        if (tradesBySymbol.size > 1) {
          await new Promise(resolve => setTimeout(resolve, 20));
        }

      } catch (symbolError) {
        console.error(`[Refresh] Failed to process symbol ${symbol}:`, symbolError);
        symbolTrades.forEach(trade => {
          results.push({
            tradeId: trade.id,
            symbol,
            success: false,
            error: symbolError instanceof Error ? symbolError.message : 'Unknown error'
          });
        });
      }
    }

    const summary = {
      total: results.length,
      successful: results.filter(r => r.success).length,
      failed: results.filter(r => !r.success).length
    };

    console.log(`[Refresh Active Trades] Complete:`, summary);

    return NextResponse.json({
      success: true,
      message: `Refreshed ${summary.successful} of ${summary.total} trades`,
      results,
      summary,
      timestamp: new Date().toISOString()
    });

  } catch (error: any) {
    console.error('[Refresh Active Trades] Error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Failed to refresh trades'
      },
      { status: 500 }
    );
  }
}
