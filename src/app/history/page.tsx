"use client"

import React, { useState, useCallback, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { History, Calendar, BarChart3, RefreshCw, Loader2 } from 'lucide-react'
import HistoricTradesDashboard from '@/components/dashboard/historic-trades-dashboard'
import { TradeHistoryCalendar } from '@/components/history/TradeHistoryCalendar'
import { TradeHistoryAnalytics } from '@/components/history/TradeHistoryAnalytics'

export default function HistoryPage() {
  const [activeTab, setActiveTab] = useState<'list' | 'calendar' | 'analytics'>('list')
  const [refreshKey, setRefreshKey] = useState(0)

  const handleRefresh = useCallback(() => {
    setRefreshKey(prev => prev + 1)
  }, [])

  return (
    <div className="container mx-auto py-6 space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-3">
            <History className="h-8 w-8" />
            Trade History
          </h1>
          <p className="text-muted-foreground mt-1">
            View and analyze your trade history with detailed metrics and charts
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={handleRefresh}>
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </div>

      {/* Main Content Tabs */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)} className="space-y-6">
        <TabsList className="grid w-full max-w-md grid-cols-3">
          <TabsTrigger value="list" className="flex items-center gap-2">
            <History className="h-4 w-4" />
            List View
          </TabsTrigger>
          <TabsTrigger value="calendar" className="flex items-center gap-2">
            <Calendar className="h-4 w-4" />
            Calendar
          </TabsTrigger>
          <TabsTrigger value="analytics" className="flex items-center gap-2">
            <BarChart3 className="h-4 w-4" />
            Analytics
          </TabsTrigger>
        </TabsList>

        <TabsContent value="list" className="space-y-6">
          <HistoricTradesDashboard key={`list-${refreshKey}`} />
        </TabsContent>

        <TabsContent value="calendar" className="space-y-6">
          <TradeHistoryCalendar key={`calendar-${refreshKey}`} />
        </TabsContent>

        <TabsContent value="analytics" className="space-y-6">
          <TradeHistoryAnalytics key={`analytics-${refreshKey}`} />
        </TabsContent>
      </Tabs>
    </div>
  )
}
