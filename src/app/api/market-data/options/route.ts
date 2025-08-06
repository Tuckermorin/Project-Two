// src/app/api/market-data/options/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getMarketDataService } from '@/lib/services/market-data-service';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const symbol = searchParams.get('symbol');
    const strike = searchParams.get('strike');
    const expiration = searchParams.get('expiration');
    const optionType = searchParams.get('type') as 'call' | 'put';
    
    if (!symbol || !strike || !expiration || !optionType) {
      return NextResponse.json({ 
        error: 'Missing required parameters: symbol, strike, expiration, type' 
      }, { status: 400 });
    }

    const marketDataService = getMarketDataService();
    const optionsData = await marketDataService.getOptionsData(
      symbol,
      parseFloat(strike),
      expiration,
      optionType
    );
    
    if (!optionsData) {
      return NextResponse.json({ 
        error: 'Option not found' 
      }, { status: 404 });
    }
    
    return NextResponse.json({
      success: true,
      data: optionsData
    });
  } catch (error) {
    console.error('Error fetching options data:', error);
    
    return NextResponse.json(
      { 
        error: 'Failed to fetch options data', 
        message: error instanceof Error ? error.message : 'Unknown error' 
      },
      { status: 500 }
    );
  }
}