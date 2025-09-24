import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getAlphaVantageClient } from "@/lib/api/alpha-vantage";
import { getMarketDataService } from "@/lib/services/market-data-service";
import { computeTradeFeatures } from "@/lib/services/trade-features-service";
import { getBenchmarks } from "@/lib/services/trade-benchmarks-service";
import { computeIpsScore, type ScoreComputationResult } from "@/lib/services/trade-scoring-service";

type FactorValue = number | string | boolean | null;

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error(
    "Supabase env vars NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY are required for /api/ai/analyze."
  );
}

const supabase = createClient(supabaseUrl, supabaseKey);

const BENCHMARK_MIN_N = Number(process.env.SCORER_BENCHMARK_MIN_N ?? 30);
const DEFAULT_MAX_ADJUST = Number(process.env.SCORER_AI_MAX_ADJ_DEFAULT ?? 5);
const BENCHMARK_MAX_ADJUST = Number(process.env.SCORER_AI_MAX_ADJ_WITH_BENCH ?? 10);
const PROMPT_VERSION = process.env.SCORER_PROMPT_VERSION ?? "2024-09-24-v1";

interface FactorScoreBreakdown {
  factorName: string;
  value: FactorValue;
  weight: number;
  individualScore: number;
  weightedScore?: number;
  targetMet: boolean;
}

interface AnalyzeRequestBody {
  trade: Record<string, any> | null;
  score?: number | null;
  scoreId?: string | null;
  breakdown?: {
    totalWeight: number;
    weightedSum: number;
    factorScores: FactorScoreBreakdown[];
    targetsMetCount: number;
    targetPercentage: number;
  } | null;
  ipsName?: string | null;
  strategyType?: string | null;
  tradeId?: string | null;
  ipsId?: string | null;
  factorValues?: Record<string, any> | null;
  model?: string | null;
}

type OllamaMessage = {
  role: string;
  content: string;
  name?: string;
};

type ToolSchema = {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, any>;
  };
};

const DAY_MS = 24 * 60 * 60 * 1000;

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

const toNumber = (raw: unknown): number | null => {
  if (raw === null || raw === undefined || raw === "") return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
};

const normalizeFactorValue = (input: unknown): FactorValue => {
  if (
    input === null ||
    input === undefined ||
    typeof input === "number" ||
    typeof input === "string" ||
    typeof input === "boolean"
  ) {
    return input as FactorValue;
  }
  if (
    typeof input === "object" &&
    input !== null &&
    "value" in (input as Record<string, unknown>)
  ) {
    return normalizeFactorValue((input as Record<string, unknown>).value);
  }
  return null;
};

const normalizeFactorMap = (
  input: Record<string, unknown> | null | undefined
): Record<string, FactorValue> => {
  const result: Record<string, FactorValue> = {};
  if (!input) return result;
  for (const [key, value] of Object.entries(input)) {
    result[key] = normalizeFactorValue(value);
  }
  return result;
};

const calcDte = (expiration: string | null | undefined): number | null => {
  if (!expiration) return null;
  const exp = new Date(expiration);
  if (Number.isNaN(exp.getTime())) return null;
  const diff = exp.getTime() - Date.now();
  return Math.max(0, Math.round(diff / DAY_MS));
};

const buildTradeLegs = (
  trade: Record<string, any> | null | undefined,
  contractType: string,
  expiry: string | null,
  qty: number | null
) => {
  const shortStrike = toNumber(
    trade?.shortPutStrike ?? trade?.shortCallStrike ?? trade?.shortStrike
  );
  const longStrike = toNumber(
    trade?.longPutStrike ?? trade?.longCallStrike ?? trade?.longStrike
  );
  const optionStrike = toNumber(trade?.optionStrike ?? trade?.strike);
  const legs: Array<Record<string, unknown>> = [];
  const normalizedQty = qty !== null && isFiniteNumber(qty) ? qty : null;

  if (contractType.includes("put-credit-spread") && shortStrike !== null && longStrike !== null) {
    legs.push({
      type: "put",
      side: "short",
      strike: shortStrike,
      expiry,
      qty: normalizedQty,
      limit_price: null,
    });
    legs.push({
      type: "put",
      side: "long",
      strike: longStrike,
      expiry,
      qty: normalizedQty,
      limit_price: null,
    });
  } else if (contractType.includes("call-credit-spread") && shortStrike !== null && longStrike !== null) {
    legs.push({
      type: "call",
      side: "short",
      strike: shortStrike,
      expiry,
      qty: normalizedQty,
      limit_price: null,
    });
    legs.push({
      type: "call",
      side: "long",
      strike: longStrike,
      expiry,
      qty: normalizedQty,
      limit_price: null,
    });
  } else if (contractType.includes("covered-call") && shortStrike !== null) {
    legs.push({
      type: "call",
      side: "short",
      strike: shortStrike,
      expiry,
      qty: normalizedQty,
      limit_price: null,
    });
  } else if (contractType.includes("long-call") && optionStrike !== null) {
    legs.push({
      type: "call",
      side: "long",
      strike: optionStrike,
      expiry,
      qty: normalizedQty,
      limit_price: null,
    });
  } else if (contractType.includes("long-put") && optionStrike !== null) {
    legs.push({
      type: "put",
      side: "long",
      strike: optionStrike,
      expiry,
      qty: normalizedQty,
      limit_price: null,
    });
  }

  return { legs, shortStrike, longStrike, optionStrike };
};

const categoryFromScore = (score: number | null): "Strong" | "Moderate" | "Weak" => {
  if (score === null) return "Moderate";
  if (score >= 80) return "Strong";
  if (score >= 60) return "Moderate";
  return "Weak";
};

const buildToolSchemas = (): ToolSchema[] => [
  {
    type: "function",
    function: {
      name: "search_symbols",
      description: "Search ticker symbols by keyword using Alpha Vantage.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Company name or ticker" },
          limit: { type: "integer", minimum: 1, maximum: 25, default: 10 },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_quote",
      description: "Get latest quote for a symbol using Alpha Vantage.",
      parameters: {
        type: "object",
        properties: { symbol: { type: "string" } },
        required: ["symbol"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_api_factors",
      description: "Fetch API factor snapshot for a symbol.",
      parameters: {
        type: "object",
        properties: { symbol: { type: "string" }, ipsId: { type: "string" } },
        required: ["symbol"],
      },
    },
  },
];

const runTool = async (name: string, rawArgs: any) => {
  try {
    switch (name) {
      case "search_symbols": {
        const query = String(rawArgs?.query ?? "").slice(0, 64);
        const limit = Math.min(25, Math.max(1, Number(rawArgs?.limit ?? 10)));
        if (!query.trim()) return [];
        const alpha = getAlphaVantageClient();
        const results = await alpha.searchSymbols(query);
        return results.slice(0, limit);
      }
      case "get_quote": {
        const sym = String(rawArgs?.symbol ?? "").toUpperCase();
        if (!sym) return { error: "Missing symbol" };
        const market = getMarketDataService();
        return market.getUnifiedStockData(sym, false);
      }
      case "get_api_factors": {
        const sym = String(rawArgs?.symbol ?? "").toUpperCase();
        if (!sym) return { error: "Missing symbol" };
        const market = getMarketDataService();
        const stock = await market.getUnifiedStockData(sym, true);
        return {
          symbol: sym,
          factors: {
            pe_ratio:
              stock.fundamentals?.eps && stock.currentPrice
                ? stock.currentPrice / stock.fundamentals.eps
                : null,
            beta: stock.beta ?? null,
            market_cap: stock.marketCap ?? null,
            revenue_growth: stock.fundamentals?.revenueGrowth ?? null,
            roe: stock.fundamentals?.roe ?? null,
            roa: stock.fundamentals?.roa ?? null,
            eps: stock.fundamentals?.eps ?? null,
          },
          lastUpdated: new Date().toISOString(),
        };
      }
      default:
        return { error: "Unknown tool: " + String(name) };
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { error: message };
  }
};

const callOllamaChat = async (
  chatUrl: string,
  model: string,
  messages: OllamaMessage[],
  options: Record<string, unknown>,
  tools: ToolSchema[]
) =>
  fetch(chatUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model, stream: false, messages, options, tools }),
  });

const listInstalledModels = async (baseOrigin: string): Promise<string[]> => {
  try {
    const res = await fetch(baseOrigin + "/api/tags");
    if (!res.ok) return [];
    const json = await res.json();
    const models = Array.isArray(json?.models)
      ? json.models
          .map((entry: any) => (entry && typeof entry.name === "string" ? entry.name : null))
          .filter((entry: string | null): entry is string => Boolean(entry))
      : [];
    return models;
  } catch {
    return [];
  }
};

const parseJsonResponse = (content: string, fallbackScore: number | null) => {
  const cleaned = content.trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    return {
      score: fallbackScore,
      summary: cleaned.slice(0, 1200),
      suggestions: [],
      confidence: 0.3,
      category: "Moderate",
    };
  }
};
const asScoreComputationResult = (
  baseline: number | null,
  breakdown: AnalyzeRequestBody["breakdown"]
): ScoreComputationResult | null => {
  if (!breakdown) return null;
  return {
    finalScore: baseline ?? 0,
    totalWeight: breakdown.totalWeight ?? 0,
    weightedSum: breakdown.weightedSum ?? 0,
    factorScores: Array.isArray(breakdown.factorScores)
      ? breakdown.factorScores.map((entry) => ({
          factorName: entry.factorName,
          value: entry.value,
          weight: entry.weight,
          individualScore: entry.individualScore,
          weightedScore: entry.weightedScore ?? 0,
          targetMet: entry.targetMet,
        }))
      : [],
    targetsMetCount: breakdown.targetsMetCount ?? 0,
    targetPercentage: breakdown.targetPercentage ?? 0,
  };
};
const ensureFactorValuesFromDb = async (
  existing: Record<string, FactorValue> | null,
  tradeId: string | null | undefined
): Promise<Record<string, FactorValue>> => {
  const base: Record<string, FactorValue> = existing ? { ...existing } : {};
  if (!tradeId) return base;
  try {
    const { data, error } = await supabase
      .from("trade_factors")
      .select("factor_name,factor_value")
      .eq("trade_id", tradeId);

    if (error || !data) return base;
    const map: Record<string, FactorValue> = {};
    for (const row of data as Array<{ factor_name: string; factor_value: unknown }>) {
      if (!row?.factor_name) continue;
      map[row.factor_name] = normalizeFactorValue(row.factor_value);
    }
    return Object.keys(map).length ? map : base;
  } catch (err) {
    console.error("Failed to load persisted trade factors", err);
    return base;
  }
};
export async function POST(request: NextRequest) {
  let body: AnalyzeRequestBody;
  try {
    body = (await request.json()) as AnalyzeRequestBody;
  } catch {
    return NextResponse.json(
      { success: false, error: "Invalid JSON body" },
      { status: 400 }
    );
  }

  if (!body?.trade) {
    return NextResponse.json(
      { success: false, error: "Missing trade payload" },
      { status: 400 }
    );
  }

  let factorValues = normalizeFactorMap(body.factorValues ?? null);
  factorValues = await ensureFactorValuesFromDb(factorValues, body.tradeId);

  let baselineScore =
    typeof body.score === "number" && Number.isFinite(body.score)
      ? Number(body.score)
      : null;
  let scoringResult: ScoreComputationResult | null = null;

  if (body.ipsId && factorValues && Object.keys(factorValues).length) {
    try {
      scoringResult = await computeIpsScore(supabase, body.ipsId, factorValues);
      baselineScore = scoringResult.finalScore;
    } catch (err) {
      console.error("Failed to compute IPS score for AI analyze", err);
    }
  }

  if (!scoringResult && body.breakdown) {
    scoringResult = asScoreComputationResult(baselineScore, body.breakdown);
  }

  const contractType = String(body.strategyType ?? body.trade?.contractType ?? "").toLowerCase();
  const dte = calcDte(body.trade?.expirationDate ?? null);
  const qty = toNumber(body.trade?.numberOfContracts ?? null);
  const legsResult = buildTradeLegs(
    body.trade,
    contractType,
    body.trade?.expirationDate ?? null,
    qty
  );
  const legs = legsResult.legs;
  const shortStrike = legsResult.shortStrike;
  const longStrike = legsResult.longStrike;
  const optionStrike = legsResult.optionStrike;

  let underlyingSnap: Record<string, any> | null = null;
  let technicals: Record<string, any> | null = null;
  let macro: Record<string, any> | null = null;
  let news: Record<string, any> | null = null;
  let features: Record<string, number | null> = {};
  let volRankValue: number | null = null;
  const symbol = body.trade?.symbol ? String(body.trade.symbol).toUpperCase() : null;
  if (symbol) {
    try {
      const market = getMarketDataService();
      const alpha = getAlphaVantageClient();
      const dataResults = await Promise.all([
        market.getUnifiedStockData(symbol, true),
        alpha.getSMA(symbol, 50, "daily", "close"),
        alpha.getSMA(symbol, 200, "daily", "close"),
        alpha.getRSI(symbol, 14, "daily", "close"),
        alpha.getMACD(symbol, "daily", "close"),
        alpha.getCPI(),
        alpha.getUnemploymentRate(),
        alpha.getFederalFundsRate(),
        alpha.getTreasuryYield10Y(),
        alpha.getNewsSentiment(symbol, 50),
      ]);
      const stock: any = dataResults[0];
      const sma50: any = dataResults[1];
      const sma200: any = dataResults[2];
      const rsi14: any = dataResults[3];
      const macd: any = dataResults[4];
      const cpi: any = dataResults[5];
      const unemp: any = dataResults[6];
      const ffr: any = dataResults[7];
      const ty10: any = dataResults[8];
      const newsSentiment: any = dataResults[9];

      underlyingSnap = {
        ticker: stock.symbol,
        price: stock.currentPrice,
        previous_close: stock.previousClose,
        change_pct: stock.priceChangePercent,
        week52_high: stock.week52High ?? stock.fundamentals?.week52High ?? null,
        week52_low: stock.week52Low ?? stock.fundamentals?.week52Low ?? null,
        beta: stock.beta ?? stock.fundamentals?.beta ?? null,
        market_cap: stock.marketCap ?? stock.fundamentals?.marketCap ?? null,
        fundamentals: {
          pe_ratio:
            stock.fundamentals?.eps && stock.currentPrice
              ? stock.currentPrice / stock.fundamentals.eps
              : stock.peRatio ?? null,
          ps_ratio_ttm: stock.fundamentals?.psRatio ?? null,
          pb_ratio: stock.fundamentals?.pbRatio ?? null,
          peg_ratio: stock.fundamentals?.pegRatio ?? null,
          ev_to_ebitda: stock.fundamentals?.evToEbitda ?? null,
          eps_ttm: stock.fundamentals?.eps ?? null,
          revenue_ttm: stock.fundamentals?.revenue ?? null,
          gross_margin_pct: stock.fundamentals?.grossMargin ?? null,
          operating_margin_pct: stock.fundamentals?.operatingMargin ?? null,
          net_margin_pct: stock.fundamentals?.netMargin ?? null,
          roe_pct: stock.fundamentals?.roe ?? null,
          roa_pct: stock.fundamentals?.roa ?? null,
          revenue_growth_yoy_pct: stock.fundamentals?.revenueGrowth ?? null,
          earnings_growth_yoy_pct: stock.fundamentals?.earningsGrowth ?? null,
          dividend_yield_pct: stock.fundamentals?.dividendYield ?? null,
        },
        last_updated: new Date().toISOString(),
      };

      technicals = {
        sma50: sma50?.value ?? null,
        sma200: sma200?.value ?? null,
        rsi14: rsi14?.value ?? null,
        macd: macd?.macd ?? null,
        macd_signal: macd?.signal ?? null,
        macd_hist: macd?.histogram ?? null,
        price_above_50:
          stock.currentPrice && sma50?.value ? (stock.currentPrice > sma50.value ? 1 : 0) : null,
        price_above_200:
          stock.currentPrice && sma200?.value ? (stock.currentPrice > sma200.value ? 1 : 0) : null,
        golden_cross:
          sma50?.value && sma200?.value ? (sma50.value > sma200.value ? 1 : 0) : null,
        trend_bias:
          sma50?.value && sma200?.value
            ? (sma50.value > sma200.value ? "uptrend" : "downtrend")
            : null,
      };

      macro = {
        cpi: cpi?.value ?? null,
        unemployment_rate: unemp?.value ?? null,
        fed_funds_rate: ffr?.value ?? null,
        treasury_10y: ty10?.value ?? null,
      };

      news = newsSentiment ?? null;

      const price = toNumber(stock.currentPrice) ?? toNumber(body.trade?.currentPrice);
      features = await computeTradeFeatures({
        symbol,
        trade: body.trade,
        price,
        dte,
        technicals,
        supabase,
      });

      volRankValue = toNumber(features.hv30_rank) ?? toNumber(features.atr_pct_rank) ?? null;
    } catch (err) {
      console.error("Failed to build market context for AI analyze", err);
    }
  }
  const benchmarks = await getBenchmarks({
    supabase,
    symbol,
    strategy: contractType,
    dte,
    volRank: volRankValue,
  });

  const contextPayload = {
    meta: {
      ipsName: body.ipsName ?? null,
      strategyType: contractType ? contractType : null,
      timestamp: new Date().toISOString(),
      promptVersion: PROMPT_VERSION,
    },
    underlying: underlyingSnap || {
      ticker: symbol,
      price: toNumber(body.trade?.currentPrice),
    },
    strategy: contractType ? contractType : null,
    trade: {
      symbol,
      name: body.trade?.name ?? null,
      contractType: body.trade?.contractType ?? null,
      expirationDate: body.trade?.expirationDate ?? null,
      dte,
      numberOfContracts: qty,
      currentPrice: toNumber(body.trade?.currentPrice),
      shortStrike,
      longStrike,
      optionStrike,
      creditReceived:
        toNumber(body.trade?.creditReceived) ??
        toNumber(body.trade?.premiumReceived) ??
        (body.trade?.debitPaid ? -Math.abs(Number(body.trade.debitPaid)) : null),
      iv: toNumber(body.trade?.iv),
      iv_rank: toNumber(body.trade?.iv_rank),
      legs: legs.length ? legs : null,
      apiFactors: body.trade?.apiFactors ?? null,
      ipsFactors: body.trade?.ipsFactors ?? null,
      liquidity: body.trade?.liquidity ?? null,
      events: {
        earnings_date: body.trade?.earnings_date ?? null,
        ex_div_date: body.trade?.ex_div_date ?? null,
      },
      risk_budget: {
        account_size: toNumber(body.trade?.account_size),
        max_risk_per_trade_pct: toNumber(body.trade?.max_risk_per_trade_pct),
      },
    },
    features,
    benchmarks,
    baselineScore: baselineScore,
    adjustment_limits: {
      benchmark_min_n: BENCHMARK_MIN_N,
      default_max: DEFAULT_MAX_ADJUST,
      with_benchmarks_max: BENCHMARK_MAX_ADJUST,
      sample_size: benchmarks.sample_size,
    },
    scoring:
      scoringResult || baselineScore !== null
        ? {
            score: baselineScore,
            breakdown: scoringResult
              ? {
                  totalWeight: scoringResult.totalWeight,
                  weightedSum: scoringResult.weightedSum,
                  targetsMetCount: scoringResult.targetsMetCount,
                  targetPercentage: scoringResult.targetPercentage,
                  factorScores: scoringResult.factorScores,
                }
              : null,
          }
        : null,
  };
  const schemaLines = [
    "Return JSON describing the trade analysis.",
    "Required keys:",
    "- score: number between 0 and 100.",
    "- category: one of Strong, Moderate, Weak.",
    "- confidence: number 0-1.",
    "- summary: short narrative (string).",
    "- rationale_bullets: array of short strings (optional).",
    "- suggestions: array of action strings (max 8).",
    "- drivers: array of { code, direction (pos|neg), evidence_number, short_text }.",
    "- adjustments: { baseline:number, ai_adjustment:number, reasons:string[] }.",
    "- playbook: { entries: [{ trigger, condition, action, exit_if, confidence }] }.",
    "- features: object.",
    "- benchmarks: { win_rate, median_pl, sample_size, dte_bucket, iv_rank_bucket, delta_bucket }.",
    "Rules:",
    "- Ground every judgement in provided numbers.",
    "- ai_adjustment stays within +/-5, or up to +/-10 only when benchmarks.sample_size >= " + String(BENCHMARK_MIN_N) + ".",
    "- Use pos/neg for direction. Evidence numbers must be numeric.",
  ];
  const baselineLine = "Baseline IPS score: " + (baselineScore !== null ? baselineScore.toFixed(1) : "null");
  const benchmarkLine = "Benchmarks sample size: " + String(benchmarks.sample_size) + " (min required " + String(BENCHMARK_MIN_N) + ").";
  const promptContext = {
    contextPayload,
    technicals,
    macro,
    news_sentiment: news,
    factorValues,
  };
  const contextJson = JSON.stringify(promptContext);
  const finalPrompt = [
    ...schemaLines,
    baselineLine,
    benchmarkLine,
    "Context (JSON):",
    contextJson,
  ].join("\n");
  const ollamaUrl = (process.env.OLLAMA_API_URL ?? "http://golem:11434/api/chat").trim();
  const requestedModel = body.model ? body.model.trim() : null;
  let model = requestedModel && requestedModel.length ? requestedModel : (process.env.OLLAMA_MODEL ?? "llama4:maverick").trim();

  let baseOrigin = "";
  try {
    const parsed = new URL(ollamaUrl);
    baseOrigin = parsed.origin;
  } catch {
    baseOrigin = "http://golem:11434";
  }

  const messages: OllamaMessage[] = [
    { role: "system", content: "You are an options and equity trading analyst. Use supplied fundamentals only." },
    { role: "user", content: finalPrompt },
  ];
  const options = { temperature: 0.1, top_p: 0.9, seed: 42 };
  const tools = buildToolSchemas();

  let response = await callOllamaChat(ollamaUrl, model, messages, options, tools);
  if (response.status === 404) {
    const installed = await listInstalledModels(baseOrigin);
    const preferred = [
      "gpt-oss:120b",
      "llama4:maverick",
      "llama3.2:latest",
      "llama3.1:latest",
      "llama3:latest",
      "mistral:latest",
      "qwen2.5:latest",
    ];
    const fallback = preferred.find((entry) => installed.includes(entry)) ?? installed[0];
    if (fallback) {
      model = fallback;
      response = await callOllamaChat(ollamaUrl, model, messages, options, tools);
    }
  }

  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    return NextResponse.json(
      {
        success: false,
        error: "Ollama error: " + String(response.status) + " " + errorText,
        hint: "Ensure the requested model is installed (ollama pull <model>).",
      },
      { status: 502 }
    );
  }

  let data: any = await response.json();
  for (let round = 0; round < 2; round += 1) {
    const toolCalls = data?.message?.tool_calls || data?.tool_calls || [];
    if (!Array.isArray(toolCalls) || toolCalls.length === 0) break;

    for (const call of toolCalls) {
      const name = call?.function?.name || call?.name;
      if (!name) continue;
      const rawArgs = call?.function?.arguments || call?.arguments || {};
      let parsedArgs: any = {};
      try {
        parsedArgs = typeof rawArgs === "string" && rawArgs.trim() ? JSON.parse(rawArgs) : rawArgs;
      } catch {
        parsedArgs = rawArgs;
      }
      const result = await runTool(String(name), parsedArgs);
      messages.push({ role: "tool", name: String(name), content: JSON.stringify(result) });
    }

    response = await callOllamaChat(ollamaUrl, model, messages, options, tools);
    if (!response.ok) {
      break;
    }
    data = await response.json();
  }

  const contentCandidate = Array.isArray(data?.messages) && data.messages.length
    ? data.messages[data.messages.length - 1]?.content
    : undefined;
  const content = data?.message?.content || contentCandidate;
  if (!content || typeof content !== "string") {
    return NextResponse.json(
      { success: false, error: "Invalid model response" },
      { status: 502 }
    );
  }

  const parsed = parseJsonResponse(content, baselineScore);

  const numeric = (value: unknown): number | null => {
    if (value === null || value === undefined || value === "") return null;
    const cast = Number(value);
    return Number.isFinite(cast) ? cast : null;
  };

  const normalizedAiScore = numeric(parsed?.score);
  const summary = String(parsed?.summary ?? "No summary provided.");
  const suggestions = Array.isArray(parsed?.suggestions)
    ? parsed.suggestions.map((s: any) => String(s)).slice(0, 8)
    : [];
  const confidence = Math.max(0, Math.min(1, Number(parsed?.confidence ?? 0.5)));
  const drivers = Array.isArray(parsed?.drivers)
    ? parsed.drivers
        .map((driver: any) => ({
          code: typeof driver?.code === "string" ? driver.code : "",
          direction: driver?.direction === "neg" ? "neg" : "pos",
          evidence_number: numeric(driver?.evidence_number),
          short_text: typeof driver?.short_text === "string" ? driver.short_text : "",
        }))
        .filter((driver: any) => driver.code && driver.evidence_number !== null)
        .slice(0, 6)
    : [];

  const reasons = Array.isArray(parsed?.adjustments?.reasons)
    ? parsed.adjustments.reasons.map((reason: any) => String(reason)).slice(0, 6)
    : [];

  const sampleSize = Number(benchmarks?.sample_size ?? 0);
  const allowedAdjustment =
    sampleSize >= BENCHMARK_MIN_N ? BENCHMARK_MAX_ADJUST : DEFAULT_MAX_ADJUST;

  let aiAdjustment = numeric(parsed?.adjustments?.ai_adjustment);
  const baselineScoreValue = numeric(baselineScore);
  if (aiAdjustment === null && baselineScoreValue !== null && normalizedAiScore !== null) {
    aiAdjustment = normalizedAiScore - baselineScoreValue;
  }
  if (aiAdjustment === null) aiAdjustment = 0;
  aiAdjustment = Math.max(-allowedAdjustment, Math.min(allowedAdjustment, aiAdjustment));

  const finalScore = baselineScoreValue !== null ? baselineScoreValue + aiAdjustment : normalizedAiScore;
  const resolvedScore = finalScore !== null && Number.isFinite(finalScore)
    ? Math.round(finalScore * 10) / 10
    : null;

  const category =
    typeof parsed?.category === "string" && ["Strong", "Moderate", "Weak"].includes(parsed.category)
      ? (parsed.category as "Strong" | "Moderate" | "Weak")
      : categoryFromScore(resolvedScore);

  const rationale = typeof parsed?.rationale === "string"
    ? parsed.rationale
    : Array.isArray(parsed?.rationale_bullets)
      ? parsed.rationale_bullets.map((text: any) => String(text)).join(" • ")
      : undefined;

  const playbookEntries = Array.isArray(parsed?.playbook?.entries)
    ? parsed.playbook.entries
        .map((entry: any) => ({
          trigger: typeof entry?.trigger === "string" ? entry.trigger : "",
          condition: typeof entry?.condition === "string" ? entry.condition : "",
          action: typeof entry?.action === "string" ? entry.action : "",
          exit_if: typeof entry?.exit_if === "string" ? entry.exit_if : "",
          confidence: Math.max(0, Math.min(1, Number(entry?.confidence ?? 0))),
        }))
        .filter((entry: any) => entry.trigger)
        .slice(0, 6)
    : [];
  const playbook = playbookEntries.length ? { entries: playbookEntries } : null;

  const adjustmentsOut = {
    baseline: baselineScoreValue,
    ai_adjustment:
      baselineScoreValue !== null && resolvedScore !== null
        ? Math.round((resolvedScore - baselineScoreValue) * 10) / 10
        : aiAdjustment,
    reasons,
  };

  const scoreSources = {
    baseline: baselineScoreValue,
    ai: normalizedAiScore,
  };

  const scoringSummary = scoringResult
    ? {
        baselineScore: baselineScoreValue,
        totalWeight: scoringResult.totalWeight,
        weightedSum: scoringResult.weightedSum,
        targetsMetCount: scoringResult.targetsMetCount,
        targetPercentage: scoringResult.targetPercentage,
        factorScores: scoringResult.factorScores,
        benchmarks,
      }
    : {
        baselineScore: baselineScoreValue,
        totalWeight: null,
        weightedSum: null,
        targetsMetCount: null,
        targetPercentage: null,
        factorScores: [],
        benchmarks,
      };

  try {
    const scoreCalculationId =
      body.scoreId ??
      (body as any)?.score_id ??
      ((body.breakdown as any)?.scoreId ?? null);

    await supabase.from("ai_trade_analyses").insert({
      trade_id: body.tradeId ?? null,
      ips_score_calculation_id: scoreCalculationId,
      baseline_score: baselineScoreValue,
      ai_raw_score: normalizedAiScore,
      final_score: resolvedScore,
      ai_adjustment: adjustmentsOut.ai_adjustment,
      drivers,
      features,
      benchmarks,
      playbook,
      model,
      prompt_version: PROMPT_VERSION,
      created_at: new Date().toISOString(),
    });
  } catch (err) {
    console.error("Failed to persist AI analysis audit", err);
  }

  return NextResponse.json({
    success: true,
    data: {
      score: resolvedScore,
      scoreSources,
      summary,
      rationale,
      suggestions,
      confidence,
      category,
      raw: content,
      model,
      status:
        typeof parsed?.status === "string" && parsed.status !== "INCOMPLETE"
          ? parsed.status
          : undefined,
      full: parsed,
      features,
      benchmarks,
      drivers,
      adjustments: adjustmentsOut,
      playbook,
      scoring: scoringSummary,
      inputs: {
        underlying: underlyingSnap,
        technicals,
        macro,
        news_sentiment: news,
      },
    },
  });
}
