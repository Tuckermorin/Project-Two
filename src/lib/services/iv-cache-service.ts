// src/lib/services/iv-cache-service.ts

import { getAlphaVantageClient, type RealtimeOptionContract } from '@/lib/api/alpha-vantage';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

interface IVDataPoint {
  date: string;
  iv_atm_30d: number;
}

/**
 * Get or create Supabase client
 */
function getSupabaseClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error('Missing Supabase environment variables');
  }

  return createClient(url, key);
}

/**
 * Service for caching and analyzing historical Implied Volatility data
 */
export class IVCacheService {
  private alphaVantage = getAlphaVantageClient();
  private supabase: SupabaseClient;

  constructor() {
    this.supabase = getSupabaseClient();
  }

  /**
   * Calculate days to expiration
   */
  private daysToExpiration(expirationDate: string, fromDate: string): number {
    const expDate = new Date(expirationDate);
    const from = new Date(fromDate);
    const diffMs = expDate.getTime() - from.getTime();
    return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
  }

  /**
   * Find ATM (at-the-money) strike based on current price
   */
  private findATMStrike(contracts: RealtimeOptionContract[], currentPrice: number): number | null {
    if (!contracts.length) return null;

    // Find strike closest to current price
    return contracts.reduce((closest, contract) => {
      if (!contract.strike) return closest;
      if (!closest) return contract.strike;

      const currentDiff = Math.abs(contract.strike - currentPrice);
      const closestDiff = Math.abs(closest - currentPrice);

      return currentDiff < closestDiff ? contract.strike : closest;
    }, null as number | null);
  }

  /**
   * Extract ATM IV for 30-day options from historical data
   */
  private extractATMIV(
    contracts: RealtimeOptionContract[],
    currentPrice: number,
    dataDate: string
  ): number | null {
    if (!contracts.length) return null;

    // Filter for options expiring in 25-35 days (targeting 30 DTE)
    const targetContracts = contracts.filter(c => {
      if (!c.expiration || !c.impliedVolatility) return false;
      const dte = this.daysToExpiration(c.expiration, dataDate);
      return dte >= 25 && dte <= 35;
    });

    if (!targetContracts.length) return null;

    // Find ATM strike
    const atmStrike = this.findATMStrike(targetContracts, currentPrice);
    if (!atmStrike) return null;

    // Get IV values for calls and puts near ATM
    const atmContracts = targetContracts.filter(c => {
      if (!c.strike) return false;
      const strikeDiff = Math.abs(c.strike - atmStrike);
      return strikeDiff <= currentPrice * 0.02; // Within 2% of ATM
    });

    if (!atmContracts.length) return null;

    // Average IV across calls and puts
    const ivValues = atmContracts
      .map(c => c.impliedVolatility)
      .filter((iv): iv is number => iv !== null && isFinite(iv));

    if (!ivValues.length) return null;

    const avgIV = ivValues.reduce((sum, iv) => sum + iv, 0) / ivValues.length;
    return avgIV;
  }

  /**
   * Get current stock price (needed for ATM calculation)
   */
  private async getCurrentPrice(symbol: string): Promise<number | null> {
    try {
      const quote = await this.alphaVantage.getQuote(symbol);
      const price = parseFloat(quote['05. price'] ?? '0');
      return isFinite(price) && price > 0 ? price : null;
    } catch (error) {
      console.error(`Failed to get price for ${symbol}:`, error);
      return null;
    }
  }

  /**
   * Generate list of dates going back N trading days
   */
  private generateTradingDates(lookbackDays: number): string[] {
    const dates: string[] = [];
    const today = new Date();
    let daysAdded = 0;
    let currentDate = new Date(today);

    while (daysAdded < lookbackDays) {
      const dayOfWeek = currentDate.getDay();

      // Skip weekends (0 = Sunday, 6 = Saturday)
      if (dayOfWeek !== 0 && dayOfWeek !== 6) {
        dates.push(currentDate.toISOString().split('T')[0]);
        daysAdded++;
      }

      currentDate.setDate(currentDate.getDate() - 1);
    }

    return dates.reverse(); // Oldest to newest
  }

  /**
   * Cache historical IV data for a symbol
   */
  async cacheHistoricalIVForSymbol(
    symbol: string,
    lookbackDays: number = 252
  ): Promise<{ success: boolean; daysAdded: number; error?: string }> {
    console.log(`[IV Cache] Starting cache for ${symbol}, lookback: ${lookbackDays} days`);

    try {
      // Get current price for ATM calculations
      const currentPrice = await this.getCurrentPrice(symbol);
      if (!currentPrice) {
        return { success: false, daysAdded: 0, error: 'Could not fetch current price' };
      }

      // Generate trading dates
      const dates = this.generateTradingDates(lookbackDays);
      console.log(`[IV Cache] Generated ${dates.length} trading dates`);

      let daysAdded = 0;
      // Premium tier: 600 calls/minute = ~100ms per call, use 10ms for safety margin
      const alphaVantageDelay = parseInt(process.env.ALPHA_VANTAGE_MIN_DELAY_MS || '10');

      // Process dates in batches to respect rate limits
      for (const date of dates) {
        try {
          // Check if we already have data for this date
          const { data: existing } = await this.supabase
            .from('vol_regime_daily')
            .select('iv_atm_30d')
            .eq('symbol', symbol.toUpperCase())
            .eq('as_of_date', date)
            .single();

          // Only skip if row exists AND has a valid non-null IV value
          if (existing && existing.iv_atm_30d !== null && existing.iv_atm_30d !== undefined) {
            console.log(`[IV Cache] Skipping ${symbol} ${date} - already cached`);
            continue;
          }

          // Fetch historical options data for this date
          console.log(`[IV Cache] Fetching ${symbol} for date: ${date}`);
          const contracts = await this.alphaVantage.getHistoricalOptions(symbol, { date });

          if (!contracts.length) {
            console.log(`[IV Cache] No data for ${symbol} on ${date}`);
            continue;
          }

          // Extract ATM IV
          const ivAtm30d = this.extractATMIV(contracts, currentPrice, date);

          if (ivAtm30d === null) {
            console.log(`[IV Cache] Could not extract IV for ${symbol} on ${date}`);
            continue;
          }

          // Store in database
          await this.supabase.from('vol_regime_daily').upsert({
            symbol: symbol.toUpperCase(),
            as_of_date: date,
            iv_atm_30d: ivAtm30d,
            provider: 'alpha_vantage',
            created_at: new Date().toISOString()
          }, {
            onConflict: 'symbol,as_of_date'
          });

          daysAdded++;
          console.log(`[IV Cache] Cached ${symbol} ${date}: IV=${ivAtm30d.toFixed(4)}`);

          // Rate limiting delay
          if (alphaVantageDelay > 0) {
            await new Promise(resolve => setTimeout(resolve, alphaVantageDelay));
          }

        } catch (dateError) {
          console.error(`[IV Cache] Error processing ${symbol} ${date}:`, dateError);
          // Continue with next date
        }
      }

      console.log(`[IV Cache] Completed ${symbol}: ${daysAdded} days added`);
      return { success: true, daysAdded };

    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      console.error(`[IV Cache] Failed for ${symbol}:`, error);
      return { success: false, daysAdded: 0, error: errorMsg };
    }
  }

  /**
   * Calculate IV Rank from cached data
   */
  async calculateIVRank(
    symbol: string,
    currentIV: number,
    lookbackDays: number = 252
  ): Promise<number | null> {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - lookbackDays);

      // Fetch historical IV values
      const { data, error } = await this.supabase
        .from('vol_regime_daily')
        .select('iv_atm_30d')
        .eq('symbol', symbol.toUpperCase())
        .gte('as_of_date', cutoffDate.toISOString().split('T')[0])
        .not('iv_atm_30d', 'is', null)
        .order('as_of_date', { ascending: true });

      if (error) throw error;
      if (!data || data.length < 20) {
        console.log(`[IV Cache] Insufficient data for ${symbol} IV rank (need 20, have ${data?.length || 0})`);
        return null; // Need at least 20 data points
      }

      // Extract IV values
      const ivValues = data
        .map(d => d.iv_atm_30d)
        .filter((iv): iv is number => iv !== null && isFinite(iv));

      if (!ivValues.length) return null;

      // Calculate percentile rank
      const countBelow = ivValues.filter(iv => iv <= currentIV).length;
      const rank = (countBelow / ivValues.length) * 100;

      console.log(`[IV Cache] ${symbol} IV Rank: ${rank.toFixed(1)} (current: ${currentIV.toFixed(4)}, samples: ${ivValues.length})`);
      return rank;

    } catch (error) {
      console.error(`[IV Cache] Failed to calculate IV rank for ${symbol}:`, error);
      return null;
    }
  }

  /**
   * Update IV cache with today's data
   */
  async updateIVCache(symbol: string): Promise<{ success: boolean; error?: string }> {
    const today = new Date().toISOString().split('T')[0];

    try {
      const currentPrice = await this.getCurrentPrice(symbol);
      if (!currentPrice) {
        return { success: false, error: 'Could not fetch current price' };
      }

      // Get today's options data
      const contracts = await this.alphaVantage.getRealtimeOptions(symbol, { requireGreeks: true });

      if (!contracts.length) {
        return { success: false, error: 'No options data available' };
      }

      // Extract ATM IV
      const ivAtm30d = this.extractATMIV(contracts, currentPrice, today);

      if (ivAtm30d === null) {
        return { success: false, error: 'Could not extract ATM IV' };
      }

      // Calculate IV rank
      const ivRank = await this.calculateIVRank(symbol, ivAtm30d);

      // Store in database
      await this.supabase.from('vol_regime_daily').upsert({
        symbol: symbol.toUpperCase(),
        as_of_date: today,
        iv_atm_30d: ivAtm30d,
        iv_rank: ivRank,
        provider: 'alpha_vantage',
        created_at: new Date().toISOString()
      }, {
        onConflict: 'symbol,as_of_date'
      });

      console.log(`[IV Cache] Updated ${symbol} ${today}: IV=${ivAtm30d.toFixed(4)}, Rank=${ivRank?.toFixed(1) || 'N/A'}`);
      return { success: true };

    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      console.error(`[IV Cache] Failed to update ${symbol}:`, error);
      return { success: false, error: errorMsg };
    }
  }
}

// Singleton instance
let ivCacheServiceInstance: IVCacheService | null = null;

export function getIVCacheService(): IVCacheService {
  if (!ivCacheServiceInstance) {
    ivCacheServiceInstance = new IVCacheService();
  }
  return ivCacheServiceInstance;
}
