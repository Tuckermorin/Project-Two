// src/app/page.tsx

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { TrendingUp, TrendingDown, Activity, DollarSign, FileText, Eye, Target } from 'lucide-react'
import Link from 'next/link'
import ExcelStyleTradesDashboard from '@/components/dashboard/excel-style-trades-dashboard'
import HistoricTradesDashboard from '@/components/dashboard/historic-trades-dashboard'
import { IPSPerformanceTracker } from '@/components/ips/ips-performance-tracker'

// Compact Market Overview
function CompactMarketOverview() {
  const marketData = [
    { name: 'DOW', value: '43,250', change: '+0.85%', isPositive: true },
    { name: 'S&P', value: '5,825', change: '+0.42%', isPositive: true },
    { name: 'NASDAQ', value: '18,946', change: '-0.23%', isPositive: false }
  ]

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Market Overview</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {marketData.map((market) => (
            <div key={market.name} className="flex items-center justify-between">
              <span className="text-sm font-medium">{market.name}</span>
              <div className="text-right">
                <div className="text-sm font-bold">{market.value}</div>
                <div className={`text-xs ${market.isPositive ? 'text-green-600' : 'text-red-600'}`}>
                  {market.change}
                </div>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

// Simplified Quick Start
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
      description: "Define your trading criteria and risk parameters"
    },
    {
      title: "Watchlist",
      href: "/watchlist", 
      icon: Eye,
      completed: watchlistCount > 0,
      description: `${watchlistCount} stocks being monitored`
    },
    {
      title: "Trading",
      href: "/trades",
      icon: TrendingUp,
      completed: tradeCount > 0,
      description: `${tradeCount} trades in history`
    }
  ]

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Quick Actions</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {steps.map((step) => {
            const Icon = step.icon
            return (
              <div key={step.title} className="flex items-center justify-between p-3 border rounded-lg hover:bg-gray-50">
                <div className="flex items-center gap-3">
                  <Icon className="h-4 w-4 text-gray-600" />
                  <div>
                    <p className="text-sm font-medium">{step.title}</p>
                    <p className="text-xs text-gray-500">{step.description}</p>
                  </div>
                </div>
                <Button asChild variant="outline" size="sm">
                  <Link href={step.href}>Edit</Link>
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
  // Sample data - this would come from your state management
  const dashboardData = {
    activeTrades: 5,
    totalPL: 375.00,
    winRate: 72.5,
    ipsScore: 79,
    hasIPS: true,
    watchlistCount: 12,
    tradeCount: 23
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-gray-600 mt-2">Track your paper trading performance</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Main Content: Current and Historic Trades */}
        <div className="lg:col-span-3 space-y-8">
          {/* Current Trades */}
          <ExcelStyleTradesDashboard />
          
          {/* Historic Trades */}
          <HistoricTradesDashboard />
        </div>

        {/* Right Sidebar: Compact components */}
        <div className="space-y-6">
          {/* Compact Market Overview */}
          <CompactMarketOverview />
          
          {/* IPS Performance Tracker */}
          <IPSPerformanceTracker 
            hasActiveIPS={dashboardData.hasIPS}
          />
          
          {/* Simplified Quick Start */}
          <SimplifiedQuickStart 
            hasIPS={dashboardData.hasIPS}
            watchlistCount={dashboardData.watchlistCount}
            tradeCount={dashboardData.tradeCount}
          />
        </div>
      </div>
    </div>
  )
}