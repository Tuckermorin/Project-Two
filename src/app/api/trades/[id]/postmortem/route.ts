import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server-client';
import { getTradePostMortemService } from '@/lib/services/trade-postmortem-service';

/**
 * POST /api/trades/[id]/postmortem
 *
 * Manually trigger post-mortem analysis for a specific trade
 * Useful for testing or immediate analysis
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = await createClient();

    // Get authenticated user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const tradeId = params.id;

    // Verify user owns this trade
    const { data: trade, error: tradeError } = await supabase
      .from('trades')
      .select('id, user_id, status, symbol, closed_at')
      .eq('id', tradeId)
      .eq('user_id', user.id)
      .single();

    if (tradeError || !trade) {
      return NextResponse.json({ error: 'Trade not found' }, { status: 404 });
    }

    if (trade.status !== 'closed') {
      return NextResponse.json(
        { error: 'Trade must be closed for post-mortem analysis' },
        { status: 400 }
      );
    }

    console.log(`[PostMortem] Manual trigger for trade ${tradeId} (${trade.symbol})`);

    // Run analysis
    const postMortemService = getTradePostMortemService();
    const analysisId = await postMortemService.analyzeClosedTrade(tradeId);

    if (!analysisId) {
      return NextResponse.json(
        { error: 'Failed to generate post-mortem analysis' },
        { status: 500 }
      );
    }

    // Get the analysis
    const { data: analysis } = await supabase
      .from('trade_postmortem_analysis')
      .select('*')
      .eq('id', analysisId)
      .single();

    return NextResponse.json({
      success: true,
      analysis_id: analysisId,
      analysis: analysis
    });

  } catch (error: any) {
    console.error('[PostMortem] Manual trigger failed:', error);
    return NextResponse.json(
      {
        error: 'Failed to generate post-mortem',
        message: error.message
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/trades/[id]/postmortem
 *
 * Get existing post-mortem analysis for a trade
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = await createClient();

    // Get authenticated user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const tradeId = params.id;

    // Get post-mortem analysis
    const { data: analysis, error } = await supabase
      .from('trade_postmortem_analysis')
      .select('*')
      .eq('trade_id', tradeId)
      .eq('user_id', user.id)
      .single();

    if (error || !analysis) {
      return NextResponse.json(
        {
          exists: false,
          message: 'No post-mortem analysis found for this trade'
        },
        { status: 404 }
      );
    }

    return NextResponse.json({
      exists: true,
      analysis
    });

  } catch (error: any) {
    console.error('[PostMortem] GET failed:', error);
    return NextResponse.json(
      {
        error: 'Failed to retrieve post-mortem',
        message: error.message
      },
      { status: 500 }
    );
  }
}
