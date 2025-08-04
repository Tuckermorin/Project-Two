// src/components/dashboard/historic-trades-dashboard.tsx

"use client"

import React, { useState, useMemo } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import { 
  History, 
  Settings, 
  List, 
  Grid, 
  ChevronDown,
  Filter,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  X,
  CheckCircle,
  XCircle,
  Calendar
} from 'lucide-react'

interface HistoricTrade {
  id: string
  name: string
  placed: string
  closedDate: string
  closedPrice: number
  expDate: string
  contractType: string
  contracts: number
  shortStrike: number
  longStrike: number
  creditReceived: number
  spreadWidth: number
  maxGain: number
  maxLoss: number
  deltaShortLeg: number
  theta: number
  vega: number
  gamma: number
  rho: number
  ivAtEntry: number
  ivAtClose: number
  // Greeks at close for comparison
  deltaAtClose: number
  thetaAtClose: number
  vegaAtClose: number
  gammaAtClose: number
  rhoAtClose: number
  sector: string
  closingReason: 'expired-profit' | 'expired-loss' | 'manual-profit' | 'manual-loss' | 'rolled'
  actualPL: number
  actualPLPercent: number
  ipsScore: number
  ipsAtClose: number
  symbol: string
  premiumAtClose: number
  notes?: string
  lessons?: string
}

// Sample historic trades data
const sampleHistoricTrades: HistoricTrade[] = [
  {
    id: '1',
    name: 'MICROSOFT CORPORATION (XNAS:MSFT)',
    placed: '7/28/2025',
    closedDate: '8/1/2025',
    closedPrice: 545.20,
    expDate: '1-Aug',
    contractType: 'Put Credit Spread',
    contracts: 5,
    shortStrike: 502.5,
    longStrike: 497.5,
    creditReceived: 1.52,
    spreadWidth: 5,
    maxGain: 760.00,
    maxLoss: 1740.00,
    deltaShortLeg: -0.15,
    theta: 0.12,
    vega: 0.08,
    gamma: 0.005,
    rho: -0.03,
    ivAtEntry: 28.5,
    ivAtClose: 12.3,
    deltaAtClose: -0.02,
    thetaAtClose: 0.01,
    vegaAtClose: 0.01,
    gammaAtClose: 0.001,
    rhoAtClose: -0.01,
    sector: 'Technology',
    closingReason: 'expired-profit',
    actualPL: 760.00,
    actualPLPercent: 100.0,
    ipsScore: 85,
    ipsAtClose: 88,
    symbol: 'MSFT',
    premiumAtClose: 0.01,
    notes: 'Expired worthless, kept full credit',
    lessons: 'High IPS score led to successful trade'
  },
  {
    id: '2',
    name: 'NETFLIX INC. (XNAS:NFLX)',
    placed: '7/15/2025',
    closedDate: '7/25/2025',
    closedPrice: 380.45,
    expDate: '8-Aug',
    contractType: 'Put Credit Spread',
    contracts: 3,
    shortStrike: 390,
    longStrike: 385,
    creditReceived: 1.85,
    spreadWidth: 5,
    maxGain: 555.00,
    maxLoss: 945.00,
    deltaShortLeg: -0.30,
    theta: 0.15,
    vega: 0.11,
    gamma: 0.008,
    rho: -0.05,
    ivAtEntry: 42.1,
    ivAtClose: 38.7,
    deltaAtClose: -0.20,
    thetaAtClose: 0.10,
    vegaAtClose: 0.08,
    gammaAtClose: 0.006,
    rhoAtClose: -0.04,
    sector: 'Technology',
    closingReason: 'manual-profit',
    actualPL: 333.00,
    actualPLPercent: 60.0,
    ipsScore: 72,
    ipsAtClose: 75,
    symbol: 'NFLX',
    premiumAtClose: 0.74,
    notes: 'Closed early at 60% profit target',
    lessons: 'Good timing on profit taking'
  },
  {
    id: '3',
    name: 'TESLA INC. (XNAS:TSLA)',
    placed: '7/10/2025',
    closedDate: '7/22/2025',
    closedPrice: 195.30,
    expDate: '25-Aug',
    contractType: 'Put Credit Spread',
    contracts: 4,
    shortStrike: 200,
    longStrike: 195,
    creditReceived: 1.20,
    spreadWidth: 5,
    maxGain: 480.00,
    maxLoss: 1520.00,
    deltaShortLeg: -0.45,
    theta: 0.18,
    vega: 0.14,
    gamma: 0.012,
    rho: -0.08,
    ivAtEntry: 55.8,
    ivAtClose: 68.2,
    deltaAtClose: -0.75,
    thetaAtClose: 0.05,
    vegaAtClose: 0.18,
    gammaAtClose: 0.015,
    rhoAtClose: -0.12,
    sector: 'Consumer Discretionary',
    closingReason: 'manual-loss',
    actualPL: -920.00,
    actualPLPercent: -191.7,
    ipsScore: 48,
    ipsAtClose: 45,
    symbol: 'TSLA',
    premiumAtClose: 3.50,
    notes: 'Hit stop loss at 50% of max loss',
    lessons: 'Low IPS score was accurate predictor of poor performance'
  }
]

// Historic trades columns (similar to current but with closing data)
const historicColumns = [
  { key: 'name', label: 'Name' },
  { key: 'placed', label: 'Placed' },
  { key: 'closedDate', label: 'Closed Date' },
  { key: 'closedPrice', label: 'Price at Close' },
  { key: 'expDate', label: 'Exp. Date' },
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
  const [viewMode, setViewMode] = useState<'simple' | 'detailed'>('simple')
  const [showIPS, setShowIPS] = useState(false)
  const [visibleColumns, setVisibleColumns] = useState(new Set(defaultHistoricColumns))
  const [sortConfig, setSortConfig] = useState<{key: string, direction: 'asc' | 'desc'} | null>(null)
  const [filterText, setFilterText] = useState('')
  const [reasonFilter, setReasonFilter] = useState<string>('')
  
  const hasActiveIPS = true
  const activeIPSFactors = ['Revenue', 'P/E Ratio', 'Revenue Growth', 'Debt/Equity', 'Leadership Track Record']

  const trades = sampleHistoricTrades

  // Get columns to display
  const columnsToShow = useMemo(() => {
    if (showIPS) {
      if (!hasActiveIPS) return []
      return activeIPSFactors.map(factor => ({ key: factor.toLowerCase().replace(/[^a-z0-9]/g, ''), label: factor }))
    }
    if (viewMode === 'simple') return historicColumns.filter(col => simpleHistoricColumns.includes(col.key))
    return historicColumns.filter(col => visibleColumns.has(col.key))
  }, [viewMode, showIPS, visibleColumns, hasActiveIPS])

  // Filtered and sorted trades
  const processedTrades = useMemo(() => {
    let filtered = trades

    if (filterText) {
      filtered = filtered.filter(trade => 
        trade.name.toLowerCase().includes(filterText.toLowerCase()) ||
        trade.symbol.toLowerCase().includes(filterText.toLowerCase()) ||
        trade.sector.toLowerCase().includes(filterText.toLowerCase())
      )
    }

    if (reasonFilter) {
      filtered = filtered.filter(trade => trade.closingReason === reasonFilter)
    }

    if (sortConfig) {
      filtered.sort((a, b) => {
        const aVal = a[sortConfig.key as keyof HistoricTrade]
        const bVal = b[sortConfig.key as keyof HistoricTrade]
        
        if (typeof aVal === 'number' && typeof bVal === 'number') {
          return sortConfig.direction === 'asc' ? aVal - bVal : bVal - aVal
        }
        
        const aStr = String(aVal).toLowerCase()
        const bStr = String(bVal).toLowerCase()
        if (sortConfig.direction === 'asc') {
          return aStr < bStr ? -1 : aStr > bStr ? 1 : 0
        } else {
          return aStr > bStr ? -1 : aStr < bStr ? 1 : 0
        }
      })
    }

    return filtered
  }, [trades, filterText, reasonFilter, sortConfig])

  const handleSort = (columnKey: string) => {
    setSortConfig(prev => {
      if (prev?.key === columnKey) {
        if (prev.direction === 'asc') return { key: columnKey, direction: 'desc' }
        if (prev.direction === 'desc') return null
      }
      return { key: columnKey, direction: 'asc' }
    })
  }

  const getClosingReasonColor = (reason: string) => {
    switch (reason) {
      case 'expired-profit':
      case 'manual-profit': return 'bg-green-100 text-green-800'
      case 'expired-loss':
      case 'manual-loss': return 'bg-red-100 text-red-800'
      case 'rolled': return 'bg-blue-100 text-blue-800'
      default: return 'bg-gray-100 text-gray-800'
    }
  }

  const formatCurrency = (amount: number) => `$${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

  const formatValue = (value: any, column: any) => {
    if (value === undefined || value === null) return '--'
    
    switch (column.key) {
      case 'closedPrice':
      case 'shortStrike':
      case 'longStrike':
        return formatCurrency(value)
      case 'creditReceived':
      case 'premiumAtClose':
        return `${value.toFixed(2)}`
      case 'actualPL':
      case 'maxGain':
      case 'maxLoss':
        return formatCurrency(value)
      case 'actualPLPercent':
        return `${value > 0 ? '+' : ''}${value.toFixed(1)}%`
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
      case 'ivAtEntry':
      case 'ivAtClose':
        return `${value.toFixed(1)}%`
      case 'closingReason':
        const reasonText = value.replace(/-/g, ' ').replace(/\b\w/g, (l: string) => l.toUpperCase())
        return (
          <Badge className={getClosingReasonColor(value)}>
            {reasonText}
          </Badge>
        )
      case 'ipsScore':
      case 'ipsAtClose':
        return `${value}/100`
      default:
        return value
    }
  }

  const handleColumnToggle = (columnKey: string) => {
    const newVisible = new Set(visibleColumns)
    if (newVisible.has(columnKey)) {
      newVisible.delete(columnKey)
    } else {
      newVisible.add(columnKey)
    }
    setVisibleColumns(newVisible)
  }

  const getSortIcon = (columnKey: string) => {
    if (sortConfig?.key !== columnKey) return <ArrowUpDown className="h-3 w-3 ml-1 opacity-50" />
    return sortConfig.direction === 'asc' ? <ArrowUp className="h-3 w-3 ml-1" /> : <ArrowDown className="h-3 w-3 ml-1" />
  }

  if (trades.length === 0) {
    return (
      <Card className="col-span-full">
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <History className="h-5 w-5" />
              Historic Trades
            </div>
            <Badge variant="outline">0 Closed</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="text-center py-12">
          <div className="flex flex-col items-center gap-4">
            <div className="rounded-full bg-gray-100 p-4">
              <History className="h-8 w-8 text-gray-400" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">No Historic Trades</h3>
              <p className="text-gray-600">Completed trades will appear here for analysis and learning.</p>
            </div>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="col-span-full">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <History className="h-5 w-5" />
            Historic Trades
            <Badge variant="default">{trades.length} Closed</Badge>
          </CardTitle>
          
          <div className="flex items-center gap-2">
            {/* View Mode Toggle */}
            <div className="flex border rounded-lg p-1">
              <Button
                variant={viewMode === 'simple' ? 'default' : 'ghost'}
                size="sm"
                onClick={() => setViewMode('simple')}
                className="h-7"
              >
                <Grid className="h-3 w-3 mr-1" />
                Simple
              </Button>
              <Button
                variant={viewMode === 'detailed' ? 'default' : 'ghost'}
                size="sm" 
                onClick={() => setViewMode('detailed')}
                className="h-7"
              >
                <List className="h-3 w-3 mr-1" />
                Detailed
              </Button>
            </div>

            {/* IPS View Toggle */}
            {hasActiveIPS ? (
              <Button
                variant={showIPS ? 'default' : 'outline'}
                size="sm"
                onClick={() => setShowIPS(!showIPS)}
                className="h-7"
              >
                IPS View
              </Button>
            ) : (
              <Button variant="outline" size="sm" className="h-7">
                Select or Create IPS
              </Button>
            )}

            {/* Column Selector */}
            {viewMode === 'detailed' && !showIPS && (
              <div className="relative">
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="h-7"
                  onClick={() => {
                    const modal = document.getElementById('historic-column-modal')
                    if (modal) modal.style.display = modal.style.display === 'block' ? 'none' : 'block'
                  }}
                >
                  <Settings className="h-3 w-3 mr-1" />
                  Columns ({visibleColumns.size})
                  <ChevronDown className="h-3 w-3 ml-1" />
                </Button>
                
                <div 
                  id="historic-column-modal"
                  className="absolute right-0 top-8 w-64 bg-white border rounded-lg shadow-lg z-50 p-4 max-h-64 overflow-y-auto hidden"
                  onClick={(e: React.MouseEvent) => e.stopPropagation()}
                >
                  <p className="text-sm font-medium mb-3">Visible Columns</p>
                  <div className="space-y-2">
                    {historicColumns.map((column) => (
                      <div key={column.key} className="flex items-center space-x-2">
                        <Checkbox
                          id={column.key}
                          checked={visibleColumns.has(column.key)}
                          onCheckedChange={() => handleColumnToggle(column.key)}
                        />
                        <label htmlFor={column.key} className="text-sm">
                          {column.label}
                        </label>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-4 mt-4">
          <div className="flex-1 max-w-sm">
            <Input
              placeholder="Filter by symbol, name, or sector..."
              value={filterText}
              onChange={(e) => setFilterText(e.target.value)}
              className="h-8"
            />
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant={reasonFilter === 'expired-profit' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setReasonFilter(reasonFilter === 'expired-profit' ? '' : 'expired-profit')}
              className="h-8"
            >
              Expired (Profit)
            </Button>
            <Button
              variant={reasonFilter === 'manual-profit' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setReasonFilter(reasonFilter === 'manual-profit' ? '' : 'manual-profit')}
              className="h-8"
            >
              Closed (Profit)
            </Button>
            <Button
              variant={reasonFilter === 'manual-loss' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setReasonFilter(reasonFilter === 'manual-loss' ? '' : 'manual-loss')}
              className="h-8"
            >
              Closed (Loss)
            </Button>
            {(filterText || reasonFilter) && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setFilterText('')
                  setReasonFilter('')
                }}
                className="h-8"
              >
                <X className="h-3 w-3" />
              </Button>
            )}
          </div>
        </div>
      </CardHeader>
      
      <CardContent>
        {/* Historic Summary Stats */}
        <div className="mb-6 p-4 bg-blue-50 rounded-lg">
          <div className="grid grid-cols-2 md:grid-cols-6 gap-4 text-sm">
            <div>
              <p className="text-gray-600">Total Closed</p>
              <p className="font-bold text-lg">{processedTrades.length}</p>
            </div>
            <div>
              <p className="text-gray-600">Win Rate</p>
              <p className="font-bold text-lg text-green-600">
                {((processedTrades.filter(t => t.actualPL > 0).length / processedTrades.length) * 100).toFixed(1)}%
              </p>
            </div>
            <div>
              <p className="text-gray-600">Total P&L</p>
              <p className={`font-bold text-lg ${processedTrades.reduce((sum, t) => sum + t.actualPL, 0) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {formatCurrency(processedTrades.reduce((sum, t) => sum + t.actualPL, 0))}
              </p>
            </div>
            <div>
              <p className="text-gray-600">Avg ROI</p>
              <p className="font-bold text-lg">
                {(processedTrades.reduce((sum, t) => sum + t.actualPLPercent, 0) / processedTrades.length).toFixed(1)}%
              </p>
            </div>
            <div>
              <p className="text-gray-600">Best Trade</p>
              <p className="font-bold text-lg text-green-600">
                {formatCurrency(Math.max(...processedTrades.map(t => t.actualPL)))}
              </p>
            </div>
            <div>
              <p className="text-gray-600">Worst Trade</p>
              <p className="font-bold text-lg text-red-600">
                {formatCurrency(Math.min(...processedTrades.map(t => t.actualPL)))}
              </p>
            </div>
          </div>
        </div>

        {/* IPS Selection Prompt */}
        {showIPS && !hasActiveIPS && (
          <div className="text-center py-12 bg-blue-50 rounded-lg mb-6">
            <h3 className="text-lg font-semibold mb-2">No Active IPS</h3>
            <p className="text-gray-600 mb-4">Select or create an Investment Policy Statement to view IPS analysis.</p>
            <div className="flex gap-2 justify-center">
              <Button variant="outline">Select Existing IPS</Button>
              <Button>Create New IPS</Button>
            </div>
          </div>
        )}

        {/* Historic Trades Table */}
        {(!showIPS || hasActiveIPS) && (
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
                      let cellValue = trade[column.key as keyof HistoricTrade]
                      
                      // For IPS view, show mock IPS scores
                      if (showIPS) {
                        const mockValues: Record<string, number> = {
                          'revenue': 85,
                          'peratio': 72,
                          'revenuegrowth': 68,
                          'debtequity': 91,
                          'leadershiptrackrecord': 78
                        }
                        cellValue = mockValues[column.key] || Math.floor(Math.random() * 40) + 60
                      }
                      
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
                          {showIPS && typeof cellValue === 'number' ? `${cellValue}/100` : formatValue(cellValue, column)}
                        </td>
                      )
                    })}
                    
                    {/* Actions column */}
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
        )}

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