import { NextRequest, NextResponse } from "next/server";
import { getAlphaVantageClient } from "@/lib/api/alpha-vantage";
import { getMarketDataService } from "@/lib/services/market-data-service";

type FactorScore = {
  factorName: string;
  value: number | string | boolean | null;
  weight: number;
  individualScore: number;
  weightedScore: number;
  targetMet: boolean;
};

type AnalyzeRequestBody = {
  trade: any;
  score?: number;
  breakdown?: {
    totalWeight: number;
    weightedSum: number;
    factorScores: FactorScore[];
    targetsMetCount: number;
    targetPercentage: number;
  };
  ipsName?: string;
  strategyType?: string;
};

async function listInstalledModels(baseOrigin: string) {
  try {
    const tagsRes = await fetch(`${baseOrigin}/api/tags`, { method: "GET" });
    if (!tagsRes.ok) return [] as string[];
    const tags = await tagsRes.json();
    const models: string[] = Array.isArray(tags?.models)
      ? tags.models.map((m: any) => String(m?.name)).filter(Boolean)
      : [];
    return models;
  } catch {
    return [] as string[];
  }
}

async function callOllamaChat({
  chatUrl,
  model,
  messages,
  options,
  tools,
}: {
  chatUrl: string;
  model: string;
  messages: Array<{ role: string; content: string; name?: string }>;
  options?: Record<string, any>;
  tools?: any[];
}) {
  return fetch(chatUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model, stream: false, messages, options, tools }),
  });
}

// --- Tool schemas ---
function buildToolSchemas() {
  const schemas = [
    {
      type: "function",
      function: {
        name: "search_symbols",
        description:
          "Search ticker symbols by keyword using Alpha Vantage SYMBOL_SEARCH. Use to resolve company name to tradable symbol.",
        parameters: {
          type: "object",
          properties: {
            query: { type: "string", description: "Company name or ticker query" },
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
        description:
          "Get latest quote (price, change, change%) for a symbol using Alpha Vantage GLOBAL_QUOTE.",
        parameters: {
          type: "object",
          properties: {
            symbol: { type: "string", description: "Ticker symbol, e.g., AAPL" },
          },
          required: ["symbol"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "get_api_factors",
        description:
          "Fetch configured API factors for this app for a given symbol and IPS id. Returns key/value map with factor metadata.",
        parameters: {
          type: "object",
          properties: {
            symbol: { type: "string" },
            ipsId: { type: "string", description: "IPS configuration id" },
          },
          required: ["symbol"],
        },
      },
    },
  ];
  return schemas;
}

async function runTool(name: string, rawArgs: any) {
  try {
    switch (name) {
      case "search_symbols": {
        const q = String(rawArgs?.query || "");
        const limit = Number(rawArgs?.limit || 10);
        const av = getAlphaVantageClient();
        const results = await av.searchSymbols(q);
        return (results || []).slice(0, limit);
      }
      case "get_quote": {
        const sym = String(rawArgs?.symbol || "").toUpperCase();
        const mkt = getMarketDataService();
        const q = await mkt.getUnifiedStockData(sym, false);
        return q;
      }
      case "get_api_factors": {
        const sym = String(rawArgs?.symbol || "").toUpperCase();
        const mkt = getMarketDataService();
        const stock = await mkt.getUnifiedStockData(sym, true);
        // Return a lightweight factor map the model can reason with
        const factors = {
          pe_ratio: stock.fundamentals?.eps && stock.currentPrice
            ? stock.currentPrice / stock.fundamentals.eps : null,
          beta: stock.beta ?? null,
          market_cap: stock.marketCap ?? null,
          revenue_growth: stock.fundamentals?.revenueGrowth ?? null,
          roe: stock.fundamentals?.roe ?? null,
          roa: stock.fundamentals?.roa ?? null,
          eps: stock.fundamentals?.eps ?? null,
        } as Record<string, number | null>;
        return { symbol: sym, factors, lastUpdated: new Date().toISOString() };
      }
      default:
        return { error: `Unknown tool: ${name}` };
    }
  } catch (e: any) {
    return { error: e?.message || 'Tool call failed' };
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as AnalyzeRequestBody;
    if (!body?.trade) {
      return NextResponse.json(
        { success: false, error: "Missing 'trade' in request body" },
        { status: 400 }
      );
    }

    const ollamaUrl = process.env.OLLAMA_API_URL?.trim() || "http://golem:11434/api/chat";
    const bodyModel = (body as any)?.model?.trim?.();
    let model = bodyModel || process.env.OLLAMA_MODEL?.trim() || "llama4:maverick";

    // Compute base origin for tags lookup if needed
    let baseOrigin = "";
    try {
      const u = new URL(ollamaUrl);
      baseOrigin = u.origin;
    } catch {
      baseOrigin = "http://golem:11434";
    }

    // Construct a compact, structured context for the LLM
    // Derive DTE if possible
    const exp = body.trade?.expirationDate ? new Date(body.trade.expirationDate) : null;
    const today = new Date();
    const dte = exp ? Math.max(0, Math.ceil((exp.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))) : null;

    // Attempt to map simple strategies to legs (best-effort; nulls for unknowns)
    const legs: Array<any> = [];
    const qty = Number(body.trade?.numberOfContracts) || null;
    const expiry = body.trade?.expirationDate || null;
    const shortStrike = body.trade?.shortPutStrike ?? body.trade?.shortCallStrike ?? null;
    const longStrike = body.trade?.longPutStrike ?? body.trade?.longCallStrike ?? null;
    const ctype = String(body.trade?.contractType || "");
    if (ctype.includes("put-credit-spread") && shortStrike && longStrike) {
      legs.push(
        { type: "put", side: "short", strike: shortStrike, expiry, qty, limit_price: null },
        { type: "put", side: "long", strike: longStrike, expiry, qty, limit_price: null }
      );
    } else if (ctype.includes("call-credit-spread") && shortStrike && longStrike) {
      legs.push(
        { type: "call", side: "short", strike: shortStrike, expiry, qty, limit_price: null },
        { type: "call", side: "long", strike: longStrike, expiry, qty, limit_price: null }
      );
    } else if (ctype.includes("covered-call") && shortStrike) {
      legs.push(
        { type: "call", side: "short", strike: shortStrike, expiry, qty, limit_price: null }
      );
    } else if (ctype.includes("long-call") && longStrike) {
      legs.push(
        { type: "call", side: "long", strike: longStrike, expiry, qty, limit_price: null }
      );
    } else if (ctype.includes("long-put") && longStrike) {
      legs.push(
        { type: "put", side: "long", strike: longStrike, expiry, qty, limit_price: null }
      );
    }

    // Fetch a richer snapshot so the model can go beyond echoing the score
    let underlyingSnap: any = null;
    let technicals: any = null;
    let macro: any = null;
    let news: any = null;
    try {
      if (body.trade?.symbol) {
        const mkt = getMarketDataService();
        const av = getAlphaVantageClient();
        // Pull extended Alpha Vantage fundamentals, technicals, macro and news
        const [stock, sma50, sma200, rsi14, macd, cpi, unemp, ffr, ty10, newsAgg] = await Promise.all([
          mkt.getUnifiedStockData(String(body.trade.symbol), true),
          av.getSMA(String(body.trade.symbol), 50, 'daily', 'close'),
          av.getSMA(String(body.trade.symbol), 200, 'daily', 'close'),
          av.getRSI(String(body.trade.symbol), 14, 'daily', 'close'),
          av.getMACD(String(body.trade.symbol), 'daily', 'close'),
          av.getCPI(),
          av.getUnemploymentRate(),
          av.getFederalFundsRate(),
          av.getTreasuryYield10Y(),
          av.getNewsSentiment(String(body.trade.symbol), 50),
        ]);
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
            pe_ratio: stock.fundamentals?.eps && stock.currentPrice ? stock.currentPrice / stock.fundamentals.eps : stock.peRatio ?? null,
            ps_ratio_ttm: stock.fundamentals?.psRatio ?? null,
            pb_ratio: stock.fundamentals?.pbRatio ?? null,
            peg_ratio: stock.fundamentals?.pegRatio ?? null,
            ev_to_ebitda: stock.fundamentals?.evToEbitda ?? null,
            eps_ttm: stock.fundamentals?.eps ?? null,
            revenue_ttm: stock.fundamentals?.revenue ?? null,
            revenue_per_share_ttm: stock.fundamentals?.revenuePerShareTTM ?? null,
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
          price_above_50: stock.currentPrice && sma50?.value ? stock.currentPrice > sma50.value : null,
          price_above_200: stock.currentPrice && sma200?.value ? stock.currentPrice > sma200.value : null,
          golden_cross: sma50?.value && sma200?.value ? sma50.value > sma200.value : null,
          trend_bias: sma50?.value && sma200?.value ? (sma50.value > sma200.value ? 'uptrend' : 'downtrend') : null,
        };
        macro = {
          cpi: cpi?.value ?? null,
          unemployment_rate: unemp?.value ?? null,
          fed_funds_rate: ffr?.value ?? null,
          treasury_10y: ty10?.value ?? null,
        };
        news = newsAgg || null;
      }
    } catch {}

    const context = {
      meta: {
        ipsName: body.ipsName || null,
        strategyType: body.strategyType || body.trade?.contractType || null,
        timestamp: new Date().toISOString(),
      },
      underlying: underlyingSnap || { ticker: body.trade?.symbol, price: body.trade?.currentPrice ?? null, atr14: body.trade?.atr14 ?? null },
      strategy: ctype || null,
      trade: {
        symbol: body.trade?.symbol,
        name: body.trade?.name,
        contractType: body.trade?.contractType,
        expirationDate: body.trade?.expirationDate,
        dte,
        numberOfContracts: body.trade?.numberOfContracts,
        currentPrice: body.trade?.currentPrice,
        shortStrike,
        longStrike,
        creditReceived:
          body.trade?.creditReceived ??
          body.trade?.premiumReceived ??
          (body.trade?.debitPaid ? -Math.abs(body.trade?.debitPaid) : null),
        iv: body.trade?.iv ?? null,
        iv_rank: body.trade?.iv_rank ?? null,
        legs: legs.length ? legs : null,
        apiFactors: body.trade?.apiFactors || null,
        ipsFactors: body.trade?.ipsFactors || null,
        liquidity: body.trade?.liquidity || null,
        events: {
          earnings_date: body.trade?.earnings_date ?? null,
          ex_div_date: body.trade?.ex_div_date ?? null,
        },
        risk_budget: {
          account_size: body.trade?.account_size ?? null,
          max_risk_per_trade_pct: body.trade?.max_risk_per_trade_pct ?? null,
        },
      },
      scoring: body.score != null || body.breakdown
        ? {
            score: body.score ?? null,
            breakdown: body.breakdown
              ? {
                  totalWeight: body.breakdown.totalWeight,
                  weightedSum: body.breakdown.weightedSum,
                  targetsMetCount: body.breakdown.targetsMetCount,
                  targetPercentage: body.breakdown.targetPercentage,
                  factorScores: (body.breakdown.factorScores || []).map((f) => ({
                    factorName: f.factorName,
                    value: f.value,
                    weight: f.weight,
                    individualScore: f.individualScore,
                    targetMet: f.targetMet,
                  })),
                }
              : null,
          }
        : null,
    };
// A.I. System and User prompts
    const finalSystemPrompt =
      "You are an expert options/stock trading analyst. Provide a practical, concise assessment that explains why the trade scores the way it does. Prefer clear reasons, friendly math, and actionable plans. Compute an independent AI score and ignore any IPS score/breakdown if present. Economic and technical context matter: use supplied fundamentals, technicals (SMA-50/200, RSI, MACD), macro (CPI, Unemployment, Fed Funds, 10y), and Alpha Intelligence news sentiment. If anything is missing, you may call tools; otherwise leave null. Never add commentary outside JSON. Always return STRICT JSON matching the schema.";

    const finalUserInstruction = `Evaluate the trade and return STRICT JSON using this simplified, UI-friendly schema. Do not include status or required_inputs. If a field is unknown, set it to null. Round numbers sensibly.\n\nAugmented data available (pre-fetched via Alpha Vantage):\n- Fundamentals: PE, PEG, PS, PB, EV/EBITDA, EPS, revenue (TTM), revenue per share TTM, margins (gross/operating/net), ROE/ROA, YoY revenue & earnings growth, dividend yield.\n- Technicals: SMA(50/200), RSI(14), MACD, trend bias (golden cross proxy), price vs averages.\n- Macro: CPI, Unemployment, Fed Funds, 10Y yield.\n- News: Alpha Intelligence average sentiment and pos/neg/neutral counts.\n\nExplain how these influence edge, timing, and risk for the selected strategy. Provide 3–6 specific, actionable suggestions (entries, risk controls, rolls, adjustments).\n\nSchema:\n{\n  "score": 0,\n  "category": "Strong | Moderate | Weak",\n  "confidence": 0.0,\n  "summary": "",\n  "rationale_bullets": [""],\n  "math": {\n    "max_profit": null,\n    "max_loss": null,\n    "rr_ratio": null,\n    "rr_display": null,\n    "breakevens": [],\n    "collateral_required": null,\n    "pop_proxy": null,\n    "pol_proxy": null\n  },\n  "market_context": {\n    "dte": null,\n    "iv": null,\n    "iv_rank": null\n  },\n  "plan": {\n    "entry_notes": "",\n    "monitoring_triggers": [""],\n    "exit_plan": {\n      "profit_target_pct": 50,\n      "max_loss_cut_pct_of_max": 50,\n      "time_exit_if_no_signal_days": 21,\n      "roll_rules": "Roll when short strike threatened and credit ≥ 25% initial"\n    }\n  },\n  "suggestions": []\n}\n\nScoring weights (total 100): Strategy fit (25), Risk/reward math (25), Liquidity (15), IPS alignment (15), Time/events (10), Sizing (10).\n\nReturn only JSON. Trade Context (JSON):\n${JSON.stringify({ ...context, technicals, macro, news_sentiment: news })}\n`;

    const messages: Array<{ role: string; content: string; name?: string }> = [
      { role: "system", content: finalSystemPrompt },
      { role: "user", content: finalUserInstruction },
    ];
    const options = { temperature: 0.2, top_p: 0.9 };
    const tools = buildToolSchemas();

    // First attempt with provided/default model
    let res = await callOllamaChat({ chatUrl: ollamaUrl, model, messages, options, tools });

    // If model not found, try to discover installed models and retry
    if (res.status === 404) {
      const txt = await res.text().catch(() => "");
      if (/not\s+found/i.test(txt) || /model\s+\"?.+\"?\s+not\s+found/i.test(txt)) {
        const installed = await listInstalledModels(baseOrigin);
        // Choose a likely chat-capable model
        const preferredOrder = [
          "gpt-oss:120b",
          "llama4:maverick",
          "llama3.2:latest",
          "llama3.1:latest",
          "llama3:latest",
          "mistral:latest",
          "qwen2.5:latest",
        ];
        let candidate = preferredOrder.find((m) => installed.includes(m));
        if (!candidate) {
          // Fallback: try first installed model if any
          candidate = installed[0];
        }
        if (candidate) {
          model = candidate;
          res = await callOllamaChat({ chatUrl: ollamaUrl, model, messages, options, tools });
        }
        // If still not ok, we will fall through to error handling below
      }
    }

    // Handle tool-calling loop (up to 2 rounds)
    let data = await res.json();
    for (let round = 0; round < 2; round++) {
      const toolCalls = data?.message?.tool_calls || data?.tool_calls || [];
      if (!toolCalls || toolCalls.length === 0) break;
      for (const call of toolCalls) {
        const name = call?.function?.name || call?.name;
        const argsStr = call?.function?.arguments || call?.arguments || '{}';
        let args: any = {};
        try { args = typeof argsStr === 'string' ? JSON.parse(argsStr) : argsStr; } catch {}
        const result = await runTool(String(name || ''), args);
        messages.push({ role: 'tool', name: String(name || ''), content: JSON.stringify(result) });
      }
      // ask model to continue with tool results
      res = await callOllamaChat({ chatUrl: ollamaUrl, model, messages, options, tools });
      if (!res.ok) break;
      data = await res.json();
    }

    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      return NextResponse.json(
        {
          success: false,
          error: `Ollama error: ${res.status} ${txt}`,
          hint:
            "Ensure the model is pulled (e.g., `ollama pull llama3.2:latest`) or set OLLAMA_MODEL to an installed model.",
        },
        { status: 502 }
      );
    }

    // if we haven't already got data
    if (!data) data = await res.json();
    // Ollama chat returns { message: { content }, ... } or { messages: [...] } depending on version
    const content: string | undefined = data?.message?.content || data?.messages?.[data?.messages?.length - 1]?.content;

    if (!content || typeof content !== "string") {
      return NextResponse.json(
        { success: false, error: "Invalid Ollama response" },
        { status: 502 }
      );
    }

    // Try to parse strict JSON. If the model included code fences, strip them.
    const cleaned = content
      .trim()
      .replace(/^```json\s*/i, "")
      .replace(/^```\s*/i, "")
      .replace(/```\s*$/i, "");

    let parsed: any;
    try {
      parsed = JSON.parse(cleaned);
    } catch (e) {
      // Fallback: wrap non-JSON in a summary
      parsed = {
        score: body.score ?? 0,
        summary: content.slice(0, 1200),
        suggestions: [],
        confidence: 0.3,
        category: "Moderate",
      };
    }

    // Normalize fields
    const aiScore = Number(parsed?.score);
    const summary = String(parsed?.summary || "No summary provided.");
    const suggestions = Array.isArray(parsed?.suggestions)
      ? parsed.suggestions.map((s: any) => String(s)).slice(0, 8)
      : [];
    const confidence = Math.max(0, Math.min(1, Number(parsed?.confidence ?? 0.5)));
    const category = ["Strong", "Moderate", "Weak"].includes(parsed?.category)
      ? parsed.category
      : aiScore >= 80
        ? "Strong"
        : aiScore >= 60
          ? "Moderate"
          : "Weak";
    const status = typeof parsed?.status === "string" && parsed.status !== "INCOMPLETE" ? parsed.status : undefined;

    const rationale = typeof parsed?.rationale === 'string'
      ? parsed.rationale
      : Array.isArray(parsed?.rationale_bullets)
        ? parsed.rationale_bullets.map((s: any) => String(s)).join(' \u2022 ')
        : undefined;

    return NextResponse.json({
      success: true,
      data: {
        score: isFinite(aiScore) ? aiScore : null,
        summary,
        rationale,
        suggestions,
        confidence,
        category,
        raw: typeof content === "string" ? content : null,
        model,
        status,
        full: parsed && typeof parsed === "object" ? parsed : null,
        inputs: {
          underlying: underlyingSnap || null,
          technicals: technicals || null,
          macro: macro || null,
          news_sentiment: news || null,
        },
      },
    });
  } catch (err) {
    console.error("AI analyze error", err);
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}
