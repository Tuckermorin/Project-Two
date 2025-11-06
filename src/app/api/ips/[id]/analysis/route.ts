/**
 * API: Get IPS Analysis
 * GET /api/ips/[id]/analysis
 *
 * Returns comprehensive AI-powered analysis of an IPS configuration
 * including performance metrics, recommendations, and actionable insights.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server-client'
import { analyzeIPSPerformance } from '@/lib/services/ips-ai-analyzer'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient()
    const { id: ipsId } = await params

    // Get current user
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Fetch IPS configuration
    const { data: ipsData, error: ipsError } = await supabase
      .from('ips_configurations')
      .select('*, ips_factors(*)')
      .eq('id', ipsId)
      .eq('user_id', user.id)
      .single()

    if (ipsError || !ipsData) {
      return NextResponse.json(
        { error: 'IPS not found' },
        { status: 404 }
      )
    }

    // Fetch trades for this IPS
    const { data: trades, error: tradesError } = await supabase
      .from('trades')
      .select('*')
      .eq('ips_id', ipsId)
      .eq('user_id', user.id)

    if (tradesError) {
      console.error('Error fetching trades:', tradesError)
      return NextResponse.json(
        { error: 'Failed to fetch trades' },
        { status: 500 }
      )
    }

    const closedTrades = (trades || []).filter(t => t.status === 'closed')

    // Check if there's enough data
    if (closedTrades.length < 25) {
      return NextResponse.json(
        {
          error: 'Insufficient data',
          message: `Need at least 25 closed trades (currently have ${closedTrades.length})`,
        },
        { status: 400 }
      )
    }

    // Check deployment duration
    const createdDate = new Date(ipsData.created_at)
    const daysSinceCreation = Math.floor(
      (Date.now() - createdDate.getTime()) / (1000 * 60 * 60 * 24)
    )

    if (daysSinceCreation < 14) {
      return NextResponse.json(
        {
          error: 'Insufficient deployment time',
          message: `IPS must be deployed for at least 14 days (currently ${daysSinceCreation} days)`,
        },
        { status: 400 }
      )
    }

    // Fetch latest backtest results (optional)
    const { data: backtestResults } = await supabase
      .from('ips_backtest_results')
      .select('*, ips_backtest_runs!inner(*)')
      .eq('ips_id', ipsId)
      .eq('ips_backtest_runs.user_id', user.id)
      .eq('ips_backtest_runs.status', 'completed')
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    // Prepare input for AI analysis
    const analysisInput = {
      ipsId: ipsData.id,
      ipsName: ipsData.name,
      ipsConfig: {
        strategies: ipsData.strategies || [],
        factors: (ipsData.ips_factors || []).map((f: any) => ({
          factor_id: f.factor_id,
          factor_name: f.factor_name,
          weight: f.weight,
          enabled: f.enabled !== false,
          target_value: f.target_value,
          target_operator: f.target_operator,
          preference_direction: f.preference_direction,
        })),
        min_dte: ipsData.min_dte,
        max_dte: ipsData.max_dte,
        exit_strategies: ipsData.exit_strategies,
        watch_criteria: ipsData.watch_criteria,
        ai_weight: ipsData.ai_weight,
      },
      trades: closedTrades,
      backtestResults: backtestResults || undefined,
    }

    // Generate AI analysis
    const analysis = await analyzeIPSPerformance(analysisInput)

    // Return comprehensive analysis
    return NextResponse.json({
      success: true,
      data: {
        ipsId: ipsData.id,
        ipsName: ipsData.name,
        analysis,
        metadata: {
          totalTrades: closedTrades.length,
          daysDeployed: daysSinceCreation,
          hasBacktestData: !!backtestResults,
          generatedAt: new Date().toISOString(),
        },
      },
    })
  } catch (error: any) {
    console.error('IPS Analysis API Error:', error)
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}
