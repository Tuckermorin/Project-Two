// src/components/dashboard/excel-style-trades-dashboard.tsx

"use client"

import React, { useState, useMemo, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { 
  TrendingUp, 
  TrendingDown, 
  Settings, 
  List, 
  Grid, 
  Plus,
  ChevronDown,
  Filter,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  X
} from 'lucide-react'
import { Checkbox } from '@/components/ui/checkbox'

interface Trade {
  id: string
  name: string
  placed: string
  currentPrice: number
  expDate: string
  dte: number
  contractType: string
  contracts: number
  shortStrike: number
  longStrike: number
  creditReceived: number
  spreadWidth: number
  maxGain: number
  maxLoss: number
  percentCurrentToShort: number
  deltaShortLeg: number
  theta: number
  vega: number
  ivAtEntry: number
  sector: string
  status: 'good' | 'watch' | 'exit-profit' | 'exit-loss'
  dateClosed?: string
  costToClose?: number
  percentOfCredit?: number
  creditPaid?: number
  plDollar?: number
  plPercent?: number
  notes?: string
  ipsScore: number
  symbol: string
}

// Sample data with all your requested columns
const sampleTrades: Trade[] = [
  {
    id: '1',
    name: 'MICROSOFT CORPORATION (XNAS:MSFT)',
    placed: '7/28/2025',
    currentPrice: 535.64,
    expDate: '1-Aug',
    dte: -3,
    contractType: 'Put Credit Spread',
    contracts: 5,
    shortStrike: 502.5,
    longStrike: 497.5,
    creditReceived: 1.52,
    spreadWidth: 5,
    maxGain: 760.00,
    maxLoss: 1740.00,
    percentCurrentToShort: 6.60,
    deltaShortLeg: -0.15,
    theta: 0.12,
    vega: 0.08,
    ivAtEntry: 28.5,
    sector: 'Technology',
    status: 'good',
    ipsScore: 85,
    symbol: 'MSFT',
    plDollar: 320.00,
    plPercent: 42.1
  },
  {
    id: '2', 
    name: 'APPLE INC. (XNAS:AAPL)',
    placed: '7/28/2025',
    currentPrice: 203.35,
    expDate: '8-Aug',
    dte: 4,
    contractType: 'Put Credit Spread',
    contracts: 5,
    shortStrike: 207.5,
    longStrike: 202.5,
    creditReceived: 1.12,
    spreadWidth: 5,
    maxGain: 560.00,
    maxLoss: 1940.00,
    percentCurrentToShort: -2.00,
    deltaShortLeg: -0.45,
    theta: 0.18,
    vega: 0.12,
    ivAtEntry: 32.1,
    sector: 'Technology',
    status: 'watch',
    ipsScore: 72,
    symbol: 'AAPL',
    plDollar: -180.00,
    plPercent: -32.1
  },
  {
    id: '3',
    name: 'QORVO, INC. (XNYS:QRVO)',
    placed: '7/25/2025', 
    currentPrice: 17.14,
    expDate: '8-Aug',
    dte: 4,
    contractType: 'Put Credit Spread',
    contracts: 5,
    shortStrike: 18,
    longStrike: 16,
    creditReceived: 0.54,
    spreadWidth: 2,
    maxGain: 270.00,
    maxLoss: 730.00,
    percentCurrentToShort: -4.78,
    deltaShortLeg: -0.62,
    theta: 0.22,
    vega: 0.15,
    ivAtEntry: 45.3,
    sector: 'Technology',
    status: 'exit-loss',
    ipsScore: 45,
    symbol: 'QRVO',
    plDollar: -420.00,
    plPercent: -155.6
  },
  {
    id: '4',
    name: 'ADVANCED MICRO DEVICES, INC. (XNAS:AMD)',
    placed: '7/28/2025',
    currentPrice: 176.78,
    expDate: '15-Aug', 
    dte: 11,
    contractType: 'Put Credit Spread',
    contracts: 5,
    shortStrike: 165,
    longStrike: 160,
    creditReceived: 1.60,
    spreadWidth: 5,
    maxGain: 800.00,
    maxLoss: 1700.00,
    percentCurrentToShort: 7.14,
    deltaShortLeg: -0.25,
    theta: 0.09,
    vega: 0.06,
    ivAtEntry: 29.8,
    sector: 'Technology',
    status: 'good',
    ipsScore: 88,
    symbol: 'AMD',
    plDollar: 240.00,
    plPercent: 30.0
  },
  {
    id: '5',
    name: 'PALANTIR TECHNOLOGIES INC. (XNAS:PLTR)',
    placed: '7/29/2025',
    currentPrice: 160.66,
    expDate: '8-Aug',
    dte: 4,
    contractType: 'Put Credit Spread',
    contracts: 5,
    shortStrike: 152.5,
    longStrike: 149,
    creditReceived: 1.30,
    spreadWidth: 3.5,
    maxGain: 650.00,
    maxLoss: 1100.00,
    percentCurrentToShort: 5.35,
    deltaShortLeg: -0.35,
    theta: 0.16,
    vega: 0.11,
    ivAtEntry: 38.7,
    sector: 'Technology',
    status: 'good',
    ipsScore: 78,
    symbol: 'PLTR',
    plDollar: 195.00,
    plPercent: 30.0
  }
]

// All possible columns matching your Excel
const allColumns = [
  { key: 'name', label: 'Name' },
  { key: 'placed', label: 'Placed' },
  { key: 'currentPrice', label: 'Current Price' },
  { key: 'expDate', label: 'Exp. Date' },
  { key: 'dte', label: 'DTE' },
  { key: 'contractType', label: 'Contract Type' },
  { key: 'contracts', label: '# of Contracts' },
  { key: 'shortStrike', label: 'Short Strike' },
  { key: 'longStrike', label: 'Long Strike' },
  { key: 'creditReceived', label: 'Credit Received' },
  { key: 'spreadWidth', label: 'Spread Width' },
  { key: 'maxGain', label: 'Max Gain' },
  { key: 'maxLoss', label: 'Max Loss' },
  { key: 'percentCurrentToShort', label: '% Current to Short' },
  { key: 'deltaShortLeg', label: 'Delta (Short Leg)' },
  { key: 'theta', label: 'Theta' },
  { key: 'vega', label: 'Vega' },
  { key: 'ivAtEntry', label: 'IV at Entry' },
  { key: 'sector', label: 'Sector' },
  { key: 'status', label: 'Status' },
  { key: 'dateClosed', label: 'Date Closed' },
  { key: 'costToClose', label: 'Cost to close' },
  { key: 'percentOfCredit', label: '% of credit' },
  { key: 'creditPaid', label: 'Credit Paid' },
  { key: 'plDollar', label: 'P/L ($)' },
  { key: 'plPercent', label: 'P/L (%)' },
  { key: 'notes', label: 'Notes' }
]

// Default visible columns (your specified list)
const defaultColumns = [
  'name', 'placed', 'currentPrice', 'expDate', 'dte', 'contractType', 
  'contracts', 'shortStrike', 'longStrike', 'creditReceived', 'spreadWidth',
  'maxGain', 'maxLoss', 'percentCurrentToShort', 'deltaShortLeg', 
  'theta', 'vega', 'ivAtEntry', 'sector'
]

// Simple view columns
const simpleColumns = ['name', 'contractType', 'expDate', 'dte', 'maxGain', 'maxLoss', 'percentCurrentToShort', 'status']

export default function ExcelStyleTradesDashboard() {
  const [viewMode, setViewMode] = useState<'simple' | 'detailed'>('simple')
  const [showIPS, setShowIPS] = useState(false)
  const [visibleColumns, setVisibleColumns] = useState(new Set(defaultColumns))
  const [sortConfig, setSortConfig] = useState<{key: string, direction: 'asc' | 'desc'} | null>(null)
  const [filterText, setFilterText] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('')
  
  const hasActiveIPS = true // This would come from your IPS state
  const activeIPSFactors = ['Revenue', 'P/E Ratio', 'Revenue Growth', 'Debt/Equity', 'Leadership Track Record'] // Mock IPS factors

  const trades = sampleTrades

  // Handle click outside to close column modal
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const modal = document.getElementById('column-modal')
      const target = event.target as Node
      if (modal && !modal.contains(target)) {
        modal.style.display = 'none'
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Get columns to display based on view mode and IPS toggle
  const columnsToShow = useMemo(() => {
    if (showIPS) {
      if (!hasActiveIPS) return []
      return activeIPSFactors.map(factor => ({ key: factor.toLowerCase().replace(/[^a-z0-9]/g, ''), label: factor }))
    }
    if (viewMode === 'simple') return allColumns.filter(col => simpleColumns.includes(col.key))
    return allColumns.filter(col => visibleColumns.has(col.key))
  }, [viewMode, showIPS, visibleColumns, hasActiveIPS])

  // Filtered and sorted trades
  const processedTrades = useMemo(() => {
    let filtered = trades

    // Text filter
    if (filterText) {
      filtered = filtered.filter(trade => 
        trade.name.toLowerCase().includes(filterText.toLowerCase()) ||
        trade.symbol.toLowerCase().includes(filterText.toLowerCase()) ||
        trade.sector.toLowerCase().includes(filterText.toLowerCase())
      )
    }

    // Status filter
    if (statusFilter) {
      filtered = filtered.filter(trade => trade.status === statusFilter)
    }

    // Sorting
    if (sortConfig) {
      filtered.sort((a, b) => {
        const aVal = a[sortConfig.key as keyof Trade]
        const bVal = b[sortConfig.key as keyof Trade]
        
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
  }, [trades, filterText, statusFilter, sortConfig])

  const handleSort = (columnKey: string) => {
    setSortConfig(prev => {
      if (prev?.key === columnKey) {
        if (prev.direction === 'asc') return { key: columnKey, direction: 'desc' }
        if (prev.direction === 'desc') return null
      }
      return { key: columnKey, direction: 'asc' }
    })
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'good': return 'bg-green-100 text-green-800'
      case 'watch': return 'bg-yellow-100 text-yellow-800' 
      case 'exit-profit': return 'bg-green-100 text-green-800'
      case 'exit-loss': return 'bg-red-100 text-red-800'
      case 'exit': return 'bg-red-100 text-red-800' // fallback for old data
      default: return 'bg-gray-100 text-gray-800'
    }
  }

  const getMoneyness = (currentPrice: number, shortStrike: number) => {
    const diff = ((currentPrice - shortStrike) / shortStrike) * 100
    if (Math.abs(diff) < 2) return 'ATM'
    return currentPrice > shortStrike ? 'ITM' : 'OTM' 
  }

  const formatCurrency = (amount: number) => `$${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

  const formatValue = (value: any, column: any) => {
    if (value === undefined || value === null) return '--'
    
    switch (column.key) {
      case 'currentPrice':
      case 'shortStrike':
      case 'longStrike':
        return formatCurrency(value)
      case 'creditReceived':
      case 'costToClose':
      case 'creditPaid':
        return `$${value.toFixed(2)}`
      case 'maxGain':
      case 'maxLoss':
      case 'plDollar':
        return formatCurrency(value)
      case 'percentCurrentToShort':
      case 'percentOfCredit':
      case 'plPercent':
        return `${value > 0 ? '+' : ''}${value.toFixed(2)}%`
      case 'deltaShortLeg':
      case 'theta':
      case 'vega':
        return value.toFixed(3)
      case 'ivAtEntry':
        return `${value.toFixed(1)}%`
      case 'status':
        const statusText = value === 'exit-profit' ? 'EXIT' : value === 'exit-loss' ? 'EXIT' : value.toUpperCase()
        return (
          <Badge className={getStatusColor(value)}>
            {statusText}
          </Badge>
        )
      case 'dte':
        return (
          <span className={value < 0 ? 'text-red-600 font-bold' : value <= 7 ? 'text-orange-600' : ''}>
            {value}
          </span>
        )
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
            Current Trades
            <Badge variant="outline">0 Active</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="text-center py-12">
          <div className="flex flex-col items-center gap-4">
            <div className="rounded-full bg-gray-100 p-4">
              <TrendingUp className="h-8 w-8 text-gray-400" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">No Active Trades</h3>
              <p className="text-gray-600 mb-6">Ready to start trading! Create your first position.</p>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                Start Trading
              </Button>
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
            Current Trades
            <Badge variant="default">{trades.length} Active</Badge>
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
              <Button
                variant="outline"
                size="sm"
                className="h-7"
              >
                Select or Create IPS
              </Button>
            )}

            {/* Column Selector (only show in detailed mode and not IPS view) */}
            {viewMode === 'detailed' && !showIPS && (
              <div className="relative">
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="h-7"
                  onClick={() => {
                    const modal = document.getElementById('column-modal')
                    if (modal) modal.style.display = modal.style.display === 'block' ? 'none' : 'block'
                  }}
                >
                  <Settings className="h-3 w-3 mr-1" />
                  Columns ({visibleColumns.size})
                  <ChevronDown className="h-3 w-3 ml-1" />
                </Button>
                
                {/* Column Selection Modal */}
                <div 
                  id="column-modal"
                  className="absolute right-0 top-8 w-64 bg-white border rounded-lg shadow-lg z-50 p-4 max-h-64 overflow-y-auto hidden"
                  onClick={(e: React.MouseEvent) => e.stopPropagation()}
                >
                  <p className="text-sm font-medium mb-3">Visible Columns</p>
                  <div className="space-y-2">
                    {allColumns.map((column) => (
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
              variant={statusFilter === 'good' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setStatusFilter(statusFilter === 'good' ? '' : 'good')}
              className="h-8"
            >
              Good
            </Button>
            <Button
              variant={statusFilter === 'watch' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setStatusFilter(statusFilter === 'watch' ? '' : 'watch')}
              className="h-8"
            >
              Watch
            </Button>
            <Button
              variant={statusFilter === 'exit-profit' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setStatusFilter(statusFilter === 'exit-profit' ? '' : 'exit-profit')}
              className="h-8"
            >
              Exit (Profit)
            </Button>
            <Button
              variant={statusFilter === 'exit-loss' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setStatusFilter(statusFilter === 'exit-loss' ? '' : 'exit-loss')}
              className="h-8"
            >
              Exit (Loss)
            </Button>
            {(filterText || statusFilter) && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setFilterText('')
                  setStatusFilter('')
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
        {/* Summary Stats Row - Moved to Top */}
        <div className="mb-6 p-4 bg-gray-50 rounded-lg">
          <div className="grid grid-cols-2 md:grid-cols-6 gap-4 text-sm">
            <div>
              <p className="text-gray-600">Total Positions</p>
              <p className="font-bold text-lg">{processedTrades.length}</p>
            </div>
            <div>
              <p className="text-gray-600">Total Max Gain</p>
              <p className="font-bold text-lg text-green-600">
                {formatCurrency(processedTrades.reduce((sum, t) => sum + t.maxGain, 0))}
              </p>
            </div>
            <div>
              <p className="text-gray-600">Total P&L</p>
              <p className={`font-bold text-lg ${processedTrades.reduce((sum, t) => sum + (t.plDollar || 0), 0) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {formatCurrency(processedTrades.reduce((sum, t) => sum + (t.plDollar || 0), 0))}
              </p>
            </div>
            <div>
              <p className="text-gray-600">Avg IPS Score</p>
              <p className="font-bold text-lg">
                {(processedTrades.reduce((sum, t) => sum + t.ipsScore, 0) / processedTrades.length).toFixed(0)}/100
              </p>
            </div>
            <div>
              <p className="text-gray-600">Expired/Near Expiry</p>
              <p className="font-bold text-lg text-orange-600">
                {processedTrades.filter(t => t.dte <= 7).length}
              </p>
            </div>
            <div>
              <p className="text-gray-600">At Risk Positions</p>
              <p className="font-bold text-lg text-red-600">
                {processedTrades.filter(t => t.status === 'exit-loss' || t.percentCurrentToShort < -5).length}
              </p>
            </div>
          </div>
        </div>
        {/* IPS Selection Prompt */}
        {showIPS && !hasActiveIPS && (
          <div className="text-center py-12 bg-blue-50 rounded-lg mb-6">
            <h3 className="text-lg font-semibold mb-2">No Active IPS</h3>
            <p className="text-gray-600 mb-4">Select or create an Investment Policy Statement to view IPS scoring columns.</p>
            <div className="flex gap-2 justify-center">
              <Button variant="outline">Select Existing IPS</Button>
              <Button>Create New IPS</Button>
            </div>
          </div>
        )}

        {/* Excel-style table */}
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
                    <>
                      <th className="border border-gray-200 px-3 py-2 text-left font-medium text-gray-700">
                        Actions
                      </th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody>
                {processedTrades.map((trade, index) => {
                  const moneyness = getMoneyness(trade.currentPrice, trade.shortStrike)
                  const isExpired = trade.dte < 0
                  const isNearExpiry = trade.dte <= 7 && trade.dte >= 0
                  
                  return (
                    <tr 
                      key={trade.id} 
                      className={`hover:bg-gray-50 ${isExpired ? 'bg-red-50' : ''} ${index % 2 === 0 ? 'bg-white' : 'bg-gray-25'}`}
                    >
                      {columnsToShow.map((column) => {
                        let cellValue = trade[column.key as keyof Trade]
                        
                        // For IPS view, show mock IPS scores
                        if (showIPS) {
                          // Mock IPS factor values
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
                              column.key === 'percentCurrentToShort' 
                                ? trade.percentCurrentToShort < 0 ? 'text-red-600 font-semibold' : 'text-green-600'
                                : column.key === 'dte' && isExpired
                                ? 'text-red-600 font-bold'
                                : column.key === 'dte' && isNearExpiry  
                                ? 'text-orange-600 font-semibold'
                                : column.key === 'plDollar'
                                ? (trade.plDollar || 0) >= 0 ? 'text-green-600 font-semibold' : 'text-red-600 font-semibold'
                                : column.key === 'plPercent'
                                ? (trade.plPercent || 0) >= 0 ? 'text-green-600 font-semibold' : 'text-red-600 font-semibold'
                                : ''
                            }`}
                          >
                            {showIPS && typeof cellValue === 'number' ? `${cellValue}/100` : formatValue(cellValue, column)}
                          </td>
                        )
                      })}
                      
                      {/* Actions column (removed Moneyness) */}
                      {!showIPS && (
                        <td className="border border-gray-200 px-3 py-2">
                          <div className="flex gap-1">
                            <Button variant="outline" size="sm" className="h-6 px-2 text-xs">
                              View
                            </Button>
                            <Button variant="outline" size="sm" className="h-6 px-2 text-xs">
                              Edit
                            </Button>
                            <Button 
                              variant="outline" 
                              size="sm" 
                              className={`h-6 px-2 text-xs ${
                                trade.status === 'exit-profit' ? 'bg-green-50 text-green-700' : 
                                trade.status === 'exit-loss' ? 'bg-red-50 text-red-700' : 
                                'bg-blue-50 text-blue-700'
                              }`}
                            >
                              Close
                            </Button>
                          </div>
                        </td>
                      )}
                    </tr>
                  )
                })}
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
              Export to Excel
            </Button>
            <Button variant="outline" size="sm">
              Bulk Actions
            </Button>
          </div>
          
          <Button>
            <Plus className="h-4 w-4 mr-2" />
            Add New Trade
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}