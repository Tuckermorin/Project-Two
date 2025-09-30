// src/app/api/market-data/options/expirations/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getAlphaVantageClient } from '@/lib/api/alpha-vantage';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const symbol = searchParams.get('symbol');

    if (!symbol) {
      return NextResponse.json({
        error: 'Missing required parameter: symbol'
      }, { status: 400 });
    }

    const avClient = getAlphaVantageClient();
    const options = await avClient.getRealtimeOptions(symbol, { requireGreeks: true });

    // Extract unique expiration dates and sort them
    const expirationDates = Array.from(
      new Set(options.map(opt => opt.expiration).filter(exp => exp))
    ).sort();

    return NextResponse.json({
      success: true,
      data: expirationDates
    });
  } catch (error) {
    console.error('Error fetching expiration dates:', error);

    return NextResponse.json(
      {
        error: 'Failed to fetch expiration dates',
        message: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
