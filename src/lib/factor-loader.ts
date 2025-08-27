import type { LoadedIPSFactors, IPSFactor, FactorValueMap } from "@/lib/types";
import { ipsDataService } from "@/lib/services/ips-data-service";
import { getFactorDataService } from "@/lib/services/factor-data-service";
import { getMarketDataService } from "@/lib/services/market-data-service";

/**
 * Get the IPS's selected factors already split into API vs Manual.
 * This assumes your ipsDataService can return a factor list for an IPS id.
 */
export async function loadIPSFactors(ipsId: string): Promise<LoadedIPSFactors> {
  const selected: IPSFactor[] = await ipsDataService.getIPSFactors(ipsId);
  return {
    api: selected.filter((f) => f.source === "api"),
    manual: selected.filter((f) => f.source === "manual"),
  };
}

/**
 * Batch-fetch API factor values for a symbol. Falls back to nulls on errors.
 * You can implement smarter batching inside marketDataService/factorDataService.
 */
export async function fetchApiFactorValues(
  symbol: string,
  apiFactors: IPSFactor[],
  ipsId: string
): Promise<FactorValueMap> {
  const out: FactorValueMap = {};
  const factorService = getFactorDataService();
  const marketService = getMarketDataService();

  try {
    // Fetch in one call using the real ipsId (drives which API factors are relevant)
    const response = await factorService.fetchAPIFactors(symbol, ipsId);

    // The API returns an object keyed by human factor name (e.g., 'P/E Ratio').
    // Map each configured factor to our internal key.
    for (const f of apiFactors) {
      const byName = (response.factors as any)[f.name]?.value;
      const byKey = (response.factors as any)[f.key]?.value;
      if (byName !== undefined) {
        out[f.key] = byName as number;
        continue;
      }
      if (byKey !== undefined) {
        out[f.key] = byKey as number;
        continue;
      }
      // Fallback to local mapping from market data
      try {
        const stockData = await marketService.getUnifiedStockData(symbol, true);
        out[f.key] = mapFactorToStockData(f.key, stockData) ?? null;
      } catch {
        out[f.key] = null;
      }
    }
  } catch {
    // Total failure: best-effort fallback per factor
    for (const f of apiFactors) {
      try {
        const stockData = await marketService.getUnifiedStockData(symbol, true);
        out[f.key] = mapFactorToStockData(f.key, stockData) ?? null;
      } catch {
        out[f.key] = null;
      }
    }
  }

  return out;
}

// Helper function to map factor keys to stock data properties
function mapFactorToStockData(factorKey: string, stockData: any): number | string | null {
  switch (factorKey.toLowerCase()) {
    case 'pe_ratio':
    case 'p_e_ratio':
      return stockData.fundamentals?.eps && stockData.currentPrice
        ? stockData.currentPrice / stockData.fundamentals.eps
        : null;
    case 'beta':
      return stockData.beta || null;
    case 'market_cap':
      return stockData.marketCap || null;
    case 'revenue_growth':
      return stockData.fundamentals?.revenueGrowth || null;
    default:
      return null;
  }
}
