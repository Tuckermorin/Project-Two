import { MarketOverview } from '@/components/dashboard/market-overview'
import { TradingStats } from '@/components/dashboard/trading-stats'
import { QuickStart } from '@/components/dashboard/quick-start'

export default function Dashboard() {
  // TODO: These will come from our database/state management later
  const dashboardData = {
    activeTrades: 0,
    totalPL: 0,
    winRate: null,
    hasIPS: false,
    watchlistCount: 0,
    tradeCount: 0
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold">Dashboard</h1>
        <p className="text-muted-foreground mt-2">Track your paper trading performance</p>
      </div>

      {/* Market Overview */}
      <div className="mb-8">
        <MarketOverview />
      </div>

      {/* Trading Stats */}
      <div className="mb-8">
        <TradingStats 
          activeTrades={dashboardData.activeTrades}
          totalPL={dashboardData.totalPL}
          winRate={dashboardData.winRate}
          hasIPS={dashboardData.hasIPS}
        />
      </div>

      {/* Quick Start Guide */}
      <QuickStart 
        hasIPS={dashboardData.hasIPS}
        watchlistCount={dashboardData.watchlistCount}
        tradeCount={dashboardData.tradeCount}
      />
    </div>
  )
}