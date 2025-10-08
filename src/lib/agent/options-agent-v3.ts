// Options Trading Agent v3 - Following Agent Flow Specification
// Implements progressive filtering with reasoning checkpoints and RAG integration
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
import { getMacroData } from "@/lib/api/macro-data";
import { createClient } from "@/lib/supabase/server-client";

// State interface
interface AgentState {
  runId: string;
  mode: "backtest" | "paper" | "live";
  symbols: string[]; // Initial watchlist
  survivingSymbols: string[]; // Symbols that pass each filter
  ipsId?: string;
  ipsConfig?: any;
  asof: string;

  // Data storage
  generalData: Record<string, any>; // Non-chain data (earnings, sector, etc.)
  marketData: Record<string, any>; // Options chains, quotes
  fundamentalData: Record<string, any>;
  macroData: Record<string, any>;
  features: Record<string, any>;

  // Trade candidates
  candidates: any[];
  nearMissCandidates?: any[]; // Track top near-miss candidates for display
  scores: any[];
  selected: any[];

  // Reasoning tracking
  reasoningDecisions: Array<{
    checkpoint: string;
    decision: "PROCEED" | "REJECT" | "PROCEED_WITH_CAUTION";
    reasoning: string;
    timestamp: string;
  }>;

  errors: string[];
}

// Rate limiting queue
const queue = new PQueue({ concurrency: 2, interval: 1000, intervalCap: 2 });

// ============================================================================
// STEP 1-2: Watchlist Validation & IPS Loading
// ============================================================================

async function fetchIPS(state: AgentState): Promise<Partial<AgentState>> {
  console.log(`[FetchIPS] Loading IPS configuration: ${state.ipsId || 'none'}`);

  // Fetch macro data for all runs
  const macroData = await getMacroData();
  console.log(`[FetchIPS] Loaded macro data: inflation=${macroData.inflation_rate}%`);

  if (!state.ipsId) {
    console.log("[FetchIPS] No IPS ID provided, using default");
    return { ipsConfig: null, macroData };
  }

  try {
    const { loadIPSById } = await import("@/lib/ips/loader");
    const { assertIPSShape } = await import("@/lib/ips/assert");

    const ipsConfig = await loadIPSById(state.ipsId);
    assertIPSShape(ipsConfig);

    console.log(`[FetchIPS] Loaded IPS: ${ipsConfig.name} with ${ipsConfig.factors?.length || 0} factors`);

    // Initialize surviving symbols as full watchlist
    return {
      ipsConfig,
      macroData,
      survivingSymbols: state.symbols
    };
  } catch (error: any) {
    console.error("[FetchIPS] Failed to load IPS config:", error.message);
    return {
      ipsConfig: null,
      macroData,
      survivingSymbols: state.symbols,
      errors: [...state.errors, `IPS Load: ${error.message}`]
    };
  }
}

// ============================================================================
// STEP 4: Pre-Filter on Chain-Independent Factors (weights ≥5)
// ============================================================================

async function preFilterGeneral(state: AgentState): Promise<Partial<AgentState>> {
  console.log(`[PreFilterGeneral] Pre-filtering ${state.survivingSymbols.length} symbols on general factors`);

  const generalData: Record<string, any> = {};
  const errors: string[] = [];
  const surviving: string[] = [];

  // Get high-weight general (non-chain) factors from IPS
  // Use factor_scope column to determine which factors don't need options chains
  // Note: Weights are normalized to sum=1 by loader. Raw weight >=5 becomes ~0.055 after normalization
  const highWeightGeneralFactors = state.ipsConfig?.factors?.filter((f: any) => {
    return f.factor_scope === 'general' && f.weight >= 0.055;
  }) || [];

  console.log(`[PreFilterGeneral] Found ${highWeightGeneralFactors.length} high-weight general factors to check`);

  for (const symbol of state.survivingSymbols) {
    try {
      const start = Date.now();

      // Fetch company overview (non-chain data)
      const avClient = getAlphaVantageClient();
      const overview = await queue.add(() =>
        pRetry(() => avClient.getCompanyOverview(symbol), { retries: 2 })
      );

      // Fetch technical indicators in parallel
      const [sma200Data, sma50Data, momentumData] = await Promise.all([
        queue.add(() => pRetry(() => avClient.getSMA(symbol, 200, 'daily', 'close'), { retries: 2 })),
        queue.add(() => pRetry(() => avClient.getSMA(symbol, 50, 'daily', 'close'), { retries: 2 })),
        queue.add(() => pRetry(() => avClient.getMOM(symbol, 'daily', 10, 'close'), { retries: 2 })),
      ]);

      // Extract values from SMA/MOM responses
      // getSMA returns {value: number | null, date: string | null}
      // getMOM returns number | null
      const sma200 = sma200Data?.value || null;
      const sma50 = sma50Data?.value || null;
      const momentum = momentumData || null;

      // Fetch and calculate IV Rank and IV Percentile from vol_regime_daily table
      let ivData = { iv_rank: null, iv_percentile: null };
      try {
        const supabase = await createClient();

        // Get current IV and last 252 days of historical IV data
        const cutoffDate = dayjs().subtract(252, 'day').format('YYYY-MM-DD');
        const { data: historicalData, error } = await supabase
          .from('vol_regime_daily')
          .select('as_of_date, iv_atm_30d')
          .eq('symbol', symbol)
          .gte('as_of_date', cutoffDate)
          .not('iv_atm_30d', 'is', null)
          .order('as_of_date', { ascending: false });

        if (!error && historicalData && historicalData.length >= 20) {
          // Get current IV (most recent)
          const currentIV = historicalData[0].iv_atm_30d;

          // Calculate IV rank and percentile
          const validIVs = historicalData.map(d => d.iv_atm_30d).filter(iv => iv !== null);
          const countBelow = validIVs.filter(iv => iv <= currentIV).length;
          const ivRank = (countBelow / validIVs.length) * 100;

          ivData = {
            iv_rank: Math.round(ivRank * 10) / 10, // Round to 1 decimal
            iv_percentile: Math.round(ivRank * 10) / 10 // Same as iv_rank
          };
        }
      } catch (error) {
        console.warn(`[PreFilterGeneral] Failed to calculate IV metrics for ${symbol}:`, error);
      }

      // Fetch news sentiment from both Tavily AND Alpha Vantage
      const newsSearch = await tavilySearch(
        `${symbol} stock news earnings`,
        {
          topic: "news",
          days: 7,
          max_results: 10,
          search_depth: "basic"
        }
      );
      console.log(`[PreFilterGeneral] ${symbol}: Found ${newsSearch.results?.length || 0} news articles from Tavily`);
      if (newsSearch.error) {
        console.warn(`[PreFilterGeneral] ${symbol}: Tavily news search error:`, newsSearch.error);
      }

      // Fetch social media sentiment separately (Reddit, Twitter, etc.)
      const socialSearch = await tavilySearch(
        `${symbol} stock reddit twitter sentiment`,
        {
          time_range: "week",
          max_results: 5,
          include_domains: ["reddit.com", "twitter.com", "stocktwits.com"]
        }
      );
      console.log(`[PreFilterGeneral] ${symbol}: Found ${socialSearch.results?.length || 0} social posts from Tavily`);
      if (socialSearch.error) {
        console.warn(`[PreFilterGeneral] ${symbol}: Tavily social search error:`, socialSearch.error);
      }
      if (socialSearch.results && socialSearch.results.length > 0) {
        console.log(`[PreFilterGeneral] ${symbol}: Sample social result:`, JSON.stringify(socialSearch.results[0], null, 2));
      }

      // Fetch Alpha Vantage News Sentiment (provides actual sentiment scores)
      let avNewsSentiment = null;
      try {
        const avClient = getAlphaVantageClient();
        avNewsSentiment = await avClient.getNewsSentiment(symbol, 50);
        console.log(`[PreFilterGeneral] ${symbol}: Alpha Vantage sentiment score=${avNewsSentiment.average_score?.toFixed(2)}, count=${avNewsSentiment.count}`);
      } catch (error) {
        console.warn(`[PreFilterGeneral] ${symbol}: Failed to fetch Alpha Vantage news sentiment:`, error);
      }

      // Spread overview at root level so all AlphaVantage fields are accessible
      // Then add technical indicators and other data
      generalData[symbol] = {
        ...overview,  // Spreads 52WeekHigh, 52WeekLow, MarketCapitalization, PERatio, Beta, etc.
        sma200,
        sma50,
        momentum,
        iv_rank: ivData?.iv_rank || null,
        iv_percentile: ivData?.iv_percentile || null,
        news: newsSearch.results || [],
        social: socialSearch.results || [],
        av_news_sentiment: avNewsSentiment, // Alpha Vantage sentiment with actual scores
        timestamp: new Date().toISOString()
      };

      // Check if symbol passes high-weight general factors
      let passes = true;
      const violations: string[] = [];

      for (const factor of highWeightGeneralFactors) {
        const result = evaluateGeneralFactor(factor, overview, newsSearch.results);
        if (!result.pass) {
          passes = false;
          violations.push(`${factor.display_name}: ${result.reason}`);
        }
      }

      if (passes || highWeightGeneralFactors.length === 0) {
        surviving.push(symbol);
        console.log(`[PreFilterGeneral] ✓ ${symbol} passed general filters`);
      } else {
        console.log(`[PreFilterGeneral] ✗ ${symbol} filtered out: ${violations.join(', ')}`);
      }

      const latency = Date.now() - start;
      await db.logTool(state.runId, "PreFilterGeneral", { symbol }, { passed: passes }, latency);

    } catch (error: any) {
      console.error(`[PreFilterGeneral] Error for ${symbol}:`, error);
      errors.push(`${symbol}: ${error.message}`);
      // On error, allow symbol to continue (fail-open)
      surviving.push(symbol);
    }
  }

  console.log(`[PreFilterGeneral] ${surviving.length}/${state.survivingSymbols.length} symbols passed general filters`);

  return {
    generalData,
    survivingSymbols: surviving,
    errors: [...state.errors, ...errors]
  };
}

// Helper: Evaluate general factors
function evaluateGeneralFactor(
  factor: any,
  overview: any,
  news: any[]
): { pass: boolean; reason?: string } {
  switch (factor.factor_key) {
    case 'earnings_date':
      // Check if earnings within next 14 days
      const hasUpcomingEarnings = news.some((n: any) =>
        n.snippet?.toLowerCase().includes('earnings') &&
        n.snippet?.toLowerCase().match(/\b(next|upcoming|this week|tomorrow)\b/)
      );
      if (factor.direction === 'lte' && hasUpcomingEarnings) {
        return { pass: false, reason: 'Earnings within 14 days' };
      }
      return { pass: true };

    case 'market_cap':
      const marketCap = parseFloat(overview?.MarketCapitalization || '0');
      if (factor.direction === 'gte' && marketCap < (factor.threshold || 0)) {
        return { pass: false, reason: `Market cap ${(marketCap / 1e9).toFixed(1)}B below ${(factor.threshold / 1e9).toFixed(1)}B threshold` };
      }
      return { pass: true };

    case 'volume':
      const volume = parseFloat(overview?.Volume || '0');
      if (factor.direction === 'gte' && volume < (factor.threshold || 0)) {
        return { pass: false, reason: `Volume ${(volume / 1e6).toFixed(1)}M below threshold` };
      }
      return { pass: true };

    case 'news_sentiment':
    case 'sector':
    case 'pe_ratio':
    case 'beta':
      // For now, allow these to pass (implement specific logic as needed)
      return { pass: true };

    default:
      return { pass: true };
  }
}

// ============================================================================
// REASONING CHECKPOINT 1: Should we proceed after general filter?
// ============================================================================

async function reasoningCheckpoint1(state: AgentState): Promise<Partial<AgentState>> {
  console.log(`[ReasoningCheckpoint1] Evaluating whether to proceed with ${state.survivingSymbols.length} symbols`);

  // If we have symbols, proceed
  if (state.survivingSymbols.length > 0) {
    const decision = {
      checkpoint: "after_general_filter",
      decision: "PROCEED" as const,
      reasoning: `${state.survivingSymbols.length} symbols passed general filters`,
      timestamp: new Date().toISOString()
    };

    return {
      reasoningDecisions: [...(state.reasoningDecisions || []), decision]
    };
  }

  // No symbols passed - use reasoning model to decide
  const prompt = `You are evaluating whether to proceed with options trading analysis.

Initial watchlist: ${state.symbols.join(', ')} (${state.symbols.length} symbols)
Symbols that passed general filters: ${state.survivingSymbols.length}

General data collected:
${Object.entries(state.generalData).map(([sym, data]: [string, any]) => {
  const overview = data.overview || {};
  return `${sym}: Sector=${overview.Sector || 'N/A'}, MarketCap=${overview.MarketCapitalization || 'N/A'}, News=${data.news?.length || 0} articles`;
}).join('\n')}

Question: Should we proceed with pulling expensive options chain data for symbols that were "close" to passing?

Analyze:
1. Were any factors just barely missing targets (<10%)?
2. Is there value in exploring near-misses?
3. What's the opportunity cost of stopping now?

Respond with JSON:
{
  "decision": "PROCEED" | "REJECT" | "PROCEED_WITH_CAUTION",
  "symbols_to_add": ["SYMBOL1", "SYMBOL2"], // symbols to add back if proceeding
  "reasoning": "1-2 sentence explanation"
}`;

  try {
    const response = await rationaleLLM(prompt);
    const parsed = JSON.parse(response);

    const decision = {
      checkpoint: "after_general_filter",
      decision: parsed.decision,
      reasoning: parsed.reasoning,
      timestamp: new Date().toISOString()
    };

    // Add back symbols if reasoning model suggests
    const updatedSymbols = parsed.decision === "REJECT"
      ? []
      : [...state.survivingSymbols, ...(parsed.symbols_to_add || [])];

    console.log(`[ReasoningCheckpoint1] Decision: ${parsed.decision}, Symbols: ${updatedSymbols.length}`);

    return {
      reasoningDecisions: [...(state.reasoningDecisions || []), decision],
      survivingSymbols: updatedSymbols
    };

  } catch (error: any) {
    console.error("[ReasoningCheckpoint1] Error:", error);
    // Fail-safe: reject if can't reason
    return {
      reasoningDecisions: [...(state.reasoningDecisions || []), {
        checkpoint: "after_general_filter",
        decision: "REJECT" as const,
        reasoning: `Error in reasoning: ${error.message}`,
        timestamp: new Date().toISOString()
      }],
      survivingSymbols: []
    };
  }
}

// ============================================================================
// STEP 5: Pull Stock-Specific Data (Options Chains)
// ============================================================================

async function fetchOptionsChains(state: AgentState): Promise<Partial<AgentState>> {
  console.log(`[FetchOptionsChains] Pulling chains for ${state.survivingSymbols.length} symbols`);

  const marketData: Record<string, any> = {};
  const fundamentalData: Record<string, any> = {};
  const errors: string[] = [];

  let apiCallCount = 0;
  const API_RATE_LIMIT = 500; // Alpha Vantage limit

  for (const symbol of state.survivingSymbols) {
    try {
      const start = Date.now();

      // Check if we need to wait due to rate limiting
      if (apiCallCount >= API_RATE_LIMIT) {
        console.log(`[FetchOptionsChains] Hit rate limit (${API_RATE_LIMIT} calls), waiting 60s...`);
        await new Promise(resolve => setTimeout(resolve, 60000));
        apiCallCount = 0;
      }

      // Fetch options chain (ATM, put-20 focus)
      const result = await queue.add(() =>
        pRetry(() => getOptionsChain(symbol), { retries: 3 })
      );
      apiCallCount++;

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
      apiCallCount++;

      // Calculate Put/Call Ratios from options chain
      let putCallRatio = null;
      let putCallOIRatio = null;
      try {
        const puts = normalized.filter(c => c.option_type === 'P');
        const calls = normalized.filter(c => c.option_type === 'C');

        const totalPutVolume = puts.reduce((sum, c) => sum + (c.volume || 0), 0);
        const totalCallVolume = calls.reduce((sum, c) => sum + (c.volume || 0), 0);
        const totalPutOI = puts.reduce((sum, c) => sum + (c.oi || 0), 0);
        const totalCallOI = calls.reduce((sum, c) => sum + (c.oi || 0), 0);

        if (totalCallVolume > 0) {
          putCallRatio = totalPutVolume / totalCallVolume;
        }
        if (totalCallOI > 0) {
          putCallOIRatio = totalPutOI / totalCallOI;
        }
      } catch (error) {
        console.warn(`[FetchOptionsChains] Failed to calculate Put/Call ratios for ${symbol}:`, error);
      }

      marketData[symbol] = {
        contracts: normalized,
        quote,
        asof: result.asof,
        putCallRatio,
        putCallOIRatio,
        iv_rank: state.generalData[symbol]?.iv_rank || null,
        iv_percentile: state.generalData[symbol]?.iv_percentile || null,
      };

      // Use general data directly - it already has overview fields spread at root level
      // plus sma200, sma50, momentum, iv_rank, iv_percentile, news
      fundamentalData[symbol] = state.generalData[symbol] || {};

      console.log(`[FetchOptionsChains] Got ${normalized.length} contracts for ${symbol}`);

      const latency = Date.now() - start;
      await db.logTool(state.runId, "FetchOptionsChains", { symbol }, { count: normalized.length }, latency);

    } catch (error: any) {
      console.error(`[FetchOptionsChains] Error for ${symbol}:`, error);
      errors.push(`${symbol}: ${error.message}`);
    }
  }

  return {
    marketData,
    fundamentalData,
    errors: [...state.errors, ...errors]
  };
}

// ============================================================================
// STEP 6: Filter on High-Weight Chain-Dependent Factors (weights ≥5)
// ============================================================================

async function filterHighWeightFactors(state: AgentState): Promise<Partial<AgentState>> {
  console.log(`[FilterHighWeight] Filtering on high-weight chain-dependent factors`);

  // Get high-weight chain-dependent factors using factor_scope
  // Note: Weights are normalized to sum=1 by loader. Raw weight >=5 becomes ~0.055 after normalization

  // Debug: Log all chain factors and their weights
  const allChainFactors = state.ipsConfig?.factors?.filter((f: any) => f.factor_scope === 'chain') || [];
  console.log(`[FilterHighWeight] Total chain factors: ${allChainFactors.length}`);
  allChainFactors.forEach((f: any) => {
    console.log(`[FilterHighWeight]   ${f.factor_name}: scope=${f.factor_scope}, weight=${f.weight}, passes=${f.weight >= 0.055}`);
  });

  const highWeightChainFactors = state.ipsConfig?.factors?.filter((f: any) => {
    return f.factor_scope === 'chain' && f.weight >= 0.055;
  }) || [];

  console.log(`[FilterHighWeight] Found ${highWeightChainFactors.length} high-weight chain factors`);
  console.log(`[FilterHighWeight] ⚡⚡⚡ NEW CODE VERSION LOADED - EPSILON FIX ACTIVE ⚡⚡⚡`);

  const candidates: any[] = [];
  const nearMissCandidates: any[] = []; // Track near-miss candidates for top 20 list

  for (const symbol of state.survivingSymbols) {
    const data = state.marketData[symbol];
    if (!data || !data.contracts) continue;

    // Generate candidate trades for this symbol
    const symbolCandidates = await generateCandidatesForSymbol(
      symbol,
      data,
      state.fundamentalData[symbol],
      state.ipsConfig
    );

    console.log(`[FilterHighWeight] ${symbol}: Generated ${symbolCandidates.length} candidate spreads before filtering`);

    // Filter candidates by high-weight factors
    for (const candidate of symbolCandidates) {
      let passes = true;
      const violations: string[] = [];
      let violationCount = 0;

      for (const factor of highWeightChainFactors) {
        const result = evaluateChainFactor(factor, candidate, data);
        if (!result.pass) {
          passes = false;
          violations.push(`${factor.display_name}: ${result.reason}`);
          violationCount++;
        }
      }

      if (passes || highWeightChainFactors.length === 0) {
        candidates.push(candidate);
      } else {
        // Track near-miss candidates (with violation count for sorting)
        nearMissCandidates.push({
          ...candidate,
          violation_count: violationCount,
          violations: violations.join(', ')
        });
        console.log(`[FilterHighWeight] ✗ ${symbol} candidate filtered: ${violations.join(', ')}`);
      }
    }
  }

  console.log(`[FilterHighWeight] ${candidates.length} candidates passed high-weight filters`);
  console.log(`[FilterHighWeight] ${nearMissCandidates.length} near-miss candidates tracked`);

  return {
    candidates,
    nearMissCandidates: nearMissCandidates || []
  };
}

// Helper: Generate candidate trades for a symbol
async function generateCandidatesForSymbol(
  symbol: string,
  marketData: any,
  fundamentalData: any,
  ipsConfig: any
): Promise<any[]> {
  const contracts = marketData.contracts;
  const quote = marketData.quote?.["Global Quote"] || {};
  const currentPrice = parseFloat(quote["05. price"]) || 0;

  if (!currentPrice) return [];

  const candidates: any[] = [];

  // Filter for put credit spreads (same logic as original agent)
  const puts = contracts.filter((c: any) => c.option_type === "P" && c.expiry);
  const expirations = [...new Set(puts.map((p: any) => p.expiry))];

  for (const expiry of expirations.slice(0, 3)) {
    const expiryPuts = puts
      .filter((p: any) => p.expiry === expiry)
      .filter((p: any) => p.strike && p.bid && p.ask && p.strike < currentPrice)
      .sort((a: any, b: any) => b.strike - a.strike);

    if (expiryPuts.length < 2) continue;

    // Create spread candidates - search through up to 50 strikes to find suitable low-delta spreads
    // For far OTM spreads (delta ≤0.18), we need to look deeper in the chain
    // Strategy: Start from ATM and work down to find low-delta, high-probability spreads
    for (let i = 0; i < Math.min(50, expiryPuts.length - 1); i++) {
      const shortPut = expiryPuts[i];

      // Skip if delta is too high (we want far OTM for safety)
      // Note: Delta is negative for puts, so we check absolute value
      const shortDelta = Math.abs(shortPut.delta || 0);
      if (shortDelta > 0.5) continue; // Skip deep ITM/ATM options

      const longPut = expiryPuts[i + 2] || expiryPuts[expiryPuts.length - 1];

      const width = shortPut.strike - longPut.strike;
      if (width <= 0) continue;

      const entryMid = ((shortPut.bid + shortPut.ask) / 2) - ((longPut.bid + longPut.ask) / 2);
      if (entryMid <= 0) continue;

      const maxProfit = entryMid;
      const maxLoss = width - entryMid;
      const breakeven = shortPut.strike - entryMid;
      const riskReward = maxProfit / maxLoss;

      if (riskReward < 0.15) continue;

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
        est_pop: shortPut.delta ? 1 - Math.abs(shortPut.delta) : 0.7,
        breakeven,
        max_loss: maxLoss,
        max_profit: maxProfit,
        guardrail_flags: {},
      });
    }
  }

  console.log(`[GenerateCandidates] ${symbol}: Created ${candidates.length} put credit spread candidates`);

  return candidates;
}

// Helper: Evaluate chain-dependent factors
function evaluateChainFactor(
  factor: any,
  candidate: any,
  marketData: any
): { pass: boolean; reason?: string } {
  const shortLeg = candidate.contract_legs?.find((l: any) => l.type === "SELL");

  switch (factor.factor_key) {
    case 'opt-delta':
      const delta = Math.abs(shortLeg?.delta || 0);
      const threshold = factor.threshold || 1;

      // Use tolerance of 0.01 (1%) for delta comparison
      // This allows deltas like 0.18, 0.1838, 0.19 to pass when threshold is 0.18
      const tolerance = 0.01;

      if (factor.direction === 'lte' && delta > threshold + tolerance) {
        return { pass: false, reason: `Delta ${delta.toFixed(4)} exceeds ${threshold}` };
      }
      if (factor.direction === 'gte' && delta < threshold - tolerance) {
        return { pass: false, reason: `Delta ${delta.toFixed(4)} below ${threshold}` };
      }
      return { pass: true };

    case 'opt-iv-rank':
      // TODO: IV Rank requires historical IV data (52-week range) which we don't have
      // The current calculation is incorrect - it compares IV across option strikes instead of time
      // For now, skip this check and rely on other factors
      console.log(`[FilterHighWeight] Skipping IV Rank check - requires historical data not available in options chain`);
      return { pass: true };

    case 'opt-open-interest':
      const oi = shortLeg?.oi || 0;
      if (factor.direction === 'gte' && oi < (factor.threshold || 0)) {
        return { pass: false, reason: `OI ${oi} below ${factor.threshold}` };
      }
      return { pass: true };

    case 'opt-bid-ask-spread':
      const spread = shortLeg?.ask && shortLeg?.bid ? Math.abs(shortLeg.ask - shortLeg.bid) : 999;
      const spreadThreshold = factor.threshold || 999;
      const spreadTolerance = 0.02; // Allow spreads up to $0.02 above threshold

      if (factor.direction === 'lte' && spread > spreadThreshold + spreadTolerance) {
        return { pass: false, reason: `Spread $${spread.toFixed(2)} exceeds $${spreadThreshold.toFixed(2)}` };
      }
      return { pass: true };

    case 'opt-iv':
      const iv = shortLeg?.iv || 0;
      if (factor.direction === 'gte' && iv < (factor.threshold || 0)) {
        return { pass: false, reason: `IV ${iv.toFixed(2)} below ${factor.threshold}` };
      }
      if (factor.direction === 'lte' && iv > (factor.threshold || 999)) {
        return { pass: false, reason: `IV ${iv.toFixed(2)} exceeds ${factor.threshold}` };
      }
      return { pass: true };

    case 'calc-iv-percentile':
      // TODO: IV Percentile requires historical IV data (52-week range) which we don't have
      // Same issue as IV Rank - current calculation is incorrect
      // For now, skip this check and rely on other factors
      console.log(`[FilterHighWeight] Skipping IV Percentile check - requires historical data not available in options chain`);
      return { pass: true };

    default:
      return { pass: true };
  }
}

// ============================================================================
// REASONING CHECKPOINT 2: After high-weight filter
// ============================================================================

async function reasoningCheckpoint2(state: AgentState): Promise<Partial<AgentState>> {
  console.log(`[ReasoningCheckpoint2] Evaluating ${state.candidates.length} candidates after high-weight filter`);

  if (state.candidates.length > 0) {
    const decision = {
      checkpoint: "after_high_weight_filter",
      decision: "PROCEED" as const,
      reasoning: `${state.candidates.length} candidates passed high-weight filters`,
      timestamp: new Date().toISOString()
    };

    return {
      reasoningDecisions: [...(state.reasoningDecisions || []), decision]
    };
  }

  // No candidates - use RAG to check if we should proceed with near-misses
  const prompt = `You are evaluating options trading candidates after high-weight factor filtering.

Symbols analyzed: ${state.survivingSymbols.join(', ')}
Candidates that passed: ${state.candidates.length}
High-weight factors checked: delta, IV rank, theta, open interest, bid-ask spread

Context from filtering:
${state.survivingSymbols.map(sym => {
  const data = state.marketData[sym];
  const quote = data?.quote?.["Global Quote"];
  const price = quote ? parseFloat(quote["05. price"]) : null;
  return `${sym}: Current price $${price?.toFixed(2) || 'N/A'}`;
}).join('\n')}

Question: Should we proceed by relaxing thresholds slightly for near-misses?

Analyze:
1. Were factors just barely missing targets (<10% of target)?
2. Do we take the closest trades and proceed with low-weight filtering?
3. Suggest No Trade (only if prior data suggests)?

Respond with JSON:
{
  "decision": "PROCEED" | "REJECT" | "PROCEED_WITH_CAUTION",
  "threshold_adjustments": [
    {"factor": "delta", "old_threshold": 0.15, "new_threshold": 0.18}
  ],
  "reasoning": "1-2 sentence explanation"
}`;

  try {
    const response = await rationaleLLM(prompt);

    // Try to extract JSON from the response in case LLM wraps it in text
    let parsed;
    try {
      parsed = JSON.parse(response);
    } catch (e) {
      // Try to find JSON in the response
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        parsed = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error(`LLM response was not valid JSON: ${response.substring(0, 100)}...`);
      }
    }

    const decision = {
      checkpoint: "after_high_weight_filter",
      decision: parsed.decision,
      reasoning: parsed.reasoning,
      timestamp: new Date().toISOString()
    };

    console.log(`[ReasoningCheckpoint2] Decision: ${parsed.decision}`);

    // If proceeding with caution, re-run high-weight filter with adjusted thresholds
    if (parsed.decision === "PROCEED_WITH_CAUTION" && parsed.threshold_adjustments) {
      // TODO: Re-generate candidates with adjusted thresholds
      console.log(`[ReasoningCheckpoint2] Adjusting thresholds:`, parsed.threshold_adjustments);
    }

    return {
      reasoningDecisions: [...(state.reasoningDecisions || []), decision]
    };

  } catch (error: any) {
    console.error("[ReasoningCheckpoint2] Error:", error);
    return {
      reasoningDecisions: [...(state.reasoningDecisions || []), {
        checkpoint: "after_high_weight_filter",
        decision: "REJECT" as const,
        reasoning: `Error in reasoning: ${error.message}`,
        timestamp: new Date().toISOString()
      }]
    };
  }
}

// ============================================================================
// STEP 8: Filter on Low-Weight Factors (weights <5)
// ============================================================================

async function filterLowWeightFactors(state: AgentState): Promise<Partial<AgentState>> {
  console.log(`[FilterLowWeight] Filtering ${state.candidates.length} candidates on low-weight factors`);

  // Low-weight factors are those below 0.055 (raw weight <5 after normalization)
  const lowWeightFactors = state.ipsConfig?.factors?.filter((f: any) => f.weight < 0.055) || [];
  console.log(`[FilterLowWeight] Found ${lowWeightFactors.length} low-weight factors`);

  const filteredCandidates: any[] = [];

  for (const candidate of state.candidates) {
    let passes = true;
    const violations: string[] = [];
    const factorScores: any[] = [];

    for (const factor of lowWeightFactors) {
      const result = evaluateLowWeightFactor(
        factor,
        candidate,
        state.marketData[candidate.symbol],
        state.fundamentalData[candidate.symbol],
        state.generalData[candidate.symbol]
      );

      factorScores.push({
        factor: factor.factor_key,
        name: factor.display_name,
        weight: factor.weight,
        pass: result.pass,
        reason: result.reason
      });

      if (!result.pass) {
        violations.push(`${factor.display_name}: ${result.reason}`);
      }
    }

    // For low-weight factors, we're more lenient - only reject if multiple failures
    const failureCount = violations.length;
    const failureThreshold = Math.ceil(lowWeightFactors.length * 0.5); // Allow up to 50% failures

    if (failureCount < failureThreshold || lowWeightFactors.length === 0) {
      candidate.low_weight_factor_scores = factorScores;
      filteredCandidates.push(candidate);
      console.log(`[FilterLowWeight] ✓ ${candidate.symbol} passed (${failureCount}/${lowWeightFactors.length} violations)`);
    } else {
      console.log(`[FilterLowWeight] ✗ ${candidate.symbol} filtered: ${violations.slice(0, 3).join(', ')}`);
    }
  }

  console.log(`[FilterLowWeight] ${filteredCandidates.length}/${state.candidates.length} candidates passed`);

  return { candidates: filteredCandidates };
}

// Helper: Evaluate low-weight factors
function evaluateLowWeightFactor(
  factor: any,
  candidate: any,
  marketData: any,
  fundamentalData: any,
  generalData: any
): { pass: boolean; reason?: string } {
  const shortLeg = candidate.contract_legs?.find((l: any) => l.type === "SELL");

  switch (factor.factor_key) {
    case 'gamma':
      const gamma = Math.abs(shortLeg?.gamma || 0);
      if (factor.direction === 'lte' && gamma > (factor.threshold || 1)) {
        return { pass: false, reason: `Gamma ${gamma.toFixed(3)} exceeds ${factor.threshold}` };
      }
      return { pass: true };

    case 'vega':
      const vega = Math.abs(shortLeg?.vega || 0);
      if (factor.direction === 'lte' && vega > (factor.threshold || 999)) {
        return { pass: false, reason: `Vega ${vega.toFixed(2)} exceeds ${factor.threshold}` };
      }
      return { pass: true };

    case 'news_sentiment':
    case 'sentiment_score':
      const newsResults = generalData?.news || [];
      if (newsResults.length === 0) return { pass: true };

      let positiveCount = 0;
      let negativeCount = 0;
      newsResults.forEach((article: any) => {
        const text = (article.title + ' ' + (article.snippet || '')).toLowerCase();
        if (text.match(/bullish|upgrade|beat|strong|growth|positive/)) positiveCount++;
        if (text.match(/bearish|downgrade|miss|weak|decline|negative/)) negativeCount++;
      });

      const sentiment = positiveCount - negativeCount;
      if (factor.direction === 'gte' && sentiment < (factor.threshold || 0)) {
        return { pass: false, reason: `Sentiment ${sentiment} below threshold` };
      }
      return { pass: true };

    case 'profit_margin':
      const margin = parseFloat(fundamentalData?.ProfitMargin || '0');
      if (factor.direction === 'gte' && margin < (factor.threshold || 0)) {
        return { pass: false, reason: `Profit margin ${(margin * 100).toFixed(1)}% below ${(factor.threshold * 100).toFixed(1)}%` };
      }
      return { pass: true };

    default:
      return { pass: true };
  }
}

// ============================================================================
// REASONING CHECKPOINT 3: After low-weight filter
// ============================================================================

async function reasoningCheckpoint3(state: AgentState): Promise<Partial<AgentState>> {
  console.log(`[ReasoningCheckpoint3] Evaluating ${state.candidates.length} candidates after low-weight filter`);

  if (state.candidates.length > 0) {
    const decision = {
      checkpoint: "after_low_weight_filter",
      decision: "PROCEED" as const,
      reasoning: `${state.candidates.length} candidates passed all filters`,
      timestamp: new Date().toISOString()
    };

    return {
      reasoningDecisions: [...(state.reasoningDecisions || []), decision]
    };
  }

  // No candidates passed - prepare top 20 near-miss candidates with IPS scoring
  const nearMiss = state.nearMissCandidates || [];
  console.log(`[ReasoningCheckpoint3] No passing candidates. Processing ${nearMiss.length} near-miss candidates`);

  if (nearMiss.length > 0) {
    // Sort by violation count (fewest violations first), then by credit received (highest first)
    const sortedNearMiss = nearMiss
      .sort((a, b) => {
        if (a.violation_count !== b.violation_count) {
          return a.violation_count - b.violation_count;
        }
        return (b.entry_mid || 0) - (a.entry_mid || 0);
      })
      .slice(0, 20); // Take top 20

    // Calculate IPS scores for these candidates
    console.log(`[ReasoningCheckpoint3] Calculating IPS scores for top ${sortedNearMiss.length} near-miss candidates`);

    for (const candidate of sortedNearMiss) {
      const ipsScore = await calculateIPSScore(candidate, state);
      candidate.ips_score = ipsScore;

      // Classify into tiers based on IPS score
      if (ipsScore >= 90) {
        candidate.tier = 'elite';
      } else if (ipsScore >= 75) {
        candidate.tier = 'quality';
      } else if (ipsScore >= 60) {
        candidate.tier = 'speculative';
      } else {
        candidate.tier = null;
      }
    }

    // Store these as "selected" so they appear in the UI
    const decision = {
      checkpoint: "after_low_weight_filter",
      decision: "REJECT" as const,
      reasoning: `No candidates passed all filters. Showing top ${sortedNearMiss.length} near-miss candidates for review.`,
      timestamp: new Date().toISOString()
    };

    return {
      selected: sortedNearMiss, // Make near-miss candidates visible in UI
      reasoningDecisions: [...(state.reasoningDecisions || []), decision]
    };
  }

  // Last chance - check if we should suggest cash/wait or proceed with best available
  const prompt = `You are making a final decision on options trades after all filtering.

Initial symbols: ${state.symbols.join(', ')}
Candidates remaining: ${state.candidates.length}

All IPS factors have been evaluated. No candidates passed the complete filter.

Historical reasoning decisions:
${(state.reasoningDecisions || []).map(d => `${d.checkpoint}: ${d.decision} - ${d.reasoning}`).join('\n')}

Question: Should we suggest the best available trades despite factor misses, or recommend cash/wait?

Analyze:
1. Were factors just barely missing (<10% of target)?
2. Do we take the closest trades and proceed?
3. Suggest No Trade (if factors are >30% outside target weights)?

Respond with JSON:
{
  "decision": "PROCEED" | "REJECT",
  "reasoning": "1-2 sentence explanation",
  "recommendation": "string to show user"
}`;

  try {
    const response = await rationaleLLM(prompt);

    // Try to extract JSON from the response in case LLM wraps it in text
    let parsed;
    try {
      parsed = JSON.parse(response);
    } catch (e) {
      // Try to find JSON in the response
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        parsed = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error(`LLM response was not valid JSON: ${response.substring(0, 100)}...`);
      }
    }

    const decision = {
      checkpoint: "after_low_weight_filter",
      decision: parsed.decision,
      reasoning: parsed.reasoning,
      timestamp: new Date().toISOString()
    };

    console.log(`[ReasoningCheckpoint3] Decision: ${parsed.decision}`);

    return {
      reasoningDecisions: [...(state.reasoningDecisions || []), decision]
    };

  } catch (error: any) {
    console.error("[ReasoningCheckpoint3] Error:", error);
    return {
      reasoningDecisions: [...(state.reasoningDecisions || []), {
        checkpoint: "after_low_weight_filter",
        decision: "REJECT" as const,
        reasoning: `No qualifying trades found. Suggest cash/wait.`,
        timestamp: new Date().toISOString()
      }]
    };
  }
}

// ============================================================================
// STEP 10: RAG Correlation + Composite Scoring
// ============================================================================

async function ragCorrelationScoring(state: AgentState): Promise<Partial<AgentState>> {
  console.log(`[RAGScoring] Scoring ${state.candidates.length} candidates with historical correlation`);

  const scoredCandidates: any[] = [];

  // Import RAG functions
  const { analyzeHistoricalPerformance } = await import("./rag-embeddings");

  for (const candidate of state.candidates) {
    try {
      // Query RAG for similar historical trades
      const historicalAnalysis = await analyzeHistoricalPerformance(
        candidate,
        state.ipsId
      );

      // Calculate composite score
      const yieldScore = calculateYieldScore(candidate);
      const ipsScore = await calculateIPSScore(candidate, state);

      const compositeScore = historicalAnalysis.has_data
        ? (yieldScore * 0.4) + (ipsScore * 0.3) + (historicalAnalysis.win_rate * 100 * 0.3)
        : (yieldScore * 0.6) + (ipsScore * 0.4);

      candidate.composite_score = compositeScore;
      candidate.yield_score = yieldScore;
      candidate.ips_score = ipsScore;
      candidate.historical_analysis = {
        has_data: historicalAnalysis.has_data,
        trade_count: historicalAnalysis.trade_count,
        win_rate: historicalAnalysis.win_rate,
        avg_roi: historicalAnalysis.avg_roi,
        confidence: historicalAnalysis.confidence,
      };

      scoredCandidates.push(candidate);

      if (historicalAnalysis.has_data) {
        console.log(
          `[RAGScoring] ${candidate.symbol}: Composite=${compositeScore.toFixed(1)}, ` +
          `Historical Win Rate=${(historicalAnalysis.win_rate * 100).toFixed(1)}% ` +
          `(${historicalAnalysis.trade_count} similar trades, ${historicalAnalysis.confidence} confidence)`
        );
      } else {
        console.log(
          `[RAGScoring] ${candidate.symbol}: Composite=${compositeScore.toFixed(1)} ` +
          `(no historical data available)`
        );
      }

    } catch (error: any) {
      console.warn(`[RAGScoring] RAG unavailable for ${candidate.symbol}, using IPS + Yield only:`, error.message);

      // Fall back to scoring without RAG
      const yieldScore = calculateYieldScore(candidate);
      const ipsScore = await calculateIPSScore(candidate, state);
      const compositeScore = (yieldScore * 0.6) + (ipsScore * 0.4);

      candidate.composite_score = compositeScore;
      candidate.yield_score = yieldScore;
      candidate.ips_score = ipsScore;
      candidate.historical_analysis = {
        has_data: false,
        trade_count: 0,
        win_rate: 0,
        avg_roi: 0,
        confidence: "low" as const,
      };

      scoredCandidates.push(candidate);

      console.log(
        `[RAGScoring] ${candidate.symbol}: Composite=${compositeScore.toFixed(1)} ` +
        `(RAG disabled - using IPS ${ipsScore.toFixed(1)}% + Yield ${yieldScore.toFixed(1)})`
      );
    }
  }

  return { candidates: scoredCandidates };
}

// Helper: Calculate yield score
function calculateYieldScore(candidate: any): number {
  const riskReward = candidate.max_profit / (candidate.max_loss || 1);
  // Normalize to 0-100 scale
  return Math.min(100, riskReward * 100);
}

// Helper: Extract actual factor value from candidate
function getFactorValue(factor: any, candidate: any, state: AgentState): { value: any; target: string } {
  const shortLeg = candidate.contract_legs?.find((l: any) => l.type === "SELL");
  const marketData = state.marketData?.[candidate.symbol];
  const fundamentalData = state.fundamentalData?.[candidate.symbol];
  const generalData = state.generalData?.[candidate.symbol];

  // Overview is stored directly in fundamentalData[symbol], not nested
  const overview = fundamentalData;

  // Get current price from quote (moved before debug block)
  const quote = marketData?.quote?.["Global Quote"];
  const currentPrice = quote ? parseFloat(quote["05. price"]) : null;

  // Enhanced debug logging for EVERY factor evaluation
  const debugInfo = {
    symbol: candidate.symbol,
    factor_key: factor.factor_key,
    factor_name: factor.factor_name,
    display_name: factor.display_name,
    has_fundamentalData: !!fundamentalData,
    has_overview: !!overview,
    current_price: currentPrice,
    overview_keys: overview ? Object.keys(overview).slice(0, 10) : []
  };

  console.log(`[getFactorValue] Evaluating:`, JSON.stringify(debugInfo, null, 2));

  // Helper to format target based on direction
  const formatTarget = (threshold: any, direction: string) => {
    switch (direction) {
      case 'gte': return `≥${threshold}`;
      case 'lte': return `≤${threshold}`;
      case 'gt': return `>${threshold}`;
      case 'lt': return `<${threshold}`;
      case 'eq': return `=${threshold}`;
      default: return `${threshold}`;
    }
  };

  switch (factor.factor_key) {
    // Options factors - handle both programmatic keys AND database factor names
    case 'opt-delta':
    case 'Delta': // Database factor name
      return { value: Math.abs(shortLeg?.delta || 0), target: formatTarget(factor.threshold, factor.direction) };

    case 'opt-theta':
    case 'Theta': // Database factor name
      return { value: shortLeg?.theta || null, target: formatTarget(factor.threshold, factor.direction) };

    case 'opt-vega':
    case 'Vega': // Database factor name
      return { value: shortLeg?.vega || null, target: formatTarget(factor.threshold, factor.direction) };

    case 'opt-iv':
    case 'Implied Volatility': // Database factor name
      return { value: shortLeg?.iv || null, target: formatTarget(factor.threshold, factor.direction) };

    case 'opt-oi':
    case 'opt-open-interest':
    case 'Open Interest': // Database factor name
      return { value: shortLeg?.oi || null, target: formatTarget(factor.threshold, factor.direction) };

    case 'opt-bid-ask-spread':
    case 'Bid-Ask Spread': // Database factor name
      const spread = shortLeg ? Math.abs((shortLeg.ask || 0) - (shortLeg.bid || 0)) : null;
      return { value: spread, target: formatTarget(factor.threshold, factor.direction) };

    // IV Rank
    case 'calc-iv-rank':
    case 'opt-iv-rank':
    case 'IV Rank': // Database factor name
      return { value: marketData?.iv_rank || null, target: formatTarget(factor.threshold, factor.direction) };

    // IV Percentile
    case 'calc-iv-percentile':
    case 'opt-iv-percentile':
    case 'IV Percentile': // Database factor name
      return { value: marketData?.iv_percentile || null, target: formatTarget(factor.threshold, factor.direction) };

    // Put/Call Volume Ratio
    case 'calc-put-call-volume-ratio':
    case 'opt-put-call-ratio':
    case 'Put/Call Ratio': // Database factor name
      return { value: marketData?.putCallRatio || null, target: formatTarget(factor.threshold, factor.direction) };

    // Put/Call OI Ratio
    case 'calc-put-call-oi-ratio':
    case 'opt-put-call-oi-ratio':
    case 'Put/Call OI Ratio': // Database factor name
      return { value: marketData?.putCallOIRatio || null, target: formatTarget(factor.threshold, factor.direction) };

    // Stock fundamental factors - calculate from Alpha Vantage data
    case 'calc-52w-range-position':
    case '52W Range Position': { // Database factor name
      const highStr = overview?.["52WeekHigh"];
      const lowStr = overview?.["52WeekLow"];
      if (highStr && lowStr && currentPrice) {
        const high = parseFloat(highStr);
        const low = parseFloat(lowStr);
        if (!isNaN(high) && !isNaN(low) && high > low) {
          const rangePosition = (currentPrice - low) / (high - low);
          return { value: rangePosition, target: formatTarget(factor.threshold, factor.direction) };
        }
      }
      return { value: null, target: formatTarget(factor.threshold, factor.direction) };
    }

    // Distance from 52W High - Returns decimal (0.15 = 15% below high)
    case 'calc-dist-52w-high':
    case 'Distance from 52W High': { // Database factor name
      const highStr = overview?.["52WeekHigh"];
      if (highStr && currentPrice) {
        const high = parseFloat(highStr);
        if (!isNaN(high) && high > 0) {
          // Distance from 52W high as decimal: (52W High - Price) / 52W High
          // e.g., 0.15 = 15% below high
          const distance = (high - currentPrice) / high;
          return { value: distance, target: formatTarget(factor.threshold, factor.direction) };
        }
      }
      return { value: null, target: formatTarget(factor.threshold, factor.direction) };
    }

    // Distance from 52W Low
    case 'calc-dist-52w-low': {
      const lowStr = overview?.["52WeekLow"];
      if (lowStr && currentPrice) {
        const low = parseFloat(lowStr);
        if (!isNaN(low) && low > 0) {
          // Percentage above 52-week low: ((Price - 52W Low) / 52W Low) * 100
          const distance = ((currentPrice - low) / low) * 100;
          return { value: distance, target: formatTarget(factor.threshold, factor.direction) };
        }
      }
      return { value: null, target: formatTarget(factor.threshold, factor.direction) };
    }

    // Market Cap Category - Returns actual market cap in dollars
    case 'calc-market-cap-category':
    case 'Market Cap Category': { // Database factor name
      const mcapStr = overview?.MarketCapitalization;
      if (mcapStr && mcapStr !== "None" && mcapStr !== "-") {
        const mcapVal = parseFloat(mcapStr);
        if (!isNaN(mcapVal)) {
          // Return actual market cap value in dollars
          return { value: mcapVal, target: formatTarget(factor.threshold, factor.direction) };
        }
      }
      return { value: null, target: formatTarget(factor.threshold, factor.direction) };
    }

    // Momentum
    case 'calc-price-momentum-5d':
    case 'calc-price-momentum-20d':
    case 'av-mom':  // Database factor key
    case 'Momentum': { // Database factor name
      // Use Alpha Vantage MOM indicator fetched in preFilterGeneral
      const momentum = fundamentalData?.momentum;
      if (momentum !== null && momentum !== undefined) {
        return { value: momentum, target: formatTarget(factor.threshold, factor.direction) };
      }
      return { value: null, target: formatTarget(factor.threshold, factor.direction) };
    }

    // 200 Day Moving Average
    case 'av-200-day-ma':  // Database factor key
    case '200 Day Moving Average': {
      // Use Alpha Vantage SMA(200) indicator fetched in preFilterGeneral
      const sma200 = fundamentalData?.sma200;
      console.log(`[getFactorValue] ${candidate.symbol} 200DMA: sma200=${sma200}, currentPrice=${currentPrice}`);
      if (sma200 !== null && sma200 !== undefined && currentPrice) {
        // Return ratio: currentPrice / MA200 (e.g., 1.05 means 5% above MA)
        const ratio = currentPrice / sma200;
        console.log(`[getFactorValue] ${candidate.symbol} 200DMA CALCULATED: ratio=${ratio.toFixed(2)}`);
        return { value: ratio, target: formatTarget(factor.threshold, factor.direction) };
      }
      console.log(`[getFactorValue] ${candidate.symbol} 200DMA: Returning NULL`);
      return { value: null, target: formatTarget(factor.threshold, factor.direction) };
    }

    // 50 Day Moving Average
    case 'av-50-day-ma':  // Database factor key
    case '50 Day Moving Average': {
      // Use Alpha Vantage SMA(50) indicator fetched in preFilterGeneral
      const sma50 = fundamentalData?.sma50;
      if (sma50 !== null && sma50 !== undefined && currentPrice) {
        // Return ratio: currentPrice / MA50 (e.g., 1.05 means 5% above MA)
        const ratio = currentPrice / sma50;
        return { value: ratio, target: formatTarget(factor.threshold, factor.direction) };
      }
      return { value: null, target: formatTarget(factor.threshold, factor.direction) };
    }

    // Analyst Rating Average
    case 'calc-dist-target-price':
    case 'Analyst Rating Average': { // Database factor name
      const targetStr = overview?.AnalystTargetPrice;
      if (targetStr && targetStr !== "None" && targetStr !== "-" && currentPrice) {
        const targetVal = parseFloat(targetStr);
        if (!isNaN(targetVal) && targetVal > 0) {
          // Percentage distance from analyst target: ((Target - Price) / Price) * 100
          const distance = ((targetVal - currentPrice) / currentPrice) * 100;
          return { value: distance, target: formatTarget(factor.threshold, factor.direction) };
        }
      }
      return { value: null, target: formatTarget(factor.threshold, factor.direction) };
    }

    // Legacy keys for backwards compatibility
    case 'stk-market-cap':
    case 'market_cap': {
      // Redirect to new calc-market-cap-category
      return getFactorValue({ ...factor, factor_key: 'calc-market-cap-category' }, candidate, state);
    }

    // Macro factors
    case 'av-inflation':
    case 'Inflation Rate': // Database factor name
      return { value: state.macroData?.inflation_rate || null, target: formatTarget(factor.threshold, factor.direction) };

    // News/sentiment factors
    case 'tavily-news-sentiment-score':
    case 'News Sentiment Score': { // Database factor name
      // Prefer Alpha Vantage sentiment score (real ML-based scores)
      const avSentiment = generalData?.av_news_sentiment;
      if (avSentiment && avSentiment.average_score !== null && avSentiment.count > 0) {
        // Alpha Vantage returns -1 to 1 scale already
        return { value: avSentiment.average_score, target: formatTarget(factor.threshold, factor.direction) };
      }

      // Fallback: Enhanced sentiment analysis from Tavily with weighted keywords
      const newsResults = generalData?.news || [];
      if (newsResults.length > 0) {
        const sentiments = newsResults.map((n: any) => {
          const text = ((n.title || '') + ' ' + (n.snippet || '')).toLowerCase();
          let score = 0;

          // Strong positive indicators (weight: 2)
          if (text.match(/\b(surge|soar|breakthrough|record high|strong beat|upgraded?|outperform|bullish)\b/i)) score += 2;

          // Moderate positive indicators (weight: 1)
          if (text.match(/\b(growth|gain|rise|profit|positive|beat|strong|improve|rally|boost|expand)\b/i)) score += 1;

          // Strong negative indicators (weight: -2)
          if (text.match(/\b(plunge|crash|collapse|downgraded?|bankruptcy|scandal|fraud|investigation)\b/i)) score -= 2;

          // Moderate negative indicators (weight: -1)
          if (text.match(/\b(weak|decline|drop|fall|miss|negative|loss|concern|risk|cut|downside)\b/i)) score -= 1;

          return score;
        });

        const avgSentiment = sentiments.reduce((a, b) => a + b, 0) / sentiments.length;
        // Normalize to -1 to 1 scale
        const normalized = Math.max(-1, Math.min(1, avgSentiment / 2));
        return { value: normalized, target: formatTarget(factor.threshold, factor.direction) };
      }
      return { value: null, target: formatTarget(factor.threshold, factor.direction) };
    }

    case 'tavily-news-volume':
    case 'News Volume': { // Database factor name
      // Try Tavily first, fallback to Alpha Vantage
      const tavilyCount = generalData?.news?.length || 0;
      const avCount = generalData?.av_news_sentiment?.count || 0;
      const count = tavilyCount > 0 ? tavilyCount : avCount;
      return { value: count > 0 ? count : null, target: formatTarget(factor.threshold, factor.direction) };
    }

    case 'tavily-analyst-rating-avg': {
      const targetStr = overview?.AnalystTargetPrice;
      if (targetStr && targetStr !== "None" && targetStr !== "-") {
        const targetVal = parseFloat(targetStr);
        if (!isNaN(targetVal)) {
          // Convert price target to 1-5 rating scale (simplified)
          // This is a placeholder - real analyst ratings would come from Tavily API
          return { value: 3.5, target: formatTarget(factor.threshold, factor.direction) };
        }
      }
      return { value: null, target: formatTarget(factor.threshold, factor.direction) };
    }

    case 'tavily-social-sentiment':
    case 'Social Media Sentiment': { // Database factor name
      // Calculate sentiment from social media results
      const socialResults = generalData?.social || [];
      if (socialResults.length > 0) {
        const sentiments = socialResults.map((s: any) => {
          const text = ((s.title || '') + ' ' + (s.snippet || '')).toLowerCase();
          let score = 0;

          // Strong positive indicators (weight: 2)
          if (text.match(/\b(moon|rocket|bullish|calls?|long|buy|dip|opportunity)\b/i)) score += 2;

          // Moderate positive indicators (weight: 1)
          if (text.match(/\b(good|great|strong|up|green|gain|win|hold)\b/i)) score += 1;

          // Strong negative indicators (weight: -2)
          if (text.match(/\b(crash|dump|bearish|puts?|short|sell|avoid|trap)\b/i)) score -= 2;

          // Moderate negative indicators (weight: -1)
          if (text.match(/\b(bad|weak|down|red|loss|lose|drop|fall)\b/i)) score -= 1;

          return score;
        });

        const avgSentiment = sentiments.reduce((a, b) => a + b, 0) / sentiments.length;
        // Normalize to -1 to 1 scale
        const normalized = Math.max(-1, Math.min(1, avgSentiment / 2));
        return { value: normalized, target: formatTarget(factor.threshold, factor.direction) };
      }
      return { value: null, target: formatTarget(factor.threshold, factor.direction) };
    }

    default:
      console.log(`[getFactorValue] UNMATCHED factor_key: "${factor.factor_key}" (name: ${factor.factor_name || factor.display_name})`);
      return { value: null, target: formatTarget(factor.threshold || 'see IPS', factor.direction || 'gte') };
  }
}

// Helper: Evaluate if a factor passes based on its value and threshold
function evaluateFactor(factor: any, value: any): boolean {
  if (value === null || value === undefined) return false;

  const threshold = factor.threshold;
  const direction = factor.direction;

  switch (direction) {
    case 'gte':
      return value >= threshold;
    case 'lte':
      return value <= threshold;
    case 'eq':
      return value === threshold;
    case 'gt':
      return value > threshold;
    case 'lt':
      return value < threshold;
    default:
      return true;
  }
}

// Helper: Calculate IPS score (re-evaluates all factors for accurate pass/fail)
async function calculateIPSScore(candidate: any, state: AgentState): Promise<number> {
  if (!state.ipsConfig || !state.ipsConfig.factors) return 50;

  let totalWeight = 0;
  let weightedScore = 0;
  const passedFactors: any[] = [];
  const minorMisses: any[] = [];
  const majorMisses: any[] = [];

  for (const factor of state.ipsConfig.factors) {
    if (!factor.enabled) continue;

    totalWeight += factor.weight;

    // Extract actual value from candidate data
    const { value, target } = getFactorValue(factor, candidate, state);

    // Re-evaluate the factor based on actual value and threshold
    const passed = evaluateFactor(factor, value);

    // Debug: Log first few factors with values
    if (totalWeight <= factor.weight * 5) {
      console.log(`[IPS Factor] ${factor.factor_name}: value=${value}, target=${target}, passed=${passed}`);
    }

    // For now, use simplified scoring until we have granular data
    const factorScore = passed ? 100 : 50;
    weightedScore += factorScore * factor.weight;

    const factorDetail = {
      factor_key: factor.factor_key,
      factor_name: factor.display_name || factor.factor_name,
      value,
      target,
      passed,
      weight: factor.weight,
      distance: 0, // Calculate distance if needed
      severity: passed ? 'pass' : 'major_miss' as const,
    };

    if (passed) {
      passedFactors.push(factorDetail);
    } else {
      majorMisses.push(factorDetail);
    }
  }

  const ipsScore = totalWeight > 0 ? (weightedScore / totalWeight) : 50;

  // Classify into tiers
  const tier =
    ipsScore >= 90 ? 'elite' :
    ipsScore >= 75 ? 'quality' :
    ipsScore >= 60 ? 'speculative' :
    null;

  // Build enhanced result
  const result = {
    ips_score: ipsScore,
    tier,
    factor_details: [...passedFactors, ...minorMisses, ...majorMisses],
    passed_factors: passedFactors,
    minor_misses: minorMisses,
    major_misses: majorMisses,
    total_weight_passed: passedFactors.reduce((sum, f) => sum + f.weight, 0),
    total_weight_minor: 0,
    total_weight_major: majorMisses.reduce((sum, f) => sum + f.weight, 0),
  };

  // Attach to candidate
  candidate.ips_factor_details = result;
  candidate.tier = tier;

  console.log(
    `[IPS] ${candidate.symbol}: Score=${ipsScore.toFixed(1)}%, ` +
    `Tier=${tier || 'none'}, ` +
    `Passed=${passedFactors.length}, ` +
    `Failed=${majorMisses.length}`
  );

  return ipsScore;
}

// ============================================================================
// STEP 11: Tiered Selection with Diversification (Elite/Quality/Speculative)
// ============================================================================

async function sortAndSelectTiered(state: AgentState): Promise<Partial<AgentState>> {
  console.log(`[TieredSelection] Sorting ${state.candidates.length} candidates by tier and composite score`);

  const { applyDiversificationFilters, calculateDiversityScore } = await import("./ips-enhanced-scoring");

  // Sort by tier first, then by composite score within tier
  const sorted = [...state.candidates].sort((a, b) => {
    // Tier priority: elite > quality > speculative > null
    const tierOrder = { elite: 4, quality: 3, speculative: 2 };
    const aTier = tierOrder[a.tier as keyof typeof tierOrder] || 1;
    const bTier = tierOrder[b.tier as keyof typeof tierOrder] || 1;

    if (aTier !== bTier) return bTier - aTier;

    // Within same tier, sort by composite score
    return (b.composite_score || 0) - (a.composite_score || 0);
  });

  // Select candidates by tier with limits
  const eliteCandidates = sorted.filter(c => c.tier === 'elite').slice(0, 5);
  const qualityCandidates = sorted.filter(c => c.tier === 'quality').slice(0, 10);
  const speculativeCandidates = sorted.filter(c => c.tier === 'speculative').slice(0, 5);

  // Combine all tiers
  let combined = [...eliteCandidates, ...qualityCandidates, ...speculativeCandidates];

  console.log(`[TieredSelection] Before diversification: Elite=${eliteCandidates.length}, Quality=${qualityCandidates.length}, Speculative=${speculativeCandidates.length}`);

  // Calculate diversity scores for each candidate
  const selectedCandidates: any[] = [];
  for (const candidate of combined) {
    const diversityScore = calculateDiversityScore(selectedCandidates, candidate);
    candidate.diversity_score = diversityScore;
  }

  // Apply diversification filters (max 3 per sector, 2 per symbol)
  const diversified = applyDiversificationFilters(combined, {
    maxPerSector: 3,
    maxPerSymbol: 2,
    maxPerStrategy: 10, // More lenient for strategies
  });

  console.log(`[TieredSelection] After diversification: ${diversified.length} selected`);

  // Log tier breakdown
  const finalElite = diversified.filter(c => c.tier === 'elite');
  const finalQuality = diversified.filter(c => c.tier === 'quality');
  const finalSpeculative = diversified.filter(c => c.tier === 'speculative');

  console.log(`[TieredSelection] Final breakdown:`);
  console.log(`  Elite (IPS≥90): ${finalElite.length} trades`);
  console.log(`  Quality (IPS 75-89): ${finalQuality.length} trades`);
  console.log(`  Speculative (IPS 60-74): ${finalSpeculative.length} trades`);
  console.log(`  Total: ${diversified.length} trades`);

  // Log details for each selected trade
  diversified.forEach((c, i) => {
    console.log(
      `  ${i + 1}. [${c.tier?.toUpperCase()}] ${c.symbol}: ` +
      `Composite=${c.composite_score?.toFixed(1)}, ` +
      `IPS=${c.ips_score?.toFixed(1)}%, ` +
      `Diversity=${c.diversity_score?.toFixed(0)}`
    );
  });

  return { selected: diversified };
}

// ============================================================================
// STEP 11.5: Generate AI Trade Rationales
// ============================================================================

async function generateTradeRationales(state: AgentState): Promise<Partial<AgentState>> {
  console.log(`[GenerateRationales] Generating AI rationales for ${state.selected.length} selected trades`);

  const enrichedTrades: any[] = [];

  for (const candidate of state.selected) {
    try {
      // Build context for rationale generation
      const prompt = `You are a professional options trading analyst. Generate a clear, concise rationale for this trade opportunity.

TRADE DETAILS:
Symbol: ${candidate.symbol}
Strategy: ${candidate.strategy}
Contract Legs: ${JSON.stringify(candidate.contract_legs, null, 2)}
Entry Price: $${candidate.entry_mid?.toFixed(2)}
Max Profit: $${candidate.max_profit?.toFixed(2)}
Max Loss: $${candidate.max_loss?.toFixed(2)}
Breakeven: $${candidate.breakeven?.toFixed(2)}
Probability of Profit: ${candidate.est_pop?.toFixed(0)}%

SCORING:
Composite Score: ${candidate.composite_score?.toFixed(1)}/100
IPS Score: ${candidate.ips_score?.toFixed(1)}%
Yield Score: ${candidate.yield_score?.toFixed(1)}
${candidate.historical_analysis?.has_data ? `
Historical Performance:
- Win Rate: ${(candidate.historical_analysis.win_rate * 100).toFixed(1)}%
- Similar Trades: ${candidate.historical_analysis.trade_count}
- Avg ROI: ${candidate.historical_analysis.avg_roi?.toFixed(1)}%
- Confidence: ${candidate.historical_analysis.confidence}` : ''}

MARKET DATA:
${state.fundamentalData?.[candidate.symbol] ? `
Company: ${state.fundamentalData[candidate.symbol].Name || candidate.symbol}
Sector: ${state.fundamentalData[candidate.symbol].Sector || 'N/A'}
Industry: ${state.fundamentalData[candidate.symbol].Industry || 'N/A'}
Market Cap: ${state.fundamentalData[candidate.symbol].MarketCapitalization || 'N/A'}
P/E Ratio: ${state.fundamentalData[candidate.symbol].PERatio || 'N/A'}
Beta: ${state.fundamentalData[candidate.symbol].Beta || 'N/A'}` : 'Fundamental data unavailable'}

${state.generalData?.[candidate.symbol]?.news_results ? `
RECENT NEWS (Top 3):
${state.generalData[candidate.symbol].news_results.slice(0, 3).map((n: any, i: number) =>
  `${i + 1}. ${n.title}`
).join('\n')}` : ''}

Generate a professional trade rationale with these sections:

1. RATIONALE (2-3 sentences): Why this trade makes sense right now
2. NEWS_SUMMARY (1-2 sentences): Key market context from recent news
3. MACRO_CONTEXT (1 sentence): Relevant macro/sector trends
4. OUT_OF_IPS_JUSTIFICATION (if IPS score < 70): Why this trade is still recommended despite lower IPS score

Respond with JSON:
{
  "rationale": "string",
  "news_summary": "string or null",
  "macro_context": "string or null",
  "out_of_ips_justification": "string or null (only if IPS score < 70)"
}`;

      const response = await rationaleLLM(prompt);

      // Parse the LLM response
      let parsed;
      try {
        parsed = JSON.parse(response);
      } catch (e) {
        // Try to find JSON in the response
        const jsonMatch = response.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          parsed = JSON.parse(jsonMatch[0]);
        } else {
          console.warn(`[GenerateRationales] Failed to parse JSON for ${candidate.symbol}, using fallback`);
          parsed = {
            rationale: `${candidate.strategy} on ${candidate.symbol} with ${candidate.composite_score?.toFixed(1)}/100 composite score. Max profit: $${candidate.max_profit?.toFixed(2)}, Max loss: $${candidate.max_loss?.toFixed(2)}, PoP: ${candidate.est_pop?.toFixed(0)}%.`,
            news_summary: null,
            macro_context: null,
            out_of_ips_justification: null,
          };
        }
      }

      // Attach rationale and detailed analysis to candidate
      candidate.rationale = parsed.rationale;
      candidate.detailed_analysis = {
        ...(candidate.detailed_analysis || {}),
        news_summary: parsed.news_summary,
        macro_context: parsed.macro_context,
        out_of_ips_justification: parsed.out_of_ips_justification,
        ips_name: state.ipsConfig?.name,
        ips_factors: candidate.ips_factors,
        api_data: state.fundamentalData?.[candidate.symbol] ? {
          company_name: state.fundamentalData[candidate.symbol].Name,
          sector: state.fundamentalData[candidate.symbol].Sector,
          industry: state.fundamentalData[candidate.symbol].Industry,
          market_cap: state.fundamentalData[candidate.symbol].MarketCapitalization,
          pe_ratio: state.fundamentalData[candidate.symbol].PERatio,
          beta: state.fundamentalData[candidate.symbol].Beta,
          eps: state.fundamentalData[candidate.symbol].EPS,
          dividend_yield: state.fundamentalData[candidate.symbol].DividendYield,
          profit_margin: state.fundamentalData[candidate.symbol].ProfitMargin,
          roe: state.fundamentalData[candidate.symbol].ReturnOnEquityTTM,
          week52_high: state.fundamentalData[candidate.symbol]["52WeekHigh"],
          week52_low: state.fundamentalData[candidate.symbol]["52WeekLow"],
          analyst_target: state.fundamentalData[candidate.symbol].AnalystTargetPrice,
        } : null,
        news_results: state.generalData?.[candidate.symbol]?.news_results || [],
      };

      enrichedTrades.push(candidate);

      console.log(`[GenerateRationales] ${candidate.symbol}: Rationale generated (${parsed.rationale.length} chars)`);

    } catch (error: any) {
      console.error(`[GenerateRationales] Error for ${candidate.symbol}:`, error.message);

      // Add fallback rationale
      candidate.rationale = `${candidate.strategy} on ${candidate.symbol} with ${candidate.composite_score?.toFixed(1)}/100 composite score. Entry at $${candidate.entry_mid?.toFixed(2)} with max profit of $${candidate.max_profit?.toFixed(2)}.`;
      candidate.detailed_analysis = {
        ...(candidate.detailed_analysis || {}),
        news_summary: null,
        macro_context: null,
        out_of_ips_justification: null,
      };

      enrichedTrades.push(candidate);
    }
  }

  return { selected: enrichedTrades };
}

// ============================================================================
// STEP 12: Diversification Check
// ============================================================================

async function diversificationCheck(state: AgentState): Promise<Partial<AgentState>> {
  console.log(`[Diversification] Checking portfolio concentration for ${state.selected.length} trades`);

  const diversified: any[] = [];
  const symbolCounts: Record<string, number> = {};
  const expirationCounts: Record<string, number> = {};
  const strategyCounts: Record<string, number> = {};

  for (const candidate of state.selected) {
    const symbol = candidate.symbol;
    const expiration = candidate.contract_legs?.[0]?.expiry || 'unknown';
    const strategy = candidate.strategy;

    // Track counts
    symbolCounts[symbol] = (symbolCounts[symbol] || 0) + 1;
    expirationCounts[expiration] = (expirationCounts[expiration] || 0) + 1;
    strategyCounts[strategy] = (strategyCounts[strategy] || 0) + 1;

    // Check diversification rules
    const warnings: string[] = [];

    if (symbolCounts[symbol] > 2) {
      warnings.push(`⚠️ Already have ${symbolCounts[symbol]} ${symbol} positions`);
    }

    if (expirationCounts[expiration] > 3) {
      warnings.push(`⚠️ ${expirationCounts[expiration]} trades expiring ${expiration}`);
    }

    // Calculate portfolio weight (assuming equal sizing)
    const portfolioWeight = (100 / state.selected.length);
    if (portfolioWeight > 30) {
      warnings.push(`⚠️ ${portfolioWeight.toFixed(0)}% portfolio concentration`);
    }

    candidate.diversification_warnings = warnings;
    diversified.push(candidate);

    if (warnings.length > 0) {
      console.log(`[Diversification] ${symbol}: ${warnings.join(', ')}`);
    }
  }

  return { selected: diversified };
}

// ============================================================================
// STEP 13: Final Output - Display to User
// ============================================================================

async function finalizeOutput(state: AgentState): Promise<Partial<AgentState>> {
  console.log(`[FinalizeOutput] Preparing final output for ${state.selected.length} trades`);

  for (const candidate of state.selected) {
    // Persist to database with enhanced IPS details
    await db.persistCandidate(state.runId, {
      ...candidate,
      tier: candidate.tier,
      diversity_score: candidate.diversity_score,
      ips_factor_scores: candidate.ips_factor_details,
      detailed_analysis: {
        composite_score: candidate.composite_score,
        yield_score: candidate.yield_score,
        ips_score: candidate.ips_score,
        tier: candidate.tier,
        ips_factor_details: candidate.ips_factor_details,
        diversity_score: candidate.diversity_score,
        historical_win_rate: candidate.historical_win_rate,
        diversification_warnings: candidate.diversification_warnings,
        reasoning_decisions: state.reasoningDecisions,
      }
    });

    // Log summary
    console.log(`[FinalizeOutput] ${candidate.symbol} ${candidate.strategy}:`);
    console.log(`  IPS Score: ${candidate.ips_score?.toFixed(1)}%`);
    console.log(`  Composite: ${candidate.composite_score?.toFixed(1)}`);
    console.log(`  Entry: $${candidate.entry_mid?.toFixed(2)} | Max Profit: $${candidate.max_profit?.toFixed(2)} | Max Loss: $${candidate.max_loss?.toFixed(2)}`);
    console.log(`  Warnings: ${candidate.diversification_warnings?.length || 0}`);
  }

  return { selected: state.selected };
}

// ============================================================================
// Build graph
// ============================================================================

export function buildAgentV3Graph() {
  const graph = new StateGraph<AgentState>({
    channels: {
      runId: null,
      mode: null,
      symbols: null,
      survivingSymbols: null,
      ipsId: null,
      ipsConfig: null,
      asof: null,
      generalData: null,
      marketData: null,
      fundamentalData: null,
      macroData: null,
      features: null,
      candidates: null,
      scores: null,
      selected: null,
      reasoningDecisions: null,
      errors: null,
    },
  });

  // Add all nodes
  graph.addNode("FetchIPS", fetchIPS);
  graph.addNode("PreFilterGeneral", preFilterGeneral);
  graph.addNode("ReasoningCheckpoint1", reasoningCheckpoint1);
  graph.addNode("FetchOptionsChains", fetchOptionsChains);
  graph.addNode("FilterHighWeightFactors", filterHighWeightFactors);
  graph.addNode("ReasoningCheckpoint2", reasoningCheckpoint2);
  graph.addNode("FilterLowWeightFactors", filterLowWeightFactors);
  graph.addNode("ReasoningCheckpoint3", reasoningCheckpoint3);
  graph.addNode("RAGScoring", ragCorrelationScoring);
  graph.addNode("SortTop5", sortAndSelectTiered);
  graph.addNode("GenerateRationales", generateTradeRationales);
  graph.addNode("Diversification", diversificationCheck);
  graph.addNode("FinalizeOutput", finalizeOutput);

  // Define edges
  graph.setEntryPoint("FetchIPS");
  graph.addEdge("FetchIPS", "PreFilterGeneral");
  graph.addEdge("PreFilterGeneral", "ReasoningCheckpoint1");

  // Checkpoint 1: Proceed after general filter?
  graph.addConditionalEdges(
    "ReasoningCheckpoint1",
    (state: AgentState) => {
      const lastDecision = state.reasoningDecisions?.[state.reasoningDecisions.length - 1];
      return lastDecision?.decision === "REJECT" ? "end" : "continue";
    },
    {
      continue: "FetchOptionsChains",
      end: "__end__"
    }
  );

  graph.addEdge("FetchOptionsChains", "FilterHighWeightFactors");
  graph.addEdge("FilterHighWeightFactors", "ReasoningCheckpoint2");

  // Checkpoint 2: Proceed after high-weight filter?
  graph.addConditionalEdges(
    "ReasoningCheckpoint2",
    (state: AgentState) => {
      const lastDecision = state.reasoningDecisions?.[state.reasoningDecisions.length - 1];
      return lastDecision?.decision === "REJECT" ? "end" : "continue";
    },
    {
      continue: "FilterLowWeightFactors",
      end: "__end__"
    }
  );

  graph.addEdge("FilterLowWeightFactors", "ReasoningCheckpoint3");

  // Checkpoint 3: Proceed after low-weight filter?
  graph.addConditionalEdges(
    "ReasoningCheckpoint3",
    (state: AgentState) => {
      const lastDecision = state.reasoningDecisions?.[state.reasoningDecisions.length - 1];
      // If we have near-miss candidates in "selected", continue to FinalizeOutput to display them
      if (lastDecision?.decision === "REJECT" && state.selected && state.selected.length > 0) {
        return "finalize_near_miss";
      }
      return lastDecision?.decision === "REJECT" ? "end" : "continue";
    },
    {
      continue: "RAGScoring",
      finalize_near_miss: "FinalizeOutput",
      end: "__end__"
    }
  );

  graph.addEdge("RAGScoring", "SortTop5");
  graph.addEdge("SortTop5", "GenerateRationales");
  graph.addEdge("GenerateRationales", "Diversification");
  graph.addEdge("Diversification", "FinalizeOutput");
  graph.setFinishPoint("FinalizeOutput");

  return graph.compile();
}

// ============================================================================
// Main entry point
// ============================================================================

export async function runAgentV3(props: {
  symbols: string[];
  mode: "backtest" | "paper" | "live";
  ipsId?: string;
}) {
  const runId = uuidv4();
  const asof = new Date().toISOString();

  console.log(`\n\n🚀🚀🚀 [AgentV3] NEW CODE VERSION - Oct 8 2025 - TOLERANCE FIX v2 + 50 STRIKES 🚀🚀🚀`);
  console.log(`[AgentV3] Starting run ${runId} with ${props.symbols.length} symbols, IPS: ${props.ipsId || 'none'}`);

  // Write a marker file to confirm new code is running
  const fs = require('fs');
  fs.writeFileSync('agent-run-marker.txt', `Run started at ${new Date().toISOString()}\nVersion: EPSILON_FIX_50_STRIKES\n`, 'utf8');

  try {
    await db.openRun({ runId, mode: props.mode, symbols: props.symbols });

    const initialState: AgentState = {
      runId,
      mode: props.mode,
      symbols: props.symbols,
      survivingSymbols: [],
      ipsId: props.ipsId,
      ipsConfig: null,
      asof,
      generalData: {},
      marketData: {},
      fundamentalData: {},
      macroData: {},
      features: {},
      candidates: [],
      scores: [],
      selected: [],
      reasoningDecisions: [],
      errors: [],
    };

    const compiledGraph = buildAgentV3Graph();
    const result = await compiledGraph.invoke(initialState);

    await db.closeRun(runId, {
      candidates_count: result.candidates?.length || 0,
      reasoning_decisions: result.reasoningDecisions || [],
      errors: result.errors || [],
    });

    console.log(`[AgentV3] Completed run ${runId}. Candidates: ${result.candidates?.length || 0}`);

    return result;
  } catch (error: any) {
    console.error(`[AgentV3] Run ${runId} failed:`, error);
    await db.closeRun(runId, { error: error.message });
    throw error;
  }
}
