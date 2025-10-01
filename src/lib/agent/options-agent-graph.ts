// Options Trading Agent - LangGraph Implementation
import { StateGraph } from "@langchain/langgraph";
import { v4 as uuidv4 } from "uuid";
import pRetry from "p-retry";
import PQueue from "p-queue";
import dayjs from "dayjs";

// Import clients
import { getOptionsChain, getQuote } from "@/lib/clients/alphaVantage";
import { getSeries } from "@/lib/clients/fred";
import { tavilySearch } from "@/lib/clients/tavily";
import { rationaleLLM } from "@/lib/clients/llm";
import * as db from "@/lib/db/agent";
import { buildReasoningChain } from "./deep-reasoning";

// State interface
interface AgentState {
  runId: string;
  mode: "backtest" | "paper" | "live";
  symbols: string[];
  ipsId?: string;
  ipsConfig?: any;
  asof: string;
  marketData: Record<string, any>;
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

// Node 1: FetchMarketData
async function fetchMarketData(state: AgentState): Promise<Partial<AgentState>> {
  console.log(`[FetchMarketData] Processing ${state.symbols.length} symbols`);
  const marketData: Record<string, any> = {};
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

      const latency = Date.now() - start;
      await db.logTool(state.runId, "FetchMarketData", { symbol }, { count: normalized.length }, latency);
    } catch (error: any) {
      console.error(`[FetchMarketData] Error for ${symbol}:`, error);
      errors.push(`${symbol}: ${error.message}`);
    }
  }

  return { marketData, errors: [...state.errors, ...errors] };
}

// Node 2: FetchMacroData
async function fetchMacroData(state: AgentState): Promise<Partial<AgentState>> {
  console.log("[FetchMacroData] Fetching macro indicators");
  try {
    const start = Date.now();
    const series = ["DFF", "UNRATE", "T10Y3M"]; // Fed Funds, Unemployment, Term Spread
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
  console.log("[GenerateCandidates] Generating trade ideas");
  const candidates: any[] = [];

  for (const symbol of state.symbols) {
    const data = state.marketData[symbol];
    if (!data || !data.contracts) continue;

    const contracts = data.contracts;
    const quote = data.quote?.["Global Quote"] || {};
    const currentPrice = parseFloat(quote["05. price"]) || 0;

    if (!currentPrice) continue;

    // Filter for put credit spreads (example strategy)
    const puts = contracts.filter((c: any) => c.option_type === "P" && c.expiry);

    // Group by expiration
    const expirations = [...new Set(puts.map((p: any) => p.expiry))];

    for (const expiry of expirations.slice(0, 3)) {
      // Limit to 3 expirations
      const expiryPuts = puts.filter((p: any) => p.expiry === expiry);

      // Find options with strike < current price (OTM puts)
      // Filter to only use puts that are sufficiently out of the money
      // Avoid ATM options (within 2% of current price) which have high delta risk
      const minStrike = currentPrice * 0.85; // At least 15% OTM
      const maxStrike = currentPrice * 0.98; // No closer than 2% to current price

      const otmPuts = expiryPuts
        .filter((p: any) => {
          if (!p.strike || !p.bid || !p.ask) return false;
          if (p.strike >= maxStrike) return false; // Too close to current price
          if (p.strike < minStrike) return false; // Too far OTM
          // Filter out options with very high delta (>0.4) if available
          if (p.delta && Math.abs(p.delta) > 0.4) return false;
          return p.strike < currentPrice;
        })
        .sort((a: any, b: any) => b.strike - a.strike);

      if (otmPuts.length < 2) continue;

      // Select short and long strikes
      // Short put should be highest available OTM strike (but not ATM)
      // Long put should be 2-3 strikes lower for reasonable spread width
      const shortPut = otmPuts[0];
      const longPut = otmPuts[Math.min(2, otmPuts.length - 1)];

      // Validate spread quality
      const width = shortPut.strike - longPut.strike;
      if (width <= 0) continue; // Invalid spread

      const entryMid = ((shortPut.bid + shortPut.ask) / 2) - ((longPut.bid + longPut.ask) / 2);
      if (entryMid <= 0) continue; // Should receive a credit

      const maxProfit = entryMid;
      const maxLoss = width - entryMid;
      const breakeven = shortPut.strike - entryMid;

      // Better risk/reward check - avoid trades where max loss is much greater than max profit
      const riskRewardRatio = maxProfit / maxLoss;
      if (riskRewardRatio < 0.15) continue; // Skip if risk/reward is too poor

      // Compute est_pop from greeks if available, otherwise use approximation
      let estPop = 0.7; // Default assumption
      if (shortPut.delta) {
        // POP is approximately (1 - abs(delta)) for short puts
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
          },
          {
            type: "BUY",
            right: "P",
            strike: longPut.strike,
            expiry: longPut.expiry,
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

  return { candidates };
}

// Node 5: RiskGuardrails
async function riskGuardrails(state: AgentState): Promise<Partial<AgentState>> {
  console.log("[RiskGuardrails] Checking risk flags");
  const candidates = state.candidates.map((c) => ({ ...c }));

  for (const c of candidates) {
    // Check for earnings in next 10 days
    try {
      const tav = await tavilySearch(
        `${c.symbol} earnings date next 10 days`,
        { time_range: "week", max_results: 5 }
      );
      c.guardrail_flags.earnings_risk = tav.results.some((r: any) =>
        r.snippet.toLowerCase().includes("earnings")
      );
    } catch (error) {
      c.guardrail_flags.earnings_risk = false;
    }

    // Check macro events
    try {
      const macroSearch = await tavilySearch(
        "FOMC schedule next 10 days CPI NFP calendar",
        { time_range: "month", max_results: 5 }
      );
      c.guardrail_flags.macro_event = macroSearch.results.some((r: any) =>
        r.snippet.toLowerCase().includes("fomc")
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

// Node 6: ScoreIPS
async function scoreIPS(state: AgentState): Promise<Partial<AgentState>> {
  console.log("[ScoreIPS] Scoring trades with IPS:", state.ipsConfig?.name || "default");
  const scores: any[] = [];

  for (const c of state.candidates) {
    // Use adjusted score from DeepReasoning if available, otherwise fallback to simple scoring
    let scorePercent = 50;
    let breakdown: Record<string, any> = {};

    if (c.reasoning_chain && c.adjusted_score != null) {
      // Use the comprehensive score from DeepReasoning
      scorePercent = c.adjusted_score;
      breakdown = {
        ips_baseline: c.ips_baseline_score,
        adjusted: c.adjusted_score,
        historical_influence: c.reasoning_chain.historical_context?.has_data ? "applied" : "none",
        market_adjustments: c.reasoning_chain.threshold_adjustments?.length || 0,
        recommendation: c.recommendation,
      };

      // Add detailed IPS factor scores
      if (c.reasoning_chain.ips_compliance?.factor_scores) {
        breakdown.ips_factors = c.reasoning_chain.ips_compliance.factor_scores;
      }
    } else {
      // Fallback to old simple scoring if DeepReasoning was skipped
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

      // Apply simple adjustments
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

    const scoreObj = {
      symbol: c.symbol,
      strategy: c.strategy,
      score: scorePercent,
      breakdown,
      version: state.ipsConfig ? "ips_v1" : "default_v1",
    };

    scores.push(scoreObj);
    await db.persistScore(state.runId, scoreObj);

    // Build IPS factors comparison for detailed analysis
    if (!c.detailed_analysis) c.detailed_analysis = {};
    c.detailed_analysis.ips_factors = [];

    // Use reasoning chain compliance data if available
    if (c.reasoning_chain?.ips_compliance?.factor_scores) {
      for (const [factorName, factorData] of Object.entries(c.reasoning_chain.ips_compliance.factor_scores)) {
        if (typeof factorData === "object" && "value" in factorData) {
          c.detailed_analysis.ips_factors.push({
            name: factorName,
            target: factorData.target || "see IPS",
            actual: typeof factorData.value === "number" ? factorData.value.toFixed(2) : String(factorData.value),
            status: factorData.pass ? "pass" : "fail",
          });
        }
      }

      // Add violations and passes summary
      if (c.reasoning_chain.ips_compliance.violations?.length > 0) {
        c.detailed_analysis.ips_violations = c.reasoning_chain.ips_compliance.violations;
      }
      if (c.reasoning_chain.ips_compliance.passes?.length > 0) {
        c.detailed_analysis.ips_passes = c.reasoning_chain.ips_compliance.passes;
      }
    } else {
      // Fallback to old format
      for (const [factorName, weightData] of Object.entries(breakdown)) {
        if (factorName === "risk_reward" || factorName === "guardrails") continue;
        if (typeof weightData === "object" && "value" in weightData && weightData.value !== undefined) {
          const value = weightData.value;
          const status = value >= 60 ? "pass" : value >= 40 ? "warning" : "fail";
          c.detailed_analysis.ips_factors.push({
            name: factorName,
            target: "> 60 (preferred)",
            actual: value.toFixed(1),
            status,
          });
        }
      }
    }
  }

  return { scores, candidates: state.candidates };
}

// Node 7: LLM_Rationale
async function llmRationale(state: AgentState): Promise<Partial<AgentState>> {
  console.log("[LLM_Rationale] Generating rationales");
  const candidates = state.candidates.map((c) => ({ ...c }));

  for (const c of candidates) {
    try {
      // Fetch recent news
      const res = await tavilySearch(
        `${c.symbol} company news last 3 days`,
        { time_range: "week", max_results: 3 }
      );

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

      c.rationale = shortSummary(c.symbol, ipsScore / 100, features, newsSignal, riskNote);

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
        const justificationPrompt = `This ${c.symbol} ${c.strategy.replace(/_/g, " ")} trade only scores ${ipsFitPct}% on the IPS criteria, which is below the preferred threshold of 60%.

Key factors that are concerning:
${factorHighlights.filter((h) => h.includes("low") || h.includes("limited") || h.includes("risk")).join(", ")}

Despite this, the AI is suggesting this trade. In 2-3 sentences, explain:
1. Why this trade might still be valuable despite not meeting IPS criteria
2. What specific opportunity or edge makes it worth considering
3. What conditions would need to be true for this to be a good trade

Be honest - if there's no compelling reason, say so directly.`;

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
  console.log("[SelectTopK] Selecting top trades");

  // Sort by score descending
  const scored = state.candidates.map((c) => {
    const scoreData = state.scores.find(
      (s) => s.symbol === c.symbol && s.strategy === c.strategy
    );
    return { ...c, score: scoreData?.score || 0 };
  });

  scored.sort((a, b) => b.score - a.score);

  // Select top 10
  const selected = scored.slice(0, 10);

  // Persist candidates
  for (const c of selected) {
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
      asof: null,
      marketData: null,
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

  graph.addNode("FetchMarketData", fetchMarketData);
  graph.addNode("FetchMacroData", fetchMacroData);
  graph.addNode("EngineerFeatures", engineerFeatures);
  graph.addNode("GenerateCandidates", generateCandidates);
  graph.addNode("RiskGuardrails", riskGuardrails);
  graph.addNode("DeepReasoning", deepReasoning);
  graph.addNode("ScoreIPS", scoreIPS);
  graph.addNode("LLM_Rationale", llmRationale);
  graph.addNode("SelectTopK", selectTopK);

  // Define edges - DeepReasoning now sits between RiskGuardrails and ScoreIPS
  graph.setEntryPoint("FetchMarketData");
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

  // Load IPS configuration if provided
  let ipsConfig = null;
  if (props.ipsId) {
    try {
      const { loadActiveIPS } = await import("@/lib/ips/loader");
      const { assertIPSShape } = await import("@/lib/ips/assert");

      ipsConfig = await loadActiveIPS();
      assertIPSShape(ipsConfig);

      console.log(`[Agent] Loaded IPS config: ${ipsConfig.name} with ${ipsConfig.factors?.length || 0} factors`);
    } catch (error: any) {
      console.error("[Agent] Failed to load IPS config:", error.message);
    }
  }

  try {
    // Open run
    await db.openRun({ runId, mode: props.mode, symbols: props.symbols });

    // Initialize state
    const initialState: AgentState = {
      runId,
      mode: props.mode,
      symbols: props.symbols,
      ipsId: props.ipsId,
      ipsConfig,
      asof,
      marketData: {},
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
