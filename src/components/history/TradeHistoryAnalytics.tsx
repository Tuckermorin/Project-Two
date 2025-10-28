"use client"

import React, { useState, useEffect, useMemo } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Loader2 } from 'lucide-react'
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  ScatterChart,
  Scatter,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts'

interface Trade {
  id: string
  symbol: string
  strategy_type: string
  sector: string
  entry_date: string
  closed_at: string
  realized_pl: number
  realized_pl_percent: number
  delta_short_leg: number
  iv_at_entry: number
  ips_score: number
  days_held: number
}

export function TradeHistoryAnalytics() {
  const [loading, setLoading] = useState(true)
  const [trades, setTrades] = useState<Trade[]>([])

  useEffect(() => {
    loadTrades()
  }, [])

  const loadTrades = async () => {
    try {
      setLoading(true)

      const res = await fetch('/api/trades?status=closed')
      if (!res.ok) {
        throw new Error('Failed to load trades')
      }

      const data = await res.json()
      const closedTrades = (data.data || []).map((t: any) => ({
        ...t,
        days_held: Math.floor(
          (new Date(t.closed_at).getTime() - new Date(t.entry_date).getTime()) /
          (1000 * 60 * 60 * 24)
        ),
      }))
      setTrades(closedTrades)
    } catch (error) {
      console.error('Failed to load trades:', error)
    } finally {
      setLoading(false)
    }
  }

  const analytics = useMemo(() => {
    if (trades.length === 0) return null

    // Win rate over time
    const tradesByMonth = trades.reduce((acc, trade) => {
      const month = new Date(trade.closed_at).toLocaleDateString('en-US', { year: 'numeric', month: 'short' })
      if (!acc[month]) {
        acc[month] = { wins: 0, losses: 0, total_pl: 0 }
      }
      if (trade.realized_pl > 0) {
        acc[month].wins++
      } else {
        acc[month].losses++
      }
      acc[month].total_pl += trade.realized_pl
      return acc
    }, {} as Record<string, { wins: number; losses: number; total_pl: number }>)

    const winRateOverTime = Object.entries(tradesByMonth).map(([month, data]) => ({
      month,
      win_rate: (data.wins / (data.wins + data.losses)) * 100,
      total_trades: data.wins + data.losses,
      total_pl: data.total_pl,
    }))

    // P&L distribution
    const plDistribution = trades.reduce((acc, trade) => {
      const bucket = Math.floor(trade.realized_pl_percent / 10) * 10
      const key = `${bucket}% to ${bucket + 10}%`
      if (!acc[key]) {
        acc[key] = 0
      }
      acc[key]++
      return acc
    }, {} as Record<string, number>)

    const plDistributionData = Object.entries(plDistribution).map(([range, count]) => ({
      range,
      count,
    }))

    // Performance by symbol
    const performanceBySymbol = trades.reduce((acc, trade) => {
      if (!acc[trade.symbol]) {
        acc[trade.symbol] = { wins: 0, losses: 0, total_pl: 0 }
      }
      if (trade.realized_pl > 0) {
        acc[trade.symbol].wins++
      } else {
        acc[trade.symbol].losses++
      }
      acc[trade.symbol].total_pl += trade.realized_pl
      return acc
    }, {} as Record<string, { wins: number; losses: number; total_pl: number }>)

    const symbolData = Object.entries(performanceBySymbol)
      .map(([symbol, data]) => ({
        symbol,
        win_rate: (data.wins / (data.wins + data.losses)) * 100,
        total_trades: data.wins + data.losses,
        total_pl: data.total_pl,
      }))
      .sort((a, b) => b.total_trades - a.total_trades)
      .slice(0, 10)

    // Delta correlation
    const deltaCorrelation = trades.map(trade => ({
      delta: Math.abs(trade.delta_short_leg || 0),
      pl_percent: trade.realized_pl_percent,
      outcome: trade.realized_pl > 0 ? 'win' : 'loss',
    }))

    // Performance by strategy
    const performanceByStrategy = trades.reduce((acc, trade) => {
      if (!acc[trade.strategy_type]) {
        acc[trade.strategy_type] = { wins: 0, losses: 0 }
      }
      if (trade.realized_pl > 0) {
        acc[trade.strategy_type].wins++
      } else {
        acc[trade.strategy_type].losses++
      }
      return acc
    }, {} as Record<string, { wins: number; losses: number }>)

    const strategyData = Object.entries(performanceByStrategy).map(([strategy, data]) => ({
      name: strategy.replace(/_/g, ' ').toUpperCase(),
      wins: data.wins,
      losses: data.losses,
    }))

    // IPS score accuracy
    const ipsScoreGroups = trades.reduce((acc, trade) => {
      const bucket = Math.floor((trade.ips_score || 0) / 10) * 10
      const key = `${bucket}-${bucket + 10}`
      if (!acc[key]) {
        acc[key] = { wins: 0, losses: 0 }
      }
      if (trade.realized_pl > 0) {
        acc[key].wins++
      } else {
        acc[key].losses++
      }
      return acc
    }, {} as Record<string, { wins: number; losses: number }>)

    const ipsData = Object.entries(ipsScoreGroups).map(([range, data]) => ({
      range,
      win_rate: (data.wins / (data.wins + data.losses)) * 100,
      total: data.wins + data.losses,
    }))

    return {
      winRateOverTime,
      plDistributionData,
      symbolData,
      deltaCorrelation,
      strategyData,
      ipsData,
    }
  }, [trades])

  if (loading) {
    return (
      <Card>
        <CardContent className="py-12">
          <div className="flex items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        </CardContent>
      </Card>
    )
  }

  if (!analytics || trades.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <p className="text-muted-foreground">No trade data available for analytics</p>
        </CardContent>
      </Card>
    )
  }

  const COLORS = ['#10b981', '#ef4444', '#f59e0b', '#3b82f6', '#8b5cf6', '#ec4899']

  return (
    <div className="space-y-6">
      {/* Win Rate Over Time */}
      <Card>
        <CardHeader>
          <CardTitle>Win Rate Over Time</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={analytics.winRateOverTime}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" />
                <YAxis domain={[0, 100]} label={{ value: 'Win Rate %', angle: -90, position: 'insideLeft' }} />
                <Tooltip
                  formatter={(value: any, name: string) => {
                    if (name === 'win_rate') return [`${value.toFixed(1)}%`, 'Win Rate']
                    if (name === 'total_pl') return [`$${value.toFixed(2)}`, 'Total P&L']
                    return [value, name]
                  }}
                />
                <Legend />
                <Line type="monotone" dataKey="win_rate" stroke="#10b981" strokeWidth={2} name="Win Rate %" />
                <Line type="monotone" dataKey="total_trades" stroke="#3b82f6" strokeWidth={2} name="Total Trades" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Charts Grid */}
      <div className="grid md:grid-cols-2 gap-6">
        {/* P&L Distribution */}
        <Card>
          <CardHeader>
            <CardTitle>P&L Distribution</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={analytics.plDistributionData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="range" />
                  <YAxis />
                  <Tooltip />
                  <Bar dataKey="count" fill="#3b82f6" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Performance by Strategy */}
        <Card>
          <CardHeader>
            <CardTitle>Performance by Strategy</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={analytics.strategyData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="wins" fill="#10b981" name="Wins" />
                  <Bar dataKey="losses" fill="#ef4444" name="Losses" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Delta Correlation */}
        <Card>
          <CardHeader>
            <CardTitle>Delta vs P&L Correlation</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <ScatterChart>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="delta" label={{ value: 'Delta', position: 'insideBottom', offset: -5 }} />
                  <YAxis dataKey="pl_percent" label={{ value: 'P&L %', angle: -90, position: 'insideLeft' }} />
                  <Tooltip cursor={{ strokeDasharray: '3 3' }} />
                  <Scatter name="Wins" data={analytics.deltaCorrelation.filter(d => d.outcome === 'win')} fill="#10b981" />
                  <Scatter name="Losses" data={analytics.deltaCorrelation.filter(d => d.outcome === 'loss')} fill="#ef4444" />
                </ScatterChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* IPS Score Accuracy */}
        <Card>
          <CardHeader>
            <CardTitle>IPS Score Accuracy</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={analytics.ipsData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="range" label={{ value: 'IPS Score Range', position: 'insideBottom', offset: -5 }} />
                  <YAxis domain={[0, 100]} label={{ value: 'Win Rate %', angle: -90, position: 'insideLeft' }} />
                  <Tooltip formatter={(value: any) => `${value.toFixed(1)}%`} />
                  <Bar dataKey="win_rate" fill="#8b5cf6" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Top Performing Symbols */}
      <Card>
        <CardHeader>
          <CardTitle>Top Performing Symbols</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={analytics.symbolData} layout="horizontal">
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" domain={[0, 100]} />
                <YAxis type="category" dataKey="symbol" width={80} />
                <Tooltip
                  formatter={(value: any, name: string) => {
                    if (name === 'win_rate') return [`${value.toFixed(1)}%`, 'Win Rate']
                    if (name === 'total_pl') return [`$${value.toFixed(2)}`, 'Total P&L']
                    return [value, name]
                  }}
                />
                <Legend />
                <Bar dataKey="win_rate" fill="#10b981" name="Win Rate %" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
