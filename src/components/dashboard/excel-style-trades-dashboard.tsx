// src/components/dashboard/excel-style-trades-dashboard.tsx

"use client"

import React, { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
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
  ipsScore?: number
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
  { key: 'ipsScore', label: 'IPS Score' },
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
const simpleColumns = ['name', 'contractType', 'expDate', 'dte', 'maxGain', 'maxLoss', 'percentCurrentToShort', 'ipsScore', 'status']

export default function ExcelStyleTradesDashboard() {
  // State
  const [viewMode, setViewMode] = useState<'simple' | 'detailed'>('simple')
  const [showIPS, setShowIPS] = useState(false)
  const [visibleColumns, setVisibleColumns] = useState(new Set(defaultColumns))
  const [sortConfig, setSortConfig] = useState<{key: string, direction: 'asc' | 'desc'} | null>(null)
  const [filterText, setFilterText] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('')
  const [trades, setTrades] = useState<Trade[]>([])
  const [loading, setLoading] = useState<boolean>(false)
  const userId = 'user-123'

  // Close/action-needed dialog state (local UI helper)
  const [closing, setClosing] = useState<{
    open: boolean;
    trade: Trade | null;
    costToClose: string;
    reason: string;
    date: string;
  }>({
    open: false,
    trade: null,
    costToClose: '',
    reason: 'manual close',
    date: new Date().toISOString().slice(0, 10),
  })

  const toTitle = (s: string) => s.replace(/-/g, ' ').replace(/\b\w/g, m => m.toUpperCase())
  const daysToExpiry = (exp: string): number => {
    const d = new Date(exp)
    if (isNaN(d.getTime())) return 0
    const ms = d.setHours(0,0,0,0) - new Date().setHours(0,0,0,0)
    return Math.ceil(ms / (1000*60*60*24))
  }

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true)
        const res = await fetch(`/api/trades?userId=${encodeURIComponent(userId)}&status=active`, { cache: 'no-store' })
        const json = await res.json()
        if (!res.ok) throw new Error(json?.error || 'Failed to load active trades')
        const rows = (json?.data || []) as any[]
        let quoteMap: Record<string, number> = {}
        if (rows.length) {
          const symbols = Array.from(new Set(rows.map((r:any)=>r.symbol))).join(',')
          try {
            const qRes = await fetch(`/api/market-data/quotes?symbols=${encodeURIComponent(symbols)}`)
            const qJson = await qRes.json()
            ;(qJson?.data || []).forEach((q:any)=>{
              const price = Number(q.currentPrice ?? q.last ?? q.close ?? q.price)
              if (!isNaN(price)) quoteMap[q.symbol] = price
            })
          } catch {}
        }
        const normalized: Trade[] = rows.map((r:any) => {
          const current = (quoteMap[r.symbol] ?? Number(r.current_price ?? 0)) || 0
          const short = Number(r.short_strike ?? 0) || 0
          const percentToShort = short > 0 ? ((current - short) / short) * 100 : 0
          const exp = r.expiration_date || ''
          // WATCH only if IPS score < 75 or % to short < 5%
          const ipsScore = typeof r.ips_score === 'number' ? Number(r.ips_score) : undefined
          const watch = (ipsScore != null && ipsScore < 75) || (percentToShort < 5)
          let status: 'GOOD' | 'WATCH' | 'EXIT' = 'GOOD'
          if (watch) status = 'WATCH'
          else if (percentToShort < 0) status = 'EXIT'

          const obj: Trade = {
            id: r.id,
            name: r.name || r.symbol,
            placed: r.entry_date || r.created_at || '',
            currentPrice: current,
            expDate: exp,
            dte: exp ? daysToExpiry(exp) : 0,
            contractType: toTitle(String(r.contract_type || '')),
            contracts: Number(r.number_of_contracts ?? 0) || 0,
            shortStrike: Number(r.short_strike ?? 0) || 0,
            longStrike: Number(r.long_strike ?? 0) || 0,
            creditReceived: Number(r.credit_received ?? 0) || 0,
            spreadWidth: Number(r.spread_width ?? 0) || 0,
            maxGain: Number(r.max_gain ?? 0) || 0,
            maxLoss: Number(r.max_loss ?? 0) || 0,
            percentCurrentToShort: percentToShort,
            deltaShortLeg: Number(r.delta_short_leg ?? 0) || 0,
            theta: Number(r.theta ?? 0) || 0,
            vega: Number(r.vega ?? 0) || 0,
            ivAtEntry: Number(r.iv_at_entry ?? 0) || 0,
            sector: r.sector || '-',
            status,
            ipsScore: typeof r.ips_score === 'number' ? Number(r.ips_score) : undefined,
            plPercent: typeof r.pl_percent === 'number' ? Number(r.pl_percent) : undefined,
          }
          return obj
        })
        // Auto-move expired (DTE < 0) to history (PATCH -> closed)
        const expired = normalized.filter(t => t.dte < 0)
        if (expired.length) {
          try {
            await fetch('/api/trades', {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ ids: expired.map(e=>e.id), status: 'closed' })
            })
          } catch {}
        }
        setTrades(normalized.filter(t => t.dte >= 0))
      } catch (e) {
        console.error('Failed to load dashboard trades', e)
        setTrades([])
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])
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

  const currencyFormatter = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 2,
  })

  const percentFormatter = new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })

  const formatDate = (value: string) => {
    const d = new Date(value)
    if (isNaN(d.getTime())) return value
    return d.toLocaleDateString()
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
        return currencyFormatter.format(value)
      case 'percentOfCredit':
      case 'plPercent':
      case 'percentCurrentToShort':
      case 'ivAtEntry':
        return `${percentFormatter.format(value)}%`
      case 'placed':
      case 'expDate':
      case 'dateClosed':
        return formatDate(value)
      case 'ipsScore':
        return typeof value === 'number' ? `${value.toFixed(1)}/100` : '-'
      case 'status': {
        const tag = String(value).toUpperCase()
        const cls = tag === 'GOOD' ? 'bg-green-100 text-green-800 border-green-200' : tag === 'EXIT' ? 'bg-red-100 text-red-800 border-red-200' : 'bg-yellow-100 text-yellow-800 border-yellow-200'
        return <Badge className={`${cls} border`}>{tag}</Badge>
      }
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

  if (loading && trades.length === 0) {
    return (
      <Card className="w-full">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Current Trades</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-12 text-gray-600">Loading active trades…</div>
        </CardContent>
      </Card>
    )
  }

  // Empty state
  if (trades.length === 0) {
    return (
      <Card className="w-full">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Current Trades</CardTitle>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => (window.location.href = '/trades')}>
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
            <Button onClick={() => (window.location.href = '/trades')}>
              Add Your First Trade
            </Button>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <>
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
          <Button variant="outline" size="sm" onClick={() => (window.location.href = '/trades')}>
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
          <Select value={statusFilter || 'all'} onValueChange={(v) => setStatusFilter(v === 'all' ? '' : v)}>
            <SelectTrigger className="w-40">
              <SelectValue placeholder="All statuses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
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
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-6 px-2 text-xs"
                          onClick={() => (window.location.href = `/trades?edit=${trade.id}`)}
                        >
                          Edit
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-6 px-2 text-xs"
                          onClick={() => setClosing({ open: true, trade, costToClose: '', reason: 'manual close', date: new Date().toISOString().slice(0,10) })}
                        >Action Needed</Button>
                        
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
    {/* Close Trade Dialog */}
    <Dialog open={closing.open} onOpenChange={(o)=> setClosing(prev => ({ ...prev, open: o }))}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Mark Trade as Action Needed</DialogTitle>
        </DialogHeader>
        {closing.trade && (
          <div className="space-y-3">
            <div className="text-sm text-gray-600">{closing.trade.name}</div>
            <div>
              <Label className="text-sm">Close Date</Label>
              <Input type="date" value={closing.date} onChange={(e)=> setClosing(prev => ({ ...prev, date: e.target.value }))} />
            </div>
            <div>
              <Label className="text-sm">Closing Reason</Label>
              <Select value={closing.reason} onValueChange={(v)=> setClosing(prev => ({ ...prev, reason: v }))}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select reason" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="manual close">Manual Close</SelectItem>
                  <SelectItem value="expired">Expired</SelectItem>
                  <SelectItem value="exit (profit)">Exit (Profit)</SelectItem>
                  <SelectItem value="exit (loss)">Exit (Loss)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-sm">Cost to Close (per spread)</Label>
              <Input inputMode="decimal" value={closing.costToClose} onChange={(e)=> setClosing(prev => ({ ...prev, costToClose: e.target.value }))} placeholder="e.g., 0.35" />
              <div className="text-xs text-gray-500 mt-1">Initial credit: ${closing.trade.creditReceived.toFixed(2)} • Contracts: {closing.trade.contracts}</div>
            </div>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={()=> setClosing(prev => ({ ...prev, open: false }))}>Cancel</Button>
          <Button onClick={async ()=>{
            if (!closing.trade) return
            const cc = parseFloat(closing.costToClose)
            const valid = !isNaN(cc)
            const contracts = closing.trade.contracts || 0
            const credit = closing.trade.creditReceived || 0
            const plDollar = valid ? (credit - cc) * contracts * 100 : undefined
            const plPercent = valid && credit !== 0 ? ((credit - cc) / credit) * 100 : undefined
            try { const raw = localStorage.getItem('tenxiv:trade-closures'); const obj = raw ? JSON.parse(raw) : {}; obj[closing.trade.id] = { date: closing.date, reason: closing.reason, costToClose: valid ? cc : null, plDollar, plPercent }; localStorage.setItem('tenxiv:trade-closures', JSON.stringify(obj)); } catch {}
            try {
              await fetch('/api/trades', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids: [closing.trade.id], status: 'action_needed' }) })
              setTrades(prev => prev.filter(t => t.id !== closing.trade!.id))
            } catch (e) { console.error('Close failed', e) }
            setClosing(prev => ({ ...prev, open: false }))
          }}>Send to Action Needed</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    </>
  )
}
