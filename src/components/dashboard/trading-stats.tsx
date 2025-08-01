import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Activity, DollarSign, TrendingUp } from 'lucide-react'

interface TradingStatsProps {
  activeTrades: number
  totalPL: number
  winRate: number | null
  hasIPS: boolean
}

export function TradingStats({ 
  activeTrades = 0, 
  totalPL = 0, 
  winRate = null, 
  hasIPS = false 
}: TradingStatsProps) {
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2
    }).format(amount)
  }

  const formatPL = (amount: number) => {
    const formatted = formatCurrency(Math.abs(amount))
    return amount >= 0 ? `+${formatted}` : `-${formatted}`
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Active Trades</CardTitle>
          <Activity className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{activeTrades}</div>
          <p className="text-xs text-muted-foreground">
            {activeTrades === 0 ? 'No active positions' : `${activeTrades} position${activeTrades !== 1 ? 's' : ''}`}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Total P&L</CardTitle>
          <DollarSign className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className={`text-2xl font-bold ${
            totalPL >= 0 ? 'text-green-600' : 'text-red-600'
          }`}>
            {formatPL(totalPL)}
          </div>
          <p className="text-xs text-muted-foreground">
            {totalPL === 0 ? 'Start trading to see results' : 'Unrealized P&L'}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Win Rate</CardTitle>
          <TrendingUp className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">
            {winRate !== null ? `${winRate.toFixed(1)}%` : '--'}
          </div>
          <p className="text-xs text-muted-foreground">
            {winRate === null ? 'No completed trades' : 'Historical performance'}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">IPS Score</CardTitle>
          <Badge variant={hasIPS ? "default" : "outline"}>
            {hasIPS ? 'Active' : 'Not Set'}
          </Badge>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">--</div>
          <p className="text-xs text-muted-foreground">
            {hasIPS ? 'Ready for trade scoring' : 'Create your IPS first'}
          </p>
        </CardContent>
      </Card>
    </div>
  )
}