// src/app/api/watchlist/seed-cache/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server-client';
import { getIVCacheService } from '@/lib/services/iv-cache-service';

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { symbol } = body;

    if (!symbol || typeof symbol !== 'string') {
      return NextResponse.json(
        { success: false, error: 'Symbol is required' },
        { status: 400 }
      );
    }

    console.log(`[Watchlist Seed Cache] Starting for ${symbol}`);

    // Get IV cache service
    const ivCacheService = getIVCacheService();

    // Cache historical IV data (252 trading days = 1 year)
    const result = await ivCacheService.cacheHistoricalIVForSymbol(symbol, 252);

    if (!result.success) {
      return NextResponse.json({
        success: false,
        error: result.error || 'Failed to cache IV data',
        daysAdded: result.daysAdded
      }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      daysAdded: result.daysAdded,
      message: `Cached ${result.daysAdded} days of IV data for ${symbol}`
    });

  } catch (error: any) {
    console.error('[Watchlist Seed Cache] Error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Internal server error'
      },
      { status: 500 }
    );
  }
}
