import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server-client';
import { getIVCacheService } from '@/lib/services/iv-cache-service';

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // RLS automatically filters by user_id
    const { data, error } = await supabase
      .from('watchlist_items')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;

    return NextResponse.json({ success: true, data });
  } catch (error: any) {
    console.error('Error fetching watchlist:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const body = await request.json();
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const { data, error } = await supabase
      .from('watchlist_items')
      .insert([{
        user_id: user.id,
        symbol: body.symbol,
        company_name: body.companyName,
        sector: body.sector,
        notes: body.notes,
        current_price: body.currentPrice,
        week52_high: body.week52High,
        week52_low: body.week52Low,
        market_cap: body.marketCap,
        pe_ratio: body.peRatio,
        dividend_yield: body.dividendYield,
        change: body.change,
        change_percent: body.changePercent,
        volume: body.volume,
        currency: body.currency,
        beta: body.beta,
        analyst_target_price: body.analystTargetPrice,
        eps: body.eps,
        last_refreshed: new Date().toISOString(),
      }])
      .select()
      .single();

    if (error) throw error;

    // Trigger IV cache seeding in background (don't await - fire and forget)
    const ivCacheService = getIVCacheService();
    ivCacheService.cacheHistoricalIVForSymbol(body.symbol, 252)
      .then(result => {
        if (result.success) {
          console.log(`[Watchlist] Cached ${result.daysAdded} days of IV data for ${body.symbol}`);
        } else {
          console.warn(`[Watchlist] IV cache seeding failed for ${body.symbol}:`, result.error);
        }
      })
      .catch(err => {
        console.warn(`[Watchlist] IV cache seeding error for ${body.symbol}:`, err.message);
      });

    console.log(`[Watchlist] Added ${body.symbol}, triggered IV cache seeding`);

    return NextResponse.json({ success: true, data });
  } catch (error: any) {
    console.error('Error adding to watchlist:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json(
        { success: false, error: 'ID is required' },
        { status: 400 }
      );
    }

    // RLS automatically enforces user ownership
    const { error } = await supabase
      .from('watchlist_items')
      .delete()
      .eq('id', id);

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Error removing from watchlist:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
