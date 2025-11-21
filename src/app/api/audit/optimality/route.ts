import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getAlphaVantageClient } from "@/lib/api/alpha-vantage";
import { calculateRiskAdjustedScore } from "@/lib/agent/risk-adjusted-scoring";
import { loadIPSById } from "@/lib/ips/loader";

// Create Supabase client for server-side API
function getSupabaseClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

interface AuditCandidate {
  symbol: string;
  strategy: string;
  dte: number;
  short_strike: number;
  long_strike: number;
  spread_width: number;
  expiry: string;
  short_delta: number;
  short_theta?: number;
  short_vega?: number;
  short_iv?: number;
  long_delta: number;
  entry_mid: number;
  max_profit: number;
  max_loss: number;
  breakeven: number;
  est_pop: number;
  risk_reward: number;
  yield_score?: number;
  ips_score?: number;
  composite_score?: number;
  risk_adjusted_metrics?: any;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { symbol, ipsId, maxExpirations = 10, maxStrikesPerExpiration = 200, spreadWidths = [1, 2, 3, 5, 10] } = body;

    if (!symbol) {
      return NextResponse.json({ error: "Symbol is required" }, { status: 400 });
    }

    console.log(`[Audit] Starting optimality audit for ${symbol}`);

    // Step 1: Fetch ALL required data (just like the agent does)
    const avClient = getAlphaVantageClient();

    console.log(`[Audit] Fetching options data...`);
    const optionsData = await avClient.getRealtimeOptions(symbol, { requireGreeks: true });

    console.log(`[Audit] Fetching quote...`);
    const quote = await avClient.getQuote(symbol);
    const currentPrice = parseFloat(quote["05. price"]);

    console.log(`[Audit] Fetching fundamental data (overview)...`);
    const overview = await avClient.getCompanyOverview(symbol);

    console.log(`[Audit] Fetching technical indicators...`);
    const sma50Promise = avClient.getSMA(symbol, 'daily', 50);
    const sma200Promise = avClient.getSMA(symbol, 'daily', 200);
    const momentumPromise = avClient.getMOM(symbol, 10);

    console.log(`[Audit] Fetching news sentiment...`);
    const newsPromise = avClient.getNewsSentiment(symbol, 50);

    // Wait for all data
    const [sma50Data, sma200Data, momentumData, newsSentiment] = await Promise.all([
      sma50Promise,
      sma200Promise,
      momentumPromise,
      newsPromise,
    ]);

    // Extract latest values from technical indicators
    const sma50 = sma50Data?.value || null;
    const sma200 = sma200Data?.value || null;
    const momentum = momentumData?.value || null;

    console.log(`[Audit] Fetching IV rank/percentile data...`);
    // Fetch IV rank and percentile from vol_regime_daily (same as agent does)
    let ivData = { iv_rank: null, iv_percentile: null };
    try {
      const supabase = getSupabaseClient();
      const cutoffDate = new Date(Date.now() - 252 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

      const { data: historicalData } = await supabase
        .from('vol_regime_daily')
        .select('iv_atm_30d')
        .eq('symbol', symbol)
        .gte('as_of_date', cutoffDate)
        .order('as_of_date', { ascending: false });

      if (historicalData && historicalData.length > 0) {
        const currentIV = historicalData[0].iv_atm_30d;
        if (currentIV !== null) {
          const validIVs = historicalData.map(d => d.iv_atm_30d).filter(iv => iv !== null);
          const countBelow = validIVs.filter(iv => iv <= currentIV).length;
          const ivRank = (countBelow / validIVs.length) * 100;

          ivData = {
            iv_rank: Math.round(ivRank * 10) / 10,
            iv_percentile: Math.round(ivRank * 10) / 10
          };
        }
      }
    } catch (error) {
      console.warn(`[Audit] Failed to calculate IV metrics:`, error);
    }

    console.log(`[Audit] Fetched ${optionsData.length} option contracts, current price: $${currentPrice.toFixed(2)}`);

    // Step 2: Get IPS configuration using the loader (same as agent uses)
    let ipsConfig: any = null;

    if (ipsId) {
      console.log(`[Audit] Loading IPS config with ID: ${ipsId}`);
      try {
        ipsConfig = await loadIPSById(ipsId);
        console.log(`[Audit] IPS loaded: ${ipsConfig.name}, ${ipsConfig.factors.length} factors`);
      } catch (error) {
        console.error(`[Audit] Error loading IPS:`, error);
        return NextResponse.json({
          error: "Failed to load IPS configuration",
          message: error instanceof Error ? error.message : "Unknown error"
        }, { status: 500 });
      }
    } else {
      return NextResponse.json({
        error: "IPS ID is required",
        message: "Please select an IPS configuration"
      }, { status: 400 });
    }

    const minDTE = ipsConfig?.min_dte || 1;
    const maxDTE = ipsConfig?.max_dte || 365;

    console.log(`[Audit] Using IPS: ${ipsConfig?.name || "Default"}, DTE: ${minDTE}-${maxDTE}`);

    // Step 3: Generate all combinations (do this first to get debugStrike)
    const candidates = await generateAllCombinations(
      symbol,
      optionsData,
      currentPrice,
      { maxExpirations, maxStrikesPerExpiration, spreadWidths, minDTE, maxDTE },
      ipsConfig
    );

    console.log(`[Audit] Generated ${candidates.length} candidates`);

    // Calculate put/call ratios from options data
    const puts = optionsData.filter(c => c.type === "put");
    const calls = optionsData.filter(c => c.type === "call");

    const putVolume = puts.reduce((sum, p) => sum + (p.volume || 0), 0);
    const callVolume = calls.reduce((sum, c) => sum + (c.volume || 0), 0);
    const putCallRatio = callVolume > 0 ? putVolume / callVolume : null;

    const putOI = puts.reduce((sum, p) => sum + (p.openInterest || 0), 0);
    const callOI = calls.reduce((sum, c) => sum + (c.openInterest || 0), 0);
    const putCallOIRatio = callOI > 0 ? putOI / callOI : null;

    // Build market/fundamental data object (like the agent does)
    const marketAndFundamentalData = {
      overview,
      sma50,
      sma200,
      momentum,
      currentPrice,
      newsSentiment,
      iv_rank: ivData.iv_rank,
      iv_percentile: ivData.iv_percentile,
      putCallRatio,
      putCallOIRatio,
      debugStrike: candidates[0]?.short_strike, // For debug logging first trade
    };

    console.log(`[Audit] Market data summary:`, {
      symbol,
      currentPrice,
      hasSMA50: !!sma50,
      hasSMA200: !!sma200,
      hasMomentum: !!momentum,
      hasOverview: !!overview,
      hasNews: !!newsSentiment,
      newsCount: newsSentiment?.count || 0,
      ivRank: ivData.iv_rank,
      ivPercentile: ivData.iv_percentile,
      putCallRatio,
      putCallOIRatio,
      ipsFactors: ipsConfig?.factors?.length || 0
    });

    // Step 4: Score all candidates
    const scoredCandidates = await scoreAllCandidates(candidates, ipsConfig, marketAndFundamentalData);

    console.log(`[Audit] Scored ${scoredCandidates.length} candidates`);

    // Step 5: Sort and rank
    const topComposite = [...scoredCandidates].sort((a, b) => (b.composite_score || 0) - (a.composite_score || 0)).slice(0, 20);
    const topIPS = [...scoredCandidates].sort((a, b) => (b.ips_score || 0) - (a.ips_score || 0)).slice(0, 20);
    const topYield = [...scoredCandidates].sort((a, b) => (b.yield_score || 0) - (a.yield_score || 0)).slice(0, 20);
    const topEV = [...scoredCandidates]
      .sort((a, b) => (b.risk_adjusted_metrics?.expected_value_per_dollar || 0) - (a.risk_adjusted_metrics?.expected_value_per_dollar || 0))
      .slice(0, 20);

    // Step 6: Get agent's selection
    const supabase = getSupabaseClient();
    const { data: agentTrade } = await supabase
      .from("trades")
      .select("*")
      .eq("symbol", symbol)
      .eq("status", "active")
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    let agentRank: number | undefined;
    let isOptimal = false;

    if (agentTrade) {
      const compositeRanked = [...scoredCandidates].sort((a, b) => (b.composite_score || 0) - (a.composite_score || 0));
      agentRank = compositeRanked.findIndex(c =>
        Math.abs(c.short_strike - agentTrade.short_strike) < 0.01 &&
        Math.abs(c.long_strike - agentTrade.long_strike) < 0.01 &&
        c.dte === agentTrade.dte
      ) + 1;

      isOptimal = agentRank > 0 && agentRank <= 5;
    }

    // Step 7: Calculate statistics
    const stats = calculateStatistics(scoredCandidates);

    return NextResponse.json({
      symbol,
      currentPrice,
      totalCombinations: scoredCandidates.length,
      expirationsTested: [...new Set(scoredCandidates.map(c => c.expiry))].length,
      spreadWidthsTested: spreadWidths,
      topByComposite: topComposite,
      topByIPS: topIPS,
      topByYield: topYield,
      topByEV: topEV,
      agentTrade: agentTrade || null,
      agentRank,
      isOptimal,
      stats,
    });

  } catch (error: any) {
    console.error("[Audit] Error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to run audit" },
      { status: 500 }
    );
  }
}

async function generateAllCombinations(
  symbol: string,
  optionsData: any[],
  currentPrice: number,
  config: any,
  ipsConfig: any
): Promise<AuditCandidate[]> {
  const candidates: AuditCandidate[] = [];

  // Filter for puts below current price
  const puts = optionsData.filter((c: any) => c.type === "put" && c.strike && c.strike < currentPrice);

  // Get all unique expirations
  const allExpirations = [...new Set(puts.map((p: any) => p.expiration))];

  // Filter and sort by DTE
  const validExpirations = allExpirations
    .map(expiry => ({ expiry, dte: calculateDTE(expiry as string) }))
    .filter(e => e.dte >= config.minDTE && e.dte <= config.maxDTE)
    .sort((a, b) => a.dte - b.dte)
    .slice(0, config.maxExpirations);

  for (const { expiry, dte } of validExpirations) {
    const expiryPuts = puts
      .filter((p: any) => p.expiration === expiry && p.bid && p.ask)
      .sort((a: any, b: any) => b.strike - a.strike);

    if (expiryPuts.length < 2) continue;

    const strikesToTest = Math.min(config.maxStrikesPerExpiration, expiryPuts.length);

    for (let i = 0; i < strikesToTest; i++) {
      const shortPut = expiryPuts[i];
      const shortDelta = Math.abs(shortPut.delta || 0);

      // Test all spread widths
      for (const width of config.spreadWidths) {
        const longPutIndex = i + width;
        if (longPutIndex >= expiryPuts.length) continue;

        const longPut = expiryPuts[longPutIndex];
        const spreadWidth = shortPut.strike - longPut.strike;
        if (spreadWidth <= 0) continue;

        const entryMid = ((shortPut.bid + shortPut.ask) / 2) - ((longPut.bid + longPut.ask) / 2);
        if (entryMid <= 0) continue;

        const maxProfit = entryMid;
        const maxLoss = spreadWidth - entryMid;
        const riskReward = maxProfit / maxLoss;

        if (riskReward < 0.05) continue;

        candidates.push({
          symbol,
          strategy: "put_credit_spread",
          dte,
          short_strike: shortPut.strike,
          long_strike: longPut.strike,
          spread_width: spreadWidth,
          expiry: expiry as string,
          short_delta: shortDelta,
          short_theta: shortPut.theta,
          short_vega: shortPut.vega,
          short_iv: shortPut.impliedVolatility,
          long_delta: Math.abs(longPut.delta || 0),
          entry_mid: entryMid,
          max_profit: maxProfit,
          max_loss: maxLoss,
          breakeven: shortPut.strike - entryMid,
          est_pop: 1 - shortDelta,
          risk_reward: riskReward,
        });
      }
    }
  }

  return candidates;
}

async function scoreAllCandidates(
  candidates: AuditCandidate[],
  ipsConfig: any,
  marketData: any
): Promise<AuditCandidate[]> {
  for (const candidate of candidates) {
    // Calculate yield score
    const riskAdjusted = calculateRiskAdjustedScore({
      max_profit: candidate.max_profit,
      max_loss: candidate.max_loss,
      entry_mid: candidate.entry_mid,
      est_pop: candidate.est_pop,
      dte: candidate.dte,
      delta: candidate.short_delta,
      theta: candidate.short_theta,
      vega: candidate.short_vega,
    });

    candidate.risk_adjusted_metrics = riskAdjusted;
    candidate.yield_score = riskAdjusted.risk_adjusted_score;

    // Calculate IPS score (with real factor evaluation)
    candidate.ips_score = calculateIPSScore(candidate, ipsConfig, marketData);

    // Calculate composite score
    candidate.composite_score = (candidate.yield_score * 0.4) + (candidate.ips_score * 0.6);
  }

  return candidates;
}

function calculateIPSScore(candidate: AuditCandidate, ipsConfig: any, marketData: any): number {
  if (!ipsConfig || !ipsConfig.factors || ipsConfig.factors.length === 0) {
    console.log(`[IPS] No IPS config or factors`);
    return 50;
  }

  let totalWeight = 0;
  let weightedScore = 0;
  const passedFactors: any[] = [];
  const minorMisses: any[] = [];
  const majorMisses: any[] = [];

  // Use ipsConfig.factors (from loader), not ipsConfig.ips_factors
  for (const factor of ipsConfig.factors) {
    if (!factor.enabled) continue;

    totalWeight += factor.weight;

    // Get factor value from candidate and market data (use factor_key from loader)
    const value = getFactorValue(factor, candidate, marketData);

    // Format target for display
    const formatTarget = (threshold: any, direction: string) => {
      if (threshold === null || threshold === undefined) return null;
      switch (direction) {
        case 'gte': return `≥${threshold}`;
        case 'lte': return `≤${threshold}`;
        case 'eq': return `=${threshold}`;
        case 'range': return `${threshold}-${factor.threshold_max}`;
        default: return `${threshold}`;
      }
    };

    // Evaluate if it passes (use threshold and direction from loader)
    const passed = evaluateFactorThreshold(factor, value);
    const factorScore = passed ? 100 : 50;
    weightedScore += factorScore * factor.weight;

    // Store factor detail
    const factorDetail = {
      factor_key: factor.factor_key,
      factor_name: factor.display_name || factor.factor_key,
      value,
      target: formatTarget(factor.threshold, factor.direction || ''),
      passed,
      weight: factor.weight,
      severity: passed ? 'pass' : 'major_miss' as const,
    };

    if (passed) {
      passedFactors.push(factorDetail);
    } else {
      majorMisses.push(factorDetail);
    }

    // Debug first trade only
    if (candidate.short_strike === marketData.debugStrike) {
      console.log(`[IPS Factor] ${factor.factor_key}: value=${value}, threshold=${factor.threshold}, direction=${factor.direction}, passed=${passed}`);
    }
  }

  const finalScore = totalWeight > 0 ? (weightedScore / totalWeight) : 50;

  // Attach factor details to candidate
  (candidate as any).ips_factor_details = {
    ips_score: finalScore,
    tier: finalScore >= 90 ? 'elite' : finalScore >= 75 ? 'quality' : finalScore >= 60 ? 'speculative' : null,
    factor_details: [...passedFactors, ...minorMisses, ...majorMisses],
    passed_factors: passedFactors,
    minor_misses: minorMisses,
    major_misses: majorMisses,
    total_weight_passed: passedFactors.reduce((sum, f) => sum + f.weight, 0),
    total_weight_minor: 0,
    total_weight_major: majorMisses.reduce((sum, f) => sum + f.weight, 0),
  };

  if (candidate.short_strike === marketData.debugStrike) {
    console.log(`[IPS Summary] ${candidate.symbol} $${candidate.short_strike}: Score=${finalScore.toFixed(1)}%, Passed=${passedFactors.length}, Failed=${majorMisses.length}`);
  }

  return finalScore;
}

// Extract factor value from candidate and market data
function getFactorValue(factor: any, candidate: AuditCandidate, marketData: any): any {
  const { overview, sma50, sma200, momentum, currentPrice, newsSentiment, iv_rank, iv_percentile, putCallRatio, putCallOIRatio } = marketData;

  // Use factor_key from loader (loader maps factor_id -> factor_key)
  switch (factor.factor_key) {
    // Options Greeks
    case 'opt-delta':
    case 'Delta':
      return candidate.short_delta;

    case 'opt-theta':
    case 'Theta':
      return candidate.short_theta;

    case 'opt-vega':
    case 'Vega':
      return candidate.short_vega;

    case 'opt-iv':
    case 'Implied Volatility':
      return candidate.short_iv;

    // IV Metrics
    case 'calc-iv-rank':
    case 'opt-iv-rank':
    case 'IV Rank':
      return iv_rank;

    case 'calc-iv-percentile':
    case 'opt-iv-percentile':
    case 'IV Percentile':
      return iv_percentile;

    // Put/Call Ratios
    case 'calc-put-call-volume-ratio':
    case 'opt-put-call-ratio':
    case 'Put/Call Ratio':
      return putCallRatio;

    case 'calc-put-call-oi-ratio':
    case 'opt-put-call-oi-ratio':
    case 'Put/Call OI Ratio':
      return putCallOIRatio;

    // Open Interest (from candidate's short leg)
    case 'opt-oi':
    case 'opt-open-interest':
    case 'Open Interest':
      return null; // Not available in candidate data, would need to pass it through

    // Bid-Ask Spread (not available in audit candidates)
    case 'opt-bid-ask-spread':
    case 'Bid-Ask Spread':
      return null;

    // Moving Averages
    case 'av-200-day-ma':
    case '200 Day Moving Average':
      if (sma200 && currentPrice) {
        return currentPrice / sma200; // Ratio
      }
      return null;

    case 'av-50-day-ma':
    case '50 Day Moving Average':
      if (sma50 && currentPrice) {
        return currentPrice / sma50; // Ratio
      }
      return null;

    // Momentum
    case 'av-mom':
    case 'Momentum':
      return momentum;

    // 52-week range
    case 'calc-52w-range-position':
    case '52W Range Position': {
      const high = parseFloat(overview?.["52WeekHigh"] || "0");
      const low = parseFloat(overview?.["52WeekLow"] || "0");
      if (high > 0 && low > 0 && currentPrice) {
        return (currentPrice - low) / (high - low);
      }
      return null;
    }

    case 'calc-dist-52w-high':
    case 'Distance from 52W High': {
      const high = parseFloat(overview?.["52WeekHigh"] || "0");
      if (high > 0 && currentPrice) {
        return (high - currentPrice) / high;
      }
      return null;
    }

    // Market Cap
    case 'calc-market-cap-category':
    case 'Market Cap Category': {
      const mcap = parseFloat(overview?.MarketCapitalization || "0");
      return mcap > 0 ? mcap : null;
    }

    // Analyst Target
    case 'calc-dist-target-price':
    case 'Analyst Rating Average': {
      const target = parseFloat(overview?.AnalystTargetPrice || "0");
      if (target > 0 && currentPrice) {
        return ((target - currentPrice) / currentPrice) * 100;
      }
      return null;
    }

    // News Sentiment
    case 'tavily-news-sentiment-score':
    case 'News Sentiment Score':
      return newsSentiment?.average_score || null;

    case 'tavily-news-volume':
    case 'News Volume':
      return newsSentiment?.count || null;

    // Earnings News Sentiment (Alpha Intelligence factor)
    case 'alpha-earnings-news-sentiment':
    case 'Earnings News Sentiment': {
      // Filter for earnings-related news only
      if (newsSentiment && newsSentiment.count > 0) {
        // Check if sentiment is based on earnings news
        // For now, return general news sentiment as proxy
        return newsSentiment.average_score;
      }
      return null;
    }

    // Negative News Article Count (Alpha Intelligence factor)
    case 'alpha-negative-news-count':
    case 'Negative News Article Count':
      if (newsSentiment) {
        return newsSentiment.negative || 0;
      }
      return null;

    default:
      return null;
  }
}

// Evaluate if factor value passes threshold
function evaluateFactorThreshold(factor: any, value: any): boolean {
  if (value === null || value === undefined) return false;

  // Use threshold and direction from loader (loader maps target_value -> threshold, target_operator -> direction)
  const threshold = factor.threshold;
  const direction = factor.direction;
  const thresholdMax = factor.threshold_max; // For range operator

  if (threshold === null || threshold === undefined) return true; // No threshold = auto-pass

  switch (direction) {
    case 'gte':
      return value >= threshold;
    case 'lte':
      return value <= threshold;
    case 'eq':
      return value === threshold;
    case 'range':
      // For range, threshold_max should be used
      if (thresholdMax !== null && thresholdMax !== undefined) {
        return value >= threshold && value <= thresholdMax;
      }
      return value >= threshold;
    default:
      return true;
  }
}

function calculateDTE(expiry: string): number {
  const expiryDate = new Date(expiry);
  const now = new Date();
  const diffTime = expiryDate.getTime() - now.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return diffDays;
}

function calculateStatistics(candidates: AuditCandidate[]) {
  const compositeScores = candidates.map(c => c.composite_score || 0).sort((a, b) => a - b);
  const ipsScores = candidates.map(c => c.ips_score || 0).sort((a, b) => a - b);
  const yieldScores = candidates.map(c => c.yield_score || 0).sort((a, b) => a - b);

  const median = (arr: number[]) => arr[Math.floor(arr.length / 2)];
  const avg = (arr: number[]) => arr.reduce((a, b) => a + b, 0) / arr.length;

  return {
    composite: {
      min: compositeScores[0],
      max: compositeScores[compositeScores.length - 1],
      avg: avg(compositeScores),
      median: median(compositeScores),
    },
    ips: {
      min: ipsScores[0],
      max: ipsScores[ipsScores.length - 1],
      avg: avg(ipsScores),
      median: median(ipsScores),
    },
    yield: {
      min: yieldScores[0],
      max: yieldScores[yieldScores.length - 1],
      avg: avg(yieldScores),
      median: median(yieldScores),
    },
  };
}
