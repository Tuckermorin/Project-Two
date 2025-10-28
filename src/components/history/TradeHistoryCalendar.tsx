"use client"

import React, { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Loader2, ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { TradeComparisonModal } from './TradeComparisonModal'

interface CalendarTrade {
  id: string
  symbol: string
  entry_date?: string
  closed_at?: string
  realized_pl: number
  realized_pl_percent: number
  days_held: number
}

export function TradeHistoryCalendar() {
  const [loading, setLoading] = useState(true)
  const [trades, setTrades] = useState<CalendarTrade[]>([])
  const [currentMonth, setCurrentMonth] = useState(new Date())
  const [selectedTrade, setSelectedTrade] = useState<string | null>(null)
  const [modalOpen, setModalOpen] = useState(false)

  useEffect(() => {
    loadTrades()
  }, [currentMonth])

  const loadTrades = async () => {
    try {
      setLoading(true)

      const res = await fetch('/api/trades?status=closed')
      if (!res.ok) {
        throw new Error('Failed to load trades')
      }

      const data = await res.json()
      setTrades(data.data || [])
    } catch (error) {
      console.error('Failed to load trades:', error)
    } finally {
      setLoading(false)
    }
  }

  const getDaysInMonth = (date: Date) => {
    return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate()
  }

  const getFirstDayOfMonth = (date: Date) => {
    return new Date(date.getFullYear(), date.getMonth(), 1).getDay()
  }

  const getTradesForDate = (date: Date) => {
    const dateStr = date.toISOString().split('T')[0]
    return trades.filter(trade => {
      const entryDate = trade.entry_date ? new Date(trade.entry_date).toISOString().split('T')[0] : null
      const closedDate = trade.closed_at ? new Date(trade.closed_at).toISOString().split('T')[0] : null
      return entryDate === dateStr || closedDate === dateStr
    })
  }

  const previousMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1))
  }

  const nextMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1))
  }

  const today = () => {
    setCurrentMonth(new Date())
  }

  const daysInMonth = getDaysInMonth(currentMonth)
  const firstDay = getFirstDayOfMonth(currentMonth)
  const monthName = currentMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })

  const calendarDays = []

  // Add empty cells for days before the start of the month
  for (let i = 0; i < firstDay; i++) {
    calendarDays.push(null)
  }

  // Add days of the month
  for (let day = 1; day <= daysInMonth; day++) {
    calendarDays.push(day)
  }

  if (loading) {
    return (
      <Card>
        <CardContent className="py-12">
          <div className="flex items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>{monthName}</CardTitle>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={previousMonth}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button variant="outline" size="sm" onClick={today}>
                Today
              </Button>
              <Button variant="outline" size="sm" onClick={nextMonth}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-7 gap-2">
            {/* Day headers */}
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
              <div key={day} className="text-center text-sm font-semibold text-muted-foreground py-2">
                {day}
              </div>
            ))}

            {/* Calendar days */}
            {calendarDays.map((day, index) => {
              if (day === null) {
                return <div key={`empty-${index}`} className="aspect-square" />
              }

              const date = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), day)
              const dayTrades = getTradesForDate(date)
              const isToday = date.toDateString() === new Date().toDateString()

              return (
                <div
                  key={day}
                  className={cn(
                    'aspect-square border rounded-lg p-2 transition-colors',
                    isToday && 'border-primary border-2',
                    dayTrades.length > 0 ? 'cursor-pointer hover:bg-muted' : 'bg-muted/30'
                  )}
                >
                  <div className="text-sm font-medium mb-1">{day}</div>
                  {dayTrades.length > 0 && (
                    <div className="space-y-1">
                      {dayTrades.slice(0, 3).map(trade => (
                        <div
                          key={trade.id}
                          className={cn(
                            'text-xs p-1 rounded cursor-pointer hover:opacity-80',
                            trade.realized_pl > 0
                              ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
                              : 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400'
                          )}
                          onClick={() => {
                            setSelectedTrade(trade.id)
                            setModalOpen(true)
                          }}
                        >
                          {trade.symbol}
                        </div>
                      ))}
                      {dayTrades.length > 3 && (
                        <div className="text-xs text-muted-foreground text-center">
                          +{dayTrades.length - 3} more
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          {/* Legend */}
          <div className="flex items-center justify-center gap-6 mt-6 text-sm">
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded bg-green-100 dark:bg-green-900/30 border border-green-200 dark:border-green-800" />
              <span className="text-muted-foreground">Winning Trade</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded bg-red-100 dark:bg-red-900/30 border border-red-200 dark:border-red-800" />
              <span className="text-muted-foreground">Losing Trade</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {selectedTrade && (
        <TradeComparisonModal
          open={modalOpen}
          onOpenChange={setModalOpen}
          tradeId={selectedTrade}
        />
      )}
    </>
  )
}
