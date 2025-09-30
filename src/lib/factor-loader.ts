import type { LoadedIPSFactors, IPSFactor, FactorValueMap } from "@/lib/types";
import type { OptionsRequestContext } from "@/lib/types/market-data";
import { ipsDataService } from "@/lib/services/ips-data-service";
import { getFactorDataService } from "@/lib/services/factor-data-service";
import { getMarketDataService } from "@/lib/services/market-data-service";

/**
 * Get the IPS's selected factors already split into API vs Manual.
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
 */
export async function fetchApiFactorValues(
  symbol: string,
  apiFactors: IPSFactor[],
  ipsId: string,
  optionsContext?: OptionsRequestContext
): Promise<FactorValueMap> {
  const out: FactorValueMap = {};
  const factorService = getFactorDataService();
  const marketService = getMarketDataService();

  try {
    const response = await factorService.fetchAPIFactors(symbol, ipsId, optionsContext);
    const factorsByName = response.factors as Record<string, { value?: number | string | boolean | null } | undefined>;

    for (const factor of apiFactors) {
      const keyed = factorsByName[factor.key];
      const named = factorsByName[factor.name];
      const resolved = keyed ?? named;

      if (resolved?.value !== undefined) {
        out[factor.key] = resolved.value as number | string | boolean;
        continue;
      }

      if (isOptionsFactor(factor)) {
        out[factor.key] = null;
        continue;
      }

      try {
        const stockData = await marketService.getUnifiedStockData(symbol, true);
        out[factor.key] = mapFactorToStockData(factor.key, stockData) ?? null;
      } catch {
        out[factor.key] = null;
      }
    }
  } catch {
    for (const factor of apiFactors) {
      if (isOptionsFactor(factor)) {
        out[factor.key] = null;
        continue;
      }

      try {
        const stockData = await marketService.getUnifiedStockData(symbol, true);
        out[factor.key] = mapFactorToStockData(factor.key, stockData) ?? null;
      } catch {
        out[factor.key] = null;
      }
    }
  }

  return out;
}

function isOptionsFactor(factor: IPSFactor): boolean {
  if (factor.key?.startsWith("opt-")) return true;
  const lowerName = factor.name.toLowerCase();
  return (
    lowerName.includes("implied volatility") ||
    lowerName.includes("delta") ||
    lowerName.includes("gamma") ||
    lowerName.includes("theta") ||
    lowerName.includes("vega") ||
    lowerName.includes("rho") ||
    lowerName.includes("open interest") ||
    lowerName.includes("bid-ask") ||
    lowerName.includes("time value") ||
    lowerName.includes("intrinsic value")
  );
}

function mapFactorToStockData(factorKey: string, stockData: any): number | string | null {
  switch (factorKey.toLowerCase()) {
    case "pe_ratio":
    case "p_e_ratio":
      return stockData.fundamentals?.eps && stockData.currentPrice
        ? stockData.currentPrice / stockData.fundamentals.eps
        : null;
    case "beta":
      return stockData.beta || null;
    case "market_cap":
      return stockData.marketCap || null;
    case "revenue_growth":
      return stockData.fundamentals?.revenueGrowth || null;
    default:
      return null;
  }
}

