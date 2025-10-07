// Options Trading Agent - LangGraph Implementation
import { StateGraph } from "@langchain/langgraph";
import { v4 as uuidv4 } from "uuid";
import pRetry from "p-retry";
import PQueue from "p-queue";
import dayjs from "dayjs";

// Import clients
import { getOptionsChain, getQuote } from "@/lib/clients/alphaVantage";
import { getAlphaVantageClient } from "@/lib/api/alpha-vantage";
import { getSeries } from "@/lib/clients/fred";
import { tavilySearch } from "@/lib/clients/tavily";
import { rationaleLLM } from "@/lib/clients/llm";
import * as db from "@/lib/db/agent";
import { buildReasoningChain } from "./deep-reasoning";
import { evaluatePCSTrade, formatEvaluation, type PCSCandidate } from "./pcs-trade-evaluator";

// State interface
interface AgentState {
  runId: string;
  mode: "backtest" | "paper" | "live";
  symbols: string[];
  ipsId?: string;
  ipsConfig?: any;
  asof: string;
  marketData: Record<string, any>;
  fundamentalData: Record<string, any>; // Company overview data
  macroData: Record<string, any>;
  features: Record<string, any>;
  candidates: any[];
  scores: any[];
  selected: any[];
  errors: string[];
  // Deep reasoning additions
  reasoningChains: Record<string, any>;
  ipsCompliance: Record<string, any>;
  historicalContext: Record<string, any>;
  researchSynthesis: Record<string, any>;
  adjustedThresholds: Record<string, any>;
}

// Rate limiting queue
const queue = new PQueue({ concurrency: 2, interval: 1000, intervalCap: 2 });

// Node 0: FetchIPS - Load IPS configuration first
async function fetchIPS(state: AgentState): Promise<Partial<AgentState>> {
  console.log(`[FetchIPS] Loading IPS configuration: ${state.ipsId || 'none'}`);

  if (!state.ipsId) {
    console.log("[FetchIPS] No IPS ID provided, skipping IPS load");
    return { ipsConfig: null };
  }

  try {
    const { loadIPSById } = await import("@/lib/ips/loader");
    const { assertIPSShape } = await import("@/lib/ips/assert");

    const ipsConfig = await loadIPSById(state.ipsId);
    assertIPSShape(ipsConfig);

    console.log(`[FetchIPS] Loaded IPS config: ${ipsConfig.name} with ${ipsConfig.factors?.length || 0} factors`);
    console.log(`[FetchIPS] IPS Factors:`, ipsConfig.factors?.map(f => ({
      name: f.display_name,
      key: f.factor_key,
      weight: f.weight,
      threshold: f.threshold,
      direction: f.direction
    })));

    return { ipsConfig };
  } catch (error: any) {
    console.error("[FetchIPS] Failed to load IPS config:", error.message);
    return {
      ipsConfig: null,
      errors: [...state.errors, `IPS Load: ${error.message}`]
    };
  }
}

// Node 1: FetchMarketData
async function fetchMarketData(state: AgentState): Promise<Partial<AgentState>> {
  console.log(`[FetchMarketData] Processing ${state.symbols.length} symbols`);
  const marketData: Record<string, any> = {};
  const fundamentalData: Record<string, any> = {};
  const errors: string[] = [];

  for (const symbol of state.symbols) {
    try {
      const start = Date.now();

      // Fetch options chain
      const result = await queue.add(() =>
        pRetry(() => getOptionsChain(symbol), { retries: 3 })
      );

      // Normalize contracts
      const normalized = result.contracts.map((c) => ({
        symbol: c.symbol,
        expiry: c.expiry,
        strike: c.strike,
        option_type: c.option_type,
        bid: c.bid ?? null,
        ask: c.ask ?? null,
        last: c.last ?? null,
        iv: c.iv ?? null,
        delta: c.delta ?? null,
        gamma: c.gamma ?? null,
        theta: c.theta ?? null,
        vega: c.vega ?? null,
        oi: c.oi ?? null,
        volume: c.volume ?? null,
        asof: result.asof,
      }));

      // Persist to database
      await db.persistRawOptions(state.runId, symbol, result.asof, {
        count: normalized.length,
      });
      await db.persistContracts(normalized);

      // Fetch quote
      const quote = await queue.add(() =>
        pRetry(() => getQuote(symbol), { retries: 3 })
      );

      marketData[symbol] = {
        contracts: normalized,
        quote,
        asof: result.asof,
      };

      console.log(`[FetchMarketData] Got ${normalized.length} contracts for ${symbol}`);

      // Fetch company fundamentals
      try {
        console.log(`[FetchMarketData] Fetching fundamentals for ${symbol}`);
        const avClient = getAlphaVantageClient();
        const overview = await queue.add(() =>
          pRetry(() => avClient.getCompanyOverview(symbol), { retries: 2 })
        );

        fundamentalData[symbol] = overview;
        console.log(`[FetchMarketData] Got fundamentals for ${symbol}: PE=${overview.PERatio}, Beta=${overview.Beta}`);
      } catch (fundError: any) {
        console.warn(`[FetchMarketData] Failed to fetch fundamentals for ${symbol}:`, fundError.message);
        fundamentalData[symbol] = null;
      }

      // Fetch 5-day historical prices for momentum calculation
      try {
        console.log(`[FetchMarketData] Fetching 5-day price history for ${symbol}`);
        const avClient = getAlphaVantageClient();
        const dailySeries = await queue.add(() =>
          pRetry(() => avClient.getDailyAdjustedSeries(symbol, 'compact'), { retries: 2 })
        );

        // Extract prices from the last 6 days (to ensure we get 5 days ago even with weekends)
        if (dailySeries) {
          const dates = Object.keys(dailySeries).sort().reverse();
          if (dates.length >= 6) {
            const price5dAgo = parseFloat(dailySeries[dates[5]]['5. adjusted close']);
            marketData[symbol].price5dAgo = price5dAgo;
            console.log(`[FetchMarketData] Got 5-day price for ${symbol}: $${price5dAgo}`);
          }
        }
      } catch (priceError: any) {
        console.warn(`[FetchMarketData] Failed to fetch 5-day price for ${symbol}:`, priceError.message);
      }

      // Fetch ATR-14 for volatility assessment
      try {
        console.log(`[FetchMarketData] Fetching ATR-14 for ${symbol}`);
        const avClient = getAlphaVantageClient();
        const atr = await queue.add(() =>
          pRetry(() => avClient.getATR(symbol, 14, 'daily'), { retries: 2 })
        );

        if (atr && atr.value) {
          marketData[symbol].atr14 = atr.value;
          console.log(`[FetchMarketData] Got ATR-14 for ${symbol}: ${atr.value.toFixed(2)}`);
        }
      } catch (atrError: any) {
        console.warn(`[FetchMarketData] Failed to fetch ATR-14 for ${symbol}:`, atrError.message);
      }

      const latency = Date.now() - start;
      await db.logTool(state.runId, "FetchMarketData", { symbol }, { count: normalized.length }, latency);
    } catch (error: any) {
      console.error(`[FetchMarketData] Error for ${symbol}:`, error);
      errors.push(`${symbol}: ${error.message}`);
    }
  }

  return { marketData, fundamentalData, errors: [...state.errors, ...errors] };
}

// Node 2: FetchMacroData
async function fetchMacroData(state: AgentState): Promise<Partial<AgentState>> {
  console.log("[FetchMacroData] Fetching macro indicators");
  try {
    const start = Date.now();
    const series = ["DFF", "UNRATE", "T10Y3M", "CPIAUCSL"]; // Fed Funds, Unemployment, Term Spread, CPI (Inflation)
    const fredSlice = await queue.add(() =>
      pRetry(() => getSeries(series), { retries: 3 })
    );

    const latency = Date.now() - start;
    await db.logTool(state.runId, "FetchMacroData", { series }, fredSlice, latency);

    return { macroData: fredSlice };
  } catch (error: any) {
    console.error("[FetchMacroData] Error:", error);
    return {
      macroData: {},
      errors: [...state.errors, `Macro: ${error.message}`],
    };
  }
}

// Node 3: EngineerFeatures
async function engineerFeatures(state: AgentState): Promise<Partial<AgentState>> {
  console.log("[EngineerFeatures] Computing features");
  const features: Record<string, any> = {};

  for (const symbol of state.symbols) {
    const data = state.marketData[symbol];
    if (!data || !data.contracts) continue;

    const contracts = data.contracts;

    // TODO: Implement proper IV Rank computation (requires IV history)
    const ivRank = Math.random() * 100; // Placeholder

    // Term slope: difference between near-term and far-term IV
    // TODO: Improve with actual term structure computation
    const termSlope = Math.random() * 0.1 - 0.05; // Placeholder

    // Put skew: IV(put) - IV(call) at similar deltas
    // TODO: Compute from actual delta-matched options
    const putSkew = Math.random() * 0.05; // Placeholder

    // Volume/OI ratio
    const totalVolume = contracts.reduce((sum: number, c: any) => sum + (c.volume || 0), 0);
    const totalOI = contracts.reduce((sum: number, c: any) => sum + (c.oi || 0), 0);
    const volumeOIRatio = totalOI > 0 ? totalVolume / totalOI : 0;

    // Macro regime (simple heuristic based on term spread)
    const termSpread = state.macroData["T10Y3M"]?.[0]?.value ?? 0;
    const macroRegime = termSpread < 0 ? "risk_off" : termSpread > 1 ? "risk_on" : "neutral";

    const f = {
      dte: null, // Will be computed per trade
      iv_rank: ivRank,
      term_slope: termSlope,
      put_skew: putSkew,
      volume_oi_ratio: volumeOIRatio,
      macro_regime: macroRegime,
      custom: { total_contracts: contracts.length },
    };

    features[symbol] = f;

    // Persist features
    await db.persistFeatures(state.runId, symbol, state.asof, f);
  }

  return { features };
}

// Node 4: GenerateCandidates
async function generateCandidates(state: AgentState): Promise<Partial<AgentState>> {
  console.log("[GenerateCandidates] Generating IPS-optimized trade ideas");
  const candidates: any[] = [];

  // Get IPS delta preferences - target optimal range 0.12-0.15 for better returns
  let deltaMin = 0.12;
  let deltaMax = 0.15;

  if (state.ipsConfig?.factors) {
    const deltaFactor = state.ipsConfig.factors.find(f =>
      f.factor_key === "delta" || f.factor_key === "delta_max" || f.factor_key === "opt-delta"
    );
    if (deltaFactor && deltaFactor.threshold) {
      // If IPS specifies max delta, use it and calculate optimal min (80% of max)
      deltaMax = Math.abs(deltaFactor.threshold); // e.g., 0.18
      deltaMin = deltaMax * 0.67; // e.g., 0.12 (optimal range for returns)
      console.log(`[GenerateCandidates] Using IPS delta range: ${deltaMin.toFixed(3)} to ${deltaMax.toFixed(3)}`);
    }
  }

  console.log(`[GenerateCandidates] Target delta range: ${deltaMin.toFixed(3)} to ${deltaMax.toFixed(3)}`);

  for (const symbol of state.symbols) {
    const data = state.marketData[symbol];
    if (!data || !data.contracts) continue;

    const contracts = data.contracts;
    const quote = data.quote?.["Global Quote"] || {};
    const currentPrice = parseFloat(quote["05. price"]) || 0;

    if (!currentPrice) continue;

    // Filter for put credit spreads
    const puts = contracts.filter((c: any) => c.option_type === "P" && c.expiry);
    console.log(`[GenerateCandidates] ${symbol}: ${puts.length} puts from ${contracts.length} total contracts`);

    // Group by expiration
    const expirations = [...new Set(puts.map((p: any) => p.expiry))];
    console.log(`[GenerateCandidates] ${symbol}: ${expirations.length} expirations found: ${expirations.slice(0, 3).join(', ')}`);

    for (const expiry of expirations.slice(0, 3)) {
      const expiryPuts = puts.filter((p: any) => p.expiry === expiry);

      console.log(`[GenerateCandidates] ${symbol} expiry ${expiry}: ${expiryPuts.length} puts, sample delta: ${expiryPuts[0]?.delta || 'N/A'}, current price: ${currentPrice}`);

      // Check if deltas are in small scale (< 0.01) - likely need different handling
      const sampleDelta = Math.abs(expiryPuts[0]?.delta || 0);
      const useDeltaFiltering = sampleDelta > 0.01; // Only use delta filtering if values are in normal range

      if (!useDeltaFiltering && sampleDelta > 0) {
        console.log(`[GenerateCandidates] ${symbol} expiry ${expiry}: Delta values too small (${sampleDelta.toFixed(5)}), using moneyness filtering instead`);
      }

      // Filter OTM puts with proper delta ranges
      const otmPuts = expiryPuts
        .filter((p: any) => {
          if (!p.strike || !p.bid || !p.ask) return false;
          if (p.strike >= currentPrice) return false; // Must be OTM

          // Use moneyness-based filtering since deltas are unreliable
          const moneyness = p.strike / currentPrice;
          // For ~0.12-0.15 delta puts, we want strikes around 88-85% of current price
          // Being more generous to get some candidates
          if (moneyness > 0.92 || moneyness < 0.75) {
            return false;
          }

          return true;
        })
        .sort((a: any, b: any) => {
          // Sort by delta (closest to IPS target first) or by moneyness if no delta
          const targetDelta = (deltaMin + deltaMax) / 2;

          const aHasDelta = a.delta != null && a.delta !== undefined;
          const bHasDelta = b.delta != null && b.delta !== undefined;

          if (aHasDelta && bHasDelta) {
            const aDiff = Math.abs(Math.abs(a.delta) - Math.abs(targetDelta));
            const bDiff = Math.abs(Math.abs(b.delta) - Math.abs(targetDelta));
            return aDiff - bDiff;
          } else if (aHasDelta) {
            return -1; // Prefer contracts with delta
          } else if (bHasDelta) {
            return 1;
          } else {
            // Both missing delta - sort by moneyness (closer to 0.86 is better for ~0.13 delta)
            const targetMoneyness = 0.86;
            const aMoneyness = a.strike / currentPrice;
            const bMoneyness = b.strike / currentPrice;
            return Math.abs(aMoneyness - targetMoneyness) - Math.abs(bMoneyness - targetMoneyness);
          }
        });

      console.log(`[GenerateCandidates] ${symbol} expiry ${expiry}: ${otmPuts.length} OTM puts after filtering (need ≥2 for spreads)`);

      if (otmPuts.length < 2) continue;

      // Generate multiple candidates with varying strike selections
      // This creates a range from IPS-optimal (lower delta) to higher return (higher delta)
      const candidatesPerExpiry = Math.min(3, Math.floor(otmPuts.length / 2));

      for (let i = 0; i < candidatesPerExpiry; i++) {
        const shortPutIdx = i * 2; // Spread them out
        const longPutIdx = Math.min(shortPutIdx + 2, otmPuts.length - 1);

        if (shortPutIdx >= otmPuts.length || longPutIdx >= otmPuts.length) break;

        const shortPut = otmPuts[shortPutIdx];
        const longPut = otmPuts[longPutIdx];

        // Validate spread quality
        const width = shortPut.strike - longPut.strike;
        if (width <= 0) continue;

        const entryMid = ((shortPut.bid + shortPut.ask) / 2) - ((longPut.bid + longPut.ask) / 2);
        if (entryMid <= 0) continue;

        const maxProfit = entryMid;
        const maxLoss = width - entryMid;
        const breakeven = shortPut.strike - entryMid;

        const riskRewardRatio = maxProfit / maxLoss;
        if (riskRewardRatio < 0.15) continue;

        // Compute POP from delta
        let estPop = 0.7;
        if (shortPut.delta) {
          estPop = 1 - Math.abs(shortPut.delta);
        }

        candidates.push({
          id: uuidv4(),
          symbol,
          strategy: "put_credit_spread",
          contract_legs: [
            {
              type: "SELL",
              right: "P",
              strike: shortPut.strike,
              expiry: shortPut.expiry,
              delta: shortPut.delta,
              theta: shortPut.theta,
              vega: shortPut.vega,
              iv: shortPut.iv,
              bid: shortPut.bid,
              ask: shortPut.ask,
              oi: shortPut.oi,
              volume: shortPut.volume,
            },
            {
              type: "BUY",
              right: "P",
              strike: longPut.strike,
              expiry: longPut.expiry,
              delta: longPut.delta,
              theta: longPut.theta,
              vega: longPut.vega,
              iv: longPut.iv,
              bid: longPut.bid,
              ask: longPut.ask,
              oi: longPut.oi,
              volume: longPut.volume,
            },
          ],
          entry_mid: entryMid,
          est_pop: estPop,
          breakeven,
          max_loss: maxLoss,
          max_profit: maxProfit,
          guardrail_flags: {},
        });
      }
    }
  }

  console.log(`[GenerateCandidates] Generated ${candidates.length} IPS-optimized candidates`);
  return { candidates };
}

// Node 5: RiskGuardrails
async function riskGuardrails(state: AgentState): Promise<Partial<AgentState>> {
  console.log("[RiskGuardrails] Checking risk flags");
  const candidates = state.candidates.map((c) => ({ ...c }));

  for (const c of candidates) {
    // Initialize detailed_analysis if not exists
    if (!c.detailed_analysis) c.detailed_analysis = {};

    // ENHANCED: Check for earnings in next 10 days with advanced search
    try {
      const tav = await tavilySearch(
        `${c.symbol} earnings date announcement`,
        {
          topic: "news",
          search_depth: "advanced", // Advanced depth for better accuracy
          days: 14, // Look ahead 2 weeks
          max_results: 10, // More results for better coverage
        }
      );
      c.guardrail_flags.earnings_risk = tav.results.some((r: any) =>
        r.snippet.toLowerCase().includes("earnings")
      );
      // Store earnings news for news volume/sentiment analysis
      if (!c.detailed_analysis.news_results) c.detailed_analysis.news_results = [];
      c.detailed_analysis.news_results.push(...tav.results);
    } catch (error) {
      c.guardrail_flags.earnings_risk = false;
    }

    // ENHANCED: Fetch 7-day news for sentiment and volume with advanced search
    try {
      const newsSearch7d = await tavilySearch(
        `${c.symbol} stock news analysis`,
        {
          topic: "news",
          search_depth: "advanced", // Advanced depth for quality
          chunks_per_source: 3, // More context per article
          days: 7,
          max_results: 15 // Keep at 15 for comprehensive coverage
        }
      );
      if (!c.detailed_analysis.news_results) c.detailed_analysis.news_results = [];
      c.detailed_analysis.news_results.push(...newsSearch7d.results);
      c.detailed_analysis.news_count_7d = newsSearch7d.results.length;
      console.log(`[RiskGuardrails] ${c.symbol}: Found ${newsSearch7d.results.length} news articles (7d, advanced)`);
    } catch (error) {
      console.warn(`[RiskGuardrails] Failed to fetch 7-day news for ${c.symbol}:`, error);
      c.detailed_analysis.news_count_7d = 0;
    }

    // ENHANCED: Fetch 90-day news count for z-score baseline with advanced search
    try {
      const newsSearch90d = await tavilySearch(
        `${c.symbol} stock news`,
        {
          topic: "news",
          search_depth: "advanced", // Advanced for better quality
          days: 30, // Tavily max is ~30 days
          max_results: 50
        }
      );
      // Tavily "month" returns ~30 days, so we'll multiply by 3 for an estimate
      // This is an approximation since Tavily doesn't support custom date ranges
      const estimatedCount90d = newsSearch90d.results.length * 3;
      c.detailed_analysis.news_count_90d = estimatedCount90d;
      console.log(`[RiskGuardrails] ${c.symbol}: Estimated 90-day news count: ${estimatedCount90d} (based on ${newsSearch90d.results.length} in 30d, advanced)`);
    } catch (error) {
      console.warn(`[RiskGuardrails] Failed to fetch 90-day news estimate for ${c.symbol}:`, error);
      c.detailed_analysis.news_count_90d = 0;
    }

    // ENHANCED: Check macro events with advanced search
    try {
      const macroSearch = await tavilySearch(
        "FOMC Federal Reserve meeting schedule CPI NFP economic calendar",
        {
          topic: "news",
          search_depth: "advanced", // Advanced for accuracy
          days: 30, // Look ahead 30 days
          max_results: 8 // More results for comprehensive coverage
        }
      );
      c.guardrail_flags.macro_event = macroSearch.results.some((r: any) =>
        r.snippet.toLowerCase().includes("fomc") || r.snippet.toLowerCase().includes("federal reserve")
      );
    } catch (error) {
      c.guardrail_flags.macro_event = false;
    }
  }

  return { candidates };
}

// Node 5.5: DeepReasoning - Multi-phase analysis with IPS validation and historical context
async function deepReasoning(state: AgentState): Promise<Partial<AgentState>> {
  console.log("[DeepReasoning] Running comprehensive analysis on candidates");

  if (!state.ipsConfig) {
    console.warn("[DeepReasoning] No IPS config loaded, skipping deep analysis");
    return {};
  }

  const reasoningChains: Record<string, any> = {};
  const ipsCompliance: Record<string, any> = {};
  const historicalContext: Record<string, any> = {};
  const researchSynthesis: Record<string, any> = {};

  for (const candidate of state.candidates) {
    try {
      const features = state.features[candidate.symbol] || {};

      // Build complete reasoning chain for this candidate
      const chain = await buildReasoningChain(
        candidate,
        features,
        state.ipsConfig,
        state.macroData
      );

      // Store in state
      const key = `${candidate.symbol}_${candidate.strategy}`;
      reasoningChains[key] = chain;
      ipsCompliance[key] = chain.ips_compliance;
      historicalContext[key] = chain.historical_context;
      researchSynthesis[key] = chain.market_factors;

      // Attach reasoning to candidate for downstream use
      candidate.reasoning_chain = chain;
      candidate.ips_baseline_score = chain.ips_baseline_score;
      candidate.adjusted_score = chain.adjusted_score;
      candidate.recommendation = chain.recommendation;

      console.log(
        `[DeepReasoning] ${candidate.symbol}: IPS baseline=${chain.ips_baseline_score.toFixed(1)}, adjusted=${chain.adjusted_score.toFixed(1)}, rec=${chain.recommendation}`
      );
    } catch (error: any) {
      console.error(`[DeepReasoning] Error analyzing ${candidate.symbol}:`, error.message);
      candidate.reasoning_chain = {
        error: error.message,
        ips_baseline_score: 50,
        adjusted_score: 50,
        recommendation: "REVIEW",
      };
    }
  }

  return {
    candidates: state.candidates,
    reasoningChains,
    ipsCompliance,
    historicalContext,
    researchSynthesis,
  };
}

// Helper: Extract real factor values from actual data sources
function extractRealFactorValue(
  factorKey: string,
  candidate: any,
  features: any,
  fundamentalData: any,
  marketData: any,
  macroData?: any
): number | null {
  const shortLeg = candidate.contract_legs?.find((l: any) => l.type === "SELL");

  switch (factorKey) {
    // Delta factors
    case "delta":
    case "delta_max":
    case "opt-delta":
      return shortLeg?.delta ? Math.abs(shortLeg.delta) : null;

    // IV Rank
    case "iv_rank":
    case "opt-iv-rank":
      // Calculate IV rank from options chain
      const contracts = marketData?.contracts || [];
      const ivValues = contracts.map((c: any) => c.iv).filter((v: any) => v != null);
      if (ivValues.length < 10) return null;
      ivValues.sort((a: number, b: number) => a - b);
      const currentIV = shortLeg?.iv;
      if (!currentIV) return null;
      const rank = ivValues.filter((v: number) => v <= currentIV).length / ivValues.length;
      return rank * 100; // Convert to percentile

    // Greeks
    case "theta":
    case "opt-theta":
      return shortLeg?.theta ? parseFloat(shortLeg.theta) : null;

    case "vega":
    case "opt-vega":
      return shortLeg?.vega ? parseFloat(shortLeg.vega) : null;

    // Open Interest
    case "open_interest":
    case "opt-open-interest":
      return shortLeg?.oi ? parseInt(shortLeg.oi) : null;

    // Bid-Ask Spread
    case "bid_ask_spread":
    case "opt-bid-ask-spread":
      if (shortLeg?.bid && shortLeg?.ask) {
        return Math.abs(shortLeg.ask - shortLeg.bid);
      }
      return null;

    // IV / Implied Volatility
    case "iv":
    case "opt-iv":
    case "implied_volatility":
      return shortLeg?.iv ? parseFloat(shortLeg.iv) : null;

    // Market Cap
    case "market_cap":
    case "market_cap_category":
    case "calc-market-cap-category":
      const mcStr = fundamentalData?.MarketCapitalization;
      return mcStr ? parseFloat(mcStr) : null;

    // P/E Ratio
    case "pe_ratio":
      const peStr = fundamentalData?.PERatio;
      return peStr ? parseFloat(peStr) : null;

    // Beta
    case "beta":
      const betaStr = fundamentalData?.Beta;
      return betaStr ? parseFloat(betaStr) : null;

    // Analyst Rating
    case "analyst_target_price":
    case "analyst_rating":
    case "tavily-analyst-rating-avg":
      const targetStr = fundamentalData?.AnalystTargetPrice;
      return targetStr ? parseFloat(targetStr) : null;

    // Momentum (50-day MA)
    case "momentum":
    case "momentum_50d":
    case "50_day_moving_average":
    case "av-50-day-ma":
    case "av-mom":
      const price = marketData?.quote?.["Global Quote"]?.["05. price"];
      const ma50Str = fundamentalData?.["50DayMovingAverage"];
      if (price && ma50Str) {
        const ma50 = parseFloat(ma50Str);
        const current = parseFloat(price);
        return ((current - ma50) / ma50) * 100;
      }
      return null;

    // 200-day MA
    case "momentum_200d":
    case "200_day_moving_average":
    case "av-200-day-ma":
      const price200 = marketData?.quote?.["Global Quote"]?.["05. price"];
      const ma200Str = fundamentalData?.["200DayMovingAverage"];
      if (price200 && ma200Str) {
        const ma200 = parseFloat(ma200Str);
        const current200 = parseFloat(price200);
        return ((current200 - ma200) / ma200) * 100;
      }
      return null;

    // 52-week position
    case "week_52_position":
    case "52w_range_position":
    case "calc-52w-range-position":
      const currentPrice = marketData?.quote?.["Global Quote"]?.["05. price"];
      const high52 = fundamentalData?.["52WeekHigh"];
      const low52 = fundamentalData?.["52WeekLow"];
      if (currentPrice && high52 && low52) {
        const current = parseFloat(currentPrice);
        const high = parseFloat(high52);
        const low = parseFloat(low52);
        return ((current - low) / (high - low)) * 100;
      }
      return null;

    // Distance from 52-week high
    case "distance_from_52w_high":
    case "calc-dist-52w-high":
      const currentPrice2 = marketData?.quote?.["Global Quote"]?.["05. price"];
      const high522 = fundamentalData?.["52WeekHigh"];
      if (currentPrice2 && high522) {
        const current = parseFloat(currentPrice2);
        const high = parseFloat(high522);
        return ((high - current) / high) * 100;
      }
      return null;

    // Sentiment Score
    case "sentiment_score":
    case "news_sentiment_score":
    case "tavily-news-sentiment-score":
      // Extract from Tavily news results
      const newsResults = candidate.detailed_analysis?.news_results || [];
      if (newsResults.length === 0) return 0.5; // Neutral default

      let positiveCount = 0;
      let negativeCount = 0;
      newsResults.forEach((article: any) => {
        const text = (article.title + ' ' + (article.snippet || article.content || '')).toLowerCase();
        if (text.match(/bullish|upgrade|beat|strong|growth|positive|outperform/)) positiveCount++;
        if (text.match(/bearish|downgrade|miss|weak|decline|negative|underperform|concern/)) negativeCount++;
      });

      const total = positiveCount + negativeCount;
      if (total === 0) return 0.5; // Neutral
      return (positiveCount / total);

    // News Volume
    case "news_volume":
    case "tavily-news-volume":
      const newsCount = candidate.detailed_analysis?.news_results?.length || 0;
      return newsCount;

    // Put/Call Ratios
    case "put_call_ratio":
    case "opt-put-call-ratio":
      // Calculate from options volume
      const allContracts = marketData?.contracts || [];
      const putVolume = allContracts
        .filter((c: any) => c.option_type === "P")
        .reduce((sum: number, c: any) => sum + (c.volume || 0), 0);
      const callVolume = allContracts
        .filter((c: any) => c.option_type === "C")
        .reduce((sum: number, c: any) => sum + (c.volume || 0), 0);
      return callVolume > 0 ? putVolume / callVolume : null;

    case "calc-put-call-oi-ratio":
      // Calculate from open interest
      const allContractsOI = marketData?.contracts || [];
      const putOI = allContractsOI
        .filter((c: any) => c.option_type === "P")
        .reduce((sum: number, c: any) => sum + (c.oi || 0), 0);
      const callOI = allContractsOI
        .filter((c: any) => c.option_type === "C")
        .reduce((sum: number, c: any) => sum + (c.oi || 0), 0);
      return callOI > 0 ? putOI / callOI : null;

    // IV Percentile
    case "iv_percentile":
    case "calc-iv-percentile":
      // Calculate IV percentile from options chain (same as IV rank)
      const contractsForIVP = marketData?.contracts || [];
      const ivValuesForPercentile = contractsForIVP.map((c: any) => c.iv).filter((v: any) => v != null);
      if (ivValuesForPercentile.length < 10) return null;
      ivValuesForPercentile.sort((a: number, b: number) => a - b);
      const currentIVForPercentile = shortLeg?.iv;
      if (!currentIVForPercentile) return null;
      const percentile = ivValuesForPercentile.filter((v: number) => v <= currentIVForPercentile).length / ivValuesForPercentile.length;
      return percentile * 100; // Convert to percentile

    // Social Media Sentiment
    case "social_sentiment":
    case "tavily-social-sentiment":
      // Use same sentiment analysis as news for now
      const socialResults = candidate.detailed_analysis?.news_results || [];
      if (socialResults.length === 0) return 0; // Neutral default

      let socialPositive = 0;
      let socialNegative = 0;
      socialResults.forEach((article: any) => {
        const text = (article.title + ' ' + (article.snippet || article.content || '')).toLowerCase();
        if (text.match(/bullish|upgrade|beat|strong|growth|positive|outperform/)) socialPositive++;
        if (text.match(/bearish|downgrade|miss|weak|decline|negative|underperform|concern/)) socialNegative++;
      });

      const socialTotal = socialPositive + socialNegative;
      if (socialTotal === 0) return 0; // Neutral
      // Return a sentiment score from -1 to 1, then convert to 0-2 range for threshold comparison
      const sentimentScore = (socialPositive - socialNegative) / socialTotal;
      return sentimentScore; // Range: -1 (very bearish) to 1 (very bullish), 0 is neutral

    // Inflation Rate (Year-over-Year CPI change as percentage)
    case "inflation_rate":
    case "av-inflation":
      const cpiData = macroData?.["CPIAUCSL"];
      if (!cpiData || cpiData.length < 13) return null; // Need at least 13 months for YoY
      const currentCPI = cpiData[0]?.value; // Most recent
      const yearAgoCPI = cpiData[12]?.value; // 12 months ago
      if (!currentCPI || !yearAgoCPI) return null;
      // Calculate YoY inflation rate as percentage
      return ((currentCPI - yearAgoCPI) / yearAgoCPI) * 100;

    default:
      // Fallback to features for unmatched keys
      return features[factorKey] ?? null;
  }
}

function evaluateFactorScore(
  direction: string | null | undefined,
  value: number,
  threshold?: number | null,
  thresholdMax?: number | null
): { score: number; met: boolean } {
  const clampScore = (v: number) => {
    if (!Number.isFinite(v)) return 0;
    return Math.max(0, Math.min(100, v));
  };

  const tv = threshold != null ? Number(threshold) : null;
  const tvMax = thresholdMax != null ? Number(thresholdMax) : null;
  const val = Number(value);

  switch (direction) {
    case "gte":
    case "gt": {
      if (tv == null) return { score: 0, met: false };
      if (val >= tv) {
        const base = Math.abs(tv) > 0 ? Math.abs(tv) : 1;
        const excessRatio = (val - tv) / base;
        return { score: clampScore(70 + excessRatio * 30), met: true };
      }
      const ratio = tv === 0 ? 0 : val / tv;
      return { score: clampScore(ratio * 100), met: false };
    }
    case "lte":
    case "lt": {
      if (tv == null) return { score: 0, met: false };
      if (val <= tv) {
        const base = Math.abs(tv) > 0 ? Math.abs(tv) : 1;
        const savings = (tv - val) / base;
        return { score: clampScore(70 + savings * 30), met: true };
      }
      const base = Math.abs(tv) > 0 ? Math.abs(tv) : 1;
      const excess = (val - tv) / base;
      return { score: clampScore(70 - excess * 70), met: false };
    }
    case "range":
    case "between": {
      if (tv == null || tvMax == null) return { score: 0, met: false };
      if (val >= tv && val <= tvMax) {
        const rangeSize = tvMax - tv;
        if (rangeSize === 0) return { score: 100, met: true };
        const position = (val - tv) / rangeSize;
        const distanceFromCenter = Math.abs(position - 0.5);
        return { score: clampScore(70 + (1 - distanceFromCenter * 2) * 30), met: true };
      }
      const boundsWidth = Math.abs(tvMax - tv) || 1;
      const distance = val < tv ? tv - val : val - tvMax;
      return { score: clampScore(70 - (distance / boundsWidth) * 70), met: false };
    }
    case "eq":
    case "equals": {
      if (tv == null) return { score: 0, met: false };
      const denom = Math.abs(tv) > 0 ? Math.abs(tv) : Math.max(Math.abs(val), 1);
      const relErr = Math.abs(val - tv) / denom;
      if (relErr <= 0.05) return { score: 100, met: true };
      if (relErr <= 0.1) return { score: 90, met: false };
      if (relErr <= 0.2) return { score: 75, met: false };
      if (relErr <= 0.5) return { score: clampScore(50), met: false };
      return { score: clampScore(50 - relErr * 50), met: false };
    }
    default: {
      if (tv != null) {
        const denom = Math.abs(tv) > 0 ? Math.abs(tv) : Math.max(Math.abs(val), 1);
        const relErr = Math.abs(val - tv) / denom;
        const baseScore = relErr <= 0.1 ? 80 : relErr <= 0.2 ? 65 : Math.max(35, 65 - relErr * 45);
        return { score: clampScore(baseScore), met: relErr <= 0.1 };
      }
      return { score: 50, met: false };
    }
  }
}

// Node 6: ScoreIPS
async function scoreIPS(state: AgentState): Promise<Partial<AgentState>> {
  console.log("[ScoreIPS] Scoring trades with IPS:", state.ipsConfig?.name || "default");
  const scores: any[] = [];

  for (const c of state.candidates) {
    let scorePercent = 50;
    let breakdown: Record<string, any> = {};

    if (c.reasoning_chain && c.adjusted_score != null) {
      scorePercent = c.adjusted_score;
      breakdown = {
        ips_baseline: c.ips_baseline_score,
        adjusted: c.adjusted_score,
        historical_influence: c.reasoning_chain.historical_context?.has_data ? "applied" : "none",
        market_adjustments: c.reasoning_chain.threshold_adjustments?.length || 0,
        recommendation: c.recommendation,
      };

      if (c.reasoning_chain.ips_compliance?.factor_scores) {
        breakdown.ips_factors = c.reasoning_chain.ips_compliance.factor_scores;
      }
    } else {
      const features = state.features[c.symbol] || {};
      const { scoreAgainstIPS } = await import("@/lib/ips/scorer");

      let score = 0.5;
      if (state.ipsConfig && state.ipsConfig.factors && state.ipsConfig.factors.length > 0) {
        const result = scoreAgainstIPS(state.ipsConfig, features);
        score = result.alignment;
        breakdown = result.breakdown;
      } else {
        score = ((features.iv_rank || 0.5) * 0.5 + 0.25);
      }

      scorePercent = score * 100;

      if (c.guardrail_flags?.earnings_risk) scorePercent -= 15;
      if (c.guardrail_flags?.macro_event) scorePercent -= 10;

      const riskReward = c.max_profit / (c.max_loss || 1);
      scorePercent += riskReward * 5;
      scorePercent = Math.max(0, Math.min(100, scorePercent));

      breakdown.risk_reward = riskReward;
      breakdown.guardrails = c.guardrail_flags;
    }

    breakdown.risk_reward = c.max_profit / (c.max_loss || 1);
    breakdown.guardrails = c.guardrail_flags;

    if (!c.detailed_analysis) c.detailed_analysis = {};
    const factorDetails: any[] = [];
    c.detailed_analysis.ips_name = state.ipsConfig?.name || "Unknown IPS";

    const fundamentals = state.fundamentalData?.[c.symbol];
    if (fundamentals) {
      c.detailed_analysis.api_data = {
        company_name: fundamentals.Name || c.symbol,
        sector: fundamentals.Sector || "N/A",
        industry: fundamentals.Industry || "N/A",
        market_cap: fundamentals.MarketCapitalization || "N/A",
        pe_ratio: fundamentals.PERatio || "N/A",
        beta: fundamentals.Beta || "N/A",
        eps: fundamentals.EPS || "N/A",
        dividend_yield: fundamentals.DividendYield || "N/A",
        profit_margin: fundamentals.ProfitMargin || "N/A",
        roe: fundamentals.ReturnOnEquityTTM || "N/A",
        week52_high: fundamentals["52WeekHigh"] || "N/A",
        week52_low: fundamentals["52WeekLow"] || "N/A",
        analyst_target: fundamentals.AnalystTargetPrice || "N/A",
      };
      console.log(`[ScoreIPS] Added API data for ${c.symbol}: PE=${fundamentals.PERatio}, Beta=${fundamentals.Beta}`);
    } else {
      c.detailed_analysis.api_data = null;
      console.log(`[ScoreIPS] No fundamental data available for ${c.symbol}`);
    }

    if (state.ipsConfig && state.ipsConfig.factors) {
      console.log(`[ScoreIPS] Building IPS factors for ${c.symbol}, have ${state.ipsConfig.factors.length} IPS factors`);
      const features = state.features[c.symbol] || {};

      const parseNumeric = (value: any): number | null => {
        if (value === null || value === undefined) return null;
        if (typeof value === "number") return Number.isFinite(value) ? value : null;
        if (typeof value === "string") {
          const cleaned = value.replace(/[%,$]/g, "").trim();
          if (!cleaned) return null;
          const parsed = Number(cleaned);
          return Number.isFinite(parsed) ? parsed : null;
        }
        return null;
      };

      let totalWeight = 0;
      let weightedContribution = 0;
      let weightPassed = 0;
      let factorsPassed = 0;
      let evaluatedWeight = 0;
      let factorsEvaluated = 0;

      for (const ipsFactor of state.ipsConfig.factors) {
        const factorKey = ipsFactor.factor_key;
        const factorName = ipsFactor.display_name || factorKey;
        const weight = ipsFactor.weight || 0;
        const threshold = ipsFactor.threshold;
        const thresholdMax = ipsFactor.threshold_max;
        const direction = ipsFactor.direction;

        totalWeight += weight;

        console.log(`[ScoreIPS] Processing factor: ${factorName}, key: ${factorKey}, threshold: ${threshold}, threshold_max: ${thresholdMax}, direction: ${direction}`);

        let actualValue: any = extractRealFactorValue(
          factorKey,
          c,
          features,
          state.fundamentalData?.[c.symbol],
          state.marketData?.[c.symbol],
          state.macroData
        );

        console.log(`[ScoreIPS] ${factorName} (${factorKey}): extracted value = ${actualValue}`);

        if (actualValue == null && c.reasoning_chain?.ips_compliance?.factor_scores?.[factorKey]) {
          actualValue = c.reasoning_chain.ips_compliance.factor_scores[factorKey].value;
          console.log(`[ScoreIPS] ${factorName}: used reasoning chain fallback = ${actualValue}`);
        }

        const numericValue = parseNumeric(actualValue);
        const hasThreshold = threshold !== null && threshold !== undefined;
        const hasThresholdMax = thresholdMax !== null && thresholdMax !== undefined;

        let factorScore = 0;
        let met = false;

        if (numericValue != null && hasThreshold) {
          const evaluation = evaluateFactorScore(direction ?? null, numericValue, threshold ?? null, thresholdMax ?? null);
          factorScore = evaluation.score;
          met = evaluation.met;
          weightedContribution += (factorScore / 100) * weight;
          evaluatedWeight += weight;
          factorsEvaluated += 1;
          if (met) {
            weightPassed += weight;
            factorsPassed += 1;
          }
        } else if (numericValue != null && !hasThreshold) {
          factorScore = 50;
          weightedContribution += (factorScore / 100) * weight;
          evaluatedWeight += weight;
          factorsEvaluated += 1;
        }

        let status: "pass" | "fail" | "warning" = "warning";
        if (!hasThreshold) {
          status = "warning";
        } else if (numericValue == null) {
          status = "fail";
        } else {
          status = met ? "pass" : "fail";
        }

        const targetDisplay = hasThreshold
          ? direction === "range" && hasThresholdMax
            ? `${threshold} to ${thresholdMax}`
            : direction === "gte"
              ? `>= ${threshold}`
              : direction === "lte"
                ? `<= ${threshold}`
                : `= ${threshold}`
          : "N/A";

        const actualDisplay =
          actualValue !== null && actualValue !== undefined
            ? typeof actualValue === "number"
              ? actualValue.toFixed(2)
              : String(actualValue)
            : "N/A";

        factorDetails.push({
          name: factorName,
          factor_key: factorKey,
          target: targetDisplay,
          actual: actualDisplay,
          weight: (weight * 100).toFixed(0) + "%",
          status,
          score: factorScore.toFixed(1),
        });
      }

      console.log(`[ScoreIPS] Built ${factorDetails.length} factor comparisons for ${c.symbol}`);

      const ipsFitPercent = totalWeight > 0 ? (weightedContribution / totalWeight) * 100 : 0;
      scorePercent = Math.max(0, Math.min(100, ipsFitPercent));

      breakdown.ips_fit = scorePercent;
      breakdown.factors_passed = factorsPassed;
      breakdown.total_factors = factorDetails.length;
      breakdown.weight_passed = weightPassed;
      breakdown.total_weight = totalWeight;
      breakdown.weighted_sum = weightedContribution;
      breakdown.weight_evaluated = evaluatedWeight;
      breakdown.weight_missing = Math.max(totalWeight - evaluatedWeight, 0);
      breakdown.factors_evaluated = factorsEvaluated;
      breakdown.factor_scores = factorDetails.map((detail) => ({
        factor: detail.factor_key || detail.name,
        score: Number(detail.score),
        status: detail.status,
        weight: detail.weight,
      }));

      c.detailed_analysis.ips_factors = factorDetails;
    } else if (c.reasoning_chain?.ips_compliance?.factor_scores) {
      for (const [factorName, factorData] of Object.entries(c.reasoning_chain.ips_compliance.factor_scores)) {
        if (typeof factorData === "object" && "value" in factorData) {
          factorDetails.push({
            name: factorName,
            target: factorData.target || "see IPS",
            actual: typeof factorData.value === "number" ? factorData.value.toFixed(2) : String(factorData.value),
            status: factorData.pass ? "pass" : "fail",
          });
        }
      }

      if (c.reasoning_chain.ips_compliance.violations?.length > 0) {
        c.detailed_analysis.ips_violations = c.reasoning_chain.ips_compliance.violations;
      }
      if (c.reasoning_chain.ips_compliance.passes?.length > 0) {
        c.detailed_analysis.ips_passes = c.reasoning_chain.ips_compliance.passes;
      }

      c.detailed_analysis.ips_factors = factorDetails;
    } else {
      for (const [factorName, weightData] of Object.entries(breakdown)) {
        if (factorName === "risk_reward" || factorName === "guardrails") continue;
        if (typeof weightData === "object" && "value" in weightData && weightData.value !== undefined) {
          const value = weightData.value;
          const status = value >= 60 ? "pass" : value >= 40 ? "warning" : "fail";
          factorDetails.push({
            name: factorName,
            target: "> 60 (preferred)",
            actual: value.toFixed(1),
            status,
            score: value.toFixed(1),
          });
        }
      }

      c.detailed_analysis.ips_factors = factorDetails;
    }

    scorePercent = Math.max(0, Math.min(100, scorePercent));

    // Enhanced PCS Trade Evaluation (ChatGPT Framework)
    if (c.strategy === "put_credit_spread") {
      try {
        const shortLeg = c.contract_legs?.find((l: any) => l.type === "SELL");
        const longLeg = c.contract_legs?.find((l: any) => l.type === "BUY");
        const quote = state.marketData?.[c.symbol]?.quote?.["Global Quote"];
        const currentPrice = quote ? parseFloat(quote["05. price"]) : null;

        if (shortLeg && longLeg && currentPrice) {
          // Calculate DTE
          const expDate = new Date(shortLeg.expiry);
          const now = new Date();
          const dte = Math.ceil((expDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

          // Build PCS candidate for enhanced evaluation
          const marketDataForSymbol = state.marketData?.[c.symbol];
          const pcsCandidate: PCSCandidate = {
            symbol: c.symbol,
            shortStrike: shortLeg.strike,
            longStrike: longLeg.strike,
            credit: c.entry_mid || 0,
            width: shortLeg.strike - longLeg.strike,
            dte,
            currentPrice,
            shortDelta: shortLeg.delta ? Math.abs(shortLeg.delta) : undefined,
            shortTheta: shortLeg.theta || undefined,
            shortVega: shortLeg.vega || undefined,
            ivRank: breakdown.iv_rank?.value || state.features?.[c.symbol]?.iv_rank || undefined,
            bidAskSpread: shortLeg.bid && shortLeg.ask ? Math.abs(shortLeg.ask - shortLeg.bid) : undefined,
            openInterest: shortLeg.oi || undefined,
            newsCount7d: c.detailed_analysis?.news_count_7d || undefined,
            newsCount90d: c.detailed_analysis?.news_count_90d || undefined,
            price5dAgo: marketDataForSymbol?.price5dAgo || undefined,
            atr14: marketDataForSymbol?.atr14 || undefined,
            supportLevel: undefined, // TODO: Add support level from TA
          };

          // Run enhanced evaluation
          const pcsEval = evaluatePCSTrade(pcsCandidate);

          // Store enhanced evaluation in detailed_analysis
          if (!c.detailed_analysis) c.detailed_analysis = {};
          c.detailed_analysis.pcs_evaluation = {
            decision: pcsEval.decision,
            score: pcsEval.score,
            hard_gates: pcsEval.hardGates,
            strengths: pcsEval.strengths,
            concerns: pcsEval.concerns,
            fixes: pcsEval.fixes,
            management: pcsEval.management,
            formatted_output: formatEvaluation(pcsEval),
          };

          console.log(`[ScoreIPS] Enhanced PCS evaluation for ${c.symbol}: ${pcsEval.decision} (score: ${pcsEval.score})`);

          // Optionally adjust score based on PCS evaluation
          // If hard gates fail, significantly reduce score
          if (pcsEval.hardGates.creditToWidth === 'FAIL' ||
              pcsEval.hardGates.newsZScore === 'FAIL' ||
              pcsEval.hardGates.liquidity === 'FAIL') {
            scorePercent = Math.min(scorePercent, 40); // Cap at 40 if hard gates fail
            console.log(`[ScoreIPS] ${c.symbol}: Hard gate failure, capped score at 40`);
          }

          // Store enhanced score
          c.pcs_enhanced_score = pcsEval.score;
        }
      } catch (error: any) {
        console.warn(`[ScoreIPS] Enhanced PCS evaluation failed for ${c.symbol}:`, error.message);
      }
    }

    const scoreObj = {
      symbol: c.symbol,
      strategy: c.strategy,
      score: scorePercent,
      breakdown,
      version: state.ipsConfig ? "ips_v1" : "default_v1",
    };

    scores.push(scoreObj);
    await db.persistScore(state.runId, scoreObj);

    c.score = scorePercent;
  }

  return { scores, candidates: state.candidates };
}
// Node 7: LLM_Rationale
async function llmRationale(state: AgentState): Promise<Partial<AgentState>> {
  console.log("[LLM_Rationale] Generating rationales");
  const candidates = state.candidates.map((c) => ({ ...c }));

  for (const c of candidates) {
    try {
      // ENHANCED: Use advanced depth search with more results for better signal quality
      const res = await tavilySearch(
        `${c.symbol} stock news analysis outlook`,
        {
          topic: "news",
          search_depth: "advanced", // Use advanced depth (2 credits vs 1 credit)
          chunks_per_source: 3, // Get more context per article
          days: 7, // Last 7 days
          max_results: 12 // Increase from 3 to 12 for better coverage
        }
      );

      // Store news results in detailed_analysis
      if (!c.detailed_analysis) c.detailed_analysis = {};

      if (res.error) {
        console.warn(`[LLM_Rationale] Tavily search failed for ${c.symbol}: ${res.error}`);
        c.detailed_analysis.tavily_error = res.error;
        c.detailed_analysis.news_results = [];
      } else {
        // Sort by score and filter for quality (score >= 0.6)
        const qualityResults = (res.results || [])
          .filter((r: any) => (r.score || 0) >= 0.6)
          .sort((a: any, b: any) => (b.score || 0) - (a.score || 0));

        c.detailed_analysis.news_results = qualityResults.map((r: any) => ({
          title: r.title || "No title",
          snippet: r.snippet || "",
          url: r.url || "",
          published_at: r.publishedAt || null,
          score: r.score || 0,
        }));
        c.detailed_analysis.tavily_error = null;
        console.log(`[LLM_Rationale] Found ${qualityResults.length} high-quality articles for ${c.symbol} (advanced search)`);
      }

      const newsContext = res.results
        .map((r: any) => r.snippet)
        .join(" | ");

      const features = state.features[c.symbol] || {};
      const scoreData = state.scores.find(
        (s) => s.symbol === c.symbol && s.strategy === c.strategy
      );

      const ipsName = state.ipsConfig?.name || "default";
      const breakdown = scoreData?.breakdown || {};

      // Build factor highlights
      const factorHighlights: string[] = [];
      if (breakdown.iv_rank !== undefined) {
        const ivr = breakdown.iv_rank.value || features.iv_rank || 0;
        if (ivr > 70) factorHighlights.push(`high IV rank (${ivr.toFixed(0)})`);
        else if (ivr < 30) factorHighlights.push(`low IV rank (${ivr.toFixed(0)})`);
      }
      if (breakdown.risk_reward !== undefined) {
        const rr = breakdown.risk_reward;
        if (rr > 0.4) factorHighlights.push("favorable risk/reward");
        else if (rr < 0.2) factorHighlights.push("limited risk/reward");
      }
      if (c.guardrail_flags?.earnings_risk) {
        factorHighlights.push("earnings risk detected");
      }

      // Calculate IPS fit percentage
      const ipsScore = scoreData?.score || 0;
      const ipsFitPct = Math.round(ipsScore);

      const prompt = `You are presenting trade analysis data to a trader. Be direct and data-focused, not conversational.

Trade: ${c.symbol} ${c.strategy.replace(/_/g, " ")}
IPS Fit: ${ipsFitPct}% match to "${ipsName}" strategy
Entry: $${c.entry_mid?.toFixed(2)} | Max P: $${c.max_profit?.toFixed(2)} | Max L: $${c.max_loss?.toFixed(2)} | POP: ${((c.est_pop || 0) * 100).toFixed(0)}%
Key Factors: ${factorHighlights.join(", ")}
Recent News: ${newsContext || "No significant recent news"}

Write a concise 2-3 sentence analysis in this style:
"This trade is [IPS fit description]. [News sentiment]. [Key consideration]."

Example format:
"This trade is 95% aligned with your IPS criteria and benefits from high IV rank. Recent news mentions positive earnings outlook. The main risk is the elevated delta at 0.35."

Be factual and direct. Reference the actual data (IPS fit %, news sentiment, specific metrics).`;

      // Use shortSummary function for consistent, data-driven rationale
      const { shortSummary } = await import("@/lib/ips/scorer");

      const newsSignal = res.results && res.results.length > 0
        ? (res.results.some((r: any) => r.snippet && (r.snippet.toLowerCase().includes("positive") || r.snippet.toLowerCase().includes("beat"))) ? "positive" : "neutral")
        : "neutral";

      const riskNote = c.guardrail_flags?.earnings_risk ? "earnings event upcoming" :
                      c.guardrail_flags?.macro_event ? "FOMC event risk" :
                      undefined;

      // If enhanced PCS evaluation exists, use it as the primary rationale
      if (c.detailed_analysis?.pcs_evaluation?.formatted_output) {
        c.rationale = c.detailed_analysis.pcs_evaluation.formatted_output;
        console.log(`[LLM_Rationale] Using enhanced PCS evaluation for ${c.symbol}`);
      } else {
        c.rationale = shortSummary(c.symbol, ipsScore / 100, features, newsSignal, riskNote);
      }

      // Add news summary to detailed analysis
      if (!c.detailed_analysis) c.detailed_analysis = {};
      if (res.results && res.results.length > 0) {
        const newsItems = res.results
          .slice(0, 3)
          .filter((r: any) => r && r.title && r.snippet) // Filter out undefined items
          .map((r: any) => `${r.title}: ${r.snippet}`);

        if (newsItems.length > 0) {
          c.detailed_analysis.news_summary = newsItems.join(" • ");
        } else {
          c.detailed_analysis.news_summary = "No significant news found for this symbol in the past week.";
        }
      } else {
        c.detailed_analysis.news_summary = "No significant news found for this symbol in the past week.";
      }

      // Add macro context from state
      const macroData = state.macroData;
      if (macroData && Object.keys(macroData).length > 0) {
        const macroSummary: string[] = [];
        if (macroData.DFF && macroData.DFF.length > 0) {
          const latest = macroData.DFF[macroData.DFF.length - 1];
          macroSummary.push(`Fed Funds Rate: ${latest.value}%`);
        }
        if (macroData.UNRATE && macroData.UNRATE.length > 0) {
          const latest = macroData.UNRATE[macroData.UNRATE.length - 1];
          macroSummary.push(`Unemployment: ${latest.value}%`);
        }
        if (macroData.T10Y3M && macroData.T10Y3M.length > 0) {
          const latest = macroData.T10Y3M[macroData.T10Y3M.length - 1];
          macroSummary.push(`Term Spread: ${latest.value}%`);
        }
        c.detailed_analysis.macro_context = macroSummary.join(" | ");
      }

      // Check if trade is out of IPS (score < 60) and generate justification
      if (ipsScore < 60) {
        const keyConcerns = factorHighlights.filter((h) => h.includes("low") || h.includes("limited") || h.includes("risk")).join(", ") || "standard spread risk";

        const justificationPrompt = `As a professional options trader, provide a 2-3 sentence assessment of this ${c.symbol} ${c.strategy.replace(/_/g, " ")} trade scoring ${ipsFitPct}% on IPS criteria.

Key concerns: ${keyConcerns}

Address:
1. Why this trade may still offer value despite the lower score
2. The specific edge or opportunity present
3. Ideal market conditions for this setup

Be direct and honest about risk/reward. Do not include your reasoning process - provide only the final professional assessment.`;

        try {
          const justification = await rationaleLLM(justificationPrompt);
          c.detailed_analysis.out_of_ips_justification = justification;
        } catch (error) {
          c.detailed_analysis.out_of_ips_justification = "Unable to generate justification for out-of-IPS trade.";
        }
      }

    } catch (error) {
      c.rationale = "Analysis pending";
    }
  }

  return { candidates };
}

// Node 8: SelectTopK
async function selectTopK(state: AgentState): Promise<Partial<AgentState>> {
  console.log(`[SelectTopK] Selecting top trades`);

  const PERFECT_THRESHOLD = 99.9;

  const annotated = state.candidates.map((candidate: any) => {
    const scoreRecord = state.scores.find(
      (s) => s.symbol === candidate.symbol && s.strategy === candidate.strategy
    );
    const ipsScore = scoreRecord?.score ?? candidate.score ?? 0;
    const breakdown: any = scoreRecord?.breakdown ?? {};

    const maxProfit = Number(candidate.max_profit ?? 0) || 0;
    const rawMaxLoss = Number(candidate.max_loss ?? 0) || 0;
    const riskReward = rawMaxLoss > 0 ? maxProfit / rawMaxLoss : 0;
    const normalizedReturn = Number.isFinite(riskReward) && riskReward > 0 ? Math.min(riskReward * 100, 300) : 0;
    const weightMissing = typeof breakdown.weight_missing === 'number' ? breakdown.weight_missing : 0;
    const composite = ipsScore * 0.7 + normalizedReturn * 0.3 - weightMissing * 100;

    const factorScores = Array.isArray(breakdown?.factor_scores) ? breakdown.factor_scores : [];
    const failingFactors = factorScores
      .filter((f: any) => f && f.status === 'fail')
      .sort((a: any, b: any) => {
        const aWeight = parseFloat(String(a?.weight ?? '').replace('%', '')) || 0;
        const bWeight = parseFloat(String(b?.weight ?? '').replace('%', '')) || 0;
        return bWeight - aWeight;
      })
      .map((f: any) => f?.name || f?.factor || f?.factor_key)
      .filter(Boolean);

    return {
      ...candidate,
      score: ipsScore,
      __selection: {
        alignment: ipsScore,
        riskReward: Number.isFinite(riskReward) && riskReward > 0 ? riskReward : 0,
        composite,
        weightMissing,
        failingFactors,
      },
    };
  });

  const perfectMatches = annotated.filter((c: any) => c.__selection.alignment >= PERFECT_THRESHOLD);
  const remainder = annotated.filter((c: any) => c.__selection.alignment < PERFECT_THRESHOLD);

  console.log(`[SelectTopK] Perfect matches: ${perfectMatches.length}/${annotated.length}`);

  perfectMatches.sort((a: any, b: any) => {
    const rrDiff = b.__selection.riskReward - a.__selection.riskReward;
    if (Math.abs(rrDiff) > 1e-4) return rrDiff;
    const profitDiff = (Number(b.max_profit ?? 0) || 0) - (Number(a.max_profit ?? 0) || 0);
    if (Math.abs(profitDiff) > 1e-4) return profitDiff;
    return b.__selection.alignment - a.__selection.alignment;
  });

  remainder.sort((a: any, b: any) => {
    const compositeDiff = b.__selection.composite - a.__selection.composite;
    if (Math.abs(compositeDiff) > 1e-4) return compositeDiff;
    const alignDiff = b.__selection.alignment - a.__selection.alignment;
    if (Math.abs(alignDiff) > 1e-4) return alignDiff;
    const rrDiff = b.__selection.riskReward - a.__selection.riskReward;
    if (Math.abs(rrDiff) > 1e-4) return rrDiff;
    return (Number(b.max_profit ?? 0) || 0) - (Number(a.max_profit ?? 0) || 0);
  });

  const prioritized = [...perfectMatches, ...remainder];
  const selectedRaw = prioritized.slice(0, 10);
  const perfectCount = perfectMatches.length;

  const selected = selectedRaw.map((candidate: any, index: number) => {
    const metrics = candidate.__selection;
    const group = metrics.alignment >= PERFECT_THRESHOLD ? 'perfect' : 'composite';
    const rank = index + 1;
    const formattedAlignment = metrics.alignment.toFixed(1);
    const formattedRR = metrics.riskReward > 0 ? metrics.riskReward.toFixed(2) : '0.00';
    const topMisses = metrics.failingFactors.slice(0, 2).join(', ') || 'none';

    const baseReason =
      group === 'perfect'
        ? `Perfect IPS alignment (${formattedAlignment}%) with risk/reward ${formattedRR}`
        : `${perfectCount === 0 ? 'No perfect IPS matches found' : 'Selected after perfect matches'}: IPS ${formattedAlignment}% with risk/reward ${formattedRR}`;
    const reason =
      group === 'perfect'
        ? `${baseReason}.`
        : `${baseReason}. Key misses: ${topMisses}. Composite score ${metrics.composite.toFixed(1)}.`;

    const cleaned: any = { ...candidate };
    delete cleaned.__selection;

    if (!cleaned.detailed_analysis) cleaned.detailed_analysis = {};
    cleaned.detailed_analysis.selection = {
      group,
      rank,
      reason,
      metrics: {
        ips_score: Number(metrics.alignment.toFixed(2)),
        risk_reward: Number(metrics.riskReward.toFixed(4)),
        composite: Number(metrics.composite.toFixed(2)),
        weight_missing: Number(metrics.weightMissing.toFixed(4)),
      },
      failing_factors: metrics.failingFactors,
    };

    return cleaned;
  });

  for (const c of selected) {
    console.log(`[SelectTopK] Persisting candidate ${c.symbol}:`, {
      has_detailed_analysis: !!c.detailed_analysis,
      has_ips_factors: !!c.detailed_analysis?.ips_factors,
      ips_factors_count: c.detailed_analysis?.ips_factors?.length || 0,
      ips_name: c.detailed_analysis?.ips_name || 'N/A',
      selection_group: c.detailed_analysis?.selection?.group || 'composite',
      selection_rank: c.detailed_analysis?.selection?.rank || null,
    });
    await db.persistCandidate(state.runId, c);
  }

  return { selected };
}


// Build graph
export function buildOptionsAgentGraph() {
  const graph = new StateGraph<AgentState>({
    channels: {
      runId: null,
      mode: null,
      symbols: null,
      ipsId: null,
      ipsConfig: null,
      asof: null,
      marketData: null,
      fundamentalData: null,
      macroData: null,
      features: null,
      candidates: null,
      scores: null,
      selected: null,
      errors: null,
      reasoningChains: null,
      ipsCompliance: null,
      historicalContext: null,
      researchSynthesis: null,
      adjustedThresholds: null,
    },
  });

  graph.addNode("FetchIPS", fetchIPS);
  graph.addNode("FetchMarketData", fetchMarketData);
  graph.addNode("FetchMacroData", fetchMacroData);
  graph.addNode("EngineerFeatures", engineerFeatures);
  graph.addNode("GenerateCandidates", generateCandidates);
  graph.addNode("RiskGuardrails", riskGuardrails);
  graph.addNode("DeepReasoning", deepReasoning);
  graph.addNode("ScoreIPS", scoreIPS);
  graph.addNode("LLM_Rationale", llmRationale);
  graph.addNode("SelectTopK", selectTopK);

  // Define edges - FetchIPS first, then market data
  graph.setEntryPoint("FetchIPS");
  graph.addEdge("FetchIPS", "FetchMarketData");
  graph.addEdge("FetchMarketData", "FetchMacroData");
  graph.addEdge("FetchMacroData", "EngineerFeatures");
  graph.addEdge("EngineerFeatures", "GenerateCandidates");
  graph.addEdge("GenerateCandidates", "RiskGuardrails");
  graph.addEdge("RiskGuardrails", "DeepReasoning");
  graph.addEdge("DeepReasoning", "ScoreIPS");
  graph.addEdge("ScoreIPS", "LLM_Rationale");
  graph.addEdge("LLM_Rationale", "SelectTopK");
  graph.setFinishPoint("SelectTopK");

  return graph.compile();
}

// Main entry point
export async function runAgentOnce(props: {
  symbols: string[];
  mode: "backtest" | "paper" | "live";
  ipsId?: string;
}) {
  const runId = uuidv4();
  const asof = new Date().toISOString();

  console.log(`[Agent] Starting run ${runId} with ${props.symbols.length} symbols, IPS: ${props.ipsId || 'none'}`);

  try {
    // Open run
    await db.openRun({ runId, mode: props.mode, symbols: props.symbols });

    // Initialize state - ipsConfig will be loaded by FetchIPS node
    const initialState: AgentState = {
      runId,
      mode: props.mode,
      symbols: props.symbols,
      ipsId: props.ipsId,
      ipsConfig: null, // Will be populated by FetchIPS node
      asof,
      marketData: {},
      fundamentalData: {},
      macroData: {},
      features: {},
      candidates: [],
      scores: [],
      selected: [],
      errors: [],
      reasoningChains: {},
      ipsCompliance: {},
      historicalContext: {},
      researchSynthesis: {},
      adjustedThresholds: {},
    };

    // Run graph
    const compiledGraph = buildOptionsAgentGraph();
    const result = await compiledGraph.invoke(initialState);

    // Close run
    await db.closeRun(runId, {
      selected_count: result.selected?.length || 0,
      errors: result.errors || [],
    });

    console.log(`[Agent] Completed run ${runId}. Selected: ${result.selected?.length || 0} trades`);

    return result;
  } catch (error: any) {
    console.error(`[Agent] Run ${runId} failed:`, error);
    await db.closeRun(runId, { error: error.message });
    throw error;
  }
}
