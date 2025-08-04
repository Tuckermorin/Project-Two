// src/components/dashboard/ips-performance-tracker.tsx

import React from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Target, TrendingUp, Award, BarChart3 } from 'lucide-react'
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

// Mock performance data
const mockPerformanceData: IPSPerformanceData = {
  ipsName: "Conservative Growth Strategy",
  totalClosedTrades: 23,
  winRate: 73.9,
  totalPL: 4250.75,
  avgROI: 28.5,
  bestTrade: 1200.00,
  worstTrade: -850.00,
  avgIPSScore: 72,
  highIPSWinRate: 85.7, // 12/14 trades with IPS > 75 were profitable
  lowIPSWinRate: 33.3   // 2/6 trades with IPS < 60 were profitable
}

export function IPSPerformanceTracker({ 
  hasActiveIPS = true, 
  performanceData = mockPerformanceData 
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

  if (!hasActiveIPS) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Target className="h-4 w-4" />
            IPS Performance
          </CardTitle>
        </CardHeader>
        <CardContent className="text-center py-6">
          <div className="flex flex-col items-center gap-3">
            <div className="rounded-full bg-gray-100 p-3">
              <Target className="h-6 w-6 text-gray-400" />
            </div>
            <div>
              <p className="text-sm font-medium text-gray-900 mb-1">No Active IPS</p>
              <p className="text-xs text-gray-500 mb-3">Create an IPS to track performance</p>
              <Button asChild variant="outline" size="sm">
                <Link href="/ips">Create IPS</Link>
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Target className="h-4 w-4" />
          IPS Performance
        </CardTitle>
        <Badge variant="outline" className="text-xs">
          {performanceData.ipsName}
        </Badge>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {/* Overall Performance */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs text-gray-600">Total Trades</span>
              <span className="text-sm font-semibold">{performanceData.totalClosedTrades}</span>
            </div>
            
            <div className="flex items-center justify-between">
              <span className="text-xs text-gray-600">Win Rate</span>
              <span className={`text-sm font-semibold ${performanceData.winRate >= 70 ? 'text-green-600' : performanceData.winRate >= 50 ? 'text-yellow-600' : 'text-red-600'}`}>
                {performanceData.winRate.toFixed(1)}%
              </span>
            </div>
            
            <div className="flex items-center justify-between">
              <span className="text-xs text-gray-600">Total P&L</span>
              <span className={`text-sm font-semibold ${performanceData.totalPL >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {formatPL(performanceData.totalPL)}
              </span>
            </div>
            
            <div className="flex items-center justify-between">
              <span className="text-xs text-gray-600">Avg ROI</span>
              <span className={`text-sm font-semibold ${performanceData.avgROI >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {performanceData.avgROI > 0 ? '+' : ''}{performanceData.avgROI.toFixed(1)}%
              </span>
            </div>
          </div>

          <div className="border-t pt-3">
            <p className="text-xs font-medium text-gray-700 mb-2">IPS Score Analysis</p>
            
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-600">Avg IPS Score</span>
                <span className="text-sm font-semibold">{performanceData.avgIPSScore}/100</span>
              </div>
              
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-600">High IPS Win Rate</span>
                <span className="text-xs text-green-600 font-semibold">
                  {performanceData.highIPSWinRate.toFixed(1)}%
                </span>
              </div>
              <p className="text-xs text-gray-500">IPS Score &gt; 75</p>
              
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-600">Low IPS Win Rate</span>
                <span className="text-xs text-red-600 font-semibold">
                  {performanceData.lowIPSWinRate.toFixed(1)}%
                </span>
              </div>
              <p className="text-xs text-gray-500">IPS Score &lt; 60</p>
            </div>
          </div>

          <div className="border-t pt-3">
            <p className="text-xs font-medium text-gray-700 mb-2">Trade Range</p>
            
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-600">Best Trade</span>
                <span className="text-xs font-semibold text-green-600">
                  {formatCurrency(performanceData.bestTrade)}
                </span>
              </div>
              
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-600">Worst Trade</span>
                <span className="text-xs font-semibold text-red-600">
                  {formatCurrency(Math.abs(performanceData.worstTrade))}
                </span>
              </div>
            </div>
          </div>

          <div className="pt-2">
            <Button asChild variant="outline" size="sm" className="w-full">
              <Link href="/ips">
                <BarChart3 className="h-3 w-3 mr-2" />
                View Full Analysis
              </Link>
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}