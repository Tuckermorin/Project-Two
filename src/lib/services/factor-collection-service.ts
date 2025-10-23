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

  // Query IPS factors with their definitions to get full metadata
  const { data: ipsFactors, error: ipsError } = await supabase
    .from("ips_factors")
    .select(`
      factor_name,
      factor_id,
      enabled,
      factor_definitions!inner(
        name,
        category,
        collection_method,
        source
      )
    `)
    .eq("ips_id", trade.ips_id)
    .eq("enabled", true);

  if (ipsError || !ipsFactors) {
    return { factors: [], errors: [`Failed to load IPS factors: ${ipsError?.message}`] };
  }

  console.log(`[Factor Collection] Found ${ipsFactors.length} enabled factors for IPS`);

  const factorNames = ipsFactors.map(f => f.factor_name);

  // Group factors by collection method for efficiency
  const factorsByMethod: Record<string, any[]> = {
    api: [],
    manual: [],
    calculated: []
  };

  ipsFactors.forEach(f => {
    const method = (f.factor_definitions as any)?.collection_method || 'manual';
    factorsByMethod[method].push(f);
  });

  console.log(`[Factor Collection] Breakdown: ${factorsByMethod.api.length} API, ${factorsByMethod.calculated.length} calculated, ${factorsByMethod.manual.length} manual`);

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

  // 2. STOCK PRICE FACTORS (from Alpha Vantage API)
  if (factorsByMethod.api.length > 0) {
    console.log(`[Factor Collection] Fetching ${factorsByMethod.api.length} API-based factors from Alpha Vantage`);
    try {
      const alphaVantageFactors = await fetchAlphaVantageFactors(trade.symbol, factorNames);
      factors.push(...alphaVantageFactors);
      console.log(`[Factor Collection] Successfully collected ${alphaVantageFactors.length} API factors`);
    } catch (error) {
      console.error(`[Factor Collection] Alpha Vantage API error:`, error);
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

  // Import Alpha Vantage client
  const { getAlphaVantageClient } = await import('@/lib/api/alpha-vantage');
  const avClient = getAlphaVantageClient();

  // Fetch company overview once for all fundamental factors
  let overview: any = null;
  const fundamentalFactors = [
    "Trailing P/E Ratio", "Forward P/E Ratio", "Price to Sales Ratio TTM",
    "Price to Book Ratio", "EV to Revenue", "EV to EBITDA", "Shares Outstanding",
    "Analyst Target Price", "Quarterly Earnings Growth YoY", "Diluted EPS TTM",
    "Dividend Date", "Ex-Dividend Date", "50 Day Moving Average", "200 Day Moving Average"
  ];

  if (neededFactors.some(f => fundamentalFactors.includes(f))) {
    try {
      overview = await avClient.getCompanyOverview(symbol);
    } catch (error) {
      console.warn(`Failed to fetch company overview for ${symbol}:`, error);
    }
  }

  // Fetch news sentiment once for all news sentiment factors
  let newsSentiment: any = null;
  const newsSentimentFactors = [
    "News Sentiment Score", "News Sentiment Label", "Positive News Article Count",
    "Negative News Article Count", "Neutral News Article Count", "Total News Article Count",
    "News Relevance Average", "Earnings News Sentiment", "M&A News Sentiment",
    "Technology News Sentiment"
  ];

  if (neededFactors.some(f => newsSentimentFactors.includes(f))) {
    try {
      newsSentiment = await avClient.getNewsSentiment(symbol);
    } catch (error) {
      console.warn(`Failed to fetch news sentiment for ${symbol}:`, error);
    }
  }

  // Map factor names to their collection methods
  const factorCollectors: Record<string, () => Promise<FactorValue | null>> = {
    // Fundamental factors from overview
    "Trailing P/E Ratio": async () => overview?.TrailingPE ? { factorName: "Trailing P/E Ratio", value: parseFloat(overview.TrailingPE), source: "alpha_vantage", confidence: 1.0 } : null,
    "Forward P/E Ratio": async () => overview?.ForwardPE ? { factorName: "Forward P/E Ratio", value: parseFloat(overview.ForwardPE), source: "alpha_vantage", confidence: 1.0 } : null,
    "Price to Sales Ratio TTM": async () => overview?.PriceToSalesRatioTTM ? { factorName: "Price to Sales Ratio TTM", value: parseFloat(overview.PriceToSalesRatioTTM), source: "alpha_vantage", confidence: 1.0 } : null,
    "Price to Book Ratio": async () => overview?.PriceToBookRatio ? { factorName: "Price to Book Ratio", value: parseFloat(overview.PriceToBookRatio), source: "alpha_vantage", confidence: 1.0 } : null,
    "EV to Revenue": async () => overview?.EVToRevenue ? { factorName: "EV to Revenue", value: parseFloat(overview.EVToRevenue), source: "alpha_vantage", confidence: 1.0 } : null,
    "EV to EBITDA": async () => overview?.EVToEBITDA ? { factorName: "EV to EBITDA", value: parseFloat(overview.EVToEBITDA), source: "alpha_vantage", confidence: 1.0 } : null,
    "Shares Outstanding": async () => overview?.SharesOutstanding ? { factorName: "Shares Outstanding", value: parseFloat(overview.SharesOutstanding), source: "alpha_vantage", confidence: 1.0 } : null,
    "Analyst Target Price": async () => overview?.AnalystTargetPrice ? { factorName: "Analyst Target Price", value: parseFloat(overview.AnalystTargetPrice), source: "alpha_vantage", confidence: 1.0 } : null,
    "Quarterly Earnings Growth YoY": async () => overview?.QuarterlyEarningsGrowthYOY ? { factorName: "Quarterly Earnings Growth YoY", value: parseFloat(overview.QuarterlyEarningsGrowthYOY) * 100, source: "alpha_vantage", confidence: 1.0 } : null,
    "Diluted EPS TTM": async () => overview?.DilutedEPSTTM ? { factorName: "Diluted EPS TTM", value: parseFloat(overview.DilutedEPSTTM), source: "alpha_vantage", confidence: 1.0 } : null,
    "50 Day Moving Average": async () => overview?.['50DayMovingAverage'] ? { factorName: "50 Day Moving Average", value: parseFloat(overview['50DayMovingAverage']), source: "alpha_vantage", confidence: 1.0 } : null,
    "200 Day Moving Average": async () => overview?.['200DayMovingAverage'] ? { factorName: "200 Day Moving Average", value: parseFloat(overview['200DayMovingAverage']), source: "alpha_vantage", confidence: 1.0 } : null,

    // Technical indicators
    "EMA 20": async () => {
      const result = await avClient.getEMA(symbol, 20);
      return result.value !== null ? { factorName: "EMA 20", value: result.value, source: "alpha_vantage", confidence: 1.0 } : null;
    },
    "EMA 50": async () => {
      const result = await avClient.getEMA(symbol, 50);
      return result.value !== null ? { factorName: "EMA 50", value: result.value, source: "alpha_vantage", confidence: 1.0 } : null;
    },
    "EMA 200": async () => {
      const result = await avClient.getEMA(symbol, 200);
      return result.value !== null ? { factorName: "EMA 200", value: result.value, source: "alpha_vantage", confidence: 1.0 } : null;
    },
    "RSI": async () => {
      const result = await avClient.getRSI(symbol);
      return result.value !== null ? { factorName: "RSI", value: result.value, source: "alpha_vantage", confidence: 1.0 } : null;
    },
    "ADX (Average Directional Index)": async () => {
      const result = await avClient.getADX(symbol);
      return result.value !== null ? { factorName: "ADX (Average Directional Index)", value: result.value, source: "alpha_vantage", confidence: 1.0 } : null;
    },
    "ATR (Average True Range)": async () => {
      const result = await avClient.getATR(symbol);
      return result.value !== null ? { factorName: "ATR (Average True Range)", value: result.value, source: "alpha_vantage", confidence: 1.0 } : null;
    },
    "CCI (Commodity Channel Index)": async () => {
      const result = await avClient.getCCI(symbol);
      return result.value !== null ? { factorName: "CCI (Commodity Channel Index)", value: result.value, source: "alpha_vantage", confidence: 1.0 } : null;
    },
    "MFI (Money Flow Index)": async () => {
      const result = await avClient.getMFI(symbol);
      return result.value !== null ? { factorName: "MFI (Money Flow Index)", value: result.value, source: "alpha_vantage", confidence: 1.0 } : null;
    },
    "ROC (Rate of Change)": async () => {
      const result = await avClient.getROC(symbol);
      return result.value !== null ? { factorName: "ROC (Rate of Change)", value: result.value, source: "alpha_vantage", confidence: 1.0 } : null;
    },
    "Williams %R": async () => {
      const result = await avClient.getWILLR(symbol);
      return result.value !== null ? { factorName: "Williams %R", value: result.value, source: "alpha_vantage", confidence: 1.0 } : null;
    },
    "TRIX": async () => {
      const result = await avClient.getTRIX(symbol);
      return result.value !== null ? { factorName: "TRIX", value: result.value, source: "alpha_vantage", confidence: 1.0 } : null;
    },
    "Ultimate Oscillator": async () => {
      const result = await avClient.getULTOSC(symbol);
      return result.value !== null ? { factorName: "Ultimate Oscillator", value: result.value, source: "alpha_vantage", confidence: 1.0 } : null;
    },
    "OBV (On Balance Volume)": async () => {
      const result = await avClient.getOBV(symbol);
      return result.value !== null ? { factorName: "OBV (On Balance Volume)", value: result.value, source: "alpha_vantage", confidence: 1.0 } : null;
    },

    // Economic indicators (macro)
    "Treasury Yield 10 Year": async () => {
      const result = await avClient.getTreasuryYield('10year');
      return result.value !== null ? { factorName: "Treasury Yield 10 Year", value: result.value, source: "alpha_vantage", confidence: 1.0 } : null;
    },
    "CPI": async () => {
      const result = await avClient.getCPI();
      return result.value !== null ? { factorName: "CPI", value: result.value, source: "alpha_vantage", confidence: 1.0 } : null;
    },
    "Inflation Rate": async () => {
      const result = await avClient.getInflation();
      return result.value !== null ? { factorName: "Inflation Rate", value: result.value, source: "alpha_vantage", confidence: 1.0 } : null;
    },
    "Consumer Sentiment": async () => {
      const result = await avClient.getConsumerSentiment();
      return result.value !== null ? { factorName: "Consumer Sentiment", value: result.value, source: "alpha_vantage", confidence: 1.0 } : null;
    },

    // News Sentiment factors
    "News Sentiment Score": async () => newsSentiment?.average_score !== null && newsSentiment?.average_score !== undefined ? { factorName: "News Sentiment Score", value: newsSentiment.average_score, source: "alpha_vantage", confidence: 1.0 } : null,
    "News Sentiment Label": async () => newsSentiment?.sentiment_label ? { factorName: "News Sentiment Label", value: newsSentiment.sentiment_label === 'bullish' ? 1.0 : newsSentiment.sentiment_label === 'somewhat-bullish' ? 0.5 : newsSentiment.sentiment_label === 'bearish' ? -1.0 : newsSentiment.sentiment_label === 'somewhat-bearish' ? -0.5 : 0, source: "alpha_vantage", confidence: 1.0 } : null,
    "Positive News Article Count": async () => newsSentiment?.positive !== null && newsSentiment?.positive !== undefined ? { factorName: "Positive News Article Count", value: newsSentiment.positive, source: "alpha_vantage", confidence: 1.0 } : null,
    "Negative News Article Count": async () => newsSentiment?.negative !== null && newsSentiment?.negative !== undefined ? { factorName: "Negative News Article Count", value: newsSentiment.negative, source: "alpha_vantage", confidence: 1.0 } : null,
    "Neutral News Article Count": async () => newsSentiment?.neutral !== null && newsSentiment?.neutral !== undefined ? { factorName: "Neutral News Article Count", value: newsSentiment.neutral, source: "alpha_vantage", confidence: 1.0 } : null,
    "Total News Article Count": async () => newsSentiment?.count !== null && newsSentiment?.count !== undefined ? { factorName: "Total News Article Count", value: newsSentiment.count, source: "alpha_vantage", confidence: 1.0 } : null,
    "News Relevance Average": async () => newsSentiment?.avg_relevance !== null && newsSentiment?.avg_relevance !== undefined ? { factorName: "News Relevance Average", value: newsSentiment.avg_relevance, source: "alpha_vantage", confidence: 1.0 } : null,
    "Earnings News Sentiment": async () => newsSentiment?.topic_sentiment?.['Earnings'] !== null && newsSentiment?.topic_sentiment?.['Earnings'] !== undefined ? { factorName: "Earnings News Sentiment", value: newsSentiment.topic_sentiment['Earnings'], source: "alpha_vantage", confidence: 1.0 } : null,
    "M&A News Sentiment": async () => newsSentiment?.topic_sentiment?.['Mergers & Acquisitions'] !== null && newsSentiment?.topic_sentiment?.['Mergers & Acquisitions'] !== undefined ? { factorName: "M&A News Sentiment", value: newsSentiment.topic_sentiment['Mergers & Acquisitions'], source: "alpha_vantage", confidence: 1.0 } : null,
    "Technology News Sentiment": async () => newsSentiment?.topic_sentiment?.['Technology'] !== null && newsSentiment?.topic_sentiment?.['Technology'] !== undefined ? { factorName: "Technology News Sentiment", value: newsSentiment.topic_sentiment['Technology'], source: "alpha_vantage", confidence: 1.0 } : null
  };

  // Collect all requested factors
  for (const factorName of neededFactors) {
    const collector = factorCollectors[factorName];
    if (collector) {
      try {
        const factor = await collector();
        if (factor) {
          factors.push(factor);
        }
      } catch (error) {
        console.warn(`Failed to collect factor ${factorName}:`, error);
      }
    }
  }

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
