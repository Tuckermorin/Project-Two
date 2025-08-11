// src/components/ips/ips-performance-tracker.tsx

import React from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Target, TrendingUp, Award, BarChart3, AlertCircle } from 'lucide-react'
import Link from 'next/link'

interface IPSPerformanceData {
  ipsName: string
  totalClosedTrades: number
  winRate: number
  totalPL: number
  avgROI: number
  bestTrade: number
  worstTrade: number
  avgIPSScore: number
  highIPSWinRate: number // Win rate for trades with IPS > 75
  lowIPSWinRate: number  // Win rate for trades with IPS < 60
}

interface IPSPerformanceTrackerProps {
  hasActiveIPS: boolean
  performanceData?: IPSPerformanceData
}

export function IPSPerformanceTracker({ 
  hasActiveIPS = false, 
  performanceData
}: IPSPerformanceTrackerProps) {
  const formatCurrency = (amount: number) => 
    new Intl.NumberFormat('en-US', { 
      style: 'currency', 
      currency: 'USD', 
      minimumFractionDigits: 0 
    }).format(amount)

  const formatPL = (amount: number) => {
    const formatted = formatCurrency(Math.abs(amount))
    return amount >= 0 ? `+${formatted}` : `-${formatted}`
  }

  // No active IPS state
  if (!hasActiveIPS) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Target className="h-4 w-4" />
            IPS Performance
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-4">
            <AlertCircle className="h-8 w-8 mx-auto mb-2 text-gray-400" />
            <p className="text-sm font-medium mb-2">No Active IPS</p>
            <p className="text-xs text-gray-500 mb-3">
              Create an Investment Policy Statement to track performance
            </p>
            <Button asChild variant="default" size="sm" className="w-full">
              <Link href="/ips">Create IPS</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    )
  }

  // No performance data yet (active IPS but no trades)
  if (!performanceData || performanceData.totalClosedTrades === 0) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Target className="h-4 w-4" />
            IPS Performance
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-4">
            <BarChart3 className="h-8 w-8 mx-auto mb-2 text-gray-400" />
            <p className="text-sm font-medium mb-2">No Trade History</p>
            <p className="text-xs text-gray-500 mb-3">
              Complete trades to see IPS performance metrics
            </p>
            <Button asChild variant="outline" size="sm" className="w-full">
              <Link href="/trades">Start Trading</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    )
  }

  // Has performance data
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Target className="h-4 w-4" />
            IPS Performance
          </CardTitle>
          <Badge variant="default" className="text-xs">
            Active
          </Badge>
        </div>
        <p className="text-xs text-gray-600 mt-1">{performanceData.ipsName}</p>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Overall Performance */}
        <div className="bg-gray-50 rounded-lg p-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-gray-600">Overall Score</span>
            <Badge 
              variant={performanceData.avgIPSScore >= 75 ? "default" : performanceData.avgIPSScore >= 60 ? "secondary" : "destructive"}
              className="text-xs"
            >
              {performanceData.avgIPSScore}/100
            </Badge>
          </div>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div>
              <span className="text-gray-500">Win Rate</span>
              <p className="font-semibold">{performanceData.winRate.toFixed(1)}%</p>
            </div>
            <div>
              <span className="text-gray-500">Total P/L</span>
              <p className={`font-semibold ${performanceData.totalPL >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {formatPL(performanceData.totalPL)}
              </p>
            </div>
          </div>
        </div>

        {/* IPS Score Correlation */}
        <div className="space-y-2">
          <p className="text-xs font-medium text-gray-700">Score Impact</p>
          <div className="space-y-1">
            <div className="flex items-center justify-between text-xs">
              <span className="text-gray-600">High Score (&gt;75)</span>
              <span className="font-medium text-green-600">
                {performanceData.highIPSWinRate.toFixed(1)}% wins
              </span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-gray-600">Low Score (&lt;60)</span>
              <span className="font-medium text-red-600">
                {performanceData.lowIPSWinRate.toFixed(1)}% wins
              </span>
            </div>
          </div>
        </div>

        {/* Trade Summary */}
        <div className="pt-2 border-t">
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div>
              <span className="text-gray-500">Total Trades</span>
              <p className="font-semibold">{performanceData.totalClosedTrades}</p>
            </div>
            <div>
              <span className="text-gray-500">Avg ROI</span>
              <p className="font-semibold">{performanceData.avgROI.toFixed(1)}%</p>
            </div>
            <div>
              <span className="text-gray-500">Best Trade</span>
              <p className="font-semibold text-green-600">
                {formatPL(performanceData.bestTrade)}
              </p>
            </div>
            <div>
              <span className="text-gray-500">Worst Trade</span>
              <p className="font-semibold text-red-600">
                {formatPL(performanceData.worstTrade)}
              </p>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-2 pt-2">
          <Button asChild variant="outline" size="sm" className="flex-1">
            <Link href="/ips">
              <Settings className="h-3 w-3 mr-1" />
              Edit IPS
            </Link>
          </Button>
          <Button asChild variant="outline" size="sm" className="flex-1">
            <Link href="/trades">
              <TrendingUp className="h-3 w-3 mr-1" />
              View Trades
            </Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

// Add missing import
import { Settings } from 'lucide-react'