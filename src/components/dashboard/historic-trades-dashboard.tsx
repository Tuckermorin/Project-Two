// src/components/dashboard/historic-trades-dashboard.tsx

"use client"

import React, { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import { ArrowUpDown, ArrowUp, ArrowDown, ChevronDown, Filter, Eye, EyeOff, Calendar, Settings2, AlertCircle, History, TrendingUp, FileText } from 'lucide-react'

// Historic trade data type
interface HistoricTrade {
  id: string
  name: string
  placed: string
  closedDate: string
  closedPrice: number
  contractType: string
  contracts: number
  shortStrike: number
  longStrike: number
  creditReceived: number
  premiumAtClose: number
  actualPL: number
  actualPLPercent: number
  maxGain: number
  maxLoss: number
  deltaShortLeg: number
  deltaAtClose: number
  theta: number
  thetaAtClose: number
  vega: number
  vegaAtClose: number
  gamma: number
  gammaAtClose: number
  rho: number
  rhoAtClose: number
  ivAtEntry: number
  ivAtClose: number
  sector: string
  closingReason: string
  ipsScore?: number
  ipsAtClose?: number
  notes?: string
  lessons?: string
  [key: string]: any // For dynamic IPS factor columns
}

// Column definition
interface Column {
  key: string
  label: string
}

// All available columns for historic trades
const allHistoricColumns: Column[] = [
  { key: 'name', label: 'Name' },
  { key: 'placed', label: 'Date Placed' },
  { key: 'closedDate', label: 'Date Closed' },
  { key: 'closedPrice', label: 'Closed Price' },
  { key: 'contractType', label: 'Contract Type' },
  { key: 'contracts', label: '# of Contracts' },
  { key: 'shortStrike', label: 'Short Strike' },
  { key: 'longStrike', label: 'Long Strike' },
  { key: 'creditReceived', label: 'Credit Received' },
  { key: 'premiumAtClose', label: 'Premium at Close' },
  { key: 'actualPL', label: 'Actual P/L ($)' },
  { key: 'actualPLPercent', label: 'Actual P/L (%)' },
  { key: 'maxGain', label: 'Max Gain' },
  { key: 'maxLoss', label: 'Max Loss' },
  { key: 'deltaShortLeg', label: 'Delta at Entry' },
  { key: 'deltaAtClose', label: 'Delta at Close' },
  { key: 'theta', label: 'Theta at Entry' },
  { key: 'thetaAtClose', label: 'Theta at Close' },
  { key: 'vega', label: 'Vega at Entry' },
  { key: 'vegaAtClose', label: 'Vega at Close' },
  { key: 'gamma', label: 'Gamma at Entry' },
  { key: 'gammaAtClose', label: 'Gamma at Close' },
  { key: 'rho', label: 'Rho at Entry' },
  { key: 'rhoAtClose', label: 'Rho at Close' },
  { key: 'ivAtEntry', label: 'IV at Entry' },
  { key: 'ivAtClose', label: 'IV at Close' },
  { key: 'sector', label: 'Sector' },
  { key: 'closingReason', label: 'Closing Reason' },
  { key: 'ipsScore', label: 'IPS Score' },
  { key: 'ipsAtClose', label: 'IPS at Close' },
  { key: 'notes', label: 'Notes' },
  { key: 'lessons', label: 'Lessons' }
]

// Default visible columns for historic trades
const defaultHistoricColumns = [
  'name', 'placed', 'closedDate', 'closedPrice', 'contractType', 
  'shortStrike', 'longStrike', 'creditReceived', 'premiumAtClose',
  'actualPL', 'actualPLPercent', 'deltaShortLeg', 'deltaAtClose',
  'theta', 'thetaAtClose', 'closingReason', 'ipsScore'
]

// Simple view for historic trades  
const simpleHistoricColumns = ['name', 'closedDate', 'contractType', 'actualPL', 'actualPLPercent', 'closingReason', 'ipsScore']

export default function HistoricTradesDashboard() {
  // State
  const [viewMode, setViewMode] = useState<'simple' | 'detailed'>('simple')
  const [showIPS, setShowIPS] = useState(false)
  const [visibleColumns, setVisibleColumns] = useState(new Set(defaultHistoricColumns))
  const [sortConfig, setSortConfig] = useState<{key: string, direction: 'asc' | 'desc'} | null>(null)
  const [filterText, setFilterText] = useState('')
  const [reasonFilter, setReasonFilter] = useState<string>('')
  
  // TODO: Replace with actual data from your state management or API
  const trades: HistoricTrade[] = []
  const hasActiveIPS = false
  const activeIPSFactors: string[] = []

  // Calculate summary statistics
  const stats = React.useMemo(() => {
    if (trades.length === 0) {
      return {
        totalTrades: 0,
        winRate: 0,
        totalPL: 0,
        avgWin: 0,
        avgLoss: 0,
        profitFactor: 0
      }
    }

    const wins = trades.filter(t => t.actualPL > 0)
    const losses = trades.filter(t => t.actualPL < 0)
    const totalWins = wins.reduce((sum, t) => sum + t.actualPL, 0)
    const totalLosses = Math.abs(losses.reduce((sum, t) => sum + t.actualPL, 0))

    return {
      totalTrades: trades.length,
      winRate: (wins.length / trades.length) * 100,
      totalPL: trades.reduce((sum, t) => sum + t.actualPL, 0),
      avgWin: wins.length > 0 ? totalWins / wins.length : 0,
      avgLoss: losses.length > 0 ? totalLosses / losses.length : 0,
      profitFactor: totalLosses > 0 ? totalWins / totalLosses : totalWins > 0 ? Infinity : 0
    }
  }, [trades])

  // Process trades (filter and sort)
  const processedTrades = React.useMemo(() => {
    let filtered = [...trades]
    
    // Apply filters
    if (filterText) {
      filtered = filtered.filter(trade => 
        trade.name.toLowerCase().includes(filterText.toLowerCase()) ||
        trade.sector?.toLowerCase().includes(filterText.toLowerCase())
      )
    }
    
    if (reasonFilter) {
      filtered = filtered.filter(trade => trade.closingReason === reasonFilter)
    }
    
    // Apply sorting
    if (sortConfig) {
      filtered.sort((a, b) => {
        const aValue = a[sortConfig.key]
        const bValue = b[sortConfig.key]
        
        if (aValue < bValue) return sortConfig.direction === 'asc' ? -1 : 1
        if (aValue > bValue) return sortConfig.direction === 'asc' ? 1 : -1
        return 0
      })
    }
    
    return filtered
  }, [trades, filterText, reasonFilter, sortConfig])

  // Get unique closing reasons for filter
  const closingReasons = React.useMemo(() => {
    const reasons = new Set(trades.map(t => t.closingReason).filter(Boolean))
    return Array.from(reasons)
  }, [trades])

  // Handle sort
  const handleSort = (key: string) => {
    setSortConfig(current => {
      if (current?.key === key) {
        if (current.direction === 'asc') return { key, direction: 'desc' }
        if (current.direction === 'desc') return null
      }
      return { key, direction: 'asc' }
    })
  }

  // Get sort icon
  const getSortIcon = (key: string) => {
    if (sortConfig?.key !== key) return <ArrowUpDown className="h-3 w-3 ml-1 opacity-50" />
    if (sortConfig.direction === 'asc') return <ArrowUp className="h-3 w-3 ml-1" />
    return <ArrowDown className="h-3 w-3 ml-1" />
  }

  // Format value for display
  const formatValue = (value: any, column: Column) => {
    if (value === null || value === undefined) return '-'
    
    switch(column.key) {
      case 'creditReceived':
      case 'premiumAtClose':
      case 'actualPL':
      case 'maxGain':
      case 'maxLoss':
      case 'closedPrice':
        return `$${Math.abs(value).toFixed(2)}`
      case 'actualPLPercent':
      case 'ivAtEntry':
      case 'ivAtClose':
        return `${value.toFixed(1)}%`
      case 'deltaShortLeg':
      case 'deltaAtClose':
      case 'theta':
      case 'thetaAtClose':
      case 'vega':
      case 'vegaAtClose':
      case 'gamma':
      case 'gammaAtClose':
      case 'rho':
      case 'rhoAtClose':
        return value.toFixed(3)
      case 'ipsScore':
      case 'ipsAtClose':
        return value ? `${value}/100` : '-'
      default:
        return value
    }
  }

  // Get columns to show based on view mode and IPS
  const columnsToShow = React.useMemo(() => {
    if (showIPS && hasActiveIPS) {
      // Show IPS factor columns instead of trade columns
      return activeIPSFactors.map(factor => ({
        key: factor.toLowerCase().replace(/\s+/g, ''),
        label: factor
      }))
    }
    
    const baseColumns = viewMode === 'simple' ? simpleHistoricColumns : Array.from(visibleColumns)
    return allHistoricColumns.filter(col => baseColumns.includes(col.key))
  }, [viewMode, showIPS, hasActiveIPS, activeIPSFactors, visibleColumns])

  // Empty state
  if (trades.length === 0) {
    return (
      <Card className="w-full">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Trade History</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-12">
            <History className="h-12 w-12 mx-auto mb-4 text-gray-400" />
            <h3 className="text-lg font-semibold mb-2">No Trade History</h3>
            <p className="text-gray-600 mb-4">Your closed trades will appear here once you complete them.</p>
            <p className="text-sm text-gray-500">Start by adding active trades and closing them to build your history.</p>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="w-full">
      <CardHeader>
        <div className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Trade History</CardTitle>
            <p className="text-sm text-gray-600 mt-1">
              {processedTrades.length} closed {processedTrades.length === 1 ? 'trade' : 'trades'}
            </p>
          </div>
          
          <div className="flex gap-2">
            {/* View mode toggle */}
            <Select value={viewMode} onValueChange={(value: 'simple' | 'detailed') => setViewMode(value)}>
              <SelectTrigger className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="simple">Simple</SelectItem>
                <SelectItem value="detailed">Detailed</SelectItem>
              </SelectContent>
            </Select>
            
            {/* IPS toggle */}
            <Button
              variant={showIPS ? "default" : "outline"}
              size="sm"
              onClick={() => setShowIPS(!showIPS)}
              disabled={!hasActiveIPS}
            >
              {showIPS ? <EyeOff className="h-4 w-4 mr-2" /> : <Eye className="h-4 w-4 mr-2" />}
              IPS View
            </Button>
            
            {/* Column selector */}
            {viewMode === 'detailed' && !showIPS && (
              <Button variant="outline" size="sm">
                <Settings2 className="h-4 w-4 mr-2" />
                Columns
              </Button>
            )}
          </div>
        </div>

        {/* Summary Statistics */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mt-4">
          <div className="bg-gray-50 p-3 rounded">
            <p className="text-xs text-gray-600">Total Trades</p>
            <p className="text-lg font-semibold">{stats.totalTrades}</p>
          </div>
          <div className="bg-gray-50 p-3 rounded">
            <p className="text-xs text-gray-600">Win Rate</p>
            <p className="text-lg font-semibold">{stats.winRate.toFixed(1)}%</p>
          </div>
          <div className="bg-gray-50 p-3 rounded">
            <p className="text-xs text-gray-600">Total P/L</p>
            <p className={`text-lg font-semibold ${stats.totalPL >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              ${Math.abs(stats.totalPL).toFixed(2)}
            </p>
          </div>
          <div className="bg-gray-50 p-3 rounded">
            <p className="text-xs text-gray-600">Avg Win</p>
            <p className="text-lg font-semibold text-green-600">${stats.avgWin.toFixed(2)}</p>
          </div>
          <div className="bg-gray-50 p-3 rounded">
            <p className="text-xs text-gray-600">Avg Loss</p>
            <p className="text-lg font-semibold text-red-600">${stats.avgLoss.toFixed(2)}</p>
          </div>
          <div className="bg-gray-50 p-3 rounded">
            <p className="text-xs text-gray-600">Profit Factor</p>
            <p className="text-lg font-semibold">
              {stats.profitFactor === Infinity ? '∞' : stats.profitFactor.toFixed(2)}
            </p>
          </div>
        </div>
      </CardHeader>
      
      <CardContent>
        {/* Filters */}
        <div className="flex gap-4 mb-4">
          <Input
            placeholder="Search trades..."
            value={filterText}
            onChange={(e) => setFilterText(e.target.value)}
            className="max-w-sm"
          />
          <Select value={reasonFilter} onValueChange={setReasonFilter}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder="All closing reasons" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">All closing reasons</SelectItem>
              {closingReasons.map(reason => (
                <SelectItem key={reason} value={reason}>{reason}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full border-collapse border border-gray-200 text-sm">
            <thead>
              <tr className="bg-gray-50">
                {columnsToShow.map((column) => (
                  <th 
                    key={column.key}
                    className="border border-gray-200 px-3 py-2 text-left font-medium text-gray-700 cursor-pointer hover:bg-gray-100"
                    onClick={() => handleSort(column.key)}
                  >
                    <div className="flex items-center">
                      {column.label}
                      {getSortIcon(column.key)}
                    </div>
                  </th>
                ))}
                {!showIPS && (
                  <th className="border border-gray-200 px-3 py-2 text-left font-medium text-gray-700">
                    Actions
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {processedTrades.map((trade, index) => (
                <tr 
                  key={trade.id} 
                  className={`hover:bg-gray-50 ${index % 2 === 0 ? 'bg-white' : 'bg-gray-25'}`}
                >
                  {columnsToShow.map((column) => {
                    const cellValue = trade[column.key]
                    return (
                      <td 
                        key={column.key}
                        className={`border border-gray-200 px-3 py-2 ${
                          column.key === 'actualPL'
                            ? trade.actualPL >= 0 ? 'text-green-600 font-semibold' : 'text-red-600 font-semibold'
                            : column.key === 'actualPLPercent'
                            ? trade.actualPLPercent >= 0 ? 'text-green-600 font-semibold' : 'text-red-600 font-semibold'
                            : ''
                        }`}
                      >
                        {formatValue(cellValue, column)}
                      </td>
                    )
                  })}
                  {!showIPS && (
                    <td className="border border-gray-200 px-3 py-2">
                      <div className="flex gap-1">
                        <Button variant="outline" size="sm" className="h-6 px-2 text-xs">
                          View Details
                        </Button>
                        <Button variant="outline" size="sm" className="h-6 px-2 text-xs">
                          Add Lesson
                        </Button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Action Buttons */}
        <div className="flex justify-between items-center mt-6 pt-4 border-t">
          <div className="flex gap-2">
            <Button variant="outline" size="sm">
              <Filter className="h-4 w-4 mr-2" />
              Advanced Filters
            </Button>
            <Button variant="outline" size="sm">
              Export Analysis
            </Button>
            <Button variant="outline" size="sm">
              Generate Report
            </Button>
          </div>
          
          <Button variant="outline">
            <Calendar className="h-4 w-4 mr-2" />
            Close Trade Manually
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}