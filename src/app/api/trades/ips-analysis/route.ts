// API Endpoint: IPS Performance Analysis
// Tracks how well IPS scores predict actual trade outcomes

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server-client';

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();

    // Get authenticated user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = user.id;

    // Query trades that moved from prospective → active/closed
    const { data: trades, error: tradesError } = await supabase
      .from('trades')
      .select('*')
      .eq('user_id', userId)
      .in('status', ['active', 'closed'])
      .not('ips_score', 'is', null)
      .order('created_at', { ascending: false })
      .limit(100);

    if (tradesError) {
      console.error('[IPS Analysis] Error fetching trades:', tradesError);
      return NextResponse.json({ error: tradesError.message }, { status: 500 });
    }

    // Calculate win rate by IPS score bucket
    const buckets = {
      elite: { min: 90, max: 100, trades: [] as any[], wins: 0, losses: 0 },
      quality: { min: 75, max: 89, trades: [] as any[], wins: 0, losses: 0 },
      speculative: { min: 60, max: 74, trades: [] as any[], wins: 0, losses: 0 },
      below_threshold: { min: 0, max: 59, trades: [] as any[], wins: 0, losses: 0 },
    };

    for (const trade of trades || []) {
      const ipsScore = trade.ips_score || 0;
      const isWin = (trade.realized_pl || trade.realized_pnl || 0) > 0;
      const isClosed = trade.status === 'closed';

      let bucket: keyof typeof buckets | null = null;
      if (ipsScore >= 90) bucket = 'elite';
      else if (ipsScore >= 75) bucket = 'quality';
      else if (ipsScore >= 60) bucket = 'speculative';
      else bucket = 'below_threshold';

      if (bucket) {
        buckets[bucket].trades.push(trade);
        if (isClosed) {
          if (isWin) buckets[bucket].wins++;
          else buckets[bucket].losses++;
        }
      }
    }

    // Calculate metrics for each bucket
    const analysis = Object.entries(buckets).map(([tier, data]) => {
      const totalClosed = data.wins + data.losses;
      const winRate = totalClosed > 0 ? (data.wins / totalClosed) * 100 : null;
      const avgPnL = data.trades
        .filter(t => t.status === 'closed')
        .reduce((sum, t) => sum + (t.realized_pl || t.realized_pnl || 0), 0) / totalClosed || null;

      return {
        tier,
        ips_range: `${data.min}-${data.max}`,
        total_trades: data.trades.length,
        closed_trades: totalClosed,
        wins: data.wins,
        losses: data.losses,
        win_rate: winRate,
        avg_pnl: avgPnL,
      };
    });

    // Analyze factor effectiveness (which factors best predict success?)
    const factorEffectiveness: Record<string, { pass_wins: number; pass_losses: number; fail_wins: number; fail_losses: number }> = {};

    for (const trade of trades || []) {
      if (!trade.ips_factor_scores || trade.status !== 'closed') continue;

      const isWin = (trade.realized_pl || trade.realized_pnl || 0) > 0;
      const factorScores = trade.ips_factor_scores as any;

      for (const factor of factorScores.factor_details || []) {
        if (!factorEffectiveness[factor.factor_key]) {
          factorEffectiveness[factor.factor_key] = {
            pass_wins: 0,
            pass_losses: 0,
            fail_wins: 0,
            fail_losses: 0,
          };
        }

        if (factor.passed) {
          if (isWin) factorEffectiveness[factor.factor_key].pass_wins++;
          else factorEffectiveness[factor.factor_key].pass_losses++;
        } else {
          if (isWin) factorEffectiveness[factor.factor_key].fail_wins++;
          else factorEffectiveness[factor.factor_key].fail_losses++;
        }
      }
    }

    // Calculate predictive power for each factor
    const factorAnalysis = Object.entries(factorEffectiveness).map(([factorKey, stats]) => {
      const passTotal = stats.pass_wins + stats.pass_losses;
      const failTotal = stats.fail_wins + stats.fail_losses;
      const passWinRate = passTotal > 0 ? (stats.pass_wins / passTotal) * 100 : null;
      const failWinRate = failTotal > 0 ? (stats.fail_wins / failTotal) * 100 : null;
      const predictivePower = passWinRate !== null && failWinRate !== null
        ? passWinRate - failWinRate
        : null;

      return {
        factor_key: factorKey,
        pass_win_rate: passWinRate,
        fail_win_rate: failWinRate,
        predictive_power: predictivePower, // Higher = factor is more predictive
        sample_size: passTotal + failTotal,
      };
    }).sort((a, b) => (b.predictive_power || 0) - (a.predictive_power || 0));

    // Recent prospective trades performance
    const recentProspectives = (trades || [])
      .filter(t => t.tier)
      .slice(0, 20)
      .map(t => ({
        id: t.id,
        symbol: t.symbol,
        tier: t.tier,
        ips_score: t.ips_score,
        status: t.status,
        realized_pnl: t.realized_pl || t.realized_pnl,
        created_at: t.created_at,
        entry_date: t.entry_date,
        closed_at: t.closed_at,
      }));

    return NextResponse.json({
      success: true,
      data: {
        tier_performance: analysis,
        factor_effectiveness: factorAnalysis,
        recent_trades: recentProspectives,
        summary: {
          total_analyzed: trades?.length || 0,
          total_closed: trades?.filter(t => t.status === 'closed').length || 0,
          overall_win_rate: calculateOverallWinRate(trades || []),
        },
      },
    });

  } catch (error: any) {
    console.error('[IPS Analysis] Error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

function calculateOverallWinRate(trades: any[]): number | null {
  const closedTrades = trades.filter(t => t.status === 'closed');
  if (closedTrades.length === 0) return null;

  const wins = closedTrades.filter(t => (t.realized_pl || t.realized_pnl || 0) > 0).length;
  return (wins / closedTrades.length) * 100;
}
