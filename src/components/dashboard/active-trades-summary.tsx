// src/components/dashboard/active-trades-summary.tsx

"use client"

import React, { useState, useEffect, useCallback } from 'react'
import { AlertCircle, Eye, RefreshCw } from 'lucide-react'
import { evaluateExitStrategy, type ExitSignal } from '@/lib/utils/watch-criteria-evaluator'
import { toast } from 'sonner'
import { TRADES_UPDATED_EVENT, dispatchTradesUpdated } from '@/lib/events'

interface ActiveTradesSummary {
  totalActive: number
  tradesOnWatch: number
  tradesGood: number
  tradesExit: number
  totalCurrentPL: number
  totalMaxProfit: number
  totalMaxLoss: number
  totalAtRisk: number
  lastPriceUpdate: Date | null
}

export default function ActiveTradesSummary() {
  const [summary, setSummary] = useState<ActiveTradesSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const loadSummary = useCallback(async () => {
      try {
        setLoading(true)

        const [activeRes, ipsRes] = await Promise.all([
          fetch('/api/trades?status=active', { cache: 'no-store' }),
          fetch('/api/ips', { cache: 'no-store' })
        ])

        const activeData = await activeRes.json()
        const ipsData = await ipsRes.json()

        const activeTrades = activeData?.data || []

        // Build IPS map with exit strategies
        const ipsMap: Record<string, any> = {}
        if (Array.isArray(ipsData)) {
          ipsData.forEach((ips: any) => {
            ipsMap[ips.id] = ips
          })
        }

        // Fetch real-time quotes (same as dashboard)
        let quoteMap: Record<string, number> = {}
        if (activeTrades.length) {
          const symbols = Array.from(new Set(activeTrades.map((t: any) => t.symbol))).join(',')
          try {
            const qRes = await fetch(`/api/market-data/quotes?symbols=${encodeURIComponent(symbols)}`)
            const qJson = await qRes.json()
            ;(qJson?.data || []).forEach((q: any) => {
              const price = Number(q.currentPrice ?? q.last ?? q.close ?? q.price)
              if (!isNaN(price)) quoteMap[q.symbol] = price
            })
          } catch (e) {
            console.error('[Summary] Failed to fetch quotes:', e)
          }
        }

        // Calculate status counts and find last price update
        let tradesOnWatch = 0
        let tradesGood = 0
        let tradesExit = 0
        let totalCurrentPL = 0
        let totalMaxProfit = 0
        let totalMaxLoss = 0
        let lastPriceUpdate: Date | null = null

        activeTrades.forEach((trade: any) => {
          // Track the most recent spread price update
          if (trade.spread_price_updated_at) {
            const updateTime = new Date(trade.spread_price_updated_at)
            if (!lastPriceUpdate || updateTime > lastPriceUpdate) {
              lastPriceUpdate = updateTime
            }
          }

          // Determine status based on IPS score and price to short
          const ipsScore = typeof trade.ips_score === 'number' ? Number(trade.ips_score) : undefined
          // Get current price from quote map or fallback to stored price (same as dashboard)
          const currentPrice = (quoteMap[trade.symbol] ?? Number(trade.current_price ?? 0)) || 0

          const shortStrike = Number(trade.short_strike ?? trade.strike_price_short ?? 0) || 0
          const percentToShort = shortStrike > 0 ? ((currentPrice - shortStrike) / shortStrike) * 100 : 0

          // Calculate current P/L if spread price exists
          const spreadPrice = Number(trade.current_spread_price ?? 0)
          const creditReceived = Number(trade.credit_received ?? 0)
          const contracts = Number(trade.number_of_contracts ?? trade.contracts ?? 1)

          if (spreadPrice > 0 && creditReceived > 0) {
            const plPerContract = creditReceived - spreadPrice
            totalCurrentPL += plPerContract * contracts * 100
          }

          // Max profit/loss
          totalMaxProfit += Number(trade.max_gain ?? 0)
          totalMaxLoss += Number(trade.max_loss ?? 0)

          // Evaluate exit strategy if IPS exists (same logic as dashboard)
          const ips = trade.ips_id ? ipsMap[trade.ips_id] : null
          const tradeForEval = {
            current_price: spreadPrice > 0 ? spreadPrice : undefined,  // Use spread price for exit evaluation
            entry_price: Number(trade.entry_price ?? trade.credit_received ?? 0),
            credit_received: creditReceived,
            expiration_date: trade.expiration_date,
            max_gain: Number(trade.max_gain ?? 0),
            max_loss: Number(trade.max_loss ?? 0),
          }

          const exitSignal = ips?.exit_strategies ? evaluateExitStrategy(tradeForEval, ips.exit_strategies) : null

          // Determine status (EXACT same logic as excel-style-trades-dashboard.tsx lines 252, 275-283)
          const watch = (ipsScore != null && ipsScore < 75) || (shortStrike > 0 && percentToShort < 5)

          let status: 'GOOD' | 'WATCH' | 'EXIT' = 'GOOD'
          if (exitSignal?.shouldExit) {
            status = 'EXIT'
          } else if (watch) {
            status = 'WATCH'
          } else if (percentToShort < 0) {
            status = 'EXIT'
          }

          // Count by status
          if (status === 'EXIT') {
            tradesExit++
          } else if (status === 'WATCH') {
            tradesOnWatch++
          } else {
            tradesGood++
          }
        })

        // Total at risk is the sum of max losses for active trades
        const totalAtRisk = totalMaxLoss

        setSummary({
          totalActive: activeTrades.length,
          tradesOnWatch,
          tradesGood,
          tradesExit,
          totalCurrentPL,
          totalMaxProfit,
          totalMaxLoss,
          totalAtRisk,
          lastPriceUpdate
        })

      } catch (error) {
        console.error('Failed to load active trades summary:', error)
      } finally {
        setLoading(false)
      }
    }, [])

  useEffect(() => {
    loadSummary()

    // Listen for trades updated events
    const handleTradesUpdated = () => {
      console.log('[ActiveTradesSummary] Trades updated, refreshing...')
      loadSummary()
    }

    window.addEventListener(TRADES_UPDATED_EVENT, handleTradesUpdated)

    return () => {
      window.removeEventListener(TRADES_UPDATED_EVENT, handleTradesUpdated)
    }
  }, [loadSummary])

  const handleManualRefresh = async () => {
    try {
      setRefreshing(true)
      toast.info('Updating options prices...', {
        description: 'This may take a few moments',
        duration: 3000
      })

      const response = await fetch('/api/trades/spread-prices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      })

      const data = await response.json()

      if (response.ok && data.success) {
        toast.success(`Updated ${data.successful} of ${data.total} trades`, {
          description: data.updatedAt ? `Last updated: ${new Date(data.updatedAt).toLocaleTimeString()}` : undefined
        })

        // Reload the summary with fresh data (no full page reload)
        await loadSummary()

        // Notify other components that trades were updated
        dispatchTradesUpdated({ type: 'spread_prices_updated' })
      } else {
        toast.error('Failed to update prices', {
          description: data.error || 'Please try again'
        })
      }
    } catch (error) {
      console.error('Manual refresh error:', error)
      toast.error('Failed to update prices', {
        description: 'Network error occurred'
      })
    } finally {
      setRefreshing(false)
    }
  }

  const currencyFormatter = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  })

  const formatLastUpdate = (date: Date | null) => {
    if (!date) return 'Never'

    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMins = Math.floor(diffMs / 60000)

    if (diffMins < 1) return 'Just now'
    if (diffMins < 60) return `${diffMins}m ago`
    if (diffMins < 1440) return `${Math.floor(diffMins / 60)}h ago`

    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit'
    })
  }

  if (loading || !summary) {
    return null
  }

  if (summary.totalActive === 0) {
    return null
  }

  return (
    <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-lg p-4 mb-4">
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4">
        {/* Total Active */}
        <div className="text-center">
          <div className="text-2xl font-bold text-blue-900">{summary.totalActive}</div>
          <div className="text-xs text-blue-600 font-medium">Active Trades</div>
        </div>

        {/* Good */}
        <div className="text-center">
          <div className="text-2xl font-bold text-green-700">{summary.tradesGood}</div>
          <div className="text-xs text-green-600 font-medium">Good</div>
        </div>

        {/* Watch */}
        <div className="text-center">
          <div className="text-2xl font-bold text-yellow-700 flex items-center justify-center gap-1">
            <Eye className="h-5 w-5" />
            {summary.tradesOnWatch}
          </div>
          <div className="text-xs text-yellow-600 font-medium">Watch</div>
        </div>

        {/* Exit */}
        <div className="text-center">
          <div className="text-2xl font-bold text-red-700 flex items-center justify-center gap-1">
            <AlertCircle className="h-5 w-5" />
            {summary.tradesExit}
          </div>
          <div className="text-xs text-red-600 font-medium">Exit</div>
        </div>

        {/* Current P/L */}
        <div className="text-center">
          <div className={`text-2xl font-bold ${summary.totalCurrentPL >= 0 ? 'text-green-700' : 'text-red-700'}`}>
            {currencyFormatter.format(summary.totalCurrentPL)}
          </div>
          <div className="text-xs text-gray-600 font-medium">Current P/L</div>
        </div>

        {/* Max Profit */}
        <div className="text-center">
          <div className="text-2xl font-bold text-green-700">
            {currencyFormatter.format(summary.totalMaxProfit)}
          </div>
          <div className="text-xs text-green-600 font-medium">Max Profit</div>
        </div>

        {/* Max Loss */}
        <div className="text-center">
          <div className="text-2xl font-bold text-red-700">
            {currencyFormatter.format(summary.totalMaxLoss)}
          </div>
          <div className="text-xs text-red-600 font-medium">Max Loss</div>
        </div>
      </div>

      {/* Last Update Info and Manual Refresh */}
      <div className="mt-3 pt-3 border-t border-blue-200 flex items-center justify-between text-xs">
        <div className="text-gray-600">
          <span className="font-medium">Options Pricing Last Updated:</span>{' '}
          <span className={summary.lastPriceUpdate ? 'text-gray-800' : 'text-red-600'}>
            {formatLastUpdate(summary.lastPriceUpdate)}
          </span>
        </div>
        <button
          onClick={handleManualRefresh}
          disabled={refreshing}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />
          {refreshing ? 'Updating...' : 'Update Now'}
        </button>
      </div>
    </div>
  )
}
