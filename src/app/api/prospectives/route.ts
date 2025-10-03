import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server-client";
import { v4 as uuidv4 } from "uuid";
import { mapAgentToTradesStrategy } from "@/lib/trades/strategyMap";

// Map strategy_type to contract_type (display format)
function strategyToContractType(strategyType: string): string {
  switch (strategyType) {
    case "put_credit":
    case "put-credit-spreads":
      return "put-credit-spread";
    case "call_credit":
    case "call-credit-spreads":
      return "call-credit-spread";
    case "iron_condor":
    case "iron-condors":
      return "iron-condor";
    case "covered_call":
    case "covered-calls":
      return "covered-call";
    case "cash_secured_put":
      return "cash-secured-put";
    case "long-calls":
      return "long-call";
    case "long-puts":
      return "long-put";
    case "buy_hold":
    case "buy-hold-stocks":
      return "buy-hold";
    case "vertical_spread":
      return "vertical-spread";
    default:
      return strategyType;
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();

    // Get authenticated user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = user.id;
    const body = await req.json();
    console.log("[Prospectives API] Received payload:", { symbol: body.symbol, strategy: body.strategy, ips_id: body.ips_id });

    // Generate or use provided ID
    const id = body.id || uuidv4();
    const symbol: string = body.symbol;
    const agentStrategy: string = body.strategy || "UNKNOWN";
    const strategy_type = mapAgentToTradesStrategy(agentStrategy);

    // Extract contract legs
    const legs: Array<{ type: "BUY" | "SELL"; right: "P" | "C"; strike: number; expiry: string }> = body.contract_legs || [];
    const expiry = body.expiration_date || body.exp || legs[0]?.expiry || null;

    // Derive short/long strikes (typical 2-leg vertical)
    const shortLeg = legs.find((l) => l.type === "SELL");
    const longLeg = legs.find((l) => l.type === "BUY");
    const short_strike = shortLeg?.strike ?? body.short_strike ?? null;
    const long_strike = longLeg?.strike ?? body.long_strike ?? null;

    // Numeric economics
    const credit_received = body.entry_mid ?? body.credit_received ?? null;
    const max_gain = body.max_profit ?? null;
    const max_loss = body.max_loss ?? null;
    const spread_width =
      short_strike != null && long_strike != null
        ? Math.abs(Number(short_strike) - Number(long_strike))
        : body.spread_width ?? null;

    // Optional IPS fields
    const ips_id = body.ips_id ?? null;
    const ips_score = body.ips_score ?? null;
    const factors_met = body.factors_met ?? null;
    const total_factors = body.total_factors ?? null;
    const evaluation_notes = body.rationale ?? body.evaluation_notes ?? null;

    // 1. Insert to trade_candidates for agent tracking
    // Note: This may fail if user_id doesn't exist in auth.users table
    // We'll try, but won't fail the whole request if it doesn't work
    const candidatePayload = {
      id,
      run_id: body.run_id || uuidv4(), // Ensure run_id is present
      symbol,
      strategy: agentStrategy,
      contract_legs: legs,
      entry_mid: credit_received,
      est_pop: body.est_pop ?? null,
      breakeven: body.breakeven ?? null,
      max_loss,
      max_profit: max_gain,
      rationale: evaluation_notes,
      guardrail_flags: body.guardrail_flags ?? {},
    };

    // Insert to trade_candidates with authenticated user_id
    try {
      await supabase.from("trade_candidates").insert({
        ...candidatePayload,
        user_id: userId
      });
      console.log("[Prospectives API] Successfully inserted to trade_candidates");
    } catch (candidateError: any) {
      console.warn("[Prospectives API] Candidate insert failed:", candidateError?.message);
      // Continue - this is optional tracking
    }

    // 2. Insert to trades table for prospective trades page
    const insertRow = {
      id,
      user_id: userId, // Use authenticated user
      ips_id,
      symbol,
      strategy_type,
      entry_date: null, // keep null so status 'prospective' list shows it
      expiration_date: expiry ? new Date(expiry) : null,
      status: "prospective",
      quantity: body.quantity ?? 1,
      contracts: body.contracts ?? 1,
      strike_price: null, // legacy single-strike; use short/long below
      strike_price_short: short_strike ?? null,
      strike_price_long: long_strike ?? null,
      short_strike,
      long_strike,
      premium_collected: credit_received,
      premium_paid: null,
      credit_received,
      max_gain,
      max_loss,
      spread_width,
      ips_score,
      factors_met,
      total_factors,
      evaluation_notes,
      name: body.name ?? symbol,
      contract_type: strategyToContractType(strategy_type),
      number_of_contracts: body.number_of_contracts ?? body.contracts ?? 1,
      delta_short_leg: body.delta_short_leg ?? null,
      theta: body.theta ?? null,
      vega: body.vega ?? null,
      iv_at_entry: body.iv_at_entry ?? null,
      sector: body.sector ?? null,
      // leave exit fields null
    };

    const { error: tradeError } = await supabase.from("trades").insert(insertRow);

    if (tradeError) {
      console.error("[Prospectives API] Trade insert error:", tradeError);
      return NextResponse.json({ error: tradeError.message }, { status: 400 });
    }

    console.log("[Prospectives API] Successfully inserted trade with ID:", id);
    return NextResponse.json({ ok: true, id });
  } catch (e: any) {
    console.error("Prospective trade insert failed:", e);
    return NextResponse.json({ error: e.message ?? "insert failed" }, { status: 500 });
  }
}
