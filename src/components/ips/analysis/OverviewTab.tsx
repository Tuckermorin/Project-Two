"use client"

import React from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { TrendingUp, TrendingDown, Target, Calendar } from 'lucide-react'

interface OverviewTabProps {
  ipsData: {
    id: string
    name: string
    total_trades: number
    win_rate: number
    min_dte?: number
    max_dte?: number
    factors: any[]
  }
  trades: any[]
}

export function OverviewTab({ ipsData, trades }: OverviewTabProps) {
  // Calculate metrics
  const closedTrades = trades.filter(t => t.status === 'closed')
  const wins = closedTrades.filter(t => (t.realized_pl || t.realized_pnl || 0) > 0)
  const losses = closedTrades.filter(t => (t.realized_pl || t.realized_pnl || 0) < 0)

  const totalPL = closedTrades.reduce((sum, t) => sum + (t.realized_pl || t.realized_pnl || 0), 0)
  const avgPL = closedTrades.length > 0 ? totalPL / closedTrades.length : 0

  const avgROI = closedTrades.length > 0
    ? closedTrades.reduce((sum, t) => sum + (t.realized_pl_percent || 0), 0) / closedTrades.length
    : 0

  const avgDaysHeld = closedTrades.length > 0
    ? closedTrades.reduce((sum, t) => {
        const entry = new Date(t.entry_date)
        const close = new Date(t.closed_at || Date.now())
        return sum + Math.floor((close.getTime() - entry.getTime()) / (1000 * 60 * 60 * 24))
      }, 0) / closedTrades.length
    : 0

  const profitFactor = losses.length > 0
    ? Math.abs(wins.reduce((sum, t) => sum + (t.realized_pl || 0), 0) /
        losses.reduce((sum, t) => sum + (t.realized_pl || 0), 0))
    : wins.length > 0 ? 999 : 0

  return (
    <div className="space-y-6">
      {/* Key Metrics Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Trades
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{closedTrades.length}</div>
            <p className="text-xs text-muted-foreground mt-1">
              {wins.length} wins / {losses.length} losses
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Win Rate
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-green-600">
              {Math.round(ipsData.win_rate)}%
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {closedTrades.length} closed trades
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Average Profit/Loss
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className={`text-3xl font-bold ${avgPL >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              ${avgPL.toFixed(2)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Per trade
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Average ROI
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className={`text-3xl font-bold ${avgROI >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              {avgROI.toFixed(2)}%
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Return on investment
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Additional Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Calendar className="h-4 w-4" />
              Average Days Held
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{avgDaysHeld.toFixed(1)} days</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Target className="h-4 w-4" />
              Profit Factor
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {profitFactor === 999 ? '∞' : profitFactor.toFixed(2)}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <TrendingUp className="h-4 w-4" />
              Total Profit/Loss
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${totalPL >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              ${totalPL.toFixed(2)}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Configuration Summary */}
      <Card>
        <CardHeader>
          <CardTitle>Configuration Summary</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <p className="text-sm text-muted-foreground">Days to Expiration Range</p>
              <p className="text-lg font-semibold">{ipsData.min_dte} - {ipsData.max_dte} days</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Active Factors</p>
              <p className="text-lg font-semibold">{ipsData.factors.length} factors</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
