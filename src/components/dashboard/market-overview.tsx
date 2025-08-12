// src/components/dashboard/market-overview.tsx

"use client"

import React, { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { AlertCircle, TrendingUp, TrendingDown, RefreshCw, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { getMarketDataService } from '@/lib/services/market-data-service';

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
    { symbol: 'QQQ', name: 'QQQ (NASDAQ)', description: 'NASDAQ-100 Index' },
    { symbol: 'VIX', name: 'Volatility Idx', description: 'Volatility Index' }
  ]

  const fetchMarketData = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const marketDataService = getMarketDataService();
      
      const symbols = ['DIA', 'SPY', 'QQQ', 'VIX']; // Use the symbols from your indexETFs
      const promises = symbols.map(async (symbol) => {
        try {
          const data = await marketDataService.getUnifiedStockData(symbol, false);
          return { symbol, data, error: null };
        } catch (error) {
          console.error(`Error fetching data for ${symbol}:`, error);
          return { 
            symbol, 
            data: null, 
            error: error instanceof Error ? error.message : 'Unknown error' 
          };
        }
      });
      
      const results = await Promise.allSettled(promises);
    
// Transform the data to match MarketIndex interface
    const transformedData: MarketIndex[] = results
      .map((result, index) => {
        const symbol = symbols[index];
        
        if (result.status === 'fulfilled') {
          if (result.value.error || !result.value.data) {
            console.warn(`Failed to fetch ${symbol}:`, result.value.error);
            // Return fallback data that matches MarketIndex interface
            return {
              symbol,
              name: getIndexName(symbol),
              price: '$0.00',
              change: '$0.00',
              changePercent: '0.00%',
              isPositive: false,
              lastUpdated: new Date().toISOString()
            };
          }
          
          // Transform UnifiedStockData to MarketIndex
          const data = result.value.data;
          const isPositive = data.priceChange >= 0;
          
          return {
            symbol: data.symbol,
            name: getIndexName(data.symbol),
            price: `$${data.currentPrice.toFixed(2)}`,
            change: `${isPositive ? '+' : ''}$${data.priceChange.toFixed(2)}`,
            changePercent: `${isPositive ? '+' : ''}${data.priceChangePercent.toFixed(2)}%`,
            isPositive,
            lastUpdated: data.lastUpdated.toISOString()
          };
        } else {
          console.error(`Promise rejected for ${symbol}:`, result.reason);
          // Return fallback data
          return {
            symbol,
            name: getIndexName(symbol),
            price: '$0.00',
            change: '$0.00',
            changePercent: '0.00%',
            isPositive: false,
            lastUpdated: new Date().toISOString()
          };
        }
      })
      .filter((item): item is MarketIndex => item !== null && item !== undefined);
    
    setMarketData(transformedData);
    setLastRefresh(new Date());
    
  } catch (error) {
    console.error('Error in fetchMarketData:', error);
    setError(error instanceof Error ? error.message : 'Unknown error occurred');
    setMarketData([]);
  } finally {
    setIsLoading(false);
  }
};

// Helper function to get index names - update to match your indexETFs
const getIndexName = (symbol: string): string => {
  const nameMap: Record<string, string> = {
    'DIA': 'DIA (DOW)',
    'SPY': 'SPY (S&P 500)',
    'QQQ': 'QQQ (NASDAQ)',
    'VIX': 'Volatility Idx',
    // Add more as needed
  };
  return nameMap[symbol] || symbol;
};

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