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
import { ArrowUpDown, ArrowUp, ArrowDown, ChevronDown, Filter, Eye, EyeOff, Calendar, Settings2, AlertCircle, MoreVertical, Trash2, Columns3, TrendingUp, TrendingDown, Clock } from 'lucide-react'
import { dispatchTradesUpdated } from '@/lib/events'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { evaluateExitStrategy, type ExitSignal } from '@/lib/utils/watch-criteria-evaluator'

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
  ipsName?: string | null
  dateClosed?: string
  costToClose?: number
  percentOfCredit?: number
  creditPaid?: number
  plDollar?: number
  plPercent?: number
  notes?: string
  exitSignal?: ExitSignal | null
  [key: string]: any // For dynamic IPS factor columns
}

// Column definition
interface Column {
  key: string
  label: string
}

// All available columns
const allColumns: Column[] = [
  { key: 'status', label: 'Status' },
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
  'status', 'name', 'placed', 'currentPrice', 'expDate', 'dte', 'contractType',
  'contracts', 'shortStrike', 'longStrike', 'creditReceived', 'spreadWidth',
  'maxGain', 'maxLoss', 'percentCurrentToShort', 'deltaShortLeg',
  'theta', 'vega', 'ivAtEntry', 'sector'
]

export default function ExcelStyleTradesDashboard() {
  // State
  const [showIPS, setShowIPS] = useState(false)
  const [visibleColumns, setVisibleColumns] = useState(new Set(defaultColumns))
  const [showColumnSelector, setShowColumnSelector] = useState(false)
  const [sortConfig, setSortConfig] = useState<{key: string, direction: 'asc' | 'desc'} | null>(null)
  const [filterText, setFilterText] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('')
  const [trades, setTrades] = useState<Trade[]>([])
  const [loading, setLoading] = useState<boolean>(false)
  const LOCAL_CLOSURE_KEY = 'tenxiv:trade-closures'

  // Close/action-needed dialog state (local UI helper)
  const [closing, setClosing] = useState<{
    open: boolean;
    trade: Trade | null;
    costToClose: string;
    reason: string;
    date: string;
    moveToActionNeeded: boolean;
  }>({
    open: false,
    trade: null,
    costToClose: '',
    reason: 'manual close',
    date: new Date().toISOString().slice(0, 10),
    moveToActionNeeded: false,
  })

  const [deleteDialog, setDeleteDialog] = useState<{ open: boolean; trade: Trade | null }>({ open: false, trade: null })

  const resetClosingDialog = () => {
    setClosing({
      open: false,
      trade: null,
      costToClose: '',
      reason: 'manual close',
      date: new Date().toISOString().slice(0,10),
      moveToActionNeeded: false,
    })
  }

  function upsertLocalClosure(tradeId: string, payload: Record<string, unknown>) {
    try {
      const raw = localStorage.getItem(LOCAL_CLOSURE_KEY)
      const obj = raw ? JSON.parse(raw) : {}
      obj[tradeId] = { ...(obj[tradeId] || {}), ...payload }
      localStorage.setItem(LOCAL_CLOSURE_KEY, JSON.stringify(obj))
    } catch {}
  }

  function removeLocalClosure(tradeId: string) {
    try {
      const raw = localStorage.getItem(LOCAL_CLOSURE_KEY)
      if (!raw) return
      const obj = JSON.parse(raw)
      if (obj[tradeId]) {
        delete obj[tradeId]
        localStorage.setItem(LOCAL_CLOSURE_KEY, JSON.stringify(obj))
      }
    } catch {}
  }

  async function deleteTrade(trade: Trade) {
    try {
      await fetch('/api/trades', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: [trade.id] })
      })
      setTrades(prev => prev.filter(t => t.id !== trade.id))
      removeLocalClosure(trade.id)
      dispatchTradesUpdated({ type: 'delete', scope: 'active', id: trade.id })
    } catch (e) {
      console.error('Failed to delete trade', e)
    }
  }

  const toTitle = (s: string) => s.replace(/-/g, ' ').replace(/\b\w/g, m => m.toUpperCase())
  const daysToExpiry = (exp: string): number => {
    const d = new Date(exp)
    if (isNaN(d.getTime())) return 0
    // Options expire at 4PM ET on expiration day, so set to 4PM (16:00) for accurate DTE
    const expiry = new Date(d)
    expiry.setHours(16, 0, 0, 0)
    const now = new Date()
    const ms = expiry.getTime() - now.getTime()
    return Math.ceil(ms / (1000*60*60*24))
  }

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true)
        const res = await fetch(`/api/trades?status=active`, { cache: 'no-store' })
        const json = await res.json()
        if (!res.ok) throw new Error(json?.error || 'Failed to load active trades')
        const rows = (json?.data || []) as any[]
        let quoteMap: Record<string, number> = {}
        let sectorMap: Record<string, string> = {}
        if (rows.length) {
          const symbols = Array.from(new Set(rows.map((r:any)=>r.symbol))).join(',')
          try {
            const qRes = await fetch(`/api/market-data/quotes?symbols=${encodeURIComponent(symbols)}`)
            const qJson = await qRes.json()
            ;(qJson?.data || []).forEach((q:any)=>{
              const price = Number(q.currentPrice ?? q.last ?? q.close ?? q.price)
              if (!isNaN(price)) quoteMap[q.symbol] = price
              if (q.sector) sectorMap[q.symbol] = q.sector
            })
          } catch {}
        }

        // Fetch IPS configurations with exit strategies
        let ipsMap: Record<string, any> = {}
        try {
          const ipsRes = await fetch('/api/ips', { cache: 'no-store' })
          const ipsJson = await ipsRes.json()
          console.log('[Dashboard] Loaded IPS configurations:', ipsJson)
          if (ipsRes.ok && Array.isArray(ipsJson)) {
            ipsJson.forEach((ips: any) => {
              ipsMap[ips.id] = ips
              console.log(`[Dashboard] IPS ${ips.name} exit_strategies:`, ips.exit_strategies)
            })
          }
        } catch (e) {
          console.error('Failed to load IPS configurations:', e)
        }
        const normalized: Trade[] = rows.map((r:any) => {
          const current = (quoteMap[r.symbol] ?? Number(r.current_price ?? 0)) || 0
          const short = Number(r.short_strike ?? r.strike_price_short ?? 0) || 0
          const percentToShort = short > 0 ? ((current - short) / short) * 100 : 0
          const exp = r.expiration_date || ''
          // WATCH only if IPS score < 75 or % to short < 5%
          const ipsScore = typeof r.ips_score === 'number' ? Number(r.ips_score) : undefined
          const watch = (ipsScore != null && ipsScore < 75) || (short > 0 && percentToShort < 5)
          console.log(`[Dashboard] Trade ${r.symbol}: current=${current}, short=${short}, percentToShort=${percentToShort.toFixed(2)}%, ipsScore=${ipsScore}, watch=${watch}`)

          // Evaluate exit strategy if IPS exists
          const ips = r.ips_id ? ipsMap[r.ips_id] : null
          console.log(`[Dashboard] Trade ${r.symbol}: ips_id=${r.ips_id}, ips found=${!!ips}, exit_strategies=${!!ips?.exit_strategies}`)

          // For credit spreads, we need the spread price, not the underlying price
          // Until we track spread prices, don't pass current_price to avoid false exit signals
          const tradeForEval = {
            // current_price: current,  // This is the underlying price, not spread price
            entry_price: Number(r.entry_price ?? r.credit_received ?? 0),
            credit_received: Number(r.credit_received ?? 0),
            expiration_date: r.expiration_date,
            max_gain: Number(r.max_gain ?? 0),
            max_loss: Number(r.max_loss ?? 0),
          }
          console.log(`[Dashboard] Trade ${r.symbol} eval data:`, tradeForEval)
          console.log(`[Dashboard] IPS exit_strategies:`, ips?.exit_strategies)

          const exitSignal = ips?.exit_strategies ? evaluateExitStrategy(tradeForEval, ips.exit_strategies) : null
          console.log(`[Dashboard] Trade ${r.symbol} exitSignal:`, exitSignal)

          let status: 'GOOD' | 'WATCH' | 'EXIT' = 'GOOD'
          if (exitSignal?.shouldExit) {
            console.log(`[Dashboard] Trade ${r.symbol} marked as EXIT due to: ${exitSignal.reason}`)
            status = 'EXIT'
          } else if (watch) {
            status = 'WATCH'
          } else if (percentToShort < 0) {
            status = 'EXIT'
          }

          const obj: Trade = {
            id: r.id,
            name: r.name || r.symbol,
            placed: r.entry_date || r.created_at || '',
            currentPrice: current,
            expDate: exp,
            dte: exp ? daysToExpiry(exp) : 0,
            contractType: toTitle(String(r.contract_type || '')),
            contracts: Number(r.number_of_contracts ?? r.contracts ?? 0) || 0,
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
            sector: r.sector || sectorMap[r.symbol] || '-',
            status,
            ipsScore: typeof r.ips_score === 'number' ? Number(r.ips_score) : undefined,
            ipsName: r.ips_name ?? r.ips_configurations?.name ?? null,
            plPercent: typeof r.pl_percent === 'number' ? Number(r.pl_percent) : undefined,
            exitSignal,
          }
          return obj
        })
        // Auto-move expired (DTE <= 0) to action-needed instead of auto-closing
        const expired = normalized.filter(t => t.dte <= 0)
        if (expired.length) {
          try {
            const raw = localStorage.getItem(LOCAL_CLOSURE_KEY)
            const obj = raw ? JSON.parse(raw) : {}
            expired.forEach(trade => {
              obj[trade.id] = {
                ...(obj[trade.id] || {}),
                needsAction: true,
                reason: 'expired_worthless',
                date: new Date().toISOString().slice(0, 10),
                contractsClosed: trade.contracts,
                ipsName: trade.ipsName,
              }
            })
            localStorage.setItem(LOCAL_CLOSURE_KEY, JSON.stringify(obj))
            dispatchTradesUpdated({ type: 'expired', ids: expired.map(e => e.id) })
          } catch (e) {
            console.error('Failed to move expired trades to action needed', e)
          }
        }
        setTrades(normalized.filter(t => t.dte > 0))
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
  const formatValue = (value: any, column: Column, trade?: any) => {
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
        const exitSignal = trade.exitSignal

        if (exitSignal?.shouldExit) {
          const icon = exitSignal.type === 'profit' ? <TrendingUp className="h-3 w-3" /> :
                      exitSignal.type === 'loss' ? <TrendingDown className="h-3 w-3" /> :
                      <Clock className="h-3 w-3" />

          return (
            <Popover>
              <PopoverTrigger asChild>
                <Badge className={`${cls} border cursor-pointer hover:opacity-80 flex items-center gap-1`}>
                  {icon}
                  {tag}
                </Badge>
              </PopoverTrigger>
              <PopoverContent className="w-64">
                <div className="space-y-2">
                  <div className="font-semibold text-sm flex items-center gap-2">
                    {icon}
                    {exitSignal.type === 'profit' ? 'Take Profit Signal' :
                     exitSignal.type === 'loss' ? 'Stop Loss Signal' :
                     'Time Exit Signal'}
                  </div>
                  <div className="text-xs text-gray-600">
                    {exitSignal.reason}
                  </div>
                  <div className="text-xs font-medium text-gray-700 mt-2">
                    Consider closing this position
                  </div>
                </div>
              </PopoverContent>
            </Popover>
          )
        }

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

  // Get columns to show based on IPS view
  const columnsToShow = React.useMemo(() => {
    if (showIPS && hasActiveIPS) {
      // Show IPS factor columns instead of trade columns
      return activeIPSFactors.map(factor => ({
        key: factor.toLowerCase().replace(/\s+/g, ''),
        label: factor
      }))
    }

    const filtered = allColumns.filter(col => visibleColumns.has(col.key))
    const statusIndex = filtered.findIndex(col => col.key === 'status')
    if (statusIndex > 0) {
      const [statusColumn] = filtered.splice(statusIndex, 1)
      filtered.unshift(statusColumn)
    }
    return filtered
  }, [showIPS, hasActiveIPS, activeIPSFactors, visibleColumns])

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
          {!showIPS && (
            <Button variant="outline" size="sm" onClick={() => setShowColumnSelector(true)}>
              <Columns3 className="h-4 w-4 mr-2" />
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
                        {formatValue(cellValue, column, trade)}
                      </td>
                    )
                  })}
                  {!showIPS && (
                    <td className="border border-gray-200 px-3 py-2">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            aria-label={`Actions for ${trade.name}`}
                          >
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-44">
                          <DropdownMenuItem onClick={() => (window.location.href = `/trades?edit=${trade.id}`)}>
                            Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => setClosing({
                              open: true,
                              trade,
                              costToClose: '',
                              reason: 'manual close',
                              date: new Date().toISOString().slice(0, 10),
                              moveToActionNeeded: false,
                            })}
                          >
                            Close
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            className="text-red-600 focus:text-red-600"
                            onClick={() => setDeleteDialog({ open: true, trade })}
                            title="Delete"
                          >
                            <Trash2 className="mr-2 h-4 w-4" />
                            <span className="sr-only">Delete</span>
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
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
    <Dialog
      open={closing.open}
      onOpenChange={(open) => {
        if (!open) resetClosingDialog()
        else setClosing(prev => ({ ...prev, open }))
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Close Trade</DialogTitle>
        </DialogHeader>
        {closing.trade && (
          <div className="space-y-4">
            <div className="flex items-start justify-between gap-3 rounded-md border bg-gray-50 p-3">
              <div>
                <Label htmlFor="move-to-action-needed" className="text-sm font-medium">Move to Action Needed</Label>
                <p className="text-xs text-gray-500">Keep the trade open while you finalize close-out details later.</p>
              </div>
              <Checkbox
                id="move-to-action-needed"
                checked={closing.moveToActionNeeded}
                onCheckedChange={(checked)=> setClosing(prev => ({ ...prev, moveToActionNeeded: Boolean(checked) }))}
              />
            </div>
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
                <Input
                  inputMode="decimal"
                  value={closing.costToClose}
                  onChange={(e)=> setClosing(prev => ({ ...prev, costToClose: e.target.value }))}
                  placeholder="e.g., 0.35"
                />
                <div className="text-xs text-gray-500 mt-1">Initial credit: ${closing.trade.creditReceived.toFixed(2)} • Contracts: {closing.trade.contracts}</div>
              </div>
            </div>
          </div>
        )}
        <DialogFooter>
          <Button
            variant="outline"
            onClick={resetClosingDialog}
          >
            Cancel
          </Button>
          <Button
            onClick={async () => {
              if (!closing.trade) return

              const cc = parseFloat(closing.costToClose)
              const costIsNumber = !Number.isNaN(cc)
              const contracts = closing.trade.contracts || 0
              const credit = closing.trade.creditReceived || 0

              if (closing.moveToActionNeeded) {
                const plDollar = costIsNumber ? (credit - cc) * contracts * 100 : undefined
                const plPercent = costIsNumber && credit !== 0 ? ((credit - cc) / credit) * 100 : undefined
                upsertLocalClosure(closing.trade.id, {
                  date: closing.date,
                  reason: closing.reason,
                  costToClose: costIsNumber ? cc : null,
                  plDollar,
                  plPercent,
                  ipsName: closing.trade.ipsName ?? null,
                  needsAction: true,
                  updatedAt: new Date().toISOString(),
                })
                dispatchTradesUpdated({ type: 'moved-to-action-needed', id: closing.trade.id })
              } else {
                const payload: Record<string, unknown> = {
                  tradeId: closing.trade.id,
                  closeMethod: closing.reason,
                  closeDate: closing.date,
                  costToClosePerSpread: costIsNumber ? cc : null,
                  contractsClosed: contracts || null,
                }

                try {
                  await fetch('/api/trades/close', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload),
                  })
                  setTrades(prev => prev.filter(t => t.id !== closing.trade!.id))
                  removeLocalClosure(closing.trade.id)
                  dispatchTradesUpdated({ type: 'closed', id: closing.trade.id })
                } catch (e) {
                  console.error('Close trade failed', e)
                }
              }

              resetClosingDialog()
            }}
          >
            Close Trade
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    <Dialog
      open={deleteDialog.open}
      onOpenChange={(open) => setDeleteDialog(prev => ({ ...prev, open }))}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete Trade</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-gray-600">
          {`Are you sure you want to delete ${deleteDialog.trade?.name || 'this trade'}? This action cannot be undone.`}
        </p>
        <DialogFooter>
          <Button variant="outline" onClick={() => setDeleteDialog({ open: false, trade: null })}>Cancel</Button>
          <Button
            variant="destructive"
            onClick={async () => {
              if (deleteDialog.trade) {
                await deleteTrade(deleteDialog.trade)
              }
              setDeleteDialog({ open: false, trade: null })
            }}
          >
            Delete Trade
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    {/* Column Selector Dialog */}
    <Dialog open={showColumnSelector} onOpenChange={setShowColumnSelector}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Select Columns to Display</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => setVisibleColumns(new Set(allColumns.map(c => c.key)))}
            >
              Select All
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setVisibleColumns(new Set())}
            >
              Deselect All
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setVisibleColumns(new Set(defaultColumns))}
            >
              Reset to Default
            </Button>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {allColumns.map((column) => (
              <div key={column.key} className="flex items-center space-x-2">
                <Checkbox
                  id={`col-${column.key}`}
                  checked={visibleColumns.has(column.key)}
                  onCheckedChange={(checked) => {
                    const newSet = new Set(visibleColumns)
                    if (checked) {
                      newSet.add(column.key)
                    } else {
                      newSet.delete(column.key)
                    }
                    setVisibleColumns(newSet)
                  }}
                />
                <Label
                  htmlFor={`col-${column.key}`}
                  className="text-sm font-normal cursor-pointer"
                >
                  {column.label}
                </Label>
              </div>
            ))}
          </div>
        </div>
        <DialogFooter>
          <Button onClick={() => setShowColumnSelector(false)}>Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    </>
  )
}
