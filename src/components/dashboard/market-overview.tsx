// src/components/dashboard/market-overview.tsx

"use client"

import React, { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { AlertCircle, TrendingUp, TrendingDown, RefreshCw, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface MarketIndex {
  symbol: string
  name: string
  price: string
  change: string
  changePercent: string
  isPositive: boolean
  lastUpdated: string
}

interface MarketOverviewProps {
  apiKey?: string // Allow passing API key as prop for flexibility
}

export function MarketOverview() {
  const [marketData, setMarketData] = useState<MarketIndex[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null)
  const [servedFromCache, setServedFromCache] = useState(false)

  const symbols = ['DIA', 'SPY', 'QQQ', 'VIXY'] as const

  const getIndexName = (symbol: string): string => {
    const nameMap: Record<string, string> = {
      DIA: 'DIA (DOW)',
      SPY: 'SPY (S&P 500)',
      QQQ: 'QQQ (NASDAQ)',
      VIXY: 'Volatility Idx',
    }
    return nameMap[symbol] || symbol
  }

  const fetchMarketData = async () => {
    try {
      setIsLoading(true)
      setError(null)
      setServedFromCache(false)

      const qp = encodeURIComponent(symbols.join(','))
      const res = await fetch(`/api/market-data?symbols=${qp}`, { cache: 'no-store' })

      if (!res.ok) {
        const text = await res.text().catch(() => '')
        throw new Error(text || `HTTP ${res.status}`)
      }

      const json = await res.json()
      const rateLimited = res.headers.get('X-RateLimited') === 'true'
      const budgetExceeded = res.headers.get('X-Budget-Exceeded') === 'true'

      const transformed: MarketIndex[] = (json.items || []).map((it: any) => {
        const d = it.data
        if (!d) {
          return {
            symbol: it.symbol,
            name: getIndexName(it.symbol),
            price: '$0.00',
            change: '$0.00',
            changePercent: '0.00%',
            isPositive: false,
            lastUpdated: new Date().toISOString(),
          }
        }
        const isPositive = d.priceChange >= 0
        return {
          symbol: d.symbol,
          name: getIndexName(d.symbol),
          price: `$${Number(d.currentPrice).toFixed(2)}`,
          change: `${isPositive ? '+' : ''}$${Math.abs(Number(d.priceChange)).toFixed(2)}`,
          changePercent: `${isPositive ? '+' : ''}${Number(d.priceChangePercent).toFixed(2)}%`,
          isPositive,
          lastUpdated: new Date(d.lastUpdated).toISOString(),
        }
      })

      setMarketData(transformed)
      setLastRefresh(new Date())

      // If any signal says cache, show banner
      const anyServedFromCache =
        rateLimited ||
        budgetExceeded ||
        (json.items || []).some((it: any) => it.fromCache === true || it.error?.startsWith('served-stale'))

      setServedFromCache(!!anyServedFromCache)
    } catch (err: any) {
      console.error('Error in fetchMarketData:', err)
      setError(err?.message || 'Unknown error occurred')
      setMarketData([])
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    fetchMarketData()
    // Refresh every 3 hours to reduce API usage
    const interval = setInterval(fetchMarketData, 3 * 60 * 60 * 1000)
    return () => clearInterval(interval)
  }, [])

  const formatLastUpdate = () => {
    if (!lastRefresh) return ''
    const diff = Math.floor((Date.now() - lastRefresh.getTime()) / 1000)
    if (diff < 60) return 'Just now'
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
    return `${Math.floor(diff / 3600)}h ago`
  }

  if (isLoading && marketData.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Market Overview</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
            <span className="ml-2 text-sm text-gray-500">Loading market data...</span>
          </div>
        </CardContent>
      </Card>
    )
  }

  if (error && marketData.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Market Overview</CardTitle>
            <Button variant="ghost" size="sm" onClick={fetchMarketData} disabled={isLoading}>
              <RefreshCw className={`h-3 w-3 ${isLoading ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="text-center py-4">
            <AlertCircle className="h-8 w-8 mx-auto mb-2 text-gray-400" />
            <p className="text-sm text-gray-500 mb-2">Unable to load market data</p>
            <p className="text-xs text-gray-400">{error}</p>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">Market Overview</CardTitle>
          <div className="flex items-center gap-2">
            {lastRefresh && <span className="text-xs text-gray-500">{formatLastUpdate()}</span>}
            <Button variant="ghost" size="sm" onClick={fetchMarketData} disabled={isLoading} className="h-7 w-7 p-0">
              <RefreshCw className={`h-3 w-3 ${isLoading ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {marketData.map((m) => (
            <div key={m.symbol} className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">{m.name}</span>
                {m.isPositive ? (
                  <TrendingUp className="h-3 w-3 text-green-600" />
                ) : (
                  <TrendingDown className="h-3 w-3 text-red-600" />
                )}
              </div>
              <div className="text-right">
                <div className="text-sm font-bold">{m.price}</div>
                <div className={`text-xs font-medium ${m.isPositive ? 'text-green-600' : 'text-red-600'}`}>
                  {m.change} ({m.changePercent})
                </div>
              </div>
            </div>
          ))}
        </div>

        {servedFromCache && (
          <div className="mt-3 pt-3 border-t">
            <p className="text-xs text-amber-600 flex items-center gap-1">
              <AlertCircle className="h-3 w-3" />
              Showing cached data due to API limits
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

export default MarketOverview
