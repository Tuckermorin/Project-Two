import { http } from "./http";

const API = "https://www.alphavantage.co/query";
const key = process.env.ALPHA_VANTAGE_API_KEY || process.env.NEXT_PUBLIC_ALPHA_VANTAGE_API_KEY;

export type AVOption = {
  symbol: string;
  expiry: string;
  strike: number;
  option_type: "C" | "P";
  bid?: number;
  ask?: number;
  last?: number;
  iv?: number;
  delta?: number;
  gamma?: number;
  theta?: number;
  vega?: number;
  oi?: number;
  volume?: number;
};

export async function getOptionsChain(symbol: string) {
  // TODO: Replace with the exact AV premium options endpoint you have.
  // Using REALTIME_OPTIONS endpoint with require_greeks=true
  try {
    const res = await http(API, {
      params: {
        function: "REALTIME_OPTIONS",
        symbol,
        apikey: key,
        require_greeks: "true",
        entitlement: "realtime",
      },
    });

    const data = res as any;
    const rawData = Array.isArray(data?.data) ? data.data : [];

    // Normalize to AVOption[]
    const contracts: AVOption[] = rawData.map((contract: any) => ({
      symbol: contract.contractID || contract.symbol || symbol,
      expiry: contract.expiration || "",
      strike: parseFloat(contract.strike) || 0,
      option_type: (contract.type || "").toUpperCase() === "PUT" ? "P" : "C",
      bid: contract.bid ? parseFloat(contract.bid) : undefined,
      ask: contract.ask ? parseFloat(contract.ask) : undefined,
      last: contract.last ? parseFloat(contract.last) : undefined,
      iv: contract.impliedVolatility || contract.implied_volatility
        ? parseFloat(contract.impliedVolatility || contract.implied_volatility)
        : undefined,
      delta: contract.delta ? parseFloat(contract.delta) : undefined,
      gamma: contract.gamma ? parseFloat(contract.gamma) : undefined,
      theta: contract.theta ? parseFloat(contract.theta) : undefined,
      vega: contract.vega ? parseFloat(contract.vega) : undefined,
      oi: contract.openInterest || contract.open_interest
        ? parseFloat(contract.openInterest || contract.open_interest)
        : undefined,
      volume: contract.volume ? parseFloat(contract.volume) : undefined,
    }));

    const asof = new Date().toISOString();
    return { asof, contracts };
  } catch (error) {
    console.error("Error fetching options chain:", error);
    return { asof: new Date().toISOString(), contracts: [] };
  }
}

export async function getQuote(symbol: string) {
  const res = await http(API, {
    params: {
      function: "GLOBAL_QUOTE",
      symbol,
      apikey: key,
      entitlement: "realtime",
    },
  });
  return res;
}
