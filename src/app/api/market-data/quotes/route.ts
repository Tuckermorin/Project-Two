// src/app/api/market-data/quotes/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getMarketDataService } from '@/lib/services/market-data-service';

// Helper function to batch promises with rate limiting
async function batchWithRateLimit<T, R>(
  items: T[],
  batchSize: number,
  delayMs: number,
  processFn: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = [];

  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    const batchResults = await Promise.all(batch.map(processFn));
    results.push(...batchResults);

    // Add delay between batches (except for the last batch)
    if (i + batchSize < items.length) {
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }

  return results;
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const symbols = searchParams.get('symbols');

    if (!symbols) {
      return NextResponse.json({ error: 'Symbols parameter is required' }, { status: 400 });
    }

    const symbolList = symbols.split(',').map(s => s.trim().toUpperCase());
    const marketDataService = getMarketDataService();

    // With 600 calls/min, we can do 10 calls/sec
    // Batch 5 symbols at a time with 100ms delay between batches
    // This gives us ~50 symbols/sec with safety margin
    const quotes = await batchWithRateLimit(
      symbolList,
      5,  // Batch size
      100,  // Delay in ms
      async (symbol) => {
        try {
          return await marketDataService.getUnifiedStockData(symbol, false);
        } catch (error) {
          // Only log errors that aren't 503 (those are already logged with retry info)
          if (error instanceof Error && !error.message.includes('503')) {
            console.error(`Failed to fetch quote for ${symbol}:`, error);
          }
          return null;
        }
      }
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