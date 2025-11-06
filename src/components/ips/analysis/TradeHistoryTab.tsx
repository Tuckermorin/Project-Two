"use client"

import React, { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { ChevronDown, ChevronUp } from 'lucide-react'

interface TradeHistoryTabProps {
  trades: any[]
}

export function TradeHistoryTab({ trades }: TradeHistoryTabProps) {
  const [sortBy, setSortBy] = useState<'date' | 'profit' | 'symbol'>('date')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')

  const closedTrades = trades.filter(t => t.status === 'closed')

  const sortedTrades = [...closedTrades].sort((a, b) => {
    const multiplier = sortDir === 'asc' ? 1 : -1

    switch (sortBy) {
      case 'date':
        return multiplier * (new Date(b.entry_date).getTime() - new Date(a.entry_date).getTime())
      case 'profit':
        return multiplier * ((b.realized_pl || 0) - (a.realized_pl || 0))
      case 'symbol':
        return multiplier * a.symbol.localeCompare(b.symbol)
      default:
        return 0
    }
  })

  const toggleSort = (column: 'date' | 'profit' | 'symbol') => {
    if (sortBy === column) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc')
    } else {
      setSortBy(column)
      setSortDir('desc')
    }
  }

  const SortIcon = ({ column }: { column: 'date' | 'profit' | 'symbol' }) => {
    if (sortBy !== column) return null
    return sortDir === 'asc' ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Trade History ({closedTrades.length} trades)</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>
                    <Button variant="ghost" size="sm" onClick={() => toggleSort('symbol')}>
                      Symbol <SortIcon column="symbol" />
                    </Button>
                  </TableHead>
                  <TableHead>Strategy</TableHead>
                  <TableHead>
                    <Button variant="ghost" size="sm" onClick={() => toggleSort('date')}>
                      Entry Date <SortIcon column="date" />
                    </Button>
                  </TableHead>
                  <TableHead>Close Date</TableHead>
                  <TableHead>Days Held</TableHead>
                  <TableHead className="text-right">
                    <Button variant="ghost" size="sm" onClick={() => toggleSort('profit')}>
                      Profit/Loss <SortIcon column="profit" />
                    </Button>
                  </TableHead>
                  <TableHead className="text-right">ROI</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedTrades.map((trade, idx) => {
                  const pl = trade.realized_pl || trade.realized_pnl || 0
                  const plPercent = trade.realized_pl_percent || 0
                  const daysHeld = trade.closed_at
                    ? Math.floor((new Date(trade.closed_at).getTime() - new Date(trade.entry_date).getTime()) / (1000 * 60 * 60 * 24))
                    : 0

                  return (
                    <TableRow key={trade.id || idx}>
                      <TableCell className="font-medium">{trade.symbol}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-xs">
                          {trade.strategy_type?.replace(/-/g, ' ') || 'N/A'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm">
                        {new Date(trade.entry_date).toLocaleDateString()}
                      </TableCell>
                      <TableCell className="text-sm">
                        {trade.closed_at ? new Date(trade.closed_at).toLocaleDateString() : '-'}
                      </TableCell>
                      <TableCell className="text-sm">{daysHeld} days</TableCell>
                      <TableCell className={`text-right font-semibold ${pl >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        ${pl.toFixed(2)}
                      </TableCell>
                      <TableCell className={`text-right font-semibold ${plPercent >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {plPercent.toFixed(2)}%
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
