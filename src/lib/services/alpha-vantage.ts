// src/lib/services/alpha-vantage.ts
export interface UnifiedStockData {
  symbol: string;
  currentPrice: number;
  priceChange: number;
  priceChangePercent: number;
  lastUpdated: Date;
}

function parseGlobalQuote(json: any, symbol: string): UnifiedStockData | null {
  const gq = json?.['Global Quote'];
  if (!gq) return null;

  const price = Number(gq['05. price']);
  const prevClose = Number(gq['08. previous close']);
  if (!isFinite(price) || !isFinite(prevClose)) return null;

  const change = price - prevClose;
  const cpStr = String(gq['10. change percent'] || '').trim();
  const cp = cpStr.endsWith('%') ? Number(cpStr.replace('%', '')) :
    (prevClose !== 0 ? (change / prevClose) * 100 : 0);

  return {
    symbol,
    currentPrice: price,
    priceChange: change,
    priceChangePercent: cp,
    lastUpdated: new Date(),
  };
}

export async function fetchGlobalQuote(symbol: string, apiKey: string): Promise<UnifiedStockData> {
  const entitlement = process.env.ALPHA_VANTAGE_ENTITLEMENT;
  let url = `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${encodeURIComponent(symbol)}&apikey=${encodeURIComponent(apiKey)}`;
  if (entitlement) {
    url += `&entitlement=${encodeURIComponent(entitlement)}`;
  }

  const res = await fetch(url, { cache: 'no-store' });
  // Alpha Vantage uses 200 OK even on rate-limit, with a JSON "Note"
  const json = await res.json();

  if (json?.Note) {
    const err = new Error(`Alpha Vantage rate limit: ${json.Note}`);
    (err as any).code = 'RATE_LIMIT';
    throw err;
  }
  if (json?.Information) {
    const err = new Error(`Alpha Vantage info: ${json.Information}`);
    (err as any).code = 'RATE_LIMIT';
    throw err;
  }

  const parsed = parseGlobalQuote(json, symbol);
  if (!parsed) {
    throw new Error(`No usable data for ${symbol}`);
  }
  return parsed;
}
