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
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Separator } from '@/components/ui/separator'
import { ArrowUpDown, ArrowUp, ArrowDown, ChevronDown, Filter, Eye, EyeOff, Calendar, Settings2, AlertCircle, MoreVertical, Trash2, Columns3, TrendingUp, TrendingDown, Clock, X, Search, Pin, GripVertical, RefreshCw } from 'lucide-react'
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
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { evaluateExitStrategy, type ExitSignal } from '@/lib/utils/watch-criteria-evaluator'
import TradeStatsCards from './trade-stats-cards'

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
        className={`p-1 rounded transition-colors ${
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

// Trade data type
interface Trade {
  id: string
  name: string
  placed: string
  currentPrice: number
  currentSpreadPrice?: number
  currentPL?: number
  currentPLPercent?: number
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
  category: 'Basic Info' | 'Performance' | 'Greeks' | 'Trade Details'
}

// All available columns
const allColumns: Column[] = [
  { key: 'status', label: 'Status', category: 'Basic Info' },
  { key: 'name', label: 'Name', category: 'Basic Info' },
  { key: 'placed', label: 'Date Placed', category: 'Basic Info' },
  { key: 'currentPrice', label: 'Stock Price', category: 'Basic Info' },
  { key: 'expDate', label: 'Exp Date', category: 'Basic Info' },
  { key: 'dte', label: 'DTE', category: 'Basic Info' },
  { key: 'contractType', label: 'Contract Type', category: 'Basic Info' },
  { key: 'sector', label: 'Sector', category: 'Basic Info' },
  { key: 'ipsScore', label: 'IPS Score', category: 'Basic Info' },
  { key: 'currentSpreadPrice', label: 'Spread Price', category: 'Performance' },
  { key: 'currentPL', label: 'Current P/L', category: 'Performance' },
  { key: 'currentPLPercent', label: 'Current P/L %', category: 'Performance' },
  { key: 'creditReceived', label: 'Credit Received', category: 'Performance' },
  { key: 'maxGain', label: 'Max Gain', category: 'Performance' },
  { key: 'maxLoss', label: 'Max Loss', category: 'Performance' },
  { key: 'percentCurrentToShort', label: '% Current to Short', category: 'Performance' },
  { key: 'percentOfCredit', label: '% of credit', category: 'Performance' },
  { key: 'plDollar', label: 'P/L ($)', category: 'Performance' },
  { key: 'plPercent', label: 'P/L (%)', category: 'Performance' },
  { key: 'deltaShortLeg', label: 'Delta (Short Leg)', category: 'Greeks' },
  { key: 'theta', label: 'Theta', category: 'Greeks' },
  { key: 'vega', label: 'Vega', category: 'Greeks' },
  { key: 'ivAtEntry', label: 'IV at Entry', category: 'Greeks' },
  { key: 'contracts', label: '# of Contracts', category: 'Trade Details' },
  { key: 'shortStrike', label: 'Short Strike', category: 'Trade Details' },
  { key: 'longStrike', label: 'Long Strike', category: 'Trade Details' },
  { key: 'spreadWidth', label: 'Spread Width', category: 'Trade Details' },
  { key: 'dateClosed', label: 'Date Closed', category: 'Trade Details' },
  { key: 'costToClose', label: 'Cost to close', category: 'Trade Details' },
  { key: 'creditPaid', label: 'Credit Paid', category: 'Trade Details' },
  { key: 'notes', label: 'Notes', category: 'Trade Details' }
]

// Default visible columns
const defaultColumns = [
  'status', 'name', 'placed', 'currentPrice', 'expDate', 'dte', 'contractType', 'ipsScore',
  'currentSpreadPrice', 'currentPL', 'currentPLPercent', 'creditReceived'
]

// Preset interface
interface ColumnPreset {
  id: string
  name: string
  visible: string[]
  pinned: string[]
  order: string[]
}

// Default presets
const defaultPresets: ColumnPreset[] = [
  {
    id: 'quick-view',
    name: 'Quick View',
    visible: ['status', 'name', 'currentPL', 'currentPLPercent', 'expDate', 'dte'],
    pinned: ['status', 'name'],
    order: allColumns.map(c => c.key)
  },
  {
    id: 'detailed-view',
    name: 'Detailed View',
    visible: [
      'status', 'name', 'placed', 'currentPrice', 'currentSpreadPrice', 'currentPL',
      'currentPLPercent', 'expDate', 'dte', 'shortStrike', 'longStrike', 'creditReceived'
    ],
    pinned: ['status', 'name'],
    order: allColumns.map(c => c.key)
  },
  {
    id: 'greeks-focus',
    name: 'Greeks Focus',
    visible: [
      'name', 'deltaShortLeg', 'theta', 'vega', 'ivAtEntry',
      'currentPrice', 'expDate', 'dte', 'currentPL'
    ],
    pinned: ['name'],
    order: allColumns.map(c => c.key)
  }
]

export default function ExcelStyleTradesDashboard() {
  // State
  const [showIPS, setShowIPS] = useState(false)
  const [visibleColumns, setVisibleColumns] = useState(new Set(defaultColumns))
  const [showColumnSelector, setShowColumnSelector] = useState(false)
  const [columnSearchTerm, setColumnSearchTerm] = useState('')
  const [pinnedColumns, setPinnedColumns] = useState<Set<string>>(new Set())
  const [columnOrder, setColumnOrder] = useState<string[]>(allColumns.map(c => c.key))
  const [presets, setPresets] = useState<ColumnPreset[]>(defaultPresets)
  const [showSavePreset, setShowSavePreset] = useState(false)
  const [presetName, setPresetName] = useState('')
  const [sortConfig, setSortConfig] = useState<{key: string, direction: 'asc' | 'desc'} | null>(null)
  const [filterText, setFilterText] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('')
  const [trades, setTrades] = useState<Trade[]>([])
  const [loading, setLoading] = useState<boolean>(false)
  const [refreshing, setRefreshing] = useState<boolean>(false)
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null)
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

          // For credit spreads, use the spread price (current_spread_price) for exit evaluation
          // This is the actual cost to close the spread, not the underlying stock price
          const spreadPrice = r.current_spread_price ? Number(r.current_spread_price) : undefined
          const tradeForEval = {
            current_price: spreadPrice,  // Use spread price for exit evaluation
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

          // Calculate current P/L from spread price (spreadPrice already declared above)
          const creditReceived = Number(r.credit_received ?? 0) || 0
          const contracts = Number(r.number_of_contracts ?? r.contracts ?? 1) || 0

          let currentPL: number | undefined
          let currentPLPercent: number | undefined

          if (spreadPrice !== undefined && creditReceived > 0) {
            // For credit spreads: P/L = (credit received - cost to close) * contracts * 100
            const plPerContract = creditReceived - spreadPrice
            currentPL = plPerContract * contracts * 100
            currentPLPercent = (plPerContract / creditReceived) * 100
          }

          const obj: Trade = {
            id: r.id,
            name: r.name || r.symbol,
            placed: r.entry_date || r.created_at || '',
            currentPrice: current,
            currentSpreadPrice: spreadPrice,
            currentPL,
            currentPLPercent,
            expDate: exp,
            dte: exp ? daysToExpiry(exp) : 0,
            contractType: toTitle(String(r.contract_type || '')),
            contracts,
            shortStrike: Number(r.short_strike ?? 0) || 0,
            longStrike: Number(r.long_strike ?? 0) || 0,
            creditReceived,
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

        // Filter out trades that are in Action Needed (even if DTE > 0)
        // and trades with DTE <= 0
        const actionNeededIds = new Set<string>()
        try {
          const raw = localStorage.getItem(LOCAL_CLOSURE_KEY)
          const obj = raw ? JSON.parse(raw) : {}
          Object.entries(obj).forEach(([tradeId, meta]: [string, any]) => {
            if (meta?.needsAction) {
              actionNeededIds.add(tradeId)
            }
          })
        } catch {}

        setTrades(normalized.filter(t => t.dte > 0 && !actionNeededIds.has(t.id)))
      } catch (e) {
        console.error('Failed to load dashboard trades', e)
        setTrades([])
      } finally {
        setLoading(false)
      }
    }
    load()

    // Listen for trades being moved back to active from Action Needed
    const handleTradesUpdated = () => {
      load()
    }
    window.addEventListener(TRADES_UPDATED_EVENT, handleTradesUpdated)
    return () => window.removeEventListener(TRADES_UPDATED_EVENT, handleTradesUpdated)
  }, [])

  // Refresh handler - updates all active trades with current market data
  const handleRefresh = async () => {
    try {
      setRefreshing(true)

      // First, backfill any missing IPS scores
      try {
        console.log('[Refresh] Checking for missing IPS scores...')
        const backfillRes = await fetch('/api/trades/backfill-ips', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          cache: 'no-store'
        })
        const backfillData = await backfillRes.json()
        if (backfillRes.ok && backfillData.summary?.updated > 0) {
          console.log(`[Refresh] Backfilled ${backfillData.summary.updated} IPS scores`)
        }
      } catch (backfillError) {
        console.error('[Refresh] IPS backfill failed (non-critical):', backfillError)
        // Don't fail the whole refresh if backfill fails
      }

      // Then refresh market data
      const res = await fetch('/api/trades/refresh-active', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store'
      })

      const data = await res.json()

      if (res.ok && data.success) {
        setLastRefresh(new Date())
        // Reload trades from database (they've been updated by the refresh endpoint)
        const tradesRes = await fetch(`/api/trades?status=active`, { cache: 'no-store' })
        const tradesJson = await tradesRes.json()
        if (tradesRes.ok) {
          // Re-run the same normalization logic from the load function
          const rows = (tradesJson?.data || []) as any[]
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

          let ipsMap: Record<string, any> = {}
          try {
            const ipsRes = await fetch('/api/ips', { cache: 'no-store' })
            const ipsJson = await ipsRes.json()
            if (ipsRes.ok && Array.isArray(ipsJson)) {
              ipsJson.forEach((ips: any) => { ipsMap[ips.id] = ips })
            }
          } catch {}

          const normalized: Trade[] = rows.map((r:any) => {
            const current = (quoteMap[r.symbol] ?? Number(r.current_price ?? 0)) || 0
            const short = Number(r.short_strike ?? r.strike_price_short ?? 0) || 0
            const percentToShort = short > 0 ? ((current - short) / short) * 100 : 0
            const ipsScore = typeof r.ips_score === 'number' ? Number(r.ips_score) : undefined
            const watch = (ipsScore != null && ipsScore < 75) || (short > 0 && percentToShort < 5)

            const ips = r.ips_id ? ipsMap[r.ips_id] : null
            const spreadPrice = r.current_spread_price ? Number(r.current_spread_price) : undefined
            const tradeForEval = {
              current_price: spreadPrice,
              entry_price: Number(r.entry_price ?? r.credit_received ?? 0),
              credit_received: Number(r.credit_received ?? 0),
              expiration_date: r.expiration_date,
              max_gain: Number(r.max_gain ?? 0),
              max_loss: Number(r.max_loss ?? 0),
            }
            const exitSignal = ips?.exit_strategies ? evaluateExitStrategy(tradeForEval, ips.exit_strategies) : null

            let status: 'GOOD' | 'WATCH' | 'EXIT' = 'GOOD'
            if (exitSignal?.shouldExit) {
              status = 'EXIT'
            } else if (watch) {
              status = 'WATCH'
            } else if (percentToShort < 0) {
              status = 'EXIT'
            }

            const creditReceived = Number(r.credit_received ?? 0) || 0
            const contracts = Number(r.number_of_contracts ?? r.contracts ?? 1) || 0
            let currentPL: number | undefined
            let currentPLPercent: number | undefined
            if (spreadPrice !== undefined && creditReceived > 0) {
              const plPerContract = creditReceived - spreadPrice
              currentPL = plPerContract * contracts * 100
              currentPLPercent = (plPerContract / creditReceived) * 100
            }

            return {
              id: r.id,
              name: r.name || r.symbol,
              placed: r.entry_date || r.created_at || '',
              currentPrice: current,
              currentSpreadPrice: spreadPrice,
              currentPL,
              currentPLPercent,
              expDate: r.expiration_date || '',
              dte: r.expiration_date ? daysToExpiry(r.expiration_date) : 0,
              contractType: toTitle(String(r.contract_type || '')),
              contracts,
              shortStrike: short,
              longStrike: Number(r.long_strike ?? 0) || 0,
              creditReceived,
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
              ipsScore,
              ipsName: r.ips_name ?? r.ips_configurations?.name ?? null,
              plPercent: typeof r.pl_percent === 'number' ? Number(r.pl_percent) : undefined,
              exitSignal,
            } as Trade
          })

          // Filter out trades that are in Action Needed (even if DTE > 0)
          // and trades with DTE <= 0
          const actionNeededIds = new Set<string>()
          try {
            const raw = localStorage.getItem(LOCAL_CLOSURE_KEY)
            const obj = raw ? JSON.parse(raw) : {}
            Object.entries(obj).forEach(([tradeId, meta]: [string, any]) => {
              if (meta?.needsAction) {
                actionNeededIds.add(tradeId)
              }
            })
          } catch {}

          setTrades(normalized.filter(t => t.dte > 0 && !actionNeededIds.has(t.id)))
          dispatchTradesUpdated({ type: 'full_refresh' })
        }
      }
    } catch (error) {
      console.error('Failed to refresh trades:', error)
    } finally {
      setRefreshing(false)
    }
  }

  // Load column preferences from database on mount
  useEffect(() => {
    const loadPreferences = async () => {
      try {
        const res = await fetch('/api/preferences?key=dashboard_columns')
        if (res.ok) {
          const { value } = await res.json()
          if (value) {
            if (value.visible) {
              setVisibleColumns(new Set(value.visible))
            }
            if (value.pinned) {
              setPinnedColumns(new Set(value.pinned))
            }
            if (value.order) {
              setColumnOrder(value.order)
            }
            if (value.presets) {
              setPresets([...defaultPresets, ...value.presets])
            }
          }
        }
      } catch (e) {
        console.error('Failed to load column preferences from database', e)
      }
    }
    loadPreferences()
  }, [])

  // Save all column preferences to database whenever they change
  useEffect(() => {
    const savePreferences = async () => {
      try {
        // Get only user-created presets (exclude default presets)
        const userPresets = presets.filter(p => !defaultPresets.some(dp => dp.id === p.id))

        await fetch('/api/preferences', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            key: 'dashboard_columns',
            value: {
              visible: Array.from(visibleColumns),
              pinned: Array.from(pinnedColumns),
              order: columnOrder,
              presets: userPresets,
            }
          })
        })
      } catch (e) {
        console.error('Failed to save column preferences to database', e)
      }
    }

    // Debounce the save operation to avoid too many API calls
    const timeoutId = setTimeout(savePreferences, 500)
    return () => clearTimeout(timeoutId)
  }, [visibleColumns, pinnedColumns, columnOrder, presets])

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

  // Calculate trade statistics
  const tradeStats = React.useMemo(() => {
    const totalActive = processedTrades.length
    let tradesGood = 0
    let tradesOnWatch = 0
    let tradesExit = 0
    let totalCurrentPL = 0
    let totalMaxProfit = 0
    let totalMaxLoss = 0

    processedTrades.forEach(trade => {
      // Count by status
      const status = String(trade.status).toUpperCase()
      if (status === 'EXIT') {
        tradesExit++
      } else if (status === 'WATCH') {
        tradesOnWatch++
      } else if (status === 'GOOD') {
        tradesGood++
      }

      // Sum financial metrics
      totalCurrentPL += trade.currentPL || 0
      totalMaxProfit += trade.maxGain || 0
      totalMaxLoss += trade.maxLoss || 0
    })

    return {
      totalActive,
      tradesGood,
      tradesOnWatch,
      tradesExit,
      totalCurrentPL,
      totalMaxProfit,
      totalMaxLoss
    }
  }, [processedTrades])

  // Filter columns by search term and group by category, respecting column order
  const filteredColumnsByCategory = React.useMemo(() => {
    // Create a map for quick lookup
    const columnMap = new Map(allColumns.map(col => [col.key, col]))

    // Sort columns by the custom order
    const orderedColumns = columnOrder
      .map(key => columnMap.get(key))
      .filter((col): col is Column => col !== undefined)

    // Filter by search term
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

    // Add new preset to state (will be saved to database by useEffect)
    setPresets([...presets, newPreset])
    setPresetName('')
    setShowSavePreset(false)
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
      case 'name':
        return <span className="font-semibold">{value}</span>
      case 'creditReceived':
      case 'costToClose':
      case 'creditPaid':
      case 'plDollar':
      case 'maxGain':
      case 'maxLoss':
      case 'currentSpreadPrice':
        return currencyFormatter.format(value)
      case 'currentPL': {
        if (typeof value !== 'number') return '-'
        const className = value >= 0 ? 'pl-value positive text-green-600 font-medium' : 'pl-value negative text-red-600 font-medium'
        return (
          <span className={className}>
            {currencyFormatter.format(value)}
          </span>
        )
      }
      case 'currentPLPercent': {
        if (typeof value !== 'number') return '-'
        const className = value >= 0 ? 'pl-percentage positive text-green-600 font-medium' : 'pl-percentage negative text-red-600 font-medium'
        const Icon = value >= 0 ? TrendingUp : TrendingDown
        return (
          <span className={`${className} inline-flex items-center gap-1`}>
            {percentFormatter.format(value)}%
            <Icon className="h-3 w-3" />
          </span>
        )
      }
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
        const exitSignal = trade.exitSignal

        // Determine badge text and class based on status and exit signal type
        let badgeClass: string
        let displayText: string = tag

        if (exitSignal?.shouldExit) {
          // Set display text based on exit type
          if (exitSignal.type === 'profit') {
            displayText = 'EXIT (PROFIT)'
            badgeClass = 'status-badge good'
          } else if (exitSignal.type === 'loss') {
            displayText = 'EXIT (LOSS)'
            badgeClass = 'status-badge exit'
          } else if (exitSignal.type === 'time') {
            displayText = 'EXIT (TIME)'
            badgeClass = 'status-badge watch'
          } else {
            displayText = 'EXIT'
            badgeClass = 'status-badge exit'
          }
        } else if (tag === 'EXIT') {
          // Exit (not from strategy - e.g., stock breached strike)
          badgeClass = 'status-badge exit'
        } else if (tag === 'GOOD') {
          // Good status
          badgeClass = 'status-badge good'
        } else {
          // Watch: yellow
          badgeClass = 'status-badge watch'
        }

        if (exitSignal?.shouldExit) {
          const icon = exitSignal.type === 'profit' ? <TrendingUp className="h-3 w-3" /> :
                      exitSignal.type === 'loss' ? <TrendingDown className="h-3 w-3" /> :
                      <Clock className="h-3 w-3" />

          return (
            <Popover>
              <PopoverTrigger asChild>
                <span className={`${badgeClass} cursor-pointer hover:opacity-80 inline-flex items-center gap-1`}>
                  {icon}
                  {displayText}
                </span>
              </PopoverTrigger>
              <PopoverContent className="w-64">
                <div className="space-y-2">
                  <div className="font-semibold text-sm flex items-center gap-2">
                    {icon}
                    {exitSignal.type === 'profit' ? 'Take Profit Signal' :
                     exitSignal.type === 'loss' ? 'Stop Loss Signal' :
                     'Time Exit Signal'}
                  </div>
                  <div className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                    {exitSignal.reason}
                  </div>
                  <div className="text-xs font-medium mt-2" style={{ color: 'var(--text-primary)' }}>
                    Consider closing this position
                  </div>
                </div>
              </PopoverContent>
            </Popover>
          )
        }

        return <span className={badgeClass}>{displayText}</span>
      }
      case 'deltaShortLeg':
      case 'theta':
      case 'vega':
        return value.toFixed(2)
      default:
        return value
    }
  }

  // Get columns to show based on IPS view, with pinned columns first
  const columnsToShow = React.useMemo(() => {
    if (showIPS && hasActiveIPS) {
      // Show IPS factor columns instead of trade columns
      return activeIPSFactors.map(factor => ({
        key: factor.toLowerCase().replace(/\s+/g, ''),
        label: factor,
        category: 'Basic Info' as const
      }))
    }

    const filtered = allColumns.filter(col => visibleColumns.has(col.key))

    // Separate pinned and unpinned columns
    const pinned = filtered.filter(col => pinnedColumns.has(col.key))
    const unpinned = filtered.filter(col => !pinnedColumns.has(col.key))

    // Return pinned columns first, then unpinned
    return [...pinned, ...unpinned]
  }, [showIPS, hasActiveIPS, activeIPSFactors, visibleColumns, pinnedColumns])

  // Calculate cumulative widths for sticky positioning
  const stickyOffsets = React.useMemo(() => {
    const offsets: Record<string, number> = {}
    let cumulativeWidth = 0

    columnsToShow.forEach((col) => {
      if (pinnedColumns.has(col.key)) {
        offsets[col.key] = cumulativeWidth
        // Default width, will be updated if we implement resizing
        cumulativeWidth += 150
      }
    })

    return offsets
  }, [columnsToShow, pinnedColumns])

  if (loading && trades.length === 0) {
    return (
      <Card className="w-full">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Current Trades</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-12" style={{ color: 'var(--text-secondary)' }}>Loading active trades…</div>
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
            <AlertCircle className="h-12 w-12 mx-auto mb-4" style={{ color: 'var(--text-tertiary)' }} />
            <h3 className="text-lg font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>No Active Trades</h3>
            <p className="mb-4" style={{ color: 'var(--text-secondary)' }}>Start by adding your first paper trade to track.</p>
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
          <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>
            {processedTrades.length} active {processedTrades.length === 1 ? 'trade' : 'trades'}
          </p>
        </div>
        
        <div className="flex gap-2">
          {/* Refresh button */}
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            disabled={refreshing || loading}
            title={lastRefresh ? `Last refreshed: ${lastRefresh.toLocaleTimeString()}` : 'Refresh all trades'}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
            {refreshing ? 'Refreshing...' : 'Refresh'}
          </Button>

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
        <TradeStatsCards {...tradeStats} />

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
                        {formatValue(cellValue, column, trade)}
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
            <div className="flex items-start justify-between gap-3 rounded-md p-3" style={{ border: '1px solid var(--glass-border)', background: 'var(--glass-bg)' }}>
              <div>
                <Label htmlFor="move-to-action-needed" className="text-sm font-medium">Move to Action Needed</Label>
                <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>Keep the trade open while you finalize close-out details later.</p>
              </div>
              <Checkbox
                id="move-to-action-needed"
                checked={closing.moveToActionNeeded}
                onCheckedChange={(checked)=> setClosing(prev => ({ ...prev, moveToActionNeeded: Boolean(checked) }))}
              />
            </div>
            <div className="space-y-3">
              <div className="text-sm" style={{ color: 'var(--text-secondary)' }}>{closing.trade.name}</div>
              <div>
                <Label className="text-sm">Close Date</Label>
                <Input type="date" value={closing.date} onChange={(e)=> setClosing(prev => ({ ...prev, date: e.target.value }))} />
              </div>
              <div>
                <Label className="text-sm mb-3 block">Closing Reason</Label>
                <RadioGroup
                  value={closing.reason}
                  onValueChange={(value) => setClosing(prev => ({ ...prev, reason: value }))}
                  className="grid grid-cols-2 gap-3"
                >
                  {[
                    { key: 'manual close', label: 'Manual Close' },
                    { key: 'expired', label: 'Expired' },
                    { key: 'exit (profit)', label: 'Exit (Profit)' },
                    { key: 'exit (loss)', label: 'Exit (Loss)' },
                  ].map(method => (
                    <Label
                      key={method.key}
                      htmlFor={`reason-${method.key}`}
                      className={`flex items-center gap-3 p-4 rounded-xl border-2 cursor-pointer transition-all hover:border-[var(--gradient-primary-start)] hover:bg-[var(--glass-bg-hover)] ${
                        closing.reason === method.key
                          ? 'border-[var(--gradient-primary-start)] bg-[var(--glass-bg-hover)]'
                          : 'border-[var(--glass-border)] bg-[var(--glass-bg)]'
                      }`}
                    >
                      <RadioGroupItem value={method.key} id={`reason-${method.key}`} />
                      <span className="text-sm font-medium">{method.label}</span>
                    </Label>
                  ))}
                </RadioGroup>
              </div>
              <div>
                <Label className="text-sm">Cost to Close (per spread)</Label>
                <Input
                  inputMode="decimal"
                  value={closing.costToClose}
                  onChange={(e)=> setClosing(prev => ({ ...prev, costToClose: e.target.value }))}
                  placeholder="e.g., 0.35"
                />
                <div className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>Initial credit: ${closing.trade.creditReceived.toFixed(2)} • Contracts: {closing.trade.contracts}</div>
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
        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
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
            <div className="ml-auto text-xs flex items-center gap-1" style={{ color: 'var(--text-secondary)' }}>
              <span>{visibleColumns.size} visible</span>
              <span>•</span>
              <span>{pinnedColumns.size} pinned</span>
              <span>•</span>
              <span>{allColumns.length} total</span>
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
