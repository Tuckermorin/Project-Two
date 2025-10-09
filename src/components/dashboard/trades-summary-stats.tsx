// src/components/dashboard/trades-summary-stats.tsx

"use client"

import React, { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { TrendingUp, TrendingDown, Target, DollarSign, Percent, Calendar } from 'lucide-react'

interface TradeStats {
  totalTrades: number
  activeTrades: number
  closedTrades: number
  totalPL: number
  avgPL: number
  winRate: number
  avgWin: number
  avgLoss: number
  totalCreditsCollected: number
  avgDTE: number
  avgIPS: number
}

export default function TradesSummaryStats() {
  const [stats, setStats] = useState<TradeStats | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const loadStats = async () => {
      try {
        setLoading(true)

        // Fetch all trades (active and closed)
        const [activeRes, closedRes] = await Promise.all([
          fetch('/api/trades?status=active', { cache: 'no-store' }),
          fetch('/api/trades?status=closed', { cache: 'no-store' })
        ])

        const activeData = await activeRes.json()
        const closedData = await closedRes.json()

        const activeTrades = activeData?.data || []
        const closedTrades = closedData?.data || []

        // Calculate statistics
        const totalTrades = activeTrades.length + closedTrades.length
        const closedWithPL = closedTrades.filter((t: any) =>
          t.realized_pl !== null && t.realized_pl !== undefined
        )

        const wins = closedWithPL.filter((t: any) => Number(t.realized_pl) > 0)
        const losses = closedWithPL.filter((t: any) => Number(t.realized_pl) <= 0)

        const totalPL = closedWithPL.reduce((sum: number, t: any) =>
          sum + Number(t.realized_pl || 0), 0
        )

        const avgWin = wins.length > 0
          ? wins.reduce((sum: number, t: any) => sum + Number(t.realized_pl), 0) / wins.length
          : 0

        const avgLoss = losses.length > 0
          ? losses.reduce((sum: number, t: any) => sum + Number(t.realized_pl), 0) / losses.length
          : 0

        const winRate = closedWithPL.length > 0
          ? (wins.length / closedWithPL.length) * 100
          : 0

        const avgPL = closedWithPL.length > 0
          ? totalPL / closedWithPL.length
          : 0

        // Calculate total credits collected
        const totalCreditsCollected = [...activeTrades, ...closedTrades].reduce(
          (sum: number, t: any) => sum + Number(t.credit_received || 0),
          0
        )

        // Calculate average DTE for active trades
        const daysToExpiry = (exp: string): number => {
          const d = new Date(exp)
          if (isNaN(d.getTime())) return 0
          const expiry = new Date(d)
          expiry.setHours(16, 0, 0, 0)
          const now = new Date()
          const ms = expiry.getTime() - now.getTime()
          return Math.ceil(ms / (1000*60*60*24))
        }

        const activeDTEs = activeTrades
          .filter((t: any) => t.expiration_date)
          .map((t: any) => daysToExpiry(t.expiration_date))
          .filter((dte: number) => dte > 0)

        const avgDTE = activeDTEs.length > 0
          ? activeDTEs.reduce((sum: number, dte: number) => sum + dte, 0) / activeDTEs.length
          : 0

        // Calculate average IPS score for all trades
        const tradesWithIPS = [...activeTrades, ...closedTrades].filter(
          (t: any) => t.ips_score !== null && t.ips_score !== undefined
        )
        const avgIPS = tradesWithIPS.length > 0
          ? tradesWithIPS.reduce((sum: number, t: any) => sum + Number(t.ips_score), 0) / tradesWithIPS.length
          : 0

        setStats({
          totalTrades,
          activeTrades: activeTrades.length,
          closedTrades: closedTrades.length,
          totalPL,
          avgPL,
          winRate,
          avgWin,
          avgLoss,
          totalCreditsCollected,
          avgDTE,
          avgIPS
        })

      } catch (error) {
        console.error('Failed to load trade statistics:', error)
      } finally {
        setLoading(false)
      }
    }

    loadStats()
  }, [])

  const currencyFormatter = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 2,
  })

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Trade Summary</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-gray-600">Loading statistics...</div>
        </CardContent>
      </Card>
    )
  }

  if (!stats || stats.totalTrades === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Trade Summary</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-gray-600">No trades yet</div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Trade Summary</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {/* Overall Statistics */}
          <div className="grid grid-cols-3 gap-4">
            <div className="text-center p-3 bg-blue-50 rounded-lg border border-blue-100">
              <div className="text-2xl font-bold text-blue-900">{stats.totalTrades}</div>
              <div className="text-xs text-blue-600">Total Trades</div>
            </div>
            <div className="text-center p-3 bg-green-50 rounded-lg border border-green-100">
              <div className="text-2xl font-bold text-green-900">{stats.activeTrades}</div>
              <div className="text-xs text-green-600">Active</div>
            </div>
            <div className="text-center p-3 bg-muted/40 rounded-lg border border-[var(--glass-border)]">
              <div className="text-2xl font-bold text-foreground">{stats.closedTrades}</div>
              <div className="text-xs text-muted-foreground">Closed</div>
            </div>
          </div>

          {/* P&L Section */}
          {stats.closedTrades > 0 && (
            <>
              <div className="border-t pt-4">
                <h4 className="text-sm font-semibold mb-3 flex items-center gap-2">
                  <DollarSign className="h-4 w-4" />
                  Profit & Loss
                </h4>
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-600">Total P/L:</span>
                    <span className={`font-semibold ${stats.totalPL >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {currencyFormatter.format(stats.totalPL)}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-600">Average P/L:</span>
                    <span className={`font-semibold ${stats.avgPL >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {currencyFormatter.format(stats.avgPL)}
                    </span>
                  </div>
                </div>
              </div>

              {/* Win Rate Section */}
              <div className="border-t pt-4">
                <h4 className="text-sm font-semibold mb-3 flex items-center gap-2">
                  <Percent className="h-4 w-4" />
                  Performance
                </h4>
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-600">Win Rate:</span>
                    <span className="font-semibold text-blue-600">
                      {stats.winRate.toFixed(1)}%
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-600 flex items-center gap-1">
                      <TrendingUp className="h-3 w-3" />
                      Avg Win:
                    </span>
                    <span className="font-semibold text-green-600">
                      {currencyFormatter.format(stats.avgWin)}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-600 flex items-center gap-1">
                      <TrendingDown className="h-3 w-3" />
                      Avg Loss:
                    </span>
                    <span className="font-semibold text-red-600">
                      {currencyFormatter.format(stats.avgLoss)}
                    </span>
                  </div>
                </div>
              </div>
            </>
          )}

          {/* Additional Metrics */}
          <div className="border-t pt-4">
            <h4 className="text-sm font-semibold mb-3 flex items-center gap-2">
              <Target className="h-4 w-4" />
              Trade Metrics
            </h4>
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600">Total Credits:</span>
                <span className="font-semibold text-blue-600">
                  {currencyFormatter.format(stats.totalCreditsCollected)}
                </span>
              </div>
              {stats.activeTrades > 0 && (
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground flex items-center gap-1">
                    <Calendar className="h-3 w-3" />
                    Avg DTE:
                  </span>
                  <span className="font-semibold text-foreground">
                    {stats.avgDTE.toFixed(0)} days
                  </span>
                </div>
              )}
              {stats.avgIPS > 0 && (
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-600">Avg IPS Score:</span>
                  <span className="font-semibold text-purple-600">
                    {stats.avgIPS.toFixed(1)}/100
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
