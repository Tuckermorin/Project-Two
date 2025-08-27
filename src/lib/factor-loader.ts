import type { LoadedIPSFactors, IPSFactor, FactorValueMap } from "@/lib/types";
import { ipsDataService } from "@/lib/services/ips-data-service";
import { factorDataService } from "@/lib/services/factor-data-service";
import { marketDataService } from "@/lib/services/market-data-service";

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
  apiFactors: IPSFactor[]
): Promise<FactorValueMap> {
  const out: FactorValueMap = {};
  for (const f of apiFactors) {
    try {
      // try factorDataService first if you map keys -> provider
      const v = await factorDataService.getValue({ symbol, key: f.key });
      out[f.key] = v ?? null;
    } catch {
      try {
        // optional fallback to marketDataService
        const v2 = await marketDataService.getFactor({ symbol, key: f.key });
        out[f.key] = v2 ?? null;
      } catch {
        out[f.key] = null;
      }
    }
  }
  return out;
}
