// src/components/dashboard/action-needed-trades.tsx

"use client"

import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { AlertCircle, Loader2, RefreshCw, Trash2, MoreVertical } from 'lucide-react'
import { dispatchTradesUpdated, TRADES_UPDATED_EVENT } from '@/lib/events'
import { cn } from '@/lib/utils'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

interface ActionTrade {
  id: string
  name: string
  symbol: string
  contractType: string
  expirationDate: string | null
  dte: number | null
  contracts: number
  creditReceived: number | null
  spreadWidth: number | null
  numberOfContracts: number
  createdAt: string | null
  entryDate: string | null
  status: string
  ipsScore?: number | null
  underlyingPrice?: number | null
  ipsName?: string | null
  closeMeta?: Record<string, any>
  [key: string]: any
}

type CloseDialogState = {
  open: boolean
  trade: ActionTrade | null
  closeDate: string
  closeMethod: string
  costToClosePerSpread: string
  saving: boolean
  error?: string | null
}

const closeMethods = [
  { key: 'manual close', label: 'Manual Close' },
  { key: 'expired', label: 'Expired' },
  { key: 'exit (profit)', label: 'Exit (Profit)' },
  { key: 'exit (loss)', label: 'Exit (Loss)' },
]

const LOCAL_CLOSURE_KEY = 'tenxiv:trade-closures'

const currencyFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

function daysToExpiry(exp: string | null): number | null {
  if (!exp) return null
  const d = new Date(exp)
  if (Number.isNaN(d.getTime())) return null
  // Options expire at 4PM ET on expiration day, so set to 4PM (16:00) for accurate DTE
  const expiry = new Date(d)
  expiry.setHours(16, 0, 0, 0)
  const now = new Date()
  const diff = expiry.getTime() - now.getTime()
  return Math.ceil(diff / (1000 * 60 * 60 * 24))
}

export function ActionNeededTradesPanel() {
  const [trades, setTrades] = useState<ActionTrade[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [closingDialog, setClosingDialog] = useState<CloseDialogState>({
    open: false,
    trade: null,
    closeDate: new Date().toISOString().slice(0, 10),
    closeMethod: 'manual close',
    costToClosePerSpread: '',
    saving: false,
    error: null,
  })
  const [deleteDialog, setDeleteDialog] = useState<{ open: boolean; trade: ActionTrade | null }>({ open: false, trade: null })
  const [searchTerm, setSearchTerm] = useState('')
  const [reasonFilter, setReasonFilter] = useState<string>('all')

  const loadTrades = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const res = await fetch(`/api/trades?status=active`, { cache: 'no-store' })
      const json = await res.json()
      if (!res.ok) {
        throw new Error(json?.error || 'Failed to load trades that need action')
      }
      let closeMap: Record<string, any> = {}
      try {
        const raw = localStorage.getItem(LOCAL_CLOSURE_KEY)
        closeMap = raw ? JSON.parse(raw) : {}
      } catch {}

      const rows: ActionTrade[] = (json?.data || [])
        .filter((row: any) => closeMap?.[row.id]?.needsAction)
        .map((row: any) => {
          const exp = row.expiration_date || null
          const stored = closeMap[row.id] || {}
          return {
            id: row.id,
            name: row.name || row.symbol,
            symbol: row.symbol,
            contractType: String(row.contract_type || '').replace(/-/g, ' ').replace(/\b\w/g, (m: string) => m.toUpperCase()),
            expirationDate: exp,
            dte: daysToExpiry(exp),
            contracts: Number(row.number_of_contracts ?? stored.contractsClosed ?? 0) || 0,
            creditReceived: typeof row.credit_received === 'number' ? row.credit_received : null,
            spreadWidth: typeof row.spread_width === 'number' ? row.spread_width : null,
            numberOfContracts: Number(row.number_of_contracts ?? stored.contractsClosed ?? 0) || 0,
            createdAt: row.created_at || null,
            entryDate: row.entry_date || null,
            status: row.status,
            ipsScore: typeof row.ips_score === 'number' ? row.ips_score : null,
            underlyingPrice: typeof row.current_price === 'number' ? row.current_price : null,
            ipsName: stored.ipsName ?? row.ips_name ?? row.ips_configurations?.name ?? null,
            closeMeta: stored,
            raw: row,
          }
        })
      setTrades(rows)
    } catch (e: any) {
      console.error('Failed to load action-needed trades', e)
      setError(e?.message || 'Unable to load action-needed trades')
      setTrades([])
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

  const uniqueReasons = useMemo(() => {
    const set = new Set<string>()
    trades.forEach(t => {
      const reason = t.closeMeta?.reason
      if (reason) set.add(reason)
    })
    return Array.from(set).sort()
  }, [trades])

  const filteredTrades = useMemo(() => {
    const norm = searchTerm.trim().toLowerCase()
    return [...trades]
      .filter(t => {
        const meta = t.closeMeta || {}
        const matchesSearch = !norm || [t.name, t.symbol, t.ipsName, meta.reason]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(norm))
        const matchesReason = reasonFilter === 'all' || meta.reason === reasonFilter
        return matchesSearch && matchesReason
      })
      .sort((a, b) => {
        const ad = a.dte ?? Infinity
        const bd = b.dte ?? Infinity
        return ad - bd
      })
  }, [trades, searchTerm, reasonFilter])

  const resetDialog = () => {
    setClosingDialog({
      open: false,
      trade: null,
      closeDate: new Date().toISOString().slice(0, 10),
      closeMethod: 'manual close',
      costToClosePerSpread: '',
      saving: false,
      error: null,
    })
  }

  async function handleBackToActive(id: string) {
    try {
      try {
        const raw = localStorage.getItem(LOCAL_CLOSURE_KEY)
        const obj = raw ? JSON.parse(raw) : {}
        if (obj[id]) {
          delete obj[id].needsAction
          if (Object.keys(obj[id]).length === 0) delete obj[id]
          localStorage.setItem(LOCAL_CLOSURE_KEY, JSON.stringify(obj))
        }
      } catch {}
      setTrades(prev => prev.filter(t => t.id !== id))
      dispatchTradesUpdated({ type: 'returned-to-active', id })
    } catch (e) {
      console.error('Failed to move trade back to active', e)
    }
  }

  async function handleDelete(id: string) {
    try {
      await fetch('/api/trades', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: [id] }),
      })
      try {
        const raw = localStorage.getItem(LOCAL_CLOSURE_KEY)
        const obj = raw ? JSON.parse(raw) : {}
        if (obj[id]) {
          delete obj[id]
          localStorage.setItem(LOCAL_CLOSURE_KEY, JSON.stringify(obj))
        }
      } catch {}
      setTrades(prev => prev.filter(t => t.id !== id))
      dispatchTradesUpdated({ type: 'delete', scope: 'action_needed', id })
    } catch (e) {
      console.error('Failed to delete trade', e)
    }
  }

  async function handleCloseTrade() {
    if (!closingDialog.trade) return
    try {
      setClosingDialog(prev => ({ ...prev, saving: true, error: null }))
      const payload: Record<string, unknown> = {
        tradeId: closingDialog.trade.id,
        closeMethod: closingDialog.closeMethod,
        closeDate: closingDialog.closeDate,
        costToClosePerSpread: closingDialog.costToClosePerSpread ? parseFloat(closingDialog.costToClosePerSpread) : null,
        contractsClosed: closingDialog.trade.contracts || null,
      }
      const res = await fetch('/api/trades/close', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        throw new Error(json?.error || 'Failed to close trade')
      }
      setTrades(prev => prev.filter(t => t.id !== closingDialog.trade?.id))
      try {
        const raw = localStorage.getItem(LOCAL_CLOSURE_KEY)
        const obj = raw ? JSON.parse(raw) : {}
        if (obj[closingDialog.trade.id]) {
          delete obj[closingDialog.trade.id]
          localStorage.setItem(LOCAL_CLOSURE_KEY, JSON.stringify(obj))
        }
      } catch {}
      dispatchTradesUpdated({ type: 'closed', id: closingDialog.trade.id })
      resetDialog()
    } catch (e: any) {
      console.error('Close trade failed', e)
      setClosingDialog(prev => ({ ...prev, saving: false, error: e?.message || 'Unable to close trade' }))
    }
  }

  if (loading && trades.length === 0) {
    return (
      <Card className="w-full">
        <CardHeader className="flex items-center justify-between">
          <CardTitle>Action Needed</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8 text-gray-500">
            <Loader2 className="h-5 w-5 animate-spin mr-2" />
            Loading action-needed trades…
          </div>
        </CardContent>
      </Card>
    )
  }

  if (error && trades.length === 0) {
    return (
      <Card className="w-full">
        <CardHeader className="flex items-center justify-between">
          <CardTitle>Action Needed</CardTitle>
          <Button variant="ghost" size="sm" onClick={loadTrades}>
            <RefreshCw className="h-4 w-4" />
          </Button>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-sm text-red-600 flex flex-col items-center gap-2">
            <AlertCircle className="h-6 w-6" />
            {error}
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <>
      <Card className="w-full">
        <CardHeader className="flex items-center justify-between">
          <div>
            <CardTitle>Action Needed</CardTitle>
            <p className="text-sm text-gray-600 mt-1">
              {filteredTrades.length === 0 ? 'No trades awaiting action.' : `${filteredTrades.length} trade${filteredTrades.length === 1 ? '' : 's'} awaiting close details`}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={loadTrades} disabled={loading}>
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col md:flex-row md:items-center gap-3 mb-4">
            <Input
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              placeholder="Search by symbol, IPS, or reason"
              className="md:w-64"
            />
            <Select value={reasonFilter || 'all'} onValueChange={value => setReasonFilter(value === 'all' ? '' : value)}>
              <SelectTrigger className="w-full md:w-48">
                <SelectValue placeholder="All reasons" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All reasons</SelectItem>
                {uniqueReasons.map(reason => (
                  <SelectItem key={reason} value={reason}>{reason}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {filteredTrades.length === 0 ? (
            <div className="text-center py-10 text-sm text-gray-600">
              All caught up! No trades require action.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse border border-[var(--glass-border)] text-sm">
                <thead>
                  <tr className="bg-muted/40">
                    <th className="border border-[var(--glass-border)] px-3 py-2 text-left text-foreground">Status</th>
                    <th className="border border-[var(--glass-border)] px-3 py-2 text-left text-foreground">Trade</th>
                    <th className="border border-[var(--glass-border)] px-3 py-2 text-left text-foreground">Symbol</th>
                    <th className="border border-[var(--glass-border)] px-3 py-2 text-left text-foreground">IPS</th>
                    <th className="border border-[var(--glass-border)] px-3 py-2 text-left text-foreground">Contract</th>
                    <th className="border border-[var(--glass-border)] px-3 py-2 text-left text-foreground">Exp Date</th>
                    <th className="border border-[var(--glass-border)] px-3 py-2 text-left text-foreground">DTE</th>
                    <th className="border border-[var(--glass-border)] px-3 py-2 text-left text-foreground">Contracts</th>
                    <th className="border border-[var(--glass-border)] px-3 py-2 text-left text-foreground">Credit</th>
                    <th className="border border-[var(--glass-border)] px-3 py-2 text-left text-foreground">Close Date</th>
                    <th className="border border-[var(--glass-border)] px-3 py-2 text-left text-foreground">Reason</th>
                    <th className="border border-[var(--glass-border)] px-3 py-2 text-left text-foreground">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredTrades.map(trade => {
                    const meta = trade.closeMeta || {}
                    const closeDate = meta.date ? new Date(meta.date).toLocaleDateString() : '—'
                    const reasonLabel = closeMethods.find(m => m.key === meta.reason)?.label || meta.reason || 'Not set'
                    return (
                      <tr key={trade.id} className="hover:bg-muted/40">
                        <td className="border border-[var(--glass-border)] px-3 py-2">
                          <Badge className={`${String(trade.status || '').toLowerCase() === 'active' ? 'bg-green-100 text-green-800 border-green-200' : String(trade.status || '').toLowerCase() === 'closed' ? 'bg-gray-200 text-gray-700 border-gray-300' : 'bg-yellow-100 text-yellow-800 border-yellow-200'} border uppercase`}>
                            {String(trade.status || 'unknown').toUpperCase()}
                          </Badge>
                        </td>
                        <td className="border border-[var(--glass-border)] px-3 py-2">
                          <div className="font-medium">{trade.name}</div>
                          <div className="text-xs text-gray-500">{trade.createdAt ? new Date(trade.createdAt).toLocaleDateString() : ''}</div>
                        </td>
                        <td className="border border-[var(--glass-border)] px-3 py-2">{trade.symbol}</td>
                        <td className="border border-[var(--glass-border)] px-3 py-2">{trade.ipsName || '—'}</td>
                        <td className="border border-[var(--glass-border)] px-3 py-2">{trade.contractType}</td>
                        <td className="border border-[var(--glass-border)] px-3 py-2">{trade.expirationDate ? new Date(trade.expirationDate).toLocaleDateString() : '—'}</td>
                        <td className="border border-[var(--glass-border)] px-3 py-2">
                          {trade.dte === null ? '—' : (
                            <Badge variant={trade.dte <= 0 ? 'destructive' : 'outline'}>
                              {trade.dte}
                            </Badge>
                          )}
                        </td>
                        <td className="border border-[var(--glass-border)] px-3 py-2">{trade.contracts}</td>
                        <td className="border border-[var(--glass-border)] px-3 py-2">
                          {trade.creditReceived != null ? currencyFormatter.format(trade.creditReceived) : '—'}
                        </td>
                        <td className="border border-[var(--glass-border)] px-3 py-2">{closeDate}</td>
                        <td className="border border-[var(--glass-border)] px-3 py-2">
                          {meta.reason ? (
                            <Badge variant="secondary" className="capitalize">{reasonLabel}</Badge>
                          ) : '—'}
                        </td>
                        <td className="border border-[var(--glass-border)] px-3 py-2">
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
                            <DropdownMenuContent align="end" className="w-56">
                              <DropdownMenuItem
                                onSelect={() => setClosingDialog(prev => ({
                                  ...prev,
                                  open: true,
                                  trade,
                                  closeDate: trade.closeMeta?.date || new Date().toISOString().slice(0, 10),
                                  closeMethod: trade.closeMeta?.reason || 'manual close',
                                  costToClosePerSpread: trade.closeMeta?.costToClose != null ? String(trade.closeMeta.costToClose) : '',
                                  saving: false,
                                  error: null,
                                }))}
                              >
                                Enter Close Details
                              </DropdownMenuItem>
                              <DropdownMenuItem onSelect={() => handleBackToActive(trade.id)}>
                                Back to Active
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
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={closingDialog.open} onOpenChange={open => {
        if (!open) {
          resetDialog()
        }
      }}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Enter Close Details</DialogTitle>
            </DialogHeader>
            {closingDialog.trade && (
              <div className="space-y-4">
                <div className="text-sm text-gray-600">{closingDialog.trade.name}</div>
                <div>
                  <Label className="text-sm">Close Date</Label>
                  <Input type="date" value={closingDialog.closeDate} onChange={e => setClosingDialog(prev => ({ ...prev, closeDate: e.target.value }))} />
                </div>
                <div>
                  <Label className="text-sm mb-3 block">Closing Reason</Label>
                  <RadioGroup
                    value={closingDialog.closeMethod}
                    onValueChange={value => setClosingDialog(prev => ({ ...prev, closeMethod: value }))}
                    className="grid grid-cols-2 gap-3"
                  >
                    {closeMethods.map(method => (
                      <Label
                        key={method.key}
                        htmlFor={method.key}
                        className={cn(
                          "flex items-center gap-3 p-4 rounded-xl border-2 cursor-pointer transition-all",
                          "hover:border-[var(--gradient-primary-start)] hover:bg-[var(--glass-bg-hover)]",
                          closingDialog.closeMethod === method.key
                            ? "border-[var(--gradient-primary-start)] bg-[var(--glass-bg-hover)]"
                            : "border-[var(--glass-border)] bg-[var(--glass-bg)]"
                        )}
                      >
                        <RadioGroupItem value={method.key} id={method.key} />
                        <span className="text-sm font-medium">{method.label}</span>
                      </Label>
                    ))}
                  </RadioGroup>
                </div>
                <div>
                  <Label className="text-sm">Cost to Close (per spread)</Label>
                  <Input
                    inputMode="decimal"
                    placeholder="e.g., 0.35"
                    value={closingDialog.costToClosePerSpread}
                    onChange={e => setClosingDialog(prev => ({ ...prev, costToClosePerSpread: e.target.value }))}
                  />
                  <div className="text-xs text-gray-500 mt-1">
                    Initial credit: ${closingDialog.trade.creditReceived?.toFixed(2) ?? '0.00'} • Contracts: {closingDialog.trade.contracts}
                  </div>
                </div>
                {closingDialog.error && (
                  <p className="text-sm text-red-600">{closingDialog.error}</p>
                )}
              </div>
            )}
          <DialogFooter>
            <Button variant="outline" onClick={resetDialog} disabled={closingDialog.saving}>
              Cancel
            </Button>
            <Button onClick={handleCloseTrade} disabled={closingDialog.saving}>
              {closingDialog.saving ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Saving…
                </>
              ) : (
                'Save & Close Trade'
              )}
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
                  await handleDelete(deleteDialog.trade.id)
                }
                setDeleteDialog({ open: false, trade: null })
              }}
            >
              Delete Trade
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

export default ActionNeededTradesPanel
