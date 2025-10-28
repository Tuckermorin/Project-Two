"use client"

import React, { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Loader2, TrendingUp, TrendingDown } from 'lucide-react'
import { cn } from '@/lib/utils'

interface SimilarTradesPanelProps {
  tradeId: string
  trade: any
}

interface SimilarTrade {
  id: string
  symbol: string
  strategy_type: string
  entry_date: string
  realized_pl: number
  realized_pl_percent: number
  delta_short_leg: number
  iv_at_entry: number
  ips_score: number
  similarity_score: number
}

export function SimilarTradesPanel({ tradeId, trade }: SimilarTradesPanelProps) {
  const [loading, setLoading] = useState(true)
  const [similarTrades, setSimilarTrades] = useState<SimilarTrade[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    loadSimilarTrades()
  }, [tradeId])

  const loadSimilarTrades = async () => {
    try {
      setLoading(true)
      setError(null)

      const res = await fetch(`/api/trades/similar/${tradeId}`)
      if (!res.ok) {
        throw new Error('Failed to load similar trades')
      }

      const data = await res.json()
      setSimilarTrades(data.data || [])
    } catch (err: any) {
      console.error('Failed to load similar trades:', err)
      setError(err.message || 'Failed to load similar trades')
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
      year: 'numeric',
    })
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (error) {
    return (
      <Card>
        <CardContent className="py-8 text-center">
          <p className="text-red-600 mb-4">{error}</p>
          <Button onClick={loadSimilarTrades} variant="outline">
            Retry
          </Button>
        </CardContent>
      </Card>
    )
  }

  if (similarTrades.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <p className="text-muted-foreground">No similar trades found</p>
          <p className="text-sm text-muted-foreground mt-2">
            Need more trade history to find similar patterns
          </p>
        </CardContent>
      </Card>
    )
  }

  const wins = similarTrades.filter(t => t.realized_pl > 0).length
  const winRate = (wins / similarTrades.length) * 100

  return (
    <div className="space-y-6">
      {/* Summary Stats */}
      <Card className="border-2 border-primary/20">
        <CardHeader>
          <CardTitle>Pattern Performance</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-4">
            <div className="text-center">
              <p className="text-2xl font-bold">{similarTrades.length}</p>
              <p className="text-xs text-muted-foreground">Similar Trades</p>
            </div>
            <div className="text-center">
              <p className={cn(
                'text-2xl font-bold',
                winRate >= 70 ? 'text-green-600' : winRate >= 50 ? 'text-yellow-600' : 'text-red-600'
              )}>
                {winRate.toFixed(0)}%
              </p>
              <p className="text-xs text-muted-foreground">Win Rate</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold">{wins}/{similarTrades.length - wins}</p>
              <p className="text-xs text-muted-foreground">Wins/Losses</p>
            </div>
          </div>

          <div className="mt-4 p-3 bg-muted/50 rounded-lg">
            <p className="text-sm">
              {winRate >= 70 ? (
                <span className="text-green-600 font-medium">
                  Strong pattern: Trades like this succeed {winRate.toFixed(0)}% of the time
                </span>
              ) : winRate >= 50 ? (
                <span className="text-yellow-600 font-medium">
                  Mixed pattern: Trades like this have a {winRate.toFixed(0)}% success rate
                </span>
              ) : (
                <span className="text-red-600 font-medium">
                  Warning: Trades like this fail {(100 - winRate).toFixed(0)}% of the time
                </span>
              )}
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Similar Trades List */}
      <Card>
        <CardHeader>
          <CardTitle>Similar Historical Trades</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {similarTrades.map((similarTrade) => (
              <div
                key={similarTrade.id}
                className={cn(
                  'p-4 rounded-lg border transition-colors hover:bg-muted/50 cursor-pointer',
                  similarTrade.realized_pl > 0
                    ? 'border-green-200 dark:border-green-800'
                    : 'border-red-200 dark:border-red-800'
                )}
              >
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-semibold">{similarTrade.symbol}</span>
                      <Badge variant="outline" className="text-xs">
                        {similarTrade.strategy_type.replace(/_/g, ' ')}
                      </Badge>
                      <Badge
                        variant="secondary"
                        className="text-xs"
                        title="Similarity Score"
                      >
                        {(similarTrade.similarity_score * 100).toFixed(0)}% match
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {formatDate(similarTrade.entry_date)}
                    </p>
                  </div>
                  <div className="text-right">
                    <div className={cn(
                      'font-bold',
                      similarTrade.realized_pl > 0 ? 'text-green-600' : 'text-red-600'
                    )}>
                      {formatCurrency(similarTrade.realized_pl)}
                    </div>
                    <div className={cn(
                      'text-sm flex items-center justify-end gap-1',
                      similarTrade.realized_pl_percent > 0 ? 'text-green-600' : 'text-red-600'
                    )}>
                      {similarTrade.realized_pl_percent > 0 ? (
                        <TrendingUp className="h-3 w-3" />
                      ) : (
                        <TrendingDown className="h-3 w-3" />
                      )}
                      {similarTrade.realized_pl_percent > 0 ? '+' : ''}
                      {similarTrade.realized_pl_percent.toFixed(1)}%
                    </div>
                  </div>
                </div>

                <div className="flex gap-4 text-xs text-muted-foreground">
                  <div>
                    <span>Delta: </span>
                    <span className="font-mono">{similarTrade.delta_short_leg?.toFixed(3)}</span>
                  </div>
                  <div>
                    <span>IV: </span>
                    <span className="font-mono">{similarTrade.iv_at_entry?.toFixed(1)}%</span>
                  </div>
                  <div>
                    <span>IPS: </span>
                    <span className="font-mono">{similarTrade.ips_score?.toFixed(0)}/100</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Pattern Insights */}
      <Card className="bg-blue-50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-800">
        <CardHeader>
          <CardTitle className="text-blue-700 dark:text-blue-400">Pattern Insights</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          {(() => {
            const avgDelta = similarTrades.reduce((sum, t) => sum + (t.delta_short_leg || 0), 0) / similarTrades.length
            const avgIV = similarTrades.reduce((sum, t) => sum + (t.iv_at_entry || 0), 0) / similarTrades.length
            const avgIPS = similarTrades.reduce((sum, t) => sum + (t.ips_score || 0), 0) / similarTrades.length

            return (
              <>
                <div className="p-3 bg-white dark:bg-gray-900 rounded border border-blue-200 dark:border-blue-800">
                  <p className="font-medium mb-1">Average Setup Characteristics:</p>
                  <ul className="space-y-1 text-xs">
                    <li>Delta: {avgDelta.toFixed(3)}</li>
                    <li>IV: {avgIV.toFixed(1)}%</li>
                    <li>IPS Score: {avgIPS.toFixed(0)}/100</li>
                  </ul>
                </div>

                <div className="p-3 bg-white dark:bg-gray-900 rounded border border-blue-200 dark:border-blue-800">
                  <p className="font-medium mb-1">Key Observations:</p>
                  <ul className="space-y-1 text-xs">
                    {winRate >= 70 && (
                      <li>✓ This setup has a proven track record with {winRate.toFixed(0)}% success rate</li>
                    )}
                    {similarTrades.filter(t => t.symbol === trade.symbol).length > 0 && (
                      <li>
                        ✓ {similarTrades.filter(t => t.symbol === trade.symbol).length} similar trades on {trade.symbol}
                      </li>
                    )}
                    {avgIPS >= 70 && (
                      <li>✓ High IPS scores ({avgIPS.toFixed(0)}/100) correlate with this pattern</li>
                    )}
                    {winRate < 50 && (
                      <li className="text-red-600">
                        ⚠ Warning: This pattern underperforms ({(100 - winRate).toFixed(0)}% loss rate)
                      </li>
                    )}
                  </ul>
                </div>
              </>
            )
          })()}
        </CardContent>
      </Card>
    </div>
  )
}
