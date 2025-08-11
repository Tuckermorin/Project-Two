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
  lastUpdated?: string
}

interface MarketOverviewProps {
  apiKey?: string // Allow passing API key as prop for flexibility
}

export function MarketOverview({ apiKey }: MarketOverviewProps) {
  const [marketData, setMarketData] = useState<MarketIndex[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null)

  // Get API key from environment or props
  const alphaVantageKey = process.env.NEXT_PUBLIC_ALPHA_VANTAGE_API_KEY

  // Index ETFs that represent major indices (since Alpha Vantage doesn't directly provide index data)
  const indexETFs = [
    { symbol: 'DIA', name: 'DIA (DOW)', description: 'Dow Jones Industrial Average' },
    { symbol: 'SPY', name: 'SPY (S&P 500)', description: 'S&P 500 Index' },
    { symbol: 'QQQ', name: 'QQQ (NASDAQ)', description: 'NASDAQ-100 Index' }
  ]

  const fetchMarketData = async () => {
    if (!alphaVantageKey || alphaVantageKey === 'your-alpha-vantage-key-here') {
      setError('Alpha Vantage API key not configured')
      setIsLoading(false)
      return
    }

    setIsLoading(true)
    setError(null)

    try {
      const promises = indexETFs.map(async (index) => {
        const response = await fetch(
          `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${index.symbol}&apikey=${alphaVantageKey}`
        )

        if (!response.ok) {
          throw new Error(`Failed to fetch ${index.symbol}`)
        }

        const data = await response.json()

        // Check for API errors
        if (data['Error Message']) {
          throw new Error(data['Error Message'])
        }

        if (data['Note']) {
          // API rate limit message
          throw new Error('API rate limit reached. Please wait a minute and try again.')
        }

        const quote = data['Global Quote']
        
        if (!quote || Object.keys(quote).length === 0) {
          throw new Error(`No data available for ${index.symbol}`)
        }

        const price = parseFloat(quote['05. price'])
        const change = parseFloat(quote['09. change'])
        const changePercent = quote['10. change percent'].replace('%', '')
        const isPositive = change >= 0

        return {
          symbol: index.symbol,
          name: index.name,
          price: price.toFixed(2),
          change: `${isPositive ? '+' : ''}${change.toFixed(2)}`,
          changePercent: `${isPositive ? '+' : ''}${parseFloat(changePercent).toFixed(2)}%`,
          isPositive,
          lastUpdated: quote['07. latest trading day']
        }
      })

      const results = await Promise.all(promises)
      setMarketData(results)
      setLastRefresh(new Date())
      setError(null)
    } catch (err) {
      console.error('Error fetching market data:', err)
      setError(err instanceof Error ? err.message : 'Failed to fetch market data')
      
      // If we have cached data, keep showing it
      if (marketData.length === 0) {
        setMarketData([])
      }
    } finally {
      setIsLoading(false)
    }
  }

  // Fetch data on component mount
  useEffect(() => {
    fetchMarketData()
    
    // Set up auto-refresh every 5 minutes (to respect API limits)
    const interval = setInterval(fetchMarketData, 5 * 60 * 1000)
    
    return () => clearInterval(interval)
  }, [alphaVantageKey])

  // Format time for display
  const formatLastUpdate = () => {
    if (!lastRefresh) return ''
    const now = new Date()
    const diff = Math.floor((now.getTime() - lastRefresh.getTime()) / 1000)
    
    if (diff < 60) return 'Just now'
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
    return `${Math.floor(diff / 3600)}h ago`
  }

  // Loading state
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

  // Error state (when no data available)
  if (error && marketData.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Market Overview</CardTitle>
            <Button 
              variant="ghost" 
              size="sm"
              onClick={fetchMarketData}
              disabled={isLoading}
            >
              <RefreshCw className={`h-3 w-3 ${isLoading ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="text-center py-4">
            <AlertCircle className="h-8 w-8 mx-auto mb-2 text-gray-400" />
            <p className="text-sm text-gray-500 mb-2">Unable to load market data</p>
            <p className="text-xs text-gray-400">{error}</p>
            {error.includes('API key') && (
              <div className="mt-3 text-xs text-gray-500">
                <p>Get your free API key at:</p>
                <a 
                  href="https://www.alphavantage.co/support/#api-key" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-blue-500 hover:underline"
                >
                  alphavantage.co
                </a>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    )
  }

  // Success state
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">Market Overview</CardTitle>
          <div className="flex items-center gap-2">
            {lastRefresh && (
              <span className="text-xs text-gray-500">{formatLastUpdate()}</span>
            )}
            <Button 
              variant="ghost" 
              size="sm"
              onClick={fetchMarketData}
              disabled={isLoading}
              className="h-7 w-7 p-0"
            >
              <RefreshCw className={`h-3 w-3 ${isLoading ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {marketData.map((market) => (
            <div key={market.symbol} className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">{market.name}</span>
                {market.isPositive ? (
                  <TrendingUp className="h-3 w-3 text-green-600" />
                ) : (
                  <TrendingDown className="h-3 w-3 text-red-600" />
                )}
              </div>
              <div className="text-right">
                <div className="text-sm font-bold">{market.price}</div>
                <div className={`text-xs font-medium ${market.isPositive ? 'text-green-600' : 'text-red-600'}`}>
                  {market.change} ({market.changePercent})
                </div>
              </div>
            </div>
          ))}
        </div>
        
        {error && marketData.length > 0 && (
          <div className="mt-3 pt-3 border-t">
            <p className="text-xs text-amber-600 flex items-center gap-1">
              <AlertCircle className="h-3 w-3" />
              Update failed, showing cached data
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// Export as default for backward compatibility
export default MarketOverview