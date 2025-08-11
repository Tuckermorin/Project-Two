// src/components/dashboard/excel-style-trades-dashboard.tsx

"use client"

import React, { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import { ArrowUpDown, ArrowUp, ArrowDown, ChevronDown, Filter, Eye, EyeOff, Calendar, Settings2, AlertCircle } from 'lucide-react'

// Trade data type
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
  status: string
  dateClosed?: string
  costToClose?: number
  percentOfCredit?: number
  creditPaid?: number
  plDollar?: number
  plPercent?: number
  notes?: string
  [key: string]: any // For dynamic IPS factor columns
}

// Column definition
interface Column {
  key: string
  label: string
}

// All available columns
const allColumns: Column[] = [
  { key: 'name', label: 'Name' },
  { key: 'placed', label: 'Date Placed' },
  { key: 'currentPrice', label: 'Current Price' },
  { key: 'expDate', label: 'Exp Date' },
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

// Default visible columns
const defaultColumns = [
  'name', 'placed', 'currentPrice', 'expDate', 'dte', 'contractType', 
  'contracts', 'shortStrike', 'longStrike', 'creditReceived', 'spreadWidth',
  'maxGain', 'maxLoss', 'percentCurrentToShort', 'deltaShortLeg', 
  'theta', 'vega', 'ivAtEntry', 'sector'
]

// Simple view columns
const simpleColumns = ['name', 'contractType', 'expDate', 'dte', 'maxGain', 'maxLoss', 'percentCurrentToShort', 'status']

export default function ExcelStyleTradesDashboard() {
  // State
  const [viewMode, setViewMode] = useState<'simple' | 'detailed'>('simple')
  const [showIPS, setShowIPS] = useState(false)
  const [visibleColumns, setVisibleColumns] = useState(new Set(defaultColumns))
  const [sortConfig, setSortConfig] = useState<{key: string, direction: 'asc' | 'desc'} | null>(null)
  const [filterText, setFilterText] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('')
  
  // TODO: Replace with actual data from your state management or API
  const trades: Trade[] = []
  const hasActiveIPS = false
  const activeIPSFactors: string[] = []

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
    
    if (statusFilter) {
      filtered = filtered.filter(trade => trade.status === statusFilter)
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
  }, [trades, filterText, statusFilter, sortConfig])

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
      case 'costToClose':
      case 'creditPaid':
      case 'plDollar':
      case 'maxGain':
      case 'maxLoss':
        return `$${value.toFixed(2)}`
      case 'percentOfCredit':
      case 'plPercent':
      case 'percentCurrentToShort':
      case 'ivAtEntry':
        return `${value.toFixed(1)}%`
      case 'deltaShortLeg':
      case 'theta':
      case 'vega':
        return value.toFixed(3)
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
    
    const baseColumns = viewMode === 'simple' ? simpleColumns : Array.from(visibleColumns)
    return allColumns.filter(col => baseColumns.includes(col.key))
  }, [viewMode, showIPS, hasActiveIPS, activeIPSFactors, visibleColumns])

  // Empty state
  if (trades.length === 0) {
    return (
      <Card className="w-full">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Current Trades</CardTitle>
          <div className="flex gap-2">
            <Button variant="outline" size="sm">
              <Calendar className="h-4 w-4 mr-2" />
              Add Trade
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="text-center py-12">
            <AlertCircle className="h-12 w-12 mx-auto mb-4 text-gray-400" />
            <h3 className="text-lg font-semibold mb-2">No Active Trades</h3>
            <p className="text-gray-600 mb-4">Start by adding your first paper trade to track.</p>
            <Button>
              Add Your First Trade
            </Button>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="w-full">
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>Current Trades</CardTitle>
          <p className="text-sm text-gray-600 mt-1">
            {processedTrades.length} active {processedTrades.length === 1 ? 'trade' : 'trades'}
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
          
          {/* Add trade button */}
          <Button variant="outline" size="sm">
            <Calendar className="h-4 w-4 mr-2" />
            Add Trade
          </Button>
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
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-40">
              <SelectValue placeholder="All statuses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">All statuses</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="closed">Closed</SelectItem>
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
                        className="border border-gray-200 px-3 py-2"
                      >
                        {formatValue(cellValue, column)}
                      </td>
                    )
                  })}
                  {!showIPS && (
                    <td className="border border-gray-200 px-3 py-2">
                      <div className="flex gap-1">
                        <Button variant="outline" size="sm" className="h-6 px-2 text-xs">
                          Edit
                        </Button>
                        <Button variant="outline" size="sm" className="h-6 px-2 text-xs">
                          Close
                        </Button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  )
}