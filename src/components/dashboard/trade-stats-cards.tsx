// src/components/dashboard/trade-stats-cards.tsx

"use client"

import React from 'react'
import { Activity, Eye, AlertCircle, DollarSign, TrendingUp, TrendingDown } from 'lucide-react'

interface TradeStatsProps {
  totalActive: number
  tradesGood: number
  tradesOnWatch: number
  tradesExit: number
  totalCurrentPL: number
  totalMaxProfit: number
  totalMaxLoss: number
}

export default function TradeStatsCards({
  totalActive,
  tradesGood,
  tradesOnWatch,
  tradesExit,
  totalCurrentPL,
  totalMaxProfit,
  totalMaxLoss
}: TradeStatsProps) {
  const currencyFormatter = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  })

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4 mb-4">
      {/* Active Trades Card */}
      <div className="bg-white dark:bg-gray-800 border border-slate-200 dark:border-gray-700 rounded-lg p-4">
        <div className="flex items-center gap-2 mb-2">
          <Activity className="h-4 w-4 text-blue-600" />
          <div className="text-xs font-medium text-gray-600 dark:text-gray-400">Active Trades</div>
        </div>
        <div className="text-2xl font-bold text-blue-600">{totalActive}</div>
      </div>

      {/* Good Status Card */}
      <div className="bg-white dark:bg-gray-800 border border-slate-200 dark:border-gray-700 rounded-lg p-4">
        <div className="flex items-center gap-2 mb-2">
          <div className="h-4 w-4 rounded-full bg-green-500" />
          <div className="text-xs font-medium text-gray-600 dark:text-gray-400">Good</div>
        </div>
        <div className="text-2xl font-bold text-green-600">{tradesGood}</div>
      </div>

      {/* Watch Status Card */}
      <div className="bg-white dark:bg-gray-800 border border-slate-200 dark:border-gray-700 rounded-lg p-4">
        <div className="flex items-center gap-2 mb-2">
          <Eye className="h-4 w-4 text-yellow-600" />
          <div className="text-xs font-medium text-gray-600 dark:text-gray-400">Watch</div>
        </div>
        <div className="text-2xl font-bold text-yellow-600">{tradesOnWatch}</div>
      </div>

      {/* Exit Status Card */}
      <div className="bg-white dark:bg-gray-800 border border-slate-200 dark:border-gray-700 rounded-lg p-4">
        <div className="flex items-center gap-2 mb-2">
          <AlertCircle className="h-4 w-4 text-red-600" />
          <div className="text-xs font-medium text-gray-600 dark:text-gray-400">Exit</div>
        </div>
        <div className="text-2xl font-bold text-red-600">{tradesExit}</div>
      </div>

      {/* Current P/L Card */}
      <div className="bg-white dark:bg-gray-800 border border-slate-200 dark:border-gray-700 rounded-lg p-4">
        <div className="flex items-center gap-2 mb-2">
          <DollarSign className="h-4 w-4 text-gray-600 dark:text-gray-400" />
          <div className="text-xs font-medium text-gray-600 dark:text-gray-400">Current P/L</div>
        </div>
        <div className={`text-2xl font-bold ${totalCurrentPL >= 0 ? 'text-green-600' : 'text-red-600'}`}>
          {currencyFormatter.format(totalCurrentPL)}
        </div>
      </div>

      {/* Max Profit Card */}
      <div className="bg-white dark:bg-gray-800 border border-slate-200 dark:border-gray-700 rounded-lg p-4">
        <div className="flex items-center gap-2 mb-2">
          <TrendingUp className="h-4 w-4 text-green-600" />
          <div className="text-xs font-medium text-gray-600 dark:text-gray-400">Max Profit</div>
        </div>
        <div className="text-2xl font-bold text-green-600">
          {currencyFormatter.format(totalMaxProfit)}
        </div>
      </div>

      {/* Max Loss Card */}
      <div className="bg-white dark:bg-gray-800 border border-slate-200 dark:border-gray-700 rounded-lg p-4">
        <div className="flex items-center gap-2 mb-2">
          <TrendingDown className="h-4 w-4 text-red-600" />
          <div className="text-xs font-medium text-gray-600 dark:text-gray-400">Max Loss</div>
        </div>
        <div className="text-2xl font-bold text-red-600">
          {currencyFormatter.format(totalMaxLoss)}
        </div>
      </div>
    </div>
  )
}
