"use client"

import React, { useState, useEffect } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  ArrowRight,
  TrendingUp,
  TrendingDown,
  Calendar,
  DollarSign,
  Target,
  Activity,
  Loader2,
  BarChart2,
  Clock,
  FileText
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { TradeTimelineView } from './TradeTimelineView'
import { AIPostMortemPanel } from './AIPostMortemPanel'
import { SimilarTradesPanel } from './SimilarTradesPanel'

interface TradeComparisonModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  tradeId: string
}

interface TradeDetail {
  id: string
  symbol: string
  strategy_type: string
  status: string

  // Entry data
  entry_date: string
  entry_price: number
  short_strike: number
  long_strike: number
  credit_received: number
  number_of_contracts: number
  delta_short_leg: number
  theta: number
  vega: number
  iv_at_entry: number
  ips_score: number

  // Exit data
  closed_at: string
  exit_price: number
  realized_pl: number
  realized_pl_percent: number

  // AI data
  structured_rationale?: any
  ai_evaluation_id?: string

  // Snapshots
  snapshots?: any[]

  // Postmortem
  postmortem?: any
}

export function TradeComparisonModal({ open, onOpenChange, tradeId }: TradeComparisonModalProps) {
  const [loading, setLoading] = useState(true)
  const [trade, setTrade] = useState<TradeDetail | null>(null)
  const [activeTab, setActiveTab] = useState('comparison')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (open && tradeId) {
      loadTradeDetail()
    }
  }, [open, tradeId])

  const loadTradeDetail = async () => {
    try {
      setLoading(true)
      setError(null)

      const res = await fetch(`/api/trades/${tradeId}/detail`)
      if (!res.ok) {
        throw new Error('Failed to load trade details')
      }

      const data = await res.json()
      setTrade(data.data)
    } catch (err: any) {
      console.error('Failed to load trade detail:', err)
      setError(err.message || 'Failed to load trade details')
    } finally {
      setLoading(false)
    }
  }

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value)
  }

  const formatPercent = (value: number) => {
    return `${value > 0 ? '+' : ''}${value.toFixed(2)}%`
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
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-6xl max-h-[90vh] p-0">
          <DialogHeader className="px-6 pt-6 pb-3 border-b">
            <DialogTitle>Loading Trade Details...</DialogTitle>
          </DialogHeader>
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        </DialogContent>
      </Dialog>
    )
  }

  if (error || !trade) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-6xl max-h-[90vh] p-0">
          <DialogHeader className="px-6 pt-6 pb-3 border-b">
            <DialogTitle>Error</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <p className="text-red-600 mb-4">{error || 'Trade not found'}</p>
            <Button onClick={() => onOpenChange(false)}>Close</Button>
          </div>
        </DialogContent>
      </Dialog>
    )
  }

  const isWin = trade.realized_pl > 0
  const daysHeld = Math.floor(
    (new Date(trade.closed_at).getTime() - new Date(trade.entry_date).getTime()) /
    (1000 * 60 * 60 * 24)
  )

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl max-h-[90vh] p-0">
        <DialogHeader className="px-6 pt-6 pb-3 border-b">
          <div className="flex items-center justify-between">
            <div>
              <DialogTitle className="text-2xl font-bold flex items-center gap-3">
                {trade.symbol}
                <Badge variant={isWin ? 'default' : 'destructive'} className="text-base">
                  {isWin ? 'WIN' : 'LOSS'} {formatPercent(trade.realized_pl_percent)}
                </Badge>
              </DialogTitle>
              <p className="text-sm text-muted-foreground mt-1">
                {trade.strategy_type.replace(/_/g, ' ').toUpperCase()} • Held {daysHeld} days
              </p>
            </div>
            <div className="text-right">
              <div className={cn('text-2xl font-bold', isWin ? 'text-green-600' : 'text-red-600')}>
                {formatCurrency(trade.realized_pl)}
              </div>
              <p className="text-sm text-muted-foreground">Realized P&L</p>
            </div>
          </div>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1">
          <div className="px-6 pt-4">
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="comparison" className="flex items-center gap-2">
                <ArrowRight className="h-4 w-4" />
                Entry vs Exit
              </TabsTrigger>
              <TabsTrigger value="timeline" className="flex items-center gap-2">
                <Clock className="h-4 w-4" />
                Timeline
              </TabsTrigger>
              <TabsTrigger value="analysis" className="flex items-center gap-2">
                <FileText className="h-4 w-4" />
                AI Analysis
              </TabsTrigger>
              <TabsTrigger value="similar" className="flex items-center gap-2">
                <BarChart2 className="h-4 w-4" />
                Similar Trades
              </TabsTrigger>
            </TabsList>
          </div>

          <ScrollArea className="max-h-[calc(90vh-220px)]">
            <div className="px-6 py-6">
              <TabsContent value="comparison" className="mt-0">
                <ComparisonView trade={trade} />
              </TabsContent>

              <TabsContent value="timeline" className="mt-0">
                <TradeTimelineView tradeId={trade.id} trade={trade} />
              </TabsContent>

              <TabsContent value="analysis" className="mt-0">
                <AIPostMortemPanel tradeId={trade.id} trade={trade} />
              </TabsContent>

              <TabsContent value="similar" className="mt-0">
                <SimilarTradesPanel tradeId={trade.id} trade={trade} />
              </TabsContent>
            </div>
          </ScrollArea>
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}

// Comparison View Component
function ComparisonView({ trade }: { trade: TradeDetail }) {
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
      hour: 'numeric',
      minute: '2-digit',
    })
  }

  return (
    <div className="grid grid-cols-2 gap-6">
      {/* Entry State */}
      <Card className="border-green-200 dark:border-green-800">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-green-700 dark:text-green-400">
            <TrendingUp className="h-5 w-5" />
            Entry State
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Date & Price */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Date</span>
              <span className="font-medium">{formatDate(trade.entry_date)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Stock Price</span>
              <span className="font-medium">{formatCurrency(trade.entry_price || 0)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">IPS Score</span>
              <Badge variant="secondary">{trade.ips_score?.toFixed(1)}/100</Badge>
            </div>
          </div>

          {/* Contract Details */}
          <div className="pt-4 border-t space-y-2">
            <h4 className="text-sm font-semibold text-muted-foreground">Contract Details</h4>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Short Strike</span>
              <span className="font-medium">{formatCurrency(trade.short_strike)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Long Strike</span>
              <span className="font-medium">{formatCurrency(trade.long_strike)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Credit Received</span>
              <span className="font-medium text-green-600">{formatCurrency(trade.credit_received)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Contracts</span>
              <span className="font-medium">{trade.number_of_contracts}</span>
            </div>
          </div>

          {/* Greeks */}
          <div className="pt-4 border-t space-y-2">
            <h4 className="text-sm font-semibold text-muted-foreground">Greeks</h4>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Delta (Short)</span>
              <span className="font-mono">{trade.delta_short_leg?.toFixed(3)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Theta</span>
              <span className="font-mono">{trade.theta?.toFixed(3)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Vega</span>
              <span className="font-mono">{trade.vega?.toFixed(3)}</span>
            </div>
          </div>

          {/* IV */}
          <div className="pt-4 border-t space-y-2">
            <h4 className="text-sm font-semibold text-muted-foreground">Implied Volatility</h4>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">IV at Entry</span>
              <span className="font-mono">{trade.iv_at_entry?.toFixed(1)}%</span>
            </div>
          </div>

          {/* AI Recommendation */}
          {trade.structured_rationale?.summary && (
            <div className="pt-4 border-t space-y-2">
              <h4 className="text-sm font-semibold text-muted-foreground">AI Recommendation</h4>
              <div className="p-3 bg-blue-50 dark:bg-blue-950/20 rounded-lg">
                <div className="flex items-center gap-2 mb-2">
                  <Badge variant="secondary">
                    {trade.structured_rationale.summary.recommendation}
                  </Badge>
                  <Badge variant="outline">
                    {trade.structured_rationale.summary.confidence_level} confidence
                  </Badge>
                </div>
                <p className="text-sm">
                  {trade.structured_rationale.summary.one_sentence_thesis}
                </p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Exit State */}
      <Card className="border-red-200 dark:border-red-800">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-red-700 dark:text-red-400">
            <TrendingDown className="h-5 w-5" />
            Exit State
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Date & Price */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Date</span>
              <span className="font-medium">{formatDate(trade.closed_at)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Stock Price</span>
              <span className="font-medium">{formatCurrency(trade.exit_price || 0)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Days Held</span>
              <span className="font-medium">
                {Math.floor(
                  (new Date(trade.closed_at).getTime() - new Date(trade.entry_date).getTime()) /
                  (1000 * 60 * 60 * 24)
                )} days
              </span>
            </div>
          </div>

          {/* P&L */}
          <div className="pt-4 border-t space-y-2">
            <h4 className="text-sm font-semibold text-muted-foreground">Profit & Loss</h4>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Realized P&L</span>
              <span className={cn(
                'font-bold text-lg',
                trade.realized_pl > 0 ? 'text-green-600' : 'text-red-600'
              )}>
                {formatCurrency(trade.realized_pl)}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">P&L %</span>
              <span className={cn(
                'font-bold text-lg',
                trade.realized_pl_percent > 0 ? 'text-green-600' : 'text-red-600'
              )}>
                {trade.realized_pl_percent > 0 ? '+' : ''}{trade.realized_pl_percent.toFixed(2)}%
              </span>
            </div>
          </div>

          {/* Snapshot Data (if available) */}
          {trade.snapshots && trade.snapshots.length > 0 && (
            <>
              <div className="pt-4 border-t space-y-2">
                <h4 className="text-sm font-semibold text-muted-foreground">Final Greeks</h4>
                {(() => {
                  const lastSnapshot = trade.snapshots[trade.snapshots.length - 1]
                  return (
                    <>
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-muted-foreground">Delta</span>
                        <span className="font-mono">{lastSnapshot.delta_spread?.toFixed(3) || 'N/A'}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-muted-foreground">Theta</span>
                        <span className="font-mono">{lastSnapshot.theta?.toFixed(3) || 'N/A'}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-muted-foreground">Vega</span>
                        <span className="font-mono">{lastSnapshot.vega?.toFixed(3) || 'N/A'}</span>
                      </div>
                    </>
                  )
                })()}
              </div>

              <div className="pt-4 border-t space-y-2">
                <h4 className="text-sm font-semibold text-muted-foreground">Final IV</h4>
                {(() => {
                  const lastSnapshot = trade.snapshots[trade.snapshots.length - 1]
                  return (
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">IV at Exit</span>
                      <span className="font-mono">
                        {lastSnapshot.iv_short_strike?.toFixed(1) || 'N/A'}%
                      </span>
                    </div>
                  )
                })()}
              </div>
            </>
          )}

          {/* Price Movement */}
          <div className="pt-4 border-t space-y-2">
            <h4 className="text-sm font-semibold text-muted-foreground">Price Movement</h4>
            {trade.entry_price && trade.exit_price && (
              <div className="p-3 bg-muted/50 rounded-lg">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm">Entry</span>
                  <span className="font-mono">{formatCurrency(trade.entry_price)}</span>
                </div>
                <div className="flex items-center justify-center my-2">
                  <ArrowRight className="h-4 w-4 text-muted-foreground" />
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm">Exit</span>
                  <span className="font-mono">{formatCurrency(trade.exit_price)}</span>
                </div>
                <div className="mt-3 pt-3 border-t flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Change</span>
                  <span className={cn(
                    'font-medium',
                    trade.exit_price > trade.entry_price ? 'text-green-600' : 'text-red-600'
                  )}>
                    {((trade.exit_price - trade.entry_price) / trade.entry_price * 100).toFixed(2)}%
                  </span>
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
