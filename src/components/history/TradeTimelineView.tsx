"use client"

import React, { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Loader2, Circle, TrendingUp, TrendingDown, AlertCircle, CheckCircle, XCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts'

interface TradeTimelineViewProps {
  tradeId: string
  trade: any
}

interface TimelineEvent {
  date: string
  type: 'entry' | 'snapshot' | 'event' | 'exit' | 'critical_moment'
  title: string
  description?: string
  pnl?: number
  pnl_percent?: number
  delta?: number
  impact?: 'positive' | 'negative' | 'neutral'
}

export function TradeTimelineView({ tradeId, trade }: TradeTimelineViewProps) {
  const [loading, setLoading] = useState(true)
  const [events, setEvents] = useState<TimelineEvent[]>([])
  const [chartData, setChartData] = useState<any[]>([])

  useEffect(() => {
    buildTimeline()
  }, [tradeId, trade])

  const buildTimeline = async () => {
    try {
      setLoading(true)

      const timelineEvents: TimelineEvent[] = []

      // Entry event
      timelineEvents.push({
        date: trade.entry_date,
        type: 'entry',
        title: 'Trade Opened',
        description: `Entered ${trade.strategy_type.replace(/_/g, ' ')} at ${formatCurrency(trade.entry_price || 0)}`,
        pnl: 0,
        pnl_percent: 0,
        delta: trade.delta_short_leg,
        impact: 'neutral',
      })

      // Add snapshot events
      if (trade.snapshots && trade.snapshots.length > 0) {
        trade.snapshots.forEach((snapshot: any, index: number) => {
          timelineEvents.push({
            date: snapshot.snapshot_time,
            type: 'snapshot',
            title: `Day ${index + 1} Snapshot`,
            description: `Unrealized P&L: ${snapshot.unrealized_pnl_percent?.toFixed(1)}%`,
            pnl: snapshot.unrealized_pnl,
            pnl_percent: snapshot.unrealized_pnl_percent,
            delta: snapshot.delta_spread,
            impact: snapshot.unrealized_pnl_percent > 0 ? 'positive' : snapshot.unrealized_pnl_percent < 0 ? 'negative' : 'neutral',
          })
        })
      }

      // Add postmortem events (if available)
      if (trade.postmortem?.trade_lifecycle?.during_trade_events) {
        trade.postmortem.trade_lifecycle.during_trade_events.forEach((event: any) => {
          timelineEvents.push({
            date: event.date,
            type: 'event',
            title: event.event_type.replace(/_/g, ' '),
            description: event.description,
            impact: event.impact,
          })
        })
      }

      // Add critical moments from snapshot analysis
      if (trade.postmortem?.snapshot_analysis?.critical_moments) {
        trade.postmortem.snapshot_analysis.critical_moments.forEach((moment: any) => {
          timelineEvents.push({
            date: moment.snapshot_time,
            type: 'critical_moment',
            title: 'Critical Moment',
            description: moment.description,
            pnl_percent: moment.pnl_percent,
            delta: moment.delta,
            impact: moment.pnl_percent > 50 ? 'positive' : moment.pnl_percent < -20 ? 'negative' : 'neutral',
          })
        })
      }

      // Exit event
      timelineEvents.push({
        date: trade.closed_at,
        type: 'exit',
        title: 'Trade Closed',
        description: `Exited with ${trade.realized_pl > 0 ? 'profit' : 'loss'} of ${formatCurrency(trade.realized_pl)}`,
        pnl: trade.realized_pl,
        pnl_percent: trade.realized_pl_percent,
        impact: trade.realized_pl > 0 ? 'positive' : 'negative',
      })

      // Sort by date
      timelineEvents.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
      setEvents(timelineEvents)

      // Build chart data from snapshots
      if (trade.snapshots && trade.snapshots.length > 0) {
        const chartPoints = trade.snapshots.map((snapshot: any, index: number) => ({
          day: index + 1,
          pnl_percent: snapshot.unrealized_pnl_percent || 0,
          delta: Math.abs(snapshot.delta_spread || 0),
        }))

        // Add entry and exit points
        chartPoints.unshift({ day: 0, pnl_percent: 0, delta: Math.abs(trade.delta_short_leg || 0) })
        chartPoints.push({
          day: chartPoints.length,
          pnl_percent: trade.realized_pl_percent,
          delta: chartPoints[chartPoints.length - 1]?.delta || 0,
        })

        setChartData(chartPoints)
      }
    } catch (error) {
      console.error('Failed to build timeline:', error)
    } finally {
      setLoading(false)
    }
  }

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
    }).format(value)
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    })
  }

  const getEventIcon = (type: string, impact?: string) => {
    switch (type) {
      case 'entry':
        return <TrendingUp className="h-5 w-5 text-green-600" />
      case 'exit':
        return <TrendingDown className="h-5 w-5 text-red-600" />
      case 'critical_moment':
        return <AlertCircle className="h-5 w-5 text-amber-600" />
      case 'snapshot':
        return <Circle className="h-4 w-4 text-blue-600" />
      case 'event':
        if (impact === 'positive') return <CheckCircle className="h-5 w-5 text-green-600" />
        if (impact === 'negative') return <XCircle className="h-5 w-5 text-red-600" />
        return <Circle className="h-5 w-5 text-gray-600" />
      default:
        return <Circle className="h-4 w-4 text-gray-600" />
    }
  }

  const getEventColor = (impact?: string) => {
    switch (impact) {
      case 'positive':
        return 'border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-950/20'
      case 'negative':
        return 'border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/20'
      default:
        return 'border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-950/20'
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* P&L Chart */}
      {chartData.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>P&L Progression</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis
                    dataKey="day"
                    label={{ value: 'Days in Trade', position: 'insideBottom', offset: -5 }}
                  />
                  <YAxis
                    label={{ value: 'P&L %', angle: -90, position: 'insideLeft' }}
                  />
                  <Tooltip
                    formatter={(value: any, name: string) => {
                      if (name === 'pnl_percent') return [`${value.toFixed(2)}%`, 'P&L']
                      if (name === 'delta') return [value.toFixed(3), 'Delta']
                      return [value, name]
                    }}
                  />
                  <ReferenceLine y={0} stroke="#666" strokeDasharray="3 3" />
                  <Line
                    type="monotone"
                    dataKey="pnl_percent"
                    stroke="#3b82f6"
                    strokeWidth={2}
                    dot={{ r: 4 }}
                    activeDot={{ r: 6 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Timeline */}
      <Card>
        <CardHeader>
          <CardTitle>Trade Timeline</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="relative space-y-4">
            {/* Vertical line */}
            <div className="absolute left-6 top-0 bottom-0 w-0.5 bg-border" />

            {events.map((event, index) => (
              <div key={index} className="relative flex gap-4 items-start">
                {/* Icon */}
                <div className="relative z-10 flex-shrink-0 mt-1">
                  {getEventIcon(event.type, event.impact)}
                </div>

                {/* Content */}
                <div className={cn('flex-1 p-4 rounded-lg border', getEventColor(event.impact))}>
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <h4 className="font-semibold">{event.title}</h4>
                      <p className="text-xs text-muted-foreground">{formatDate(event.date)}</p>
                    </div>
                    {event.pnl_percent !== undefined && (
                      <Badge variant={event.pnl_percent > 0 ? 'default' : 'destructive'}>
                        {event.pnl_percent > 0 ? '+' : ''}{event.pnl_percent.toFixed(1)}%
                      </Badge>
                    )}
                  </div>

                  {event.description && (
                    <p className="text-sm text-muted-foreground mb-2">{event.description}</p>
                  )}

                  {event.type === 'snapshot' && (
                    <div className="flex gap-4 text-xs">
                      {event.pnl !== undefined && (
                        <div>
                          <span className="text-muted-foreground">P&L: </span>
                          <span className={cn('font-mono', event.pnl > 0 ? 'text-green-600' : 'text-red-600')}>
                            {formatCurrency(event.pnl)}
                          </span>
                        </div>
                      )}
                      {event.delta !== undefined && (
                        <div>
                          <span className="text-muted-foreground">Delta: </span>
                          <span className="font-mono">{Math.abs(event.delta).toFixed(3)}</span>
                        </div>
                      )}
                    </div>
                  )}

                  {event.type === 'critical_moment' && event.delta !== undefined && (
                    <div className="text-xs">
                      <span className="text-muted-foreground">Delta: </span>
                      <span className="font-mono">{Math.abs(event.delta).toFixed(3)}</span>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
