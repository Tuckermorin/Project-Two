// src/app/api/market-data/options/chain/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getAlphaVantageClient } from '@/lib/api/alpha-vantage';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const symbol = searchParams.get('symbol');
    const expiration = searchParams.get('expiration');

    if (!symbol || !expiration) {
      return NextResponse.json({
        error: 'Missing required parameters: symbol, expiration'
      }, { status: 400 });
    }

    const avClient = getAlphaVantageClient();
    const allOptions = await avClient.getRealtimeOptions(symbol, { requireGreeks: true });

    // Filter options by the requested expiration date
    const optionsChain = allOptions.filter(opt => opt.expiration === expiration);

    // Transform to match expected format
    const transformedChain = optionsChain.map(opt => ({
      symbol: opt.contractId,
      strike: opt.strike,
      expiration_date: opt.expiration,
      option_type: opt.type,
      bid: opt.bid,
      ask: opt.ask,
      last: opt.last,
      mark: opt.mark,
      volume: opt.volume,
      open_interest: opt.openInterest,
      greeks: {
        delta: opt.delta,
        gamma: opt.gamma,
        theta: opt.theta,
        vega: opt.vega,
        rho: opt.rho,
        mid_iv: opt.impliedVolatility
      }
    }));

    return NextResponse.json({
      success: true,
      data: transformedChain
    });
  } catch (error) {
    console.error('Error fetching options chain:', error);

    return NextResponse.json(
      {
        error: 'Failed to fetch options chain',
        message: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
