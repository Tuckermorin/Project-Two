// src/app/page.tsx

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { TrendingUp, TrendingDown, Activity, DollarSign, FileText, Eye, Target, AlertCircle } from 'lucide-react'
import Link from 'next/link'
import ExcelStyleTradesDashboard from '@/components/dashboard/excel-style-trades-dashboard'
import ActionNeededTradesPanel from '@/components/dashboard/action-needed-trades'
import HistoricTradesDashboard from '@/components/dashboard/historic-trades-dashboard'
import { IPSPerformanceTracker } from '@/components/ips/ips-performance-tracker'
import { MarketOverview } from '@/components/dashboard/market-overview'
import TradesSummaryStats from '@/components/dashboard/trades-summary-stats'

// Simplified Quick Start Component
interface SimplifiedQuickStartProps {
  hasIPS: boolean
  watchlistCount: number
  tradeCount: number
}

function SimplifiedQuickStart({ hasIPS = false, watchlistCount = 0, tradeCount = 0 }: SimplifiedQuickStartProps) {
  const steps = [
    {
      title: "Investment Policy Statement",
      href: "/ips",
      icon: FileText,
      completed: hasIPS,
      description: hasIPS ? "IPS configured" : "Set up your trading criteria"
    },
    {
      title: "Watchlist",
      href: "/watchlist",
      icon: Eye,
      completed: watchlistCount > 0,
      description: watchlistCount > 0 ? `${watchlistCount} stocks monitored` : "Add stocks to monitor"
    },
    {
      title: "Trading",
      href: "/trades",
      icon: TrendingUp,
      completed: tradeCount > 0,
      description: tradeCount > 0 ? `${tradeCount} trades recorded` : "Start paper trading"
    }
  ]

  return (
    <Card className="fade-in">
      <CardHeader className="pb-3">
        <CardTitle className="text-base" style={{ color: 'var(--text-primary)' }}>Quick Actions</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {steps.map((step, index) => {
            const Icon = step.icon
            return (
              <div
                key={step.title}
                className={`flex items-center justify-between p-3 rounded-lg transition-all hover:bg-[var(--glass-bg-hover)] fade-in-delay-${index + 1}`}
                style={{
                  border: '1px solid var(--glass-border)'
                }}
              >
                <div className="flex items-center gap-3">
                  <Icon className="h-4 w-4" style={{ color: 'var(--gradient-primary-start)' }} />
                  <div>
                    <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{step.title}</p>
                    <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>{step.description}</p>
                  </div>
                </div>
                <Button asChild variant="outline" size="sm">
                  <Link href={step.href}>
                    {step.completed ? 'View' : 'Start'}
                  </Link>
                </Button>
              </div>
            )
          })}
        </div>
      </CardContent>
    </Card>
  )
}

// Main Dashboard Component
export default function Dashboard() {
  // TODO: Replace with actual data from your state management or API
  // These should come from your authentication context, database, or state management
  const dashboardData = {
    activeTrades: 0,
    totalPL: 0,
    winRate: 0,
    ipsScore: 0,
    hasIPS: false,
    watchlistCount: 0,
    tradeCount: 0
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-8 fade-in">
        <h1 className="text-3xl font-bold gradient-text-primary">Dashboard</h1>
        <p className="mt-2" style={{ color: 'var(--text-secondary)' }}>Track your paper trading performance</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Main Content: Current and Historic Trades */}
        <div className="lg:col-span-3 space-y-8">
          {/* Current Trades Component */}
          <div className="fade-in">
            <ExcelStyleTradesDashboard />
          </div>

          {/* Action Needed Component */}
          <div className="fade-in fade-in-delay-1">
            <ActionNeededTradesPanel />
          </div>

          {/* Historic Trades Component */}
          <div className="fade-in fade-in-delay-2">
            <HistoricTradesDashboard />
          </div>
        </div>

        {/* Right Sidebar: Compact components */}
        <div className="space-y-6">
          {/* Market Overview with real Alpha Vantage data */}
          <div className="fade-in">
            <MarketOverview />
          </div>

          {/* IPS Performance Tracker */}
          <div className="fade-in fade-in-delay-1">
            <IPSPerformanceTracker />
          </div>

          {/* Simplified Quick Start */}
          <div className="fade-in fade-in-delay-2">
            <SimplifiedQuickStart
              hasIPS={dashboardData.hasIPS}
              watchlistCount={dashboardData.watchlistCount}
              tradeCount={dashboardData.tradeCount}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
