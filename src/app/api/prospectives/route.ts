import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { v4 as uuidv4 } from "uuid";
import { mapAgentToTradesStrategy } from "@/lib/trades/strategyMap";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const DEFAULT_USER_ID = process.env.NEXT_PUBLIC_DEFAULT_USER_ID!;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

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
    const candidatePayload = {
      id,
      run_id: body.run_id,
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

    await supabase.from("trade_candidates").insert(candidatePayload);

    // 2. Insert to trades table for prospective trades page
    const insertRow = {
      id,
      user_id: body.user_id || body.userId || DEFAULT_USER_ID,
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
      name: body.name ?? `AI: ${symbol} ${strategy_type}`,
      contract_type: shortLeg?.right === "P" ? "put" : shortLeg?.right === "C" ? "call" : null,
      number_of_contracts: body.number_of_contracts ?? body.contracts ?? 1,
      // leave exit fields null
    };

    const { error: tradeError } = await supabase.from("trades").insert(insertRow);

    if (tradeError) {
      console.error("Trade insert error:", tradeError);
      return NextResponse.json({ error: tradeError.message }, { status: 400 });
    }

    return NextResponse.json({ ok: true, id });
  } catch (e: any) {
    console.error("Prospective trade insert failed:", e);
    return NextResponse.json({ error: e.message ?? "insert failed" }, { status: 500 });
  }
}
