// src/components/ips/ips-performance-tracker.tsx

"use client"

import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Target, Trophy, ArrowDownCircle, Loader2, AlertCircle } from 'lucide-react'
import Link from 'next/link'
import { TRADES_UPDATED_EVENT } from '@/lib/events'

type IpsOption = {
  id: string
  name: string
  isActive: boolean
}

type IpsStats = {
  totalTrades: number
  wins: number
  best: number
  worst: number
  totalPL: number
  firstTradeDate: string | null
  daysInDeployment: number
}

const currencyFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

function formatPL(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '--'
  const prefix = value > 0 ? '+' : value < 0 ? '-' : ''
  return `${prefix}${currencyFormatter.format(Math.abs(value))}`
}

function formatDate(dateString: string | null): string {
  if (!dateString) return '--'
  const date = new Date(dateString)
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export function IPSPerformanceTracker() {
  const [ipsOptions, setIpsOptions] = useState<IpsOption[]>([])
  const [statsByIps, setStatsByIps] = useState<Record<string, IpsStats>>({})
  const [selectedIpsId, setSelectedIpsId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const loadData = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)

      const [ipsRes, tradesRes] = await Promise.all([
        fetch('/api/ips', { cache: 'no-store' }),
        fetch(`/api/trades?status=closed`, { cache: 'no-store' }),
      ])

      const ipsJson = await ipsRes.json()
      const tradesJson = await tradesRes.json()

      if (!ipsRes.ok) throw new Error(ipsJson?.error || 'Failed to load IPS data')
      if (!tradesRes.ok) throw new Error(tradesJson?.error || 'Failed to load trade history')

      const ipsList: IpsOption[] = Array.isArray(ipsJson)
        ? ipsJson.map((row: any) => ({
            id: row.id,
            name: row.name || 'Unnamed IPS',
            isActive: row.is_active === true,
          }))
        : []

      setIpsOptions(ipsList)
      if (ipsList.length > 0) {
        setSelectedIpsId((prev) => prev ?? ipsList[0].id)
      }

      const rawTrades: any[] = (tradesJson?.data || []) as any[]
      let closeMap: Record<string, any> = {}
      try {
        const raw = localStorage.getItem('tenxiv:trade-closures')
        closeMap = raw ? JSON.parse(raw) : {}
      } catch {}

      const aggregated = rawTrades.reduce((acc, trade) => {
        const ipsId = trade.ips_id
        if (!ipsId) return acc

        const closureArr = Array.isArray(trade.trade_closures)
          ? trade.trade_closures
          : trade.trade_closures
          ? [trade.trade_closures]
          : []
        const closure = closureArr[0] || null
        const details = closure || closeMap[trade.id] || {}

        const credit = typeof trade.credit_received === 'number' ? trade.credit_received : 0
        const contracts = Number(trade.number_of_contracts ?? details.contractsClosed ?? 0) || 0
        const closeCost = typeof details.cost_to_close_per_spread === 'number'
          ? details.cost_to_close_per_spread
          : typeof details.costToClose === 'number'
          ? details.costToClose
          : undefined

        let realized = typeof trade.realized_pl === 'number' ? trade.realized_pl : null
        if (typeof details.realized_pl === 'number') realized = details.realized_pl
        if (realized === null && typeof details.plDollar === 'number') realized = details.plDollar
        if (realized === null && closeCost != null) {
          realized = (credit - closeCost) * contracts * 100
        }

        if (realized === null || Number.isNaN(realized)) realized = 0

        const store = acc.get(ipsId) ?? {
          totalTrades: 0,
          wins: 0,
          best: Number.NEGATIVE_INFINITY,
          worst: Number.POSITIVE_INFINITY,
          totalPL: 0,
          firstTradeDate: null as string | null,
          daysInDeployment: 0,
        }

        store.totalTrades += 1
        store.totalPL += realized
        if (realized > 0) store.wins += 1
        if (realized > store.best) store.best = realized
        // Only track losses (negative values) for worst
        if (realized < 0 && realized < store.worst) store.worst = realized

        // Track first trade date (using entry_date which is when trade became active)
        const entryDate = trade.entry_date
        if (entryDate) {
          if (!store.firstTradeDate || entryDate < store.firstTradeDate) {
            store.firstTradeDate = entryDate
          }
        }

        acc.set(ipsId, store)
        return acc
      }, new Map<string, IpsStats>())

      const normalized: Record<string, IpsStats> = {}
      const now = new Date()

      aggregated.forEach((value, key) => {
        // Calculate days in deployment
        let daysInDeployment = 0
        if (value.firstTradeDate) {
          const firstDate = new Date(value.firstTradeDate)
          const diffTime = Math.abs(now.getTime() - firstDate.getTime())
          daysInDeployment = Math.ceil(diffTime / (1000 * 60 * 60 * 24))
        }

        normalized[key] = {
          totalTrades: value.totalTrades,
          wins: value.wins,
          best: value.best === Number.NEGATIVE_INFINITY ? 0 : value.best,
          worst: value.worst === Number.POSITIVE_INFINITY ? 0 : value.worst,
          totalPL: value.totalPL,
          firstTradeDate: value.firstTradeDate,
          daysInDeployment,
        }
      })

      setStatsByIps(normalized)
    } catch (e: any) {
      console.error('Failed to load IPS performance data', e)
      setError(e?.message || 'Unable to load IPS performance')
      setIpsOptions([])
      setStatsByIps({})
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadData()
  }, [loadData])

  useEffect(() => {
    const handler = () => loadData()
    window.addEventListener(TRADES_UPDATED_EVENT, handler)
    return () => window.removeEventListener(TRADES_UPDATED_EVENT, handler)
  }, [loadData])

  const selectedStats = selectedIpsId ? statsByIps[selectedIpsId] : undefined
  const hasActiveIps = ipsOptions.some((ips) => ips.isActive)

  const winRate = useMemo(() => {
    if (!selectedStats || selectedStats.totalTrades === 0) return 0
    return (selectedStats.wins / selectedStats.totalTrades) * 100
  }, [selectedStats])

  if (loading && ipsOptions.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Target className="h-4 w-4" />
            IPS Performance
          </CardTitle>
        </CardHeader>
        <CardContent className="py-6">
          <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading IPS performance…
          </div>
        </CardContent>
      </Card>
    )
  }

  if (error && ipsOptions.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Target className="h-4 w-4" />
            IPS Performance
          </CardTitle>
        </CardHeader>
        <CardContent className="py-6">
          <div className="text-center text-sm text-red-600 flex flex-col items-center gap-2">
            <AlertCircle className="h-5 w-5" />
            {error}
          </div>
        </CardContent>
      </Card>
    )
  }

  if (ipsOptions.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Target className="h-4 w-4" />
            IPS Performance
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-4">
            <AlertCircle className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
            <p className="text-sm font-medium mb-2 text-foreground">No IPS Configurations</p>
            <p className="text-xs text-muted-foreground mb-3">
              Create an Investment Policy Statement to track performance.
            </p>
            <Button asChild variant="default" size="sm" className="w-full">
              <Link href="/ips">Create IPS</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    )
  }

  const selectedIps = ipsOptions.find((ips) => ips.id === selectedIpsId) || ipsOptions[0]
  const activeBadge = selectedIps?.isActive ? 'Active' : 'Inactive'
  const stats = selectedStats ?? { totalTrades: 0, wins: 0, best: 0, worst: 0, totalPL: 0, firstTradeDate: null, daysInDeployment: 0 }

  const showEmptyState = stats.totalTrades === 0

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Target className="h-4 w-4" />
            IPS Performance
          </CardTitle>
          <Badge variant={selectedIps?.isActive ? 'default' : 'secondary'} className="text-xs">
            {activeBadge}
          </Badge>
        </div>
        <div className="mt-3">
          <Select value={selectedIps?.id} onValueChange={(value) => setSelectedIpsId(value)}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Select IPS" />
            </SelectTrigger>
            <SelectContent>
              {ipsOptions.map((ips) => (
                <SelectItem key={ips.id} value={ips.id}>
                  {ips.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {showEmptyState ? (
          <div className="bg-muted/40 rounded-lg p-3 text-center text-sm text-muted-foreground">
            No closed trades yet for {selectedIps.name}. Once you record a close, metrics will appear here.
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="bg-muted/40 rounded-lg p-3">
              <div className="text-xs text-muted-foreground">Win Rate</div>
              <div className="text-lg font-semibold text-foreground">{winRate.toFixed(1)}%</div>
            </div>
            <div className="bg-muted/40 rounded-lg p-3">
              <div className="text-xs text-muted-foreground">Total Trades</div>
              <div className="text-lg font-semibold text-foreground">{stats.totalTrades}</div>
            </div>
            <div className="bg-muted/40 rounded-lg p-3 flex flex-col gap-1">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>Highest Win</span>
                <Trophy className="h-4 w-4 text-green-500" />
              </div>
              <div className="text-lg font-semibold text-green-600 dark:text-green-400">{formatPL(stats.best)}</div>
            </div>
            <div className="bg-muted/40 rounded-lg p-3 flex flex-col gap-1">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>Largest Loss</span>
                <ArrowDownCircle className="h-4 w-4 text-red-500" />
              </div>
              <div className="text-lg font-semibold text-red-600 dark:text-red-400">{formatPL(stats.worst)}</div>
            </div>
            <div className="bg-muted/40 rounded-lg p-3 col-span-2">
              <div className="text-xs text-muted-foreground">Total Realized P/L</div>
              <div className={`text-lg font-semibold ${stats.totalPL >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                {formatPL(stats.totalPL)}
              </div>
            </div>
            <div className="bg-muted/40 rounded-lg p-3">
              <div className="text-xs text-muted-foreground">First Trade</div>
              <div className="text-sm font-medium text-foreground">{formatDate(stats.firstTradeDate)}</div>
            </div>
            <div className="bg-muted/40 rounded-lg p-3">
              <div className="text-xs text-muted-foreground">Days in Deployment</div>
              <div className="text-sm font-medium text-foreground">{stats.daysInDeployment > 0 ? stats.daysInDeployment : '--'}</div>
            </div>
          </div>
        )}

        <div className="flex gap-2">
          <Button asChild variant="outline" size="sm" className="flex-1">
            <Link href="/ips">Manage IPS</Link>
          </Button>
          <Button asChild variant="outline" size="sm" className="flex-1">
            <Link href="/trades">View Trades</Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

export default IPSPerformanceTracker
