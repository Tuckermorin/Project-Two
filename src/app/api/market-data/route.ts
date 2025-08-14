// src/app/api/market-data/route.ts
import { NextResponse } from 'next/server';
import { marketCache, dailyCounter, DAILY_BUDGET } from '@/lib/cache/memory-cache';
import { fetchGlobalQuote, UnifiedStockData } from '@/lib/services/alpha-vantage';

type ApiItem = {
  symbol: string;
  data: UnifiedStockData | null;
  fromCache: boolean;
  error?: string;
};

export async function GET(request: Request) {
  const url = new URL(request.url);
  const raw = url.searchParams.get('symbols') || '';
  const symbols = raw
    .split(',')
    .map(s => s.trim().toUpperCase())
    .filter(Boolean);

  if (symbols.length === 0) {
    return NextResponse.json(
      { message: 'Provide ?symbols=SYM1,SYM2' },
      { status: 400 }
    );
  }

  const key = process.env.ALPHA_VANTAGE_API_KEY;
  if (!key) {
    return NextResponse.json(
      { message: 'Server misconfiguration: ALPHA_VANTAGE_API_KEY missing' },
      { status: 500 }
    );
  }

  const results: ApiItem[] = [];
  let rateLimited = false;
  let budgetExceeded = false;

  // Serve fresh cache if available; otherwise decide whether to call AV
  for (const symbol of symbols) {
    const cached = marketCache.get(symbol);
    if (cached) {
      results.push({ symbol, data: cached.value, fromCache: true });
      continue;
    }

    // No fresh cache: do we still have budget?
    if (dailyCounter.value() >= DAILY_BUDGET) {
      budgetExceeded = true;
      const stale = marketCache.getStale(symbol);
      results.push({
        symbol,
        data: stale,
        fromCache: true,
        error: stale ? 'served-stale:budget-exceeded' : 'no-data:budget-exceeded',
      });
      continue;
    }

    // Try Alpha Vantage
    try {
      const data = await fetchGlobalQuote(symbol, key);
      marketCache.set(symbol, data);
      dailyCounter.inc();
      results.push({ symbol, data, fromCache: false });
    } catch (err: any) {
      if (err?.code === 'RATE_LIMIT') {
        rateLimited = true;
      }
      const stale = marketCache.getStale(symbol);
      results.push({
        symbol,
        data: stale,
        fromCache: true,
        error: stale ? `served-stale:${err?.code || 'fetch-failed'}` : `no-data:${err?.code || 'fetch-failed'}`,
      });
    }
  }

  const resp = NextResponse.json(
    {
      items: results,
      meta: {
        budgetUsed: dailyCounter.value(),
        budgetLimit: DAILY_BUDGET,
        budgetExceeded,
        rateLimited,
      },
    },
    {
      status: 200,
    }
  );

  // Helpful headers for the client/UI
  resp.headers.set('X-Budget-Used', String(dailyCounter.value()));
  resp.headers.set('X-Budget-Limit', String(DAILY_BUDGET));
  if (budgetExceeded) resp.headers.set('X-Budget-Exceeded', 'true');
  if (rateLimited) resp.headers.set('X-RateLimited', 'true');

  return resp;
}
