"use client"

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { TrendingUp, Plus, List } from 'lucide-react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { TradeEntryForm } from '@/components/trades/trade-entry-form'
import { useTradesStore } from '@/lib/stores/trades-store'

export default function TradesPage() {
  const [activeTab, setActiveTab] = useState("new")
  
  // Get data from store
  const { getPotentialTrades, getActiveTrades, activateTrade, deleteTrade } = useTradesStore()
  const potentialTrades = getPotentialTrades()
  const activeTrades = getActiveTrades()

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount)
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString()
  }

  const getScoreBadge = (score: number) => {
    if (score >= 80) return { variant: 'default' as const, text: 'Excellent' }
    if (score >= 60) return { variant: 'secondary' as const, text: 'Good' }
    return { variant: 'destructive' as const, text: 'Poor' }
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Trades</h1>
        <p className="text-gray-600 mt-2">
          Enter potential trades and get IPS scoring feedback
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="new" className="flex items-center gap-2">
            <Plus className="h-4 w-4" />
            New Trade
          </TabsTrigger>
          <TabsTrigger value="potential" className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4" />
            Potential ({potentialTrades.length})
          </TabsTrigger>
          <TabsTrigger value="active" className="flex items-center gap-2">
            <List className="h-4 w-4" />
            Active ({activeTrades.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="new" className="mt-6">
          <TradeEntryForm />
        </TabsContent>

        <TabsContent value="potential" className="mt-6">
          {potentialTrades.length === 0 ? (
            <Card>
              <CardContent className="text-center py-12">
                <TrendingUp className="h-16 w-16 text-gray-400 mx-auto mb-4" />
                <h3 className="text-xl font-semibold text-gray-900 mb-2">No Potential Trades</h3>
                <p className="text-gray-500 mb-6">
                  Trades you enter will be scored against your IPS and shown here before you decide to execute them
                </p>
                <Button onClick={() => setActiveTab("new")}>
                  <Plus className="h-4 w-4 mr-2" />
                  Enter Your First Trade
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {potentialTrades.map((trade) => (
                <Card key={trade.id}>
                  <CardContent className="p-6">
                    <div className="flex justify-between items-start mb-4">
                      <div>
                        <h3 className="text-lg font-semibold">
                          {trade.symbol} - {trade.type === 'put-credit-spread' ? 'Put Credit Spread' : 'Long Call'}
                        </h3>
                        <p className="text-gray-600">
                          {trade.quantity} contract{trade.quantity !== 1 ? 's' : ''} • 
                          Expires: {formatDate(trade.expirationDate)}
                        </p>
                      </div>
                      <div className="text-right">
                        <Badge {...getScoreBadge(trade.ipsScore)}>
                          {trade.ipsScore}/100
                        </Badge>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                      {trade.type === 'put-credit-spread' ? (
                        <>
                          <div>
                            <p className="text-sm text-gray-600">Short/Long Strikes</p>
                            <p className="font-medium">{trade.shortStrike} / {trade.longStrike}</p>
                          </div>
                          <div>
                            <p className="text-sm text-gray-600">Credit Received</p>
                            <p className="font-medium">{formatCurrency(trade.creditReceived || 0)}</p>
                          </div>
                          <div>
                            <p className="text-sm text-gray-600">Max Profit</p>
                            <p className="font-medium text-green-600">
                              {formatCurrency((trade.creditReceived || 0) * trade.quantity * 100)}
                            </p>
                          </div>
                        </>
                      ) : (
                        <>
                          <div>
                            <p className="text-sm text-gray-600">Strike Price</p>
                            <p className="font-medium">{trade.callStrike}</p>
                          </div>
                          <div>
                            <p className="text-sm text-gray-600">Premium Paid</p>
                            <p className="font-medium">{formatCurrency(trade.premiumPaid || 0)}</p>
                          </div>
                          <div>
                            <p className="text-sm text-gray-600">Total Cost</p>
                            <p className="font-medium text-red-600">
                              {formatCurrency((trade.premiumPaid || 0) * trade.quantity * 100)}
                            </p>
                          </div>
                        </>
                      )}
                    </div>

                    {trade.notes && (
                      <div className="mb-4">
                        <p className="text-sm text-gray-600">Notes</p>
                        <p className="text-sm">{trade.notes}</p>
                      </div>
                    )}

                    <div className="flex gap-2">
                      <Button 
                        onClick={() => activateTrade(trade.id)}
                        size="sm"
                      >
                        Execute Trade
                      </Button>
                      <Button 
                        variant="outline" 
                        size="sm"
                        onClick={() => deleteTrade(trade.id)}
                      >
                        Remove
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="active" className="mt-6">
          {activeTrades.length === 0 ? (
            <Card>
              <CardContent className="text-center py-12">
                <List className="h-16 w-16 text-gray-400 mx-auto mb-4" />
                <h3 className="text-xl font-semibold text-gray-900 mb-2">No Active Trades</h3>
                <p className="text-muted-foreground mb-6">
                  Once you &quot;Execute&quot; trades from your potential list, they&apos;ll appear here for monitoring
                </p>
                <div className="flex flex-col sm:flex-row gap-4 justify-center">
                  <Button variant="outline" onClick={() => setActiveTab("potential")}>
                    View Potential Trades
                  </Button>
                  <Button onClick={() => setActiveTab("new")}>
                    <Plus className="h-4 w-4 mr-2" />
                    Enter New Trade
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {activeTrades.map((trade) => (
                <Card key={trade.id}>
                  <CardContent className="p-6">
                    <div className="flex justify-between items-start">
                      <div>
                        <h3 className="text-lg font-semibold">
                          {trade.symbol} - {trade.type === 'put-credit-spread' ? 'Put Credit Spread' : 'Long Call'}
                        </h3>
                        <p className="text-gray-600">
                          {trade.quantity} contract{trade.quantity !== 1 ? 's' : ''} • 
                          Entered: {formatDate(trade.entryDate)} • 
                          Expires: {formatDate(trade.expirationDate)}
                        </p>
                      </div>
                      <Badge variant="outline">Active</Badge>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}