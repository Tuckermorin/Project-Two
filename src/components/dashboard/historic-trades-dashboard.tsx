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
import { Checkbox } from '@/components/ui/checkbox'
import { Separator } from '@/components/ui/separator'
import { ArrowUpDown, ArrowUp, ArrowDown, Eye, EyeOff, Columns3, AlertCircle, History, Trash2, RefreshCw, Loader2, MoreVertical, X, Search, Pin, GripVertical, TrendingUp, TrendingDown } from 'lucide-react'
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, DragEndEvent } from '@dnd-kit/core'
import { arrayMove, SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { dispatchTradesUpdated, TRADES_UPDATED_EVENT } from '@/lib/events'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

// Column definition
interface Column {
  key: string
  label: string
  category: 'Basic Info' | 'Performance' | 'Greeks' | 'Trade Details'
}

// Sortable Column Item Component
interface SortableColumnItemProps {
  column: Column
  isVisible: boolean
  isPinned: boolean
  onToggleVisible: (checked: boolean) => void
  onTogglePin: () => void
}

function SortableColumnItem({ column, isVisible, isPinned, onToggleVisible, onTogglePin }: SortableColumnItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: column.key })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-center space-x-2 group p-2 rounded ${isDragging ? 'bg-blue-50 border border-blue-300' : ''}`}
    >
      <button
        {...attributes}
        {...listeners}
        className="cursor-grab active:cursor-grabbing p-1"
        aria-label="Drag to reorder"
      >
        <GripVertical className="h-4 w-4" style={{ color: 'var(--text-tertiary)' }} />
      </button>
      <Checkbox
        id={`col-${column.key}`}
        checked={isVisible}
        onCheckedChange={onToggleVisible}
      />
      <Label
        htmlFor={`col-${column.key}`}
        className="text-sm font-normal cursor-pointer flex-1"
      >
        {column.label}
      </Label>
      <button
        onClick={onTogglePin}
        className={`p-1 rounded transition-colors cursor-pointer ${
          isPinned
            ? 'text-blue-600'
            : 'text-gray-400 opacity-0 group-hover:opacity-100'
        }`}
        aria-label={isPinned ? 'Unpin column' : 'Pin column'}
        title={isPinned ? 'Unpin column' : 'Pin column'}
      >
        <Pin className={`h-3.5 w-3.5 ${isPinned ? 'fill-current' : ''}`} />
      </button>
    </div>
  )
}

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

// All available columns for historic trades with categories
const allHistoricColumns: Column[] = [
  { key: 'name', label: 'Name', category: 'Basic Info' },
  { key: 'placed', label: 'Date Placed', category: 'Basic Info' },
  { key: 'closedDate', label: 'Date Closed', category: 'Basic Info' },
  { key: 'contractType', label: 'Contract Type', category: 'Basic Info' },
  { key: 'sector', label: 'Sector', category: 'Basic Info' },
  { key: 'ipsScore', label: 'IPS Score', category: 'Basic Info' },
  { key: 'ipsAtClose', label: 'IPS at Close', category: 'Basic Info' },
  { key: 'ipsName', label: 'IPS Name', category: 'Basic Info' },
  { key: 'actualPL', label: 'Actual P/L ($)', category: 'Performance' },
  { key: 'actualPLPercent', label: 'Actual P/L (%)', category: 'Performance' },
  { key: 'creditReceived', label: 'Credit Received', category: 'Performance' },
  { key: 'premiumAtClose', label: 'Premium at Close', category: 'Performance' },
  { key: 'closedPrice', label: 'Closed Price', category: 'Performance' },
  { key: 'maxGain', label: 'Max Gain', category: 'Performance' },
  { key: 'maxLoss', label: 'Max Loss', category: 'Performance' },
  { key: 'deltaShortLeg', label: 'Delta at Entry', category: 'Greeks' },
  { key: 'deltaAtClose', label: 'Delta at Close', category: 'Greeks' },
  { key: 'theta', label: 'Theta at Entry', category: 'Greeks' },
  { key: 'thetaAtClose', label: 'Theta at Close', category: 'Greeks' },
  { key: 'vega', label: 'Vega at Entry', category: 'Greeks' },
  { key: 'vegaAtClose', label: 'Vega at Close', category: 'Greeks' },
  { key: 'gamma', label: 'Gamma at Entry', category: 'Greeks' },
  { key: 'gammaAtClose', label: 'Gamma at Close', category: 'Greeks' },
  { key: 'rho', label: 'Rho at Entry', category: 'Greeks' },
  { key: 'rhoAtClose', label: 'Rho at Close', category: 'Greeks' },
  { key: 'ivAtEntry', label: 'IV at Entry', category: 'Greeks' },
  { key: 'ivAtClose', label: 'IV at Close', category: 'Greeks' },
  { key: 'contracts', label: '# of Contracts', category: 'Trade Details' },
  { key: 'shortStrike', label: 'Short Strike', category: 'Trade Details' },
  { key: 'longStrike', label: 'Long Strike', category: 'Trade Details' },
  { key: 'closingReason', label: 'Closing Reason', category: 'Trade Details' },
  { key: 'notes', label: 'Notes', category: 'Trade Details' },
  { key: 'lessons', label: 'Lessons', category: 'Trade Details' }
]

// Default visible columns for historic trades
const defaultHistoricColumns = [
  'name', 'placed', 'closedDate', 'closedPrice', 'contractType',
  'shortStrike', 'longStrike', 'creditReceived', 'premiumAtClose',
  'actualPL', 'actualPLPercent', 'deltaShortLeg', 'deltaAtClose',
  'theta', 'thetaAtClose', 'closingReason', 'ipsScore', 'ipsName'
]

// Preset interface
interface ColumnPreset {
  id: string
  name: string
  visible: string[]
  pinned: string[]
  order: string[]
}

// Default presets for historic trades
const defaultHistoricPresets: ColumnPreset[] = [
  {
    id: 'quick-view',
    name: 'Quick View',
    visible: ['name', 'closedDate', 'actualPL', 'actualPLPercent', 'closingReason', 'ipsScore'],
    pinned: ['name'],
    order: allHistoricColumns.map(c => c.key)
  },
  {
    id: 'detailed-view',
    name: 'Detailed View',
    visible: [
      'name', 'placed', 'closedDate', 'contractType', 'actualPL', 'actualPLPercent',
      'creditReceived', 'premiumAtClose', 'shortStrike', 'longStrike', 'closingReason', 'ipsScore'
    ],
    pinned: ['name'],
    order: allHistoricColumns.map(c => c.key)
  },
  {
    id: 'greeks-analysis',
    name: 'Greeks Analysis',
    visible: [
      'name', 'closedDate', 'deltaShortLeg', 'deltaAtClose', 'theta', 'thetaAtClose',
      'vega', 'vegaAtClose', 'actualPL', 'actualPLPercent'
    ],
    pinned: ['name'],
    order: allHistoricColumns.map(c => c.key)
  }
]

const closeMethods = [
  { key: 'manual_close', label: 'Manual Close' },
  { key: 'expired', label: 'Expired' },
  { key: 'exit (profit)', label: 'Exit (Profit)' },
  { key: 'exit (loss)', label: 'Exit (Loss)' },
]

export default function HistoricTradesDashboard() {
  // State
  const [showIPS, setShowIPS] = useState(false)
  const [visibleColumns, setVisibleColumns] = useState(new Set(defaultHistoricColumns))
  const [showColumnSelector, setShowColumnSelector] = useState(false)
  const [columnSearchTerm, setColumnSearchTerm] = useState('')
  const [pinnedColumns, setPinnedColumns] = useState<Set<string>>(new Set())
  const [columnOrder, setColumnOrder] = useState<string[]>(allHistoricColumns.map(c => c.key))
  const [presets, setPresets] = useState<ColumnPreset[]>(defaultHistoricPresets)
  const [showSavePreset, setShowSavePreset] = useState(false)
  const [presetName, setPresetName] = useState('')
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

  const [currentPage, setCurrentPage] = useState(1)
  const [totalTrades, setTotalTrades] = useState(0)
  const [allTradesForStats, setAllTradesForStats] = useState<HistoricTrade[]>([])
  const TRADES_PER_PAGE = 25

  const loadTrades = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)

      // Calculate offset for pagination
      const offset = (currentPage - 1) * TRADES_PER_PAGE

      const res = await fetch(`/api/trades?status=closed&limit=${TRADES_PER_PAGE}&offset=${offset}`, { cache: 'no-store' })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error || 'Failed to load closed trades')
      const rows = (json?.data || []) as any[]

      // Also fetch ALL trades for statistics (only on first page)
      if (currentPage === 1) {
        const allTradesRes = await fetch(`/api/trades?status=closed&limit=1000`, { cache: 'no-store' })
        const allTradesJson = await allTradesRes.json()
        const allRows = (allTradesJson?.data || []) as any[]
        setTotalTrades(allRows.length)

        // Map all trades for statistics calculation
        let closeMap: Record<string, any> = {}
        try { const raw = localStorage.getItem('tenxiv:trade-closures'); closeMap = raw ? JSON.parse(raw) : {} } catch {}

        const toTitle = (s:string)=> s.replace(/-/g,' ').replace(/\b\w/g,m=>m.toUpperCase())
        const allMapped: HistoricTrade[] = allRows.map((r:any)=>{
          const closureArr = Array.isArray(r.trade_closures) ? r.trade_closures : (r.trade_closures ? [r.trade_closures] : [])
          const closure = closureArr[0] || null
          const details = closure || closeMap[r.id] || {}
          const credit = Number(r.credit_received ?? 0) || 0
          const closeCost = typeof details.cost_to_close_per_spread === 'number' ? details.cost_to_close_per_spread : (typeof details.costToClose === 'number' ? details.costToClose : undefined)
          const contracts = Number(r.number_of_contracts ?? details.contractsClosed ?? 0) || 0
          const actualPL = typeof details.realized_pl === 'number' ? details.realized_pl : (typeof details.plDollar === 'number' ? details.plDollar : (closeCost!=null ? (credit - closeCost) * contracts * 100 : 0))
          const actualPLPercent = typeof details.realized_pl_percent === 'number' ? details.realized_pl_percent : (typeof details.plPercent === 'number' ? details.plPercent : (credit ? ((credit - (closeCost ?? 0))/credit)*100 : 0))
          return {
            id: r.id,
            name: r.name || r.symbol,
            placed: r.entry_date || r.created_at || '',
            closedDate: details.close_date || details.date || r.closed_at || r.updated_at || r.created_at,
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
        setAllTradesForStats(allMapped)
      }

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
  }, [currentPage])

  useEffect(() => {
    loadTrades()
  }, [loadTrades])

  // Reset to page 1 when changing filters
  useEffect(() => {
    setCurrentPage(1)
  }, [filterText, reasonFilter, ipsFilter])

  useEffect(() => {
    const handler = () => loadTrades()
    window.addEventListener(TRADES_UPDATED_EVENT, handler)
    return () => window.removeEventListener(TRADES_UPDATED_EVENT, handler)
  }, [loadTrades])

  // Load pinned columns, column order, and presets from localStorage
  useEffect(() => {
    try {
      const savedPinned = localStorage.getItem('historicColumnPins')
      if (savedPinned) {
        setPinnedColumns(new Set(JSON.parse(savedPinned)))
      }

      const savedOrder = localStorage.getItem('historicColumnOrder')
      if (savedOrder) {
        setColumnOrder(JSON.parse(savedOrder))
      }

      const savedPresets = localStorage.getItem('historicColumnPresets')
      if (savedPresets) {
        const userPresets = JSON.parse(savedPresets)
        setPresets([...defaultHistoricPresets, ...userPresets])
      }
    } catch (e) {
      console.error('Failed to load column settings', e)
    }
  }, [])

  // Save pinned columns to localStorage
  useEffect(() => {
    try {
      localStorage.setItem('historicColumnPins', JSON.stringify(Array.from(pinnedColumns)))
    } catch (e) {
      console.error('Failed to save pinned columns', e)
    }
  }, [pinnedColumns])

  // Save column order to localStorage
  useEffect(() => {
    try {
      localStorage.setItem('historicColumnOrder', JSON.stringify(columnOrder))
    } catch (e) {
      console.error('Failed to save column order', e)
    }
  }, [columnOrder])

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

  // Calculate summary statistics from ALL trades (not just current page)
  const stats = React.useMemo(() => {
    const statsSource = allTradesForStats.length > 0 ? allTradesForStats : trades

    if (statsSource.length === 0) {
      return {
        totalTrades: 0,
        winRate: 0,
        totalPL: 0,
        avgWin: 0,
        avgLoss: 0,
        profitFactor: 0
      }
    }

    const wins = statsSource.filter(t => t.actualPL > 0)
    const losses = statsSource.filter(t => t.actualPL < 0)
    const totalWins = wins.reduce((sum, t) => sum + t.actualPL, 0)
    const totalLosses = Math.abs(losses.reduce((sum, t) => sum + t.actualPL, 0))

    return {
      totalTrades: statsSource.length,
      winRate: (wins.length / statsSource.length) * 100,
      totalPL: statsSource.reduce((sum, t) => sum + t.actualPL, 0),
      avgWin: wins.length > 0 ? totalWins / wins.length : 0,
      avgLoss: losses.length > 0 ? totalLosses / losses.length : 0,
      profitFactor: totalLosses > 0 ? totalWins / totalLosses : totalWins > 0 ? Infinity : 0
    }
  }, [allTradesForStats, trades])

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

  // Filter columns by search term and group by category, respecting column order
  const filteredColumnsByCategory = React.useMemo(() => {
    const columnMap = new Map(allHistoricColumns.map(col => [col.key, col]))

    const orderedColumns = columnOrder
      .map(key => columnMap.get(key))
      .filter((col): col is Column => col !== undefined)

    const filtered = orderedColumns.filter(col =>
      col.label.toLowerCase().includes(columnSearchTerm.toLowerCase())
    )

    const categories: Record<string, Column[]> = {
      'Basic Info': [],
      'Performance': [],
      'Greeks': [],
      'Trade Details': []
    }

    filtered.forEach(col => {
      categories[col.category].push(col)
    })

    return categories
  }, [columnSearchTerm, columnOrder])

  // Toggle pin on a column
  const togglePinColumn = (columnKey: string) => {
    setPinnedColumns(prev => {
      const newSet = new Set(prev)
      if (newSet.has(columnKey)) {
        newSet.delete(columnKey)
      } else {
        newSet.add(columnKey)
      }
      return newSet
    })
  }

  // Drag and drop sensors
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  )

  // Handle drag end
  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event

    if (over && active.id !== over.id) {
      setColumnOrder((items) => {
        const oldIndex = items.indexOf(active.id as string)
        const newIndex = items.indexOf(over.id as string)
        return arrayMove(items, oldIndex, newIndex)
      })
    }
  }

  // Load a preset
  const loadPreset = (preset: ColumnPreset) => {
    setVisibleColumns(new Set(preset.visible))
    setPinnedColumns(new Set(preset.pinned))
    setColumnOrder(preset.order)
  }

  // Save current configuration as a new preset
  const saveAsPreset = () => {
    if (!presetName.trim()) return

    const newPreset: ColumnPreset = {
      id: `custom-${Date.now()}`,
      name: presetName.trim(),
      visible: Array.from(visibleColumns),
      pinned: Array.from(pinnedColumns),
      order: columnOrder
    }

    const userPresets = presets.filter(p => !defaultHistoricPresets.some(dp => dp.id === p.id))
    const updatedPresets = [...userPresets, newPreset]

    try {
      localStorage.setItem('historicColumnPresets', JSON.stringify(updatedPresets))
      setPresets([...defaultHistoricPresets, ...updatedPresets])
      setPresetName('')
      setShowSavePreset(false)
    } catch (e) {
      console.error('Failed to save preset', e)
    }
  }

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

  // Get columns to show with pinned columns first
  const columnsToShow = React.useMemo(() => {
    if (showIPS && hasActiveIPS) {
      return activeIPSFactors.map(factor => ({
        key: factor.toLowerCase().replace(/\s+/g, ''),
        label: factor,
        category: 'Basic Info' as const
      }))
    }

    const filtered = allHistoricColumns.filter(col => visibleColumns.has(col.key))

    const pinned = filtered.filter(col => pinnedColumns.has(col.key))
    const unpinned = filtered.filter(col => !pinnedColumns.has(col.key))

    return [...pinned, ...unpinned]
  }, [showIPS, hasActiveIPS, activeIPSFactors, visibleColumns, pinnedColumns])

  // Calculate cumulative widths for sticky positioning
  const stickyOffsets = React.useMemo(() => {
    const offsets: Record<string, number> = {}
    let cumulativeWidth = 0

    columnsToShow.forEach((col) => {
      if (pinnedColumns.has(col.key)) {
        offsets[col.key] = cumulativeWidth
        cumulativeWidth += 150
      }
    })

    return offsets
  }, [columnsToShow, pinnedColumns])

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
    // Parse dates in UTC to avoid timezone shifting (e.g., showing Thursday instead of Friday)
    const [year, month, day] = value.split('-').map(Number)
    if (!year || !month || !day) return value
    const d = new Date(Date.UTC(year, month - 1, day))
    if (isNaN(d.getTime())) return value
    return d.toLocaleDateString('en-US', { timeZone: 'UTC' })
  }

  // Format value for display
  const formatValue = (value: any, column: Column) => {
    if (value === null || value === undefined) return '-'

    switch(column.key) {
      case 'name':
        return <span className="font-semibold">{value}</span>
      case 'creditReceived':
      case 'premiumAtClose':
      case 'maxGain':
      case 'maxLoss':
      case 'closedPrice':
        return currencyFormatter.format(value)
      case 'actualPL': {
        if (typeof value !== 'number') return '-'
        const className = value >= 0 ? 'text-green-600 font-medium' : 'text-red-600 font-medium'
        return (
          <span className={className}>
            {currencyFormatter.format(value)}
          </span>
        )
      }
      case 'actualPLPercent': {
        if (typeof value !== 'number') return '-'
        const className = value >= 0 ? 'text-green-600 font-medium' : 'text-red-600 font-medium'
        const Icon = value >= 0 ? TrendingUp : TrendingDown
        return (
          <span className={`${className} inline-flex items-center gap-1`}>
            {percentFormatter.format(value)}%
            <Icon className="h-3 w-3" />
          </span>
        )
      }
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
        return value.toFixed(2)
      case 'ipsScore':
      case 'ipsAtClose':
        return typeof value === 'number' ? `${value.toFixed(1)}/100` : '-'
      default:
        return value
    }
  }

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
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>Trade History</CardTitle>
          <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>
            {totalTrades > 0 ? `${totalTrades} total closed ${totalTrades === 1 ? 'trade' : 'trades'}` : `${processedTrades.length} closed ${processedTrades.length === 1 ? 'trade' : 'trades'}`}
          </p>
        </div>

        <div className="flex gap-2">
          {/* Refresh button */}
          <Button variant="ghost" size="sm" onClick={loadTrades} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>

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
          {!showIPS && (
            <Button variant="outline" size="sm" onClick={() => setShowColumnSelector(true)}>
              <Columns3 className="h-4 w-4 mr-2" />
              Columns
            </Button>
          )}
        </div>
      </CardHeader>

      <CardContent>
        {/* Summary Statistics */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-6">
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
                {columnsToShow.map((column) => {
                  const isPinned = pinnedColumns.has(column.key)
                  const stickyStyle = isPinned ? {
                    position: 'sticky' as const,
                    left: `${stickyOffsets[column.key] || 0}px`,
                    zIndex: 10,
                    background: 'var(--glass-bg)',
                    boxShadow: '2px 0 4px rgba(0, 0, 0, 0.1)'
                  } : {}

                  return (
                    <th
                      key={column.key}
                      className="px-3 py-2 text-left font-medium cursor-pointer"
                      style={stickyStyle}
                      onClick={() => handleSort(column.key)}
                    >
                      <div className="flex items-center gap-1">
                        {column.label}
                        {getSortIcon(column.key)}
                        {isPinned && <Pin className="h-3 w-3 text-blue-600 fill-current ml-1" />}
                      </div>
                    </th>
                  )
                })}
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
                  className="group hover:bg-[var(--glass-bg-hover)] transition-colors hover:border-l-2 hover:border-l-blue-500"
                >
                  {columnsToShow.map((column) => {
                    const cellValue = trade[column.key]
                    const isPinned = pinnedColumns.has(column.key)
                    const stickyStyle = isPinned ? {
                      position: 'sticky' as const,
                      left: `${stickyOffsets[column.key] || 0}px`,
                      zIndex: 9,
                      background: index % 2 === 0 ? 'rgba(255, 255, 255, 0.04)' : 'transparent',
                      boxShadow: '2px 0 4px rgba(0, 0, 0, 0.1)'
                    } : {}

                    return (
                      <td
                        key={column.key}
                        className="px-3 py-2"
                        style={stickyStyle}
                      >
                        {formatValue(cellValue, column)}
                      </td>
                    )
                  })}
                  {!showIPS && (
                    <td className="px-3 py-2 opacity-0 group-hover:opacity-100 transition-opacity">
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

        {/* Pagination Controls */}
        {totalTrades > TRADES_PER_PAGE && (
          <div className="mt-6 flex items-center justify-between border-t pt-4">
            <div className="text-sm" style={{ color: 'var(--text-secondary)' }}>
              Showing {((currentPage - 1) * TRADES_PER_PAGE) + 1} to {Math.min(currentPage * TRADES_PER_PAGE, totalTrades)} of {totalTrades} trades
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1 || loading}
              >
                Previous
              </Button>
              <div className="flex items-center gap-2 px-3" style={{ color: 'var(--text-secondary)' }}>
                Page {currentPage} of {Math.ceil(totalTrades / TRADES_PER_PAGE)}
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(p => p + 1)}
                disabled={currentPage >= Math.ceil(totalTrades / TRADES_PER_PAGE) || loading}
              >
                Next
              </Button>
            </div>
          </div>
        )}
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

    {/* Column Selector Dialog */}
    <Dialog open={showColumnSelector} onOpenChange={setShowColumnSelector}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Select Columns to Display</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {/* Search Input */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4" style={{ color: 'var(--text-tertiary)' }} />
            <Input
              placeholder="Search columns..."
              value={columnSearchTerm}
              onChange={(e) => setColumnSearchTerm(e.target.value)}
              className="pl-9 pr-9"
            />
            {columnSearchTerm && (
              <button
                onClick={() => setColumnSearchTerm('')}
                className="absolute right-3 top-1/2 transform -translate-y-1/2"
                aria-label="Clear search"
              >
                <X className="h-4 w-4" style={{ color: 'var(--text-tertiary)' }} />
              </button>
            )}
          </div>

          {/* Presets and Quick Actions */}
          <div className="flex gap-2 flex-wrap items-center">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" variant="outline">
                  Load Preset
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                {presets.map((preset) => (
                  <DropdownMenuItem key={preset.id} onClick={() => loadPreset(preset)}>
                    {preset.name}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setShowSavePreset(true)}
            >
              Save as Preset
            </Button>
            <Separator orientation="vertical" className="h-6" />
            <Button
              size="sm"
              variant="outline"
              onClick={() => setVisibleColumns(new Set(allHistoricColumns.map(c => c.key)))}
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
              onClick={() => setVisibleColumns(new Set(defaultHistoricColumns))}
            >
              Reset to Default
            </Button>
            <div className="ml-auto text-xs flex items-center gap-1" style={{ color: 'var(--text-secondary)' }}>
              <span>{visibleColumns.size} visible</span>
              <span>•</span>
              <span>{pinnedColumns.size} pinned</span>
              <span>•</span>
              <span>{allHistoricColumns.length} total</span>
            </div>
          </div>

          {/* Columns by Category with Drag & Drop */}
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <div className="space-y-4">
              {Object.entries(filteredColumnsByCategory).map(([category, columns]) => {
                if (columns.length === 0) return null
                const columnKeys = columns.map(c => c.key)
                return (
                  <div key={category}>
                    <div className="flex items-center gap-2 mb-2">
                      <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{category}</h3>
                      <Separator className="flex-1" />
                    </div>
                    <SortableContext items={columnKeys} strategy={verticalListSortingStrategy}>
                      <div className="space-y-1">
                        {columns.map((column) => (
                          <SortableColumnItem
                            key={column.key}
                            column={column}
                            isVisible={visibleColumns.has(column.key)}
                            isPinned={pinnedColumns.has(column.key)}
                            onToggleVisible={(checked) => {
                              const newSet = new Set(visibleColumns)
                              if (checked) {
                                newSet.add(column.key)
                              } else {
                                newSet.delete(column.key)
                              }
                              setVisibleColumns(newSet)
                            }}
                            onTogglePin={() => togglePinColumn(column.key)}
                          />
                        ))}
                      </div>
                    </SortableContext>
                  </div>
                )
              })}
            </div>
          </DndContext>
        </div>
        <DialogFooter>
          <Button onClick={() => setShowColumnSelector(false)}>Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    {/* Save Preset Dialog */}
    <Dialog open={showSavePreset} onOpenChange={setShowSavePreset}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Save Column Preset</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label htmlFor="preset-name">Preset Name</Label>
            <Input
              id="preset-name"
              placeholder="Enter preset name..."
              value={presetName}
              onChange={(e) => setPresetName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && presetName.trim()) {
                  saveAsPreset()
                }
              }}
            />
          </div>
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
            This will save your current column visibility, pinning, and order configuration.
          </p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => {
            setShowSavePreset(false)
            setPresetName('')
          }}>
            Cancel
          </Button>
          <Button
            onClick={saveAsPreset}
            disabled={!presetName.trim()}
          >
            Save Preset
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    </>
  )
}
