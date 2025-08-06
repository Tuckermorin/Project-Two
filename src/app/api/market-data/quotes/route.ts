// src/app/api/market-data/quotes/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getMarketDataService } from '@/lib/services/market-data-service';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const symbols = searchParams.get('symbols');
    
    if (!symbols) {
      return NextResponse.json({ error: 'Symbols parameter is required' }, { status: 400 });
    }

    const symbolList = symbols.split(',').map(s => s.trim().toUpperCase());
    const marketDataService = getMarketDataService();
    
    const quotes = await Promise.all(
      symbolList.map(async (symbol) => {
        try {
          return await marketDataService.getUnifiedStockData(symbol, false);
        } catch (error) {
          console.error(`Failed to fetch quote for ${symbol}:`, error);
          return null;
        }
      })
    );
    
    // Filter out failed requests
    const validQuotes = quotes.filter(quote => quote !== null);
    
    return NextResponse.json({
      success: true,
      data: validQuotes,
      requestedSymbols: symbolList.length,
      returnedSymbols: validQuotes.length
    });
  } catch (error) {
    console.error('Error fetching quotes:', error);
    
    return NextResponse.json(
      { 
        error: 'Failed to fetch quotes', 
        message: error instanceof Error ? error.message : 'Unknown error' 
      },
      { status: 500 }
    );
  }
}