"use client"

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Eye, Plus, Search, Trash2, TrendingUp } from 'lucide-react'

export default function WatchlistPage() {
  // TODO: This will come from a store later
  const [stocks, setStocks] = useState([
    {
      id: '1',
      symbol: 'AAPL',
      companyName: 'Apple Inc.',
      sector: 'Technology',
      currentPrice: 195.50,
      notes: 'Strong earnings, waiting for pullback'
    },
    {
      id: '2',
      symbol: 'TSLA',
      companyName: 'Tesla, Inc.',
      sector: 'Automotive',
      currentPrice: 248.75,
      notes: 'High IV, good for PCS opportunities'
    }
  ])
  
  const [showAddForm, setShowAddForm] = useState(false)
  const [newStock, setNewStock] = useState({
    symbol: '',
    companyName: '',
    sector: '',
    notes: ''
  })

  const handleAddStock = () => {
    if (!newStock.symbol) return
    
    const stock = {
      id: Date.now().toString(),
      ...newStock,
      symbol: newStock.symbol.toUpperCase(),
      currentPrice: 0, // TODO: Fetch real price later
    }
    
    setStocks([...stocks, stock])
    setNewStock({ symbol: '', companyName: '', sector: '', notes: '' })
    setShowAddForm(false)
  }

  const handleRemoveStock = (id: string) => {
    setStocks(stocks.filter(stock => stock.id !== id))
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-8">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Watchlist</h1>
            <p className="text-gray-600 mt-2">
              Track stocks you're monitoring for trading opportunities
            </p>
          </div>
          <Button onClick={() => setShowAddForm(!showAddForm)}>
            <Plus className="h-4 w-4 mr-2" />
            Add Stock
          </Button>
        </div>
      </div>

      {/* Add Stock Form */}
      {showAddForm && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Add Stock to Watchlist</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Symbol *
                </label>
                <Input
                  placeholder="e.g., AAPL"
                  value={newStock.symbol}
                  onChange={(e) => setNewStock({...newStock, symbol: e.target.value.toUpperCase()})}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Company Name
                </label>
                <Input
                  placeholder="e.g., Apple Inc."
                  value={newStock.companyName}
                  onChange={(e) => setNewStock({...newStock, companyName: e.target.value})}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Sector
                </label>
                <Input
                  placeholder="e.g., Technology"
                  value={newStock.sector}
                  onChange={(e) => setNewStock({...newStock, sector: e.target.value})}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Notes
                </label>
                <Input
                  placeholder="Why you're watching this stock"
                  value={newStock.notes}
                  onChange={(e) => setNewStock({...newStock, notes: e.target.value})}
                />
              </div>
            </div>
            <div className="flex gap-2">
              <Button onClick={handleAddStock} disabled={!newStock.symbol}>
                Add to Watchlist
              </Button>
              <Button variant="outline" onClick={() => setShowAddForm(false)}>
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Watchlist Grid */}
      {stocks.length === 0 ? (
        <Card>
          <CardContent className="text-center py-12">
            <Eye className="h-16 w-16 text-gray-400 mx-auto mb-4" />
            <h3 className="text-xl font-semibold text-gray-900 mb-2">No Stocks in Watchlist</h3>
            <p className="text-gray-500 mb-6">
              Add stocks you want to monitor for trading opportunities
            </p>
            <Button onClick={() => setShowAddForm(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Add Your First Stock
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {stocks.map((stock) => (
            <Card key={stock.id} className="hover:shadow-md transition-shadow">
              <CardContent className="p-6">
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <h3 className="text-lg font-bold text-gray-900">{stock.symbol}</h3>
                    {stock.companyName && (
                      <p className="text-sm text-gray-600">{stock.companyName}</p>
                    )}
                  </div>
                  <Button 
                    variant="ghost" 
                    size="sm"
                    onClick={() => handleRemoveStock(stock.id)}
                  >
                    <Trash2 className="h-4 w-4 text-gray-400 hover:text-red-500" />
                  </Button>
                </div>

                {stock.sector && (
                  <Badge variant="secondary" className="mb-3">
                    {stock.sector}
                  </Badge>
                )}

                <div className="mb-4">
                  <p className="text-sm text-gray-600">Current Price</p>
                  <p className="text-2xl font-bold text-gray-900">
                    {stock.currentPrice > 0 ? `$${stock.currentPrice.toFixed(2)}` : 'N/A'}
                  </p>
                </div>

                {stock.notes && (
                  <div className="mb-4">
                    <p className="text-sm text-gray-600">Notes</p>
                    <p className="text-sm text-gray-800">{stock.notes}</p>
                  </div>
                )}

                <div className="flex gap-2">
                  <Button size="sm" variant="outline" className="flex-1">
                    <TrendingUp className="h-4 w-4 mr-1" />
                    Trade
                  </Button>
                  <Button size="sm" variant="outline">
                    <Search className="h-4 w-4 mr-1" />
                    Research
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Quick Stats */}
      {stocks.length > 0 && (
        <Card className="mt-8">
          <CardHeader>
            <CardTitle>Watchlist Stats</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="text-center">
                <p className="text-2xl font-bold text-gray-900">{stocks.length}</p>
                <p className="text-sm text-gray-600">Total Stocks</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-gray-900">
                  {new Set(stocks.map(s => s.sector).filter(Boolean)).size}
                </p>
                <p className="text-sm text-gray-600">Sectors</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-gray-900">
                  {stocks.filter(s => s.notes).length}
                </p>
                <p className="text-sm text-gray-600">With Notes</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}