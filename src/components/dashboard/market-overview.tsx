import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { TrendingUp, TrendingDown, Activity } from 'lucide-react'

interface MarketData {
  name: string
  value: string
  change: string
  changePercent: string
  isPositive: boolean
}

const marketData: MarketData[] = [
  {
    name: 'Dow Jones',
    value: '43,250.12',
    change: '+365.42',
    changePercent: '+0.85%',
    isPositive: true
  },
  {
    name: 'S&P 500',
    value: '5,825.34',
    change: '+24.18',
    changePercent: '+0.42%',
    isPositive: true
  },
  {
    name: 'NASDAQ',
    value: '18,945.67',
    change: '-43.89',
    changePercent: '-0.23%',
    isPositive: false
  }
]

export function MarketOverview() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
      {marketData.map((market) => (
        <Card key={market.name}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{market.name}</CardTitle>
            {market.isPositive ? (
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            ) : (
              <TrendingDown className="h-4 w-4 text-muted-foreground" />
            )}
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{market.value}</div>
            <div className={`flex items-center text-xs ${
              market.isPositive ? 'text-green-600' : 'text-red-600'
            }`}>
              {market.isPositive ? (
                <TrendingUp className="h-3 w-3 mr-1" />
              ) : (
                <TrendingDown className="h-3 w-3 mr-1" />
              )}
              {market.changePercent} ({market.change})
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}