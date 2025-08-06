// src/app/api/market-data/fundamental/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getMarketDataService } from '@/lib/services/market-data-service';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const symbol = searchParams.get('symbol');
    
    if (!symbol) {
      return NextResponse.json({ error: 'Symbol parameter is required' }, { status: 400 });
    }

    const marketDataService = getMarketDataService();
    const stockData = await marketDataService.getUnifiedStockData(symbol, true);
    
    return NextResponse.json({
      success: true,
      data: stockData
    });
  } catch (error) {
    console.error('Error fetching fundamental data:', error);
    
    return NextResponse.json(
      { 
        error: 'Failed to fetch fundamental data', 
        message: error instanceof Error ? error.message : 'Unknown error' 
      },
      { status: 500 }
    );
  }
}