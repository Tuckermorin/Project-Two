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

  if (!state.ipsId) {
    console.log("[FetchIPS] No IPS ID provided, using default");
    return { ipsConfig: null };
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
      survivingSymbols: state.symbols
    };
  } catch (error: any) {
    console.error("[FetchIPS] Failed to load IPS config:", error.message);
    return {
      ipsConfig: null,
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

      // Fetch news sentiment
      const newsSearch = await tavilySearch(
        `${symbol} stock news earnings`,
        { time_range: "week", max_results: 5 }
      );

      generalData[symbol] = {
        overview,
        news: newsSearch.results,
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

      marketData[symbol] = {
        contracts: normalized,
        quote,
        asof: result.asof,
      };

      // Merge with general data fundamentals if available
      fundamentalData[symbol] = state.generalData[symbol]?.overview || null;

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

  const candidates: any[] = [];

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

    // Filter candidates by high-weight factors
    for (const candidate of symbolCandidates) {
      let passes = true;
      const violations: string[] = [];

      for (const factor of highWeightChainFactors) {
        const result = evaluateChainFactor(factor, candidate, data);
        if (!result.pass) {
          passes = false;
          violations.push(`${factor.display_name}: ${result.reason}`);
        }
      }

      if (passes || highWeightChainFactors.length === 0) {
        candidates.push(candidate);
      } else {
        console.log(`[FilterHighWeight] ✗ ${symbol} candidate filtered: ${violations.join(', ')}`);
      }
    }
  }

  console.log(`[FilterHighWeight] ${candidates.length} candidates passed high-weight filters`);

  return { candidates };
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

    // Create spread candidates - search through up to 20 strikes to find suitable deltas
    for (let i = 0; i < Math.min(20, expiryPuts.length - 1); i++) {
      const shortPut = expiryPuts[i];
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
      if (factor.direction === 'lte' && delta > (factor.threshold || 1)) {
        return { pass: false, reason: `Delta ${delta.toFixed(2)} exceeds ${factor.threshold}` };
      }
      if (factor.direction === 'gte' && delta < (factor.threshold || 0)) {
        return { pass: false, reason: `Delta ${delta.toFixed(2)} below ${factor.threshold}` };
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
      if (factor.direction === 'lte' && spread > (factor.threshold || 999)) {
        return { pass: false, reason: `Spread $${spread.toFixed(2)} exceeds $${factor.threshold}` };
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

// Helper: Calculate IPS score
async function calculateIPSScore(candidate: any, state: AgentState): Promise<number> {
  if (!state.ipsConfig || !state.ipsConfig.factors) return 50;

  let totalWeight = 0;
  let weightedScore = 0;

  for (const factor of state.ipsConfig.factors) {
    totalWeight += factor.weight;

    // Check if factor passed (from previous filtering steps)
    const highWeightScore = candidate.high_weight_factor_scores?.find((s: any) => s.factor === factor.factor_key);
    const lowWeightScore = candidate.low_weight_factor_scores?.find((s: any) => s.factor === factor.factor_key);

    const passed = highWeightScore?.pass || lowWeightScore?.pass || false;
    const factorScore = passed ? 100 : 50; // Binary for now

    weightedScore += factorScore * factor.weight;
  }

  return totalWeight > 0 ? (weightedScore / totalWeight) : 50;
}

// ============================================================================
// STEP 11: Sort Highest to Lowest Yield (Top 5)
// ============================================================================

async function sortAndSelectTop5(state: AgentState): Promise<Partial<AgentState>> {
  console.log(`[SortTop5] Sorting ${state.candidates.length} candidates by composite score`);

  const sorted = [...state.candidates].sort((a, b) => {
    return (b.composite_score || 0) - (a.composite_score || 0);
  });

  const top5 = sorted.slice(0, 5);

  console.log(`[SortTop5] Selected top 5:`);
  top5.forEach((c, i) => {
    console.log(`  ${i + 1}. ${c.symbol}: Composite=${c.composite_score?.toFixed(1)}`);
  });

  return { selected: top5 };
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
    // Persist to database
    await db.persistCandidate(state.runId, {
      ...candidate,
      detailed_analysis: {
        composite_score: candidate.composite_score,
        yield_score: candidate.yield_score,
        ips_score: candidate.ips_score,
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
  graph.addNode("SortTop5", sortAndSelectTop5);
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
      return lastDecision?.decision === "REJECT" ? "end" : "continue";
    },
    {
      continue: "RAGScoring",
      end: "__end__"
    }
  );

  graph.addEdge("RAGScoring", "SortTop5");
  graph.addEdge("SortTop5", "Diversification");
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

  console.log(`[AgentV3] Starting run ${runId} with ${props.symbols.length} symbols, IPS: ${props.ipsId || 'none'}`);

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
