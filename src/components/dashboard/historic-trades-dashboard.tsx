// src/components/dashboard/historic-trades-dashboard.tsx

"use client"

import React, { useCallback, useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { ArrowUpDown, ArrowUp, ArrowDown, Filter, Eye, EyeOff, Settings2, AlertCircle, History, Trash2, RefreshCw, Loader2, MoreVertical } from 'lucide-react'
import { dispatchTradesUpdated, TRADES_UPDATED_EVENT } from '@/lib/events'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

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
  ipsName?: string | null
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
  { key: 'ipsName', label: 'IPS Name' },
  { key: 'notes', label: 'Notes' },
  { key: 'lessons', label: 'Lessons' }
]

// Default visible columns for historic trades
const defaultHistoricColumns = [
  'name', 'placed', 'closedDate', 'closedPrice', 'contractType', 
  'shortStrike', 'longStrike', 'creditReceived', 'premiumAtClose',
  'actualPL', 'actualPLPercent', 'deltaShortLeg', 'deltaAtClose',
  'theta', 'thetaAtClose', 'closingReason', 'ipsScore', 'ipsName'
]

// Simple view for historic trades
const simpleHistoricColumns = ['name', 'closedDate', 'contractType', 'actualPL', 'actualPLPercent', 'closingReason', 'ipsScore']

const closeMethods = [
  { key: 'manual_close', label: 'Manual Close' },
  { key: 'expired', label: 'Expired' },
  { key: 'exit (profit)', label: 'Exit (Profit)' },
  { key: 'exit (loss)', label: 'Exit (Loss)' },
]

export default function HistoricTradesDashboard() {
  // State
  const [viewMode, setViewMode] = useState<'simple' | 'detailed'>('simple')
  const [showIPS, setShowIPS] = useState(false)
  const [visibleColumns, setVisibleColumns] = useState(new Set(defaultHistoricColumns))
  const [sortConfig, setSortConfig] = useState<{key: string, direction: 'asc' | 'desc'} | null>(null)
  const [filterText, setFilterText] = useState('')
  const [reasonFilter, setReasonFilter] = useState<string>('')
  
  const [trades, setTrades] = useState<HistoricTrade[]>([])
  const [loading, setLoading] = useState<boolean>(false)
  const [deleteDialog, setDeleteDialog] = useState<{ open: boolean; trade: HistoricTrade | null }>({ open: false, trade: null })
  const [editDialog, setEditDialog] = useState<{
    open: boolean;
    trade: HistoricTrade | null;
    closeDate: string;
    closePrice: string;
    closeMethod: string;
    saving: boolean;
    error?: string | null;
  }>({
    open: false,
    trade: null,
    closeDate: new Date().toISOString().slice(0, 10),
    closePrice: '',
    closeMethod: 'manual_close',
    saving: false,
    error: null,
  })
  const [ipsFilter, setIpsFilter] = useState<string>('all')
  const [error, setError] = useState<string | null>(null)
  const hasActiveIPS = false
  const activeIPSFactors: string[] = []

  const loadTrades = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const res = await fetch(`/api/trades?status=closed`, { cache: 'no-store' })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error || 'Failed to load closed trades')
      const rows = (json?.data || []) as any[]
      let closeMap: Record<string, any> = {}
      try { const raw = localStorage.getItem('tenxiv:trade-closures'); closeMap = raw ? JSON.parse(raw) : {} } catch {}

      const toTitle = (s:string)=> s.replace(/-/g,' ').replace(/\b\w/g,m=>m.toUpperCase())
      const mapped: HistoricTrade[] = rows.map((r:any)=>{
        const closureArr = Array.isArray(r.trade_closures) ? r.trade_closures : (r.trade_closures ? [r.trade_closures] : [])
        const closure = closureArr[0] || null
        const details = closure || closeMap[r.id] || {}
        const closedDate = details.close_date || details.date || r.closed_at || r.updated_at || r.created_at
        const credit = Number(r.credit_received ?? 0) || 0
        const closeCost = typeof details.cost_to_close_per_spread === 'number' ? details.cost_to_close_per_spread : (typeof details.costToClose === 'number' ? details.costToClose : undefined)
        const contracts = Number(r.number_of_contracts ?? details.contractsClosed ?? 0) || 0
        const actualPL = typeof details.realized_pl === 'number' ? details.realized_pl : (typeof details.plDollar === 'number' ? details.plDollar : (closeCost!=null ? (credit - closeCost) * contracts * 100 : 0))
        const actualPLPercent = typeof details.realized_pl_percent === 'number' ? details.realized_pl_percent : (typeof details.plPercent === 'number' ? details.plPercent : (credit ? ((credit - (closeCost ?? 0))/credit)*100 : 0))
          return {
            id: r.id,
            name: r.name || r.symbol,
            placed: r.entry_date || r.created_at || '',
            closedDate,
            closedPrice: closeCost ?? 0,
            contractType: toTitle(String(r.contract_type || '')),
            contracts,
            shortStrike: Number(r.short_strike ?? 0) || 0,
            longStrike: Number(r.long_strike ?? 0) || 0,
            creditReceived: credit,
            premiumAtClose: closeCost ?? 0,
            actualPL,
            actualPLPercent,
            maxGain: Number(r.max_gain ?? 0) || 0,
            maxLoss: Number(r.max_loss ?? 0) || 0,
            deltaShortLeg: Number(r.delta_short_leg ?? 0) || 0,
            deltaAtClose: 0,
            theta: Number(r.theta ?? 0) || 0,
            thetaAtClose: 0,
            vega: Number(r.vega ?? 0) || 0,
            vegaAtClose: 0,
            gamma: 0,
            gammaAtClose: 0,
            rho: 0,
            rhoAtClose: 0,
            ivAtEntry: Number(r.iv_at_entry ?? 0) || 0,
            ivAtClose: 0,
            sector: r.sector || '-',
            closingReason: details.close_method || details.reason || 'Closed',
            ipsScore: typeof r.ips_score === 'number' ? Number(r.ips_score) : undefined,
            ipsName: details.ips_name || r.ips_name || r.ips_configurations?.name || null,
          } as HistoricTrade
        })
      setTrades(mapped)
    } catch (e: any) {
      console.error('Failed to load history', e)
      setTrades([])
      setError(e?.message || 'Unable to load trade history')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadTrades()
  }, [loadTrades])

  useEffect(() => {
    const handler = () => loadTrades()
    window.addEventListener(TRADES_UPDATED_EVENT, handler)
    return () => window.removeEventListener(TRADES_UPDATED_EVENT, handler)
  }, [loadTrades])

  async function handleDelete(id: string) {
    try {
      await fetch('/api/trades', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: [id] }),
      })
      setTrades(prev => prev.filter(t => t.id !== id))
      dispatchTradesUpdated({ type: 'delete', scope: 'history', id })
    } catch (e) {
      console.error('Failed to delete historical trade', e)
    }
  }

  async function handleEditTrade() {
    if (!editDialog.trade) return
    try {
      setEditDialog(prev => ({ ...prev, saving: true, error: null }))

      const payload: Record<string, unknown> = {
        tradeId: editDialog.trade.id,
        closeMethod: editDialog.closeMethod,
        closeDate: editDialog.closeDate,
        costToClosePerSpread: editDialog.closePrice ? parseFloat(editDialog.closePrice) : null,
        contractsClosed: editDialog.trade.contracts || null,
      }

      const res = await fetch('/api/trades/close', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        throw new Error(json?.error || 'Failed to update trade')
      }

      // Reload trades to get updated data
      await loadTrades()
      dispatchTradesUpdated({ type: 'updated', id: editDialog.trade.id })

      setEditDialog({
        open: false,
        trade: null,
        closeDate: new Date().toISOString().slice(0, 10),
        closePrice: '',
        closeMethod: 'manual_close',
        saving: false,
        error: null,
      })
    } catch (e: any) {
      console.error('Edit trade failed', e)
      setEditDialog(prev => ({ ...prev, saving: false, error: e?.message || 'Unable to update trade' }))
    }
  }

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
        trade.sector?.toLowerCase().includes(filterText.toLowerCase()) ||
        (trade.ipsName || '').toLowerCase().includes(filterText.toLowerCase())
      )
    }
    
    if (reasonFilter) {
      filtered = filtered.filter(trade => trade.closingReason === reasonFilter)
    }
    if (ipsFilter !== 'all') {
      filtered = filtered.filter(trade => (trade.ipsName ?? 'Unassigned') === ipsFilter)
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
  }, [trades, filterText, reasonFilter, ipsFilter, sortConfig])

  // Get unique closing reasons for filter
  const closingReasons = React.useMemo(() => {
    const reasons = new Set(trades.map(t => t.closingReason).filter(Boolean))
    return Array.from(reasons)
  }, [trades])

  const ipsOptions = React.useMemo(() => {
    const set = new Set<string>()
    trades.forEach(t => {
      if (t.ipsName) set.add(t.ipsName)
    })
    return Array.from(set).sort()
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
      case 'premiumAtClose':
      case 'actualPL':
      case 'maxGain':
      case 'maxLoss':
      case 'closedPrice':
        return currencyFormatter.format(value)
      case 'actualPLPercent':
      case 'ivAtEntry':
      case 'ivAtClose':
        return `${percentFormatter.format(value)}%`
      case 'placed':
      case 'closedDate':
        return formatDate(value)
      case 'ipsName':
        return value || '—'
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
        return typeof value === 'number' ? `${value.toFixed(1)}/100` : '-'
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

  if (loading && trades.length === 0) {
    return (
      <Card className="w-full">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Trade History</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-12 flex items-center justify-center gap-2" style={{ color: 'var(--text-secondary)' }}>
            <Loader2 className="h-5 w-5 animate-spin" />
            Loading closed trades…
          </div>
        </CardContent>
      </Card>
    )
  }

  if (error && trades.length === 0) {
    return (
      <Card className="w-full">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Trade History</CardTitle>
          <Button variant="ghost" size="sm" onClick={loadTrades}>
            <RefreshCw className="h-4 w-4" />
          </Button>
        </CardHeader>
        <CardContent>
          <div className="text-center py-12 text-sm text-red-600 flex flex-col items-center gap-2">
            <AlertCircle className="h-6 w-6" />
            {error}
          </div>
        </CardContent>
      </Card>
    )
  }

  // Empty state
  if (trades.length === 0) {
    return (
      <Card className="w-full">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Trade History</CardTitle>
          <Button variant="ghost" size="sm" onClick={loadTrades}>
            <RefreshCw className="h-4 w-4" />
          </Button>
        </CardHeader>
        <CardContent>
          <div className="text-center py-12">
            <History className="h-12 w-12 mx-auto mb-4" style={{ color: 'var(--text-tertiary)' }} />
            <h3 className="text-lg font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>No Trade History</h3>
            <p className="mb-4" style={{ color: 'var(--text-secondary)' }}>Your closed trades will appear here once you complete them.</p>
            <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>Start by adding active trades and closing them to build your history.</p>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <>
    <Card className="w-full">
      <CardHeader>
        <div className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Trade History</CardTitle>
            <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>
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

            <Button variant="ghost" size="sm" onClick={loadTrades} disabled={loading}>
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </div>

        {/* Summary Statistics */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mt-4">
          <div className="p-3 rounded" style={{ background: 'var(--glass-bg)' }}>
            <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>Total Trades</p>
            <p className="text-lg font-semibold">{stats.totalTrades}</p>
          </div>
          <div className="p-3 rounded" style={{ background: 'var(--glass-bg)' }}>
            <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>Win Rate</p>
            <p className="text-lg font-semibold">{stats.winRate.toFixed(1)}%</p>
          </div>
          <div className="p-3 rounded" style={{ background: 'var(--glass-bg)' }}>
            <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>Total P/L</p>
            <p className={`text-lg font-semibold ${stats.totalPL >= 0 ? 'pl-value positive' : 'pl-value negative'}`}>
              {currencyFormatter.format(stats.totalPL)}
            </p>
          </div>
          <div className="p-3 rounded" style={{ background: 'var(--glass-bg)' }}>
            <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>Avg Win</p>
            <p className="text-lg font-semibold pl-value positive">{currencyFormatter.format(stats.avgWin)}</p>
          </div>
          <div className="p-3 rounded" style={{ background: 'var(--glass-bg)' }}>
            <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>Avg Loss</p>
            <p className="text-lg font-semibold pl-value negative">{currencyFormatter.format(stats.avgLoss)}</p>
          </div>
          <div className="p-3 rounded" style={{ background: 'var(--glass-bg)' }}>
            <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>Profit Factor</p>
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
          <Select value={reasonFilter || 'all'} onValueChange={(v)=> setReasonFilter(v === 'all' ? '' : v)}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder="All closing reasons" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All closing reasons</SelectItem>
              {closingReasons.map(reason => (
                <SelectItem key={reason} value={reason}>{reason}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={ipsFilter} onValueChange={(v) => setIpsFilter(v)}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder="All IPS" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All IPS</SelectItem>
              {ipsOptions.map(name => (
                <SelectItem key={name} value={name}>{name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Table */}
        <div className="overflow-x-auto trades-table-container">
          <table className="w-full border-collapse trades-table text-sm">
            <thead>
              <tr>
                {columnsToShow.map((column) => (
                  <th
                    key={column.key}
                    className="px-3 py-2 text-left font-medium cursor-pointer"
                    onClick={() => handleSort(column.key)}
                  >
                    <div className="flex items-center">
                      {column.label}
                      {getSortIcon(column.key)}
                    </div>
                  </th>
                ))}
                {!showIPS && (
                  <th className="px-3 py-2 text-left font-medium">
                    Actions
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {processedTrades.map((trade, index) => (
                <tr
                  key={trade.id}
                >
                  {columnsToShow.map((column) => {
                    const cellValue = trade[column.key]
                    const plClass = column.key === 'actualPL' || column.key === 'actualPLPercent'
                      ? (trade[column.key] >= 0 ? 'pl-value positive' : 'pl-value negative')
                      : ''
                    return (
                      <td
                        key={column.key}
                        className={`px-3 py-2 ${plClass}`}
                      >
                        {formatValue(cellValue, column)}
                      </td>
                    )
                  })}
                  {!showIPS && (
                    <td className="px-3 py-2">
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
                        <DropdownMenuContent align="end" className="w-40">
                          <DropdownMenuItem>
                            View Details
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onSelect={() => setEditDialog({
                              open: true,
                              trade,
                              closeDate: trade.closedDate ? new Date(trade.closedDate).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10),
                              closePrice: String(trade.closedPrice || trade.premiumAtClose || ''),
                              closeMethod: trade.closingReason || 'manual_close',
                              saving: false,
                              error: null,
                            })}
                          >
                            Edit Close Details
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            className="text-red-600 focus:text-red-600"
                            onSelect={() => setDeleteDialog({ open: true, trade })}
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
        </div>
      </CardContent>
    </Card>
    <Dialog
      open={deleteDialog.open}
      onOpenChange={(open) => setDeleteDialog(prev => ({ ...prev, open }))}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete Trade</DialogTitle>
        </DialogHeader>
        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
          {`Are you sure you want to delete ${deleteDialog.trade?.name || 'this trade'} from history? This action cannot be undone.`}
        </p>
        <DialogFooter>
          <Button variant="outline" onClick={() => setDeleteDialog({ open: false, trade: null })}>Cancel</Button>
          <Button
            variant="destructive"
            onClick={async () => {
              if (deleteDialog.trade) await handleDelete(deleteDialog.trade.id)
              setDeleteDialog({ open: false, trade: null })
            }}
          >
            Delete Trade
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <Dialog
      open={editDialog.open}
      onOpenChange={(open) => {
        if (!open) {
          setEditDialog({
            open: false,
            trade: null,
            closeDate: new Date().toISOString().slice(0, 10),
            closePrice: '',
            closeMethod: 'manual_close',
            saving: false,
            error: null,
          })
        }
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit Close Details</DialogTitle>
        </DialogHeader>
        {editDialog.trade && (
          <div className="space-y-4">
            <div className="space-y-3">
              <div className="text-sm" style={{ color: 'var(--text-secondary)' }}>{editDialog.trade.name}</div>
              <div>
                <Label className="text-sm">Close Date</Label>
                <Input
                  type="date"
                  value={editDialog.closeDate}
                  onChange={e => setEditDialog(prev => ({ ...prev, closeDate: e.target.value }))}
                />
              </div>
              <div>
                <Label className="text-sm">Closing Reason</Label>
                <Select
                  value={editDialog.closeMethod}
                  onValueChange={value => setEditDialog(prev => ({ ...prev, closeMethod: value }))}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select reason" />
                  </SelectTrigger>
                  <SelectContent>
                    {closeMethods.map(method => (
                      <SelectItem key={method.key} value={method.key}>{method.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-sm">Cost to Close (per spread)</Label>
                <Input
                  inputMode="decimal"
                  value={editDialog.closePrice}
                  onChange={e => setEditDialog(prev => ({ ...prev, closePrice: e.target.value }))}
                  placeholder="e.g., 0.35"
                />
                <div className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>
                  Initial credit: ${editDialog.trade.creditReceived?.toFixed(2) ?? '0.00'} • Contracts: {editDialog.trade.contracts}
                </div>
              </div>
            </div>
            {editDialog.error && (
              <p className="text-sm text-red-600">{editDialog.error}</p>
            )}
          </div>
        )}
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => setEditDialog({
              open: false,
              trade: null,
              closeDate: new Date().toISOString().slice(0, 10),
              closePrice: '',
              closeMethod: 'manual_close',
              saving: false,
              error: null,
            })}
            disabled={editDialog.saving}
          >
            Cancel
          </Button>
          <Button onClick={handleEditTrade} disabled={editDialog.saving}>
            {editDialog.saving ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                Saving…
              </>
            ) : (
              'Save Changes'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    </>
  )
}
