import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

interface PatternInsight {
  category: 'delta' | 'iv' | 'dte' | 'sector' | 'timing' | 'ips' | 'risk_management'
  title: string
  description: string
  win_rate?: number
  sample_size: number
  confidence: 'high' | 'medium' | 'low'
  recommendation_type: 'action_required' | 'consider' | 'informational'
  details?: {
    metric?: string
    value?: string | number
    comparison?: string
  }
  filter_params?: any
}

export async function GET(request: NextRequest) {
  try {
    // Fetch all closed trades
    const { data: trades, error } = await supabase
      .from('trades')
      .select('*')
      .eq('status', 'closed')

    if (error || !trades || trades.length < 10) {
      return NextResponse.json({
        success: true,
        data: {
          total_trades: trades?.length || 0,
          insights: [],
        },
      })
    }

    const insights = await generatePatternInsights(trades)

    return NextResponse.json({
      success: true,
      data: {
        total_trades: trades.length,
        insights,
      },
    })
  } catch (error: any) {
    console.error('Error analyzing patterns:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to analyze patterns' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  // Same as GET but explicitly triggers regeneration
  return GET(request)
}

async function generatePatternInsights(trades: any[]): Promise<PatternInsight[]> {
  const insights: PatternInsight[] = []

  // Helper to calculate win rate
  const calcWinRate = (trades: any[]) => {
    const wins = trades.filter(t => (t.realized_pnl || t.realized_pl || 0) > 0).length
    return (wins / trades.length) * 100
  }

  // 1. Delta Analysis
  const deltaGroups = {
    low: trades.filter(t => Math.abs(t.delta_short_leg || 0) < 0.16),
    medium: trades.filter(t => Math.abs(t.delta_short_leg || 0) >= 0.16 && Math.abs(t.delta_short_leg || 0) < 0.20),
    high: trades.filter(t => Math.abs(t.delta_short_leg || 0) >= 0.20),
  }

  if (deltaGroups.medium.length >= 5) {
    const mediumWinRate = calcWinRate(deltaGroups.medium)
    const lowWinRate = deltaGroups.low.length >= 5 ? calcWinRate(deltaGroups.low) : null
    const highWinRate = deltaGroups.high.length >= 5 ? calcWinRate(deltaGroups.high) : null

    if (mediumWinRate > 70 || (lowWinRate !== null && mediumWinRate > lowWinRate + 15) || (highWinRate !== null && mediumWinRate > highWinRate + 15)) {
      insights.push({
        category: 'delta',
        title: 'Delta Sweet Spot Identified',
        description: `Credit spreads with delta 0.16-0.20 achieve ${mediumWinRate.toFixed(1)}% win rate (${deltaGroups.medium.filter(t => (t.realized_pnl || 0) > 0).length}/${deltaGroups.medium.length} trades)`,
        win_rate: mediumWinRate,
        sample_size: deltaGroups.medium.length,
        confidence: deltaGroups.medium.length >= 10 ? 'high' : deltaGroups.medium.length >= 5 ? 'medium' : 'low',
        recommendation_type: mediumWinRate > 80 ? 'action_required' : 'consider',
        details: {
          metric: 'Optimal Delta Range',
          value: '0.16 - 0.20',
          comparison: highWinRate !== null ? `vs ${highWinRate.toFixed(1)}% for delta >0.20` : undefined,
        },
        filter_params: { delta_min: 0.16, delta_max: 0.20 },
      })
    }
  }

  // 2. IV Rank Analysis
  const ivGroups = {
    low: trades.filter(t => (t.iv_at_entry || 0) < 30),
    medium: trades.filter(t => (t.iv_at_entry || 0) >= 30 && (t.iv_at_entry || 0) < 60),
    high: trades.filter(t => (t.iv_at_entry || 0) >= 60),
  }

  if (ivGroups.high.length >= 5) {
    const highIVWinRate = calcWinRate(ivGroups.high)
    const lowIVWinRate = ivGroups.low.length >= 5 ? calcWinRate(ivGroups.low) : null

    if (highIVWinRate > 70) {
      insights.push({
        category: 'iv',
        title: 'High IV Rank Correlation',
        description: `Trades entered when IV rank >60 have ${highIVWinRate.toFixed(1)}% success rate`,
        win_rate: highIVWinRate,
        sample_size: ivGroups.high.length,
        confidence: ivGroups.high.length >= 10 ? 'high' : 'medium',
        recommendation_type: 'consider',
        details: {
          metric: 'Optimal IV Entry',
          value: '> 60',
          comparison: lowIVWinRate !== null ? `vs ${lowIVWinRate.toFixed(1)}% for IV <30` : undefined,
        },
      })
    } else if (lowIVWinRate !== null && lowIVWinRate < 50 && highIVWinRate < 50) {
      insights.push({
        category: 'iv',
        title: 'IV Timing Needs Improvement',
        description: 'Both high and low IV entries show suboptimal results. Consider refining IV entry criteria.',
        win_rate: (highIVWinRate + lowIVWinRate) / 2,
        sample_size: ivGroups.high.length + ivGroups.low.length,
        confidence: 'medium',
        recommendation_type: 'action_required',
      })
    }
  }

  // 3. IPS Score Effectiveness
  const ipsGroups = {
    high: trades.filter(t => (t.ips_score || 0) >= 80),
    medium: trades.filter(t => (t.ips_score || 0) >= 60 && (t.ips_score || 0) < 80),
    low: trades.filter(t => (t.ips_score || 0) < 60),
  }

  if (ipsGroups.high.length >= 5) {
    const highIPSWinRate = calcWinRate(ipsGroups.high)
    const lowIPSWinRate = ipsGroups.low.length >= 5 ? calcWinRate(ipsGroups.low) : null

    if (highIPSWinRate > 75) {
      insights.push({
        category: 'ips',
        title: 'IPS Score Highly Predictive',
        description: `Trades with IPS score ≥80 achieve ${highIPSWinRate.toFixed(1)}% win rate. Focus on high-scoring opportunities.`,
        win_rate: highIPSWinRate,
        sample_size: ipsGroups.high.length,
        confidence: ipsGroups.high.length >= 10 ? 'high' : 'medium',
        recommendation_type: 'action_required',
        details: {
          metric: 'Minimum IPS Score',
          value: '80',
          comparison: lowIPSWinRate !== null ? `Low IPS (<60) only ${lowIPSWinRate.toFixed(1)}% win rate` : undefined,
        },
      })
    } else if (lowIPSWinRate !== null && Math.abs(highIPSWinRate - lowIPSWinRate) < 10) {
      insights.push({
        category: 'ips',
        title: 'IPS Score Needs Calibration',
        description: 'IPS score shows low predictive power. Consider reviewing factor weights.',
        sample_size: ipsGroups.high.length + ipsGroups.low.length,
        confidence: 'medium',
        recommendation_type: 'action_required',
      })
    }
  }

  // 4. Symbol Performance
  const symbolGroups = trades.reduce((acc, trade) => {
    if (!acc[trade.symbol]) {
      acc[trade.symbol] = []
    }
    acc[trade.symbol].push(trade)
    return acc
  }, {} as Record<string, any[]>)

  const topSymbols = Object.entries(symbolGroups)
    .filter(([_, trades]) => trades.length >= 3)
    .map(([symbol, symbolTrades]) => ({
      symbol,
      trades: symbolTrades,
      win_rate: calcWinRate(symbolTrades),
      count: symbolTrades.length,
    }))
    .sort((a, b) => b.win_rate - a.win_rate)

  if (topSymbols.length > 0 && topSymbols[0].win_rate > 80) {
    insights.push({
      category: 'sector',
      title: `${topSymbols[0].symbol} Strong Performer`,
      description: `${topSymbols[0].symbol} trades succeed ${topSymbols[0].win_rate.toFixed(1)}% of the time (${topSymbols[0].count} trades). High confidence setup.`,
      win_rate: topSymbols[0].win_rate,
      sample_size: topSymbols[0].count,
      confidence: topSymbols[0].count >= 5 ? 'high' : 'medium',
      recommendation_type: 'informational',
      filter_params: { symbol: topSymbols[0].symbol },
    })
  }

  const worstSymbols = topSymbols.filter(s => s.win_rate < 40 && s.count >= 3)
  if (worstSymbols.length > 0) {
    worstSymbols.forEach(worst => {
      insights.push({
        category: 'sector',
        title: `Avoid ${worst.symbol}`,
        description: `${worst.symbol} has only ${worst.win_rate.toFixed(1)}% success rate across ${worst.count} trades. Consider avoiding this symbol.`,
        win_rate: worst.win_rate,
        sample_size: worst.count,
        confidence: worst.count >= 5 ? 'high' : 'medium',
        recommendation_type: 'action_required',
        filter_params: { symbol: worst.symbol },
      })
    })
  }

  // 5. Days Held Analysis
  const daysHeldGroups = {
    short: trades.filter(t => {
      const days = Math.floor((new Date(t.closed_at).getTime() - new Date(t.entry_date).getTime()) / (1000 * 60 * 60 * 24))
      return days <= 7
    }),
    medium: trades.filter(t => {
      const days = Math.floor((new Date(t.closed_at).getTime() - new Date(t.entry_date).getTime()) / (1000 * 60 * 60 * 24))
      return days > 7 && days <= 21
    }),
    long: trades.filter(t => {
      const days = Math.floor((new Date(t.closed_at).getTime() - new Date(t.entry_date).getTime()) / (1000 * 60 * 60 * 24))
      return days > 21
    }),
  }

  if (daysHeldGroups.short.length >= 5) {
    const shortWinRate = calcWinRate(daysHeldGroups.short)
    const mediumWinRate = daysHeldGroups.medium.length >= 5 ? calcWinRate(daysHeldGroups.medium) : null

    if (shortWinRate > 75) {
      insights.push({
        category: 'risk_management',
        title: 'Early Exit Strategy Effective',
        description: `Trades closed within 7 days achieve ${shortWinRate.toFixed(1)}% win rate. Early profit-taking works well.`,
        win_rate: shortWinRate,
        sample_size: daysHeldGroups.short.length,
        confidence: daysHeldGroups.short.length >= 10 ? 'high' : 'medium',
        recommendation_type: 'consider',
        details: {
          metric: 'Optimal Hold Period',
          value: '≤ 7 days',
          comparison: mediumWinRate !== null ? `vs ${mediumWinRate.toFixed(1)}% for 8-21 days` : undefined,
        },
      })
    }
  }

  // 6. Strategy Performance
  const strategyGroups = trades.reduce((acc, trade) => {
    if (!acc[trade.strategy_type]) {
      acc[trade.strategy_type] = []
    }
    acc[trade.strategy_type].push(trade)
    return acc
  }, {} as Record<string, any[]>)

  Object.entries(strategyGroups)
    .filter(([_, trades]) => trades.length >= 5)
    .forEach(([strategy, strategyTrades]) => {
      const winRate = calcWinRate(strategyTrades)
      if (winRate > 80 || winRate < 40) {
        insights.push({
          category: 'timing',
          title: `${strategy.replace(/_/g, ' ').toUpperCase()} ${winRate > 80 ? 'Excelling' : 'Underperforming'}`,
          description: `${strategy.replace(/_/g, ' ')} strategy shows ${winRate.toFixed(1)}% win rate across ${strategyTrades.length} trades.`,
          win_rate: winRate,
          sample_size: strategyTrades.length,
          confidence: strategyTrades.length >= 10 ? 'high' : 'medium',
          recommendation_type: winRate > 80 ? 'informational' : 'action_required',
          filter_params: { strategy_type: strategy },
        })
      }
    })

  return insights.sort((a, b) => {
    // Sort by recommendation type first, then by confidence
    const typeOrder = { action_required: 0, consider: 1, informational: 2 }
    const confOrder = { high: 0, medium: 1, low: 2 }

    if (typeOrder[a.recommendation_type] !== typeOrder[b.recommendation_type]) {
      return typeOrder[a.recommendation_type] - typeOrder[b.recommendation_type]
    }

    return confOrder[a.confidence] - confOrder[b.confidence]
  })
}
