import { NextRequest, NextResponse } from 'next/server';
import { getAlphaVantageClient } from '@/lib/api/alpha-vantage';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const q = (searchParams.get('q') || searchParams.get('query') || '').trim();
    const limit = Number(searchParams.get('limit') || 10);

    if (!q) {
      return NextResponse.json({ success: false, error: 'Missing query ?q' }, { status: 400 });
    }

    const av = getAlphaVantageClient();
    const results = await av.searchSymbols(q);
    const out = (results || [])
      .slice(0, Number.isFinite(limit) && limit > 0 ? limit : 10)
      .map(r => ({
        symbol: r.symbol,
        name: r.name,
        type: r.type,
        region: r.region,
        currency: r.currency,
        matchScore: r.matchScore,
      }));

    return NextResponse.json({ success: true, data: out });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err?.message || 'Unexpected error' }, { status: 500 });
  }
}

