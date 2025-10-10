// src/app/api/debug/closed-trades/route.ts
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET() {
  try {
    // Get all closed trades
    const { data: allClosed, error: allClosedError } = await supabase
      .from('trades')
      .select('id, symbol, status, closed_at, realized_pnl, created_at')
      .eq('status', 'closed')
      .order('closed_at', { ascending: false });

    if (allClosedError) {
      return NextResponse.json({ error: allClosedError.message }, { status: 500 });
    }

    // Get closed trades in last 2 hours (what cron job is checking)
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    const { data: recentClosed, error: recentError } = await supabase
      .from('trades')
      .select('id, symbol, status, closed_at, realized_pnl')
      .eq('status', 'closed')
      .gte('closed_at', twoHoursAgo)
      .not('realized_pnl', 'is', null);

    if (recentError) {
      return NextResponse.json({ error: recentError.message }, { status: 500 });
    }

    // Check which have post-mortems
    const tradesWithPM = [];
    const tradesWithoutPM = [];

    if (allClosed && allClosed.length > 0) {
      for (const trade of allClosed) {
        const { data: pm } = await supabase
          .from('trade_postmortems')
          .select('id, created_at')
          .eq('trade_id', trade.id)
          .single();

        if (pm) {
          tradesWithPM.push({ ...trade, postmortem_id: pm.id, postmortem_created: pm.created_at });
        } else {
          tradesWithoutPM.push(trade);
        }
      }
    }

    return NextResponse.json({
      summary: {
        total_closed: allClosed?.length || 0,
        recent_closed_2hrs: recentClosed?.length || 0,
        with_postmortem: tradesWithPM.length,
        without_postmortem: tradesWithoutPM.length,
        two_hours_ago: twoHoursAgo,
        now: new Date().toISOString(),
      },
      all_closed_trades: allClosed,
      recent_closed_trades: recentClosed,
      trades_with_postmortem: tradesWithPM,
      trades_without_postmortem: tradesWithoutPM,
    });
  } catch (error: any) {
    console.error('[Debug] Error checking closed trades:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
