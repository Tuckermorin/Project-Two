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
