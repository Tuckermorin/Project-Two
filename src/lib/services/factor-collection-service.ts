/**
 * Factor Collection Service
 *
 * Collects all factor values needed for IPS scoring from various sources:
 * - Options chain data (Greeks, IV, OI, bid-ask spread)
 * - Stock fundamentals (Alpha Vantage)
 * - Technical indicators (Alpha Vantage)
 * - News sentiment (Alpha Vantage)
 * - Calculated factors (IV percentile, price position, ratios)
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export type FactorValue = {
  factorName: string;
  value: number | null;
  source: string;
  confidence?: number;
};

export type FactorCollectionResult = {
  factors: FactorValue[];
  errors: string[];
};

/**
 * Collect all factor values for a trade during refresh
 */
export async function collectTradeFactors(
  supabase: SupabaseClient,
  trade: {
    id: string;
    symbol: string;
    ips_id: string | null;
    short_strike: number | null;
    long_strike: number | null;
    expiration_date: string | null;
    contract_type: string | null;
    current_price?: number | null;
  },
  optionsData?: any
): Promise<FactorCollectionResult> {
  const factors: FactorValue[] = [];
  const errors: string[] = [];

  // Get enabled factors for this IPS
  if (!trade.ips_id) {
    return { factors: [], errors: ["No IPS configuration"] };
  }

  const { data: ipsFactors, error: ipsError } = await supabase
    .from("ips_factors")
    .select(`
      factor_name,
      factor_id,
      enabled
    `)
    .eq("ips_id", trade.ips_id)
    .eq("enabled", true);

  if (ipsError || !ipsFactors) {
    return { factors: [], errors: [`Failed to load IPS factors: ${ipsError?.message}`] };
  }

  const factorNames = ipsFactors.map(f => f.factor_name);

  // 1. OPTIONS CHAIN FACTORS (from passed optionsData)
  if (optionsData) {
    const greeks = optionsData.greeks;

    if (factorNames.includes("Delta") && greeks?.delta) {
      factors.push({
        factorName: "Delta",
        value: Math.abs(greeks.delta),
        source: "options_chain",
        confidence: 1.0
      });
    }

    if (factorNames.includes("Theta") && greeks?.theta) {
      factors.push({
        factorName: "Theta",
        value: Math.abs(greeks.theta),
        source: "options_chain",
        confidence: 1.0
      });
    }

    if (factorNames.includes("Vega") && greeks?.vega) {
      factors.push({
        factorName: "Vega",
        value: Math.abs(greeks.vega),
        source: "options_chain",
        confidence: 1.0
      });
    }

    if (factorNames.includes("Implied Volatility") && greeks?.impliedVolatility) {
      factors.push({
        factorName: "Implied Volatility",
        value: greeks.impliedVolatility,
        source: "options_chain",
        confidence: 1.0
      });
    }

    if (factorNames.includes("Bid-Ask Spread") && optionsData.bidAskSpread) {
      factors.push({
        factorName: "Bid-Ask Spread",
        value: optionsData.bidAskSpread,
        source: "options_chain",
        confidence: 1.0
      });
    }

    if (factorNames.includes("Open Interest") && optionsData.openInterest) {
      factors.push({
        factorName: "Open Interest",
        value: optionsData.openInterest,
        source: "options_chain",
        confidence: 1.0
      });
    }
  }

  // 2. STOCK PRICE FACTORS
  if (trade.current_price) {
    // We'll fetch additional data from Alpha Vantage if needed
    try {
      const alphaVantageFactors = await fetchAlphaVantageFactors(trade.symbol, factorNames);
      factors.push(...alphaVantageFactors);
    } catch (error) {
      errors.push(`Alpha Vantage API error: ${error}`);
    }
  }

  // 3. CALCULATED FACTORS
  const calculatedFactors = await calculateDerivedFactors(
    supabase,
    trade,
    factors,
    factorNames
  );
  factors.push(...calculatedFactors);

  // 4. CACHED FACTORS (from vol_regime_daily, etc.)
  try {
    const cachedFactors = await fetchCachedFactors(supabase, trade.symbol, factorNames);
    factors.push(...cachedFactors);
  } catch (error) {
    errors.push(`Cached factors error: ${error}`);
  }

  return { factors, errors };
}

/**
 * Fetch factors from Alpha Vantage API
 */
async function fetchAlphaVantageFactors(
  symbol: string,
  neededFactors: string[]
): Promise<FactorValue[]> {
  const factors: FactorValue[] = [];
  const apiKey = process.env.ALPHA_VANTAGE_API_KEY || process.env.NEXT_PUBLIC_ALPHA_VANTAGE_API_KEY;

  if (!apiKey) {
    return factors;
  }

  // Check which AV factors are needed
  const avFactorMap: Record<string, string> = {
    "50 Day Moving Average": "SMA",
    "200 Day Moving Average": "SMA",
    "Momentum": "MOM",
    "News Sentiment Score": "NEWS_SENTIMENT"
  };

  // For now, return empty - we'll implement specific API calls as needed
  // This is a placeholder for the full implementation
  return factors;
}

/**
 * Calculate derived/computed factors
 */
async function calculateDerivedFactors(
  supabase: SupabaseClient,
  trade: any,
  existingFactors: FactorValue[],
  neededFactors: string[]
): Promise<FactorValue[]> {
  const factors: FactorValue[] = [];

  // IV Percentile (if we have IV)
  if (neededFactors.includes("IV Percentile")) {
    const ivFactor = existingFactors.find(f => f.factorName === "Implied Volatility");
    if (ivFactor && ivFactor.value) {
      // Fetch historical IV data from vol_regime_daily
      const { data: ivHistory } = await supabase
        .from("vol_regime_daily")
        .select("current_iv")
        .eq("symbol", trade.symbol)
        .order("as_of_date", { ascending: false })
        .limit(252); // 1 year of trading days

      if (ivHistory && ivHistory.length > 0) {
        const currentIV = ivFactor.value;
        const sortedIVs = ivHistory.map(h => h.current_iv).filter(iv => iv != null).sort((a, b) => a - b);
        const lowerCount = sortedIVs.filter(iv => iv < currentIV).length;
        const ivPercentile = (lowerCount / sortedIVs.length) * 100;

        factors.push({
          factorName: "IV Percentile",
          value: ivPercentile,
          source: "calculated",
          confidence: 0.9
        });
      }
    }
  }

  // 52W Range Position
  if (neededFactors.includes("52W Range Position") && trade.current_price) {
    // Would need to fetch 52-week high/low from Alpha Vantage or cache
    // Placeholder for now
  }

  // Market Cap Category
  if (neededFactors.includes("Market Cap Category")) {
    // Would fetch from Alpha Vantage fundamentals
    // Placeholder for now
  }

  return factors;
}

/**
 * Fetch cached factor values from database tables
 */
async function fetchCachedFactors(
  supabase: SupabaseClient,
  symbol: string,
  neededFactors: string[]
): Promise<FactorValue[]> {
  const factors: FactorValue[] = [];

  // Check vol_regime_daily for IV Rank
  if (neededFactors.includes("IV Rank")) {
    const { data: volData } = await supabase
      .from("vol_regime_daily")
      .select("iv_rank")
      .eq("symbol", symbol)
      .order("as_of_date", { ascending: false })
      .limit(1)
      .single();

    if (volData?.iv_rank != null) {
      factors.push({
        factorName: "IV Rank",
        value: volData.iv_rank,
        source: "vol_regime_cache",
        confidence: 1.0
      });
    }
  }

  return factors;
}

/**
 * Save factor values to trade_factors table
 */
export async function saveTradeFactors(
  supabase: SupabaseClient,
  tradeId: string,
  userId: string,
  factors: FactorValue[]
): Promise<void> {
  // Delete old factors for this trade (we'll store fresh ones)
  await supabase
    .from("trade_factors")
    .delete()
    .eq("trade_id", tradeId);

  // Insert new factors
  const rows = factors.map(f => ({
    trade_id: tradeId,
    user_id: userId,
    factor_name: f.factorName,
    factor_value: f.value,
    source: f.source,
    confidence: f.confidence ?? null
  }));

  if (rows.length > 0) {
    await supabase.from("trade_factors").insert(rows);
  }
}
