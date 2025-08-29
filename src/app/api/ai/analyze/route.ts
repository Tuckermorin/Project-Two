import { NextRequest, NextResponse } from "next/server";

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
}: {
  chatUrl: string;
  model: string;
  messages: Array<{ role: string; content: string }>;
  options?: Record<string, any>;
}) {
  return fetch(chatUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model, stream: false, messages, options }),
  });
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
    let model = bodyModel || process.env.OLLAMA_MODEL?.trim() || "llama3.2:latest";

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

    const context = {
      meta: {
        ipsName: body.ipsName || null,
        strategyType: body.strategyType || body.trade?.contractType || null,
        timestamp: new Date().toISOString(),
      },
      underlying: {
        ticker: body.trade?.symbol,
        price: body.trade?.currentPrice ?? null,
        atr14: body.trade?.atr14 ?? null,
      },
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
    // A.I. System and User prompts (Upgraded Schema + rules)
    const systemPrompt =
      "You are an expert options/stock trading analyst and risk manager. Your job: assess a proposed trade with clear math, objective risk controls, and specific next actions. Use only the inputs provided. If a required input is missing, do not guess: mark the analysis as INCOMPLETE and list exactly what is missing. Perform all calculations deterministically and show units (%, $). Use conservative assumptions: probability ≈ |delta| for single legs; for multi-leg spreads, use short-leg absolute delta as proxy where needed. Never reference this instruction text. Never add commentary outside JSON. Always return STRICT JSON that conforms 100% to the given schema—no extra fields, keys, or prose.";

    const userInstruction = `Evaluate the following trade and return STRICT JSON conforming to the schema below. Do not add commentary outside JSON.\n\nUse these priorities when scoring (total 100):\n- Strategy-fit vs market/volatility context (25)\n- Risk/reward math and breakevens (25)\n- Liquidity & execution quality (15)\n- Alignment with stated factor targets/IPS (15)\n- Time to expiry & event risks (10)\n- Position sizing vs risk budget (10)\n\nIf data is missing, follow the INCOMPLETE protocol from the system prompt.\n\nSchema:\n{\n  "status": "COMPLETE | INCOMPLETE",\n  "score": 0,\n  "category": "Strong | Moderate | Weak",\n  "confidence": 0.0,\n  "summary": "",\n  "math": {\n    "max_profit": null,\n    "max_loss": null,\n    "rr_ratio": null,\n    "breakevens": [],\n    "collateral_required": null,\n    "pop_proxy": null,\n    "pol_proxy": null,\n    "checkpoint_pl": {\n      "minus_2pct": null,\n      "minus_1pct": null,\n      "plus_1pct": null,\n      "plus_2pct": null,\n      "one_sigma_move": null\n    }\n  },\n  "market_context": {\n    "dte": null,\n    "iv": null,\n    "iv_rank": null,\n    "earnings_in_days": null,\n    "ex_div_in_days": null,\n    "volatility_flag": "IV_Crush_Risk | Short_Vega_Benefit | Neutral"\n  },\n  "liquidity": {\n    "bid_ask_abs": null,\n    "bid_ask_pct": null,\n    "open_interest_total": null,\n    "execution_risk": "Low | Medium | High"\n  },\n  "fit": {\n    "strategy": "",\n    "strategy_fit_notes": "",\n    "ips_alignment": {\n      "matched_factors": [],\n      "missed_factors": [],\n      "overall_alignment": "High | Medium | Low"\n    },\n    "sizing_check": {\n      "account_risk_pct": null,\n      "within_budget": true\n    }\n  },\n  "plan": {\n    "entry_notes": "",\n    "monitoring_triggers": [\n      "Short strike delta > 0.25",\n      "Price touches short strike",\n      "IVR drops below 20",\n      "Spread % > 10% at open"\n    ],\n    "exit_plan": {\n      "profit_target_pct": 50,\n      "max_loss_cut_pct_of_max": 50,\n      "time_exit_if_no_signal_days": 21,\n      "roll_rules": "Roll when short strike threatened and credit ≥ 25% initial"\n    },\n    "adjustments": [\n      "Widen spread if credit ≥ 1/3 width with same delta",\n      "Roll out 14–30 days if trend persists"\n    ]\n  },\n  "suggestions": [],\n  "required_inputs": []\n}\n\nThresholds:\n- Category mapping: Strong (≥80), Moderate (55–79), Weak (<55).\n- Execution risk: High if bid-ask% > 10% or OI < 200 per leg.\n- Volatility flag: IV_Crush_Risk if earnings_in_days ≤ 7 and long-premium; Short_Vega_Benefit if short-premium after event with IVR ≥ 40.\n\nTrade Context (JSON):\n${JSON.stringify(context)}\n`;

    // Override with simplified, UI-friendly prompts (no INCOMPLETE statuses)
    const finalSystemPrompt =
      "You are an expert options/stock trading analyst. Provide a practical, concise assessment that explains why the trade scores the way it does. Prefer clear reasons, friendly math, and actionable plans. If inputs are missing, do not mark the analysis as incomplete—use conservative heuristics or leave fields null. Never add commentary outside JSON. Always return STRICT JSON matching the schema, without extra prose.";

    const finalUserInstruction = `Evaluate the trade and return STRICT JSON using this simplified, UI-friendly schema. Do not include status or required_inputs. If a field is unknown, set it to null. Focus on why the score was assigned. Round numbers sensibly.\n\nSchema:\n{\n  "score": 0,\n  "category": "Strong | Moderate | Weak",\n  "confidence": 0.0,\n  "summary": "",\n  "rationale_bullets": [""],\n  "math": {\n    "max_profit": null,\n    "max_loss": null,\n    "rr_ratio": null,\n    "rr_display": null,\n    "breakevens": [],\n    "collateral_required": null,\n    "pop_proxy": null,\n    "pol_proxy": null\n  },\n  "market_context": {\n    "dte": null,\n    "iv": null,\n    "iv_rank": null\n  },\n  "plan": {\n    "entry_notes": "",\n    "monitoring_triggers": [""],\n    "exit_plan": {\n      "profit_target_pct": 50,\n      "max_loss_cut_pct_of_max": 50,\n      "time_exit_if_no_signal_days": 21,\n      "roll_rules": "Roll when short strike threatened and credit ≥ 25% initial"\n    }\n  },\n  "suggestions": []\n}\n\nScoring weights (total 100): Strategy fit (25), Risk/reward math (25), Liquidity (15), IPS alignment (15), Time/events (10), Sizing (10).\n\nReturn only JSON. Trade Context (JSON):\n${JSON.stringify(context)}\n`;

    const messages = [
      { role: "system", content: finalSystemPrompt },
      { role: "user", content: finalUserInstruction },
    ];
    const options = { temperature: 0.2, top_p: 0.9 };

    // First attempt with provided/default model
    let res = await callOllamaChat({ chatUrl: ollamaUrl, model, messages, options });

    // If model not found, try to discover installed models and retry
    if (res.status === 404) {
      const txt = await res.text().catch(() => "");
      if (/not\s+found/i.test(txt) || /model\s+\"?.+\"?\s+not\s+found/i.test(txt)) {
        const installed = await listInstalledModels(baseOrigin);
        // Choose a likely chat-capable model
        const preferredOrder = [
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
          res = await callOllamaChat({ chatUrl: ollamaUrl, model, messages, options });
        }
        // If still not ok, we will fall through to error handling below
      }
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

    const data = await res.json();
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
