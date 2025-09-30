You’re hitting the constraint because the agent is inserting a `strategy_type` (e.g., `"PCS"` or `"put_credit_spread"`) that isn’t in your table’s allowed list. Fix it by **normalizing strategy names in code before insert** (recommended), and optionally make the **“Add to Prospective Trades”** button insert into `public.trades` with `status='prospective'` (no `entry_date`) so it shows up in your Prospective list.

Below is a single **Claude Code** prompt you can paste in your terminal. It will:

1. Add a **strategy mapper** so agent labels (PCS/CCS/etc.) become values allowed by your `trades_strategy_type_check_v2` constraint.
2. Update the **/api/prospectives** route to insert into **public.trades** (or update if you prefer to keep `trade_candidates` too).
3. Update the **button handler** so it uses that route and passes the right payload.

---

### 0) Context

* We have a Postgres check constraint on `public.trades.strategy_type` allowing only:
  `['buy_hold','put_credit','call_credit','iron_condor','covered_call','cash_secured_put','vertical_spread','put-credit-spreads','call-credit-spreads','iron-condors','covered-calls','long-calls','long-puts','buy-hold-stocks','unknown']`
* The agent sometimes produces labels like `PCS`, `CCS`, `IC`, `CC`, `CSP`, `LONG_CALL`, etc. These violate the constraint.

### 1) Add a strategy normalizer

**Create:** `src/lib/trades/strategyMap.ts`

```ts
export type AgentStrategy =
  | "PCS" | "PUT_CREDIT" | "PUT_CREDIT_SPREAD" | "PUT-CREDIT-SPREAD"
  | "CCS" | "CALL_CREDIT" | "CALL_CREDIT_SPREAD" | "CALL-CREDIT-SPREAD"
  | "IC" | "IRON_CONDOR" | "IRON-CONDOR"
  | "CC" | "COVERED_CALL" | "COVERED-CALL"
  | "CSP" | "CASH_SECURED_PUT" | "CASH-SECURED-PUT"
  | "VERTICAL_SPREAD"
  | "LONG_CALL" | "LONG_PUT"
  | "BUY_HOLD" | "BUY-HOLD-STOCKS"
  | "UNKNOWN" | string;

type TradesStrategyType =
  | "buy_hold"
  | "put_credit"
  | "call_credit"
  | "iron_condor"
  | "covered_call"
  | "cash_secured_put"
  | "vertical_spread"
  | "put-credit-spreads"
  | "call-credit-spreads"
  | "iron-condors"
  | "covered-calls"
  | "long-calls"
  | "long-puts"
  | "buy-hold-stocks"
  | "unknown";

/** Map any agent label to a value allowed by trades.strategy_type check constraint. */
export function mapAgentToTradesStrategy(s: AgentStrategy): TradesStrategyType {
  const x = String(s || "").toUpperCase().replace(/\s+/g, "_");
  switch (x) {
    // Put credit spread
    case "PCS":
    case "PUT_CREDIT":
    case "PUT_CREDIT_SPREAD":
    case "PUT-CREDIT-SPREAD":
      // choose ONE canonical; both "put_credit" and "put-credit-spreads" are allowed
      return "put_credit";

    // Call credit spread
    case "CCS":
    case "CALL_CREDIT":
    case "CALL_CREDIT_SPREAD":
    case "CALL-CREDIT-SPREAD":
      return "call_credit";

    // Iron condor
    case "IC":
    case "IRON_CONDOR":
    case "IRON-CONDOR":
      return "iron_condor";

    // Covered call
    case "CC":
    case "COVERED_CALL":
    case "COVERED-CALL":
      return "covered_call";

    // Cash-secured put
    case "CSP":
    case "CASH_SECURED_PUT":
    case "CASH-SECURED-PUT":
      return "cash_secured_put";

    // Longs
    case "LONG_CALL":
      return "long-calls";
    case "LONG_PUT":
      return "long-puts";

    // Vertical generic
    case "VERTICAL_SPREAD":
      return "vertical_spread";

    // Buy & hold
    case "BUY_HOLD":
    case "BUY-HOLD-STOCKS":
      return "buy-hold-stocks";

    default:
      return "unknown";
  }
}
```

### 2) Fix the Prospective insert route to write into `public.trades`

**Edit or create:** `src/app/api/prospectives/route.ts`

* Use service role key server-side.
* Normalize `strategy_type` via the mapper.
* Keep `status='prospective'` and `entry_date=NULL` (so it stays in Prospective).
* Fill obvious columns from candidate (strikes, credit, spread width), but don’t force optional fields.

```ts
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { v4 as uuidv4 } from "uuid";
import { mapAgentToTradesStrategy } from "@/lib/trades/strategyMap";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY! // server-only
);

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    // Candidate-ish payload coming from the modal/agent
    // Expected minimal inputs:
    // symbol, strategy (agent label), contract_legs[], entry_mid, est_pop, breakeven, max_loss, max_profit, expiry
    const id = body.id || uuidv4();
    const symbol: string = body.symbol;
    const agentStrategy: string = body.strategy || "UNKNOWN";
    const strategy_type = mapAgentToTradesStrategy(agentStrategy);
    const legs: Array<{ type:"BUY"|"SELL"; right:"P"|"C"; strike:number; expiry:string }> = body.contract_legs || [];
    const expiry = body.expiration_date || body.exp || legs[0]?.expiry || null;

    // Derive short/long strikes (typical 2-leg vertical)
    const shortLeg = legs.find(l => l.type === "SELL");
    const longLeg  = legs.find(l => l.type === "BUY");
    const short_strike = shortLeg?.strike ?? body.short_strike ?? null;
    const long_strike  = longLeg?.strike  ?? body.long_strike  ?? null;

    // Numeric economics
    const credit_received = body.entry_mid ?? body.credit_received ?? null;
    const max_gain = body.max_profit ?? null;
    const max_loss = body.max_loss ?? null;
    const spread_width = (short_strike != null && long_strike != null)
      ? Math.abs(Number(short_strike) - Number(long_strike))
      : (body.spread_width ?? null);

    // Optional IPS fields
    const ips_id = body.ips_id ?? null;
    const ips_score = body.ips_score ?? null;
    const factors_met = body.factors_met ?? null;
    const total_factors = body.total_factors ?? null;
    const evaluation_notes = body.rationale ?? body.evaluation_notes ?? null;

    const insertRow = {
      id,
      user_id: body.user_id || "default-user",
      ips_id,
      symbol,
      strategy_type,
      entry_date: null,             // keep null so status 'prospective' list shows it
      expiration_date: expiry ? new Date(expiry) : null,
      status: "prospective",
      quantity: body.quantity ?? 1,
      contracts: body.contracts ?? 1,
      strike_price: null,           // legacy single-strike; use short/long below
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
      name: body.name ?? `${symbol} ${strategy_type}`,
      contract_type: (shortLeg?.right === "P" ? "put" : (shortLeg?.right === "C" ? "call" : null)),
      number_of_contracts: body.number_of_contracts ?? body.contracts ?? 1,
      // leave exit fields null
    };

    const { error } = await supabase.from("trades").insert(insertRow);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    return NextResponse.json({ ok: true, id });
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? "insert failed" }, { status: 500 });
  }
}
```

### 3) Update the “Add to Prospective Trades” button

Find the AI analysis modal component (the one in your screenshot). Update the click handler so it calls the route above and then navigates back to `/trades?highlight=<id>`.

```tsx
import { useRouter } from "next/navigation";
...
async function onAddProspective(candidate:any) {
  const res = await fetch("/api/prospectives", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      // minimal data required
      id: candidate.id,                 // keep if already generated; otherwise server will create
      symbol: candidate.symbol,
      strategy: candidate.strategy,     // e.g., "PCS" → mapper will normalize to 'put_credit'
      contract_legs: candidate.contract_legs,
      entry_mid: candidate.entry_mid,
      est_pop: candidate.est_pop,
      breakeven: candidate.breakeven,
      max_loss: candidate.max_loss,
      max_profit: candidate.max_profit,
      exp: candidate.expiration_date || candidate.expiry,
      rationale: candidate.rationale,
      ips_id: candidate.ips_id,
      ips_score: candidate.ips_score,
      factors_met: candidate.factors_met,
      total_factors: candidate.total_factors,
    })
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || "Failed to add trade");
  router.push(`/trades?highlight=${encodeURIComponent(json.id)}`);
}
...
<button onClick={() => onAddProspective(candidate)} className="px-4 py-2 rounded-2xl bg-black text-white">
  Add to Prospective Trades
</button>
```

### 4) (Optional) Keep `trade_candidates` too

If you still want to insert into `trade_candidates` as a staging table, do that first, then also call `/api/prospectives`. But for the UI behavior you want, writing straight to `public.trades` with `status='prospective'` is simplest.

### 5) Validation & Testing

* Try adding a PCS: ensure `strategy_type` becomes `put_credit`.
* Ensure no `entry_date` is set and `status='prospective'`.
* Confirm Prospective list shows the newly added trade.
* If you ever want to relax DB constraints instead of mapping, add synonyms to the check constraint (requires dropping and recreating the constraint). **Not recommended**—keep DB canonical and normalize in code as we just did.

**Done criteria**

* No more `violates check constraint "trades_strategy_type_check_v2"`.
* Button inserts into `public.trades` and returns to `/trades` highlighting the new row.
* Prospective list shows it even without an `entry_date`.

---

If you prefer the DB to accept shorthand values like `"PCS"` directly, I can give you a safe migration to **drop and recreate** the check constraint including those values—but mapping in code is cleaner and future-proof.
