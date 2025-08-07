"use client"

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { TrendingUp, Plus, List, Eye, Filter, ArrowLeft, Target, BarChart3, Layers, FileText } from 'lucide-react'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { useRouter } from 'next/navigation'

// Import services
import { ipsDataService, type IPSConfiguration, type TradingStrategy } from '@/lib/services/ips-data-service'

// Types
interface TradeFormData {
  strategy: string
  symbol: string
  quantity: number
  expiration: string
  notes: string
  [key: string]: string | number // Allow dynamic factor fields
}

interface ScoreBadgeConfig {
  color: string
  text: string
}

type ViewType = "selection" | "manual" | "potential" | "active"
type OptionType = "watchlist" | "smart-filter" | "manual"

export default function TradesPage() {
  const [currentView, setCurrentView] = useState<ViewType>("selection")
  const [selectedIPS, setSelectedIPS] = useState<string>("")
  const [tradeFormData, setTradeFormData] = useState<TradeFormData>({
    strategy: '',
    symbol: '',
    quantity: 1,
    expiration: '',
    notes: ''
  })
  const [calculatedScore, setCalculatedScore] = useState<number | null>(null)
  const [showSuccess, setShowSuccess] = useState<boolean>(false)
  
  // Real IPS data instead of mock
  const [activeIPSs, setActiveIPSs] = useState<IPSConfiguration[]>([])
  const [availableStrategies, setAvailableStrategies] = useState<TradingStrategy[]>([])
  const [selectedIPSData, setSelectedIPSData] = useState<IPSConfiguration | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  
  const router = useRouter()
  const userId = 'user-123' // Replace with actual user ID from auth

  // Load real IPS data on component mount
  useEffect(() => {
    const loadIPSData = async () => {
      try {
        setIsLoading(true)
        const [userIPSs, strategies] = await Promise.all([
          ipsDataService.getAllUserIPSs(userId),
          Promise.resolve(ipsDataService.getAvailableStrategies())
        ])
        
        // Filter to only active IPSs for trade selection
        const activeOnly = userIPSs.filter(ips => ips.is_active)
        setActiveIPSs(activeOnly)
        setAvailableStrategies(strategies)
        
      } catch (error) {
        console.error('Error loading IPS data:', error)
      } finally {
        setIsLoading(false)
      }
    }

    loadIPSData()
  }, [userId])

  const handleOptionSelect = (option: OptionType): void => {
    if (option === 'watchlist') {
      alert('Watchlist feature coming soon!')
    } else if (option === 'smart-filter') {
      alert('IPS Smart Filter feature coming soon!')
    } else if (option === 'manual') {
      setCurrentView('manual')
    }
  }

  const handleIPSSelection = (ipsId: string): void => {
    setSelectedIPS(ipsId)
    const ipsData = activeIPSs.find(ips => ips.id === ipsId)
    setSelectedIPSData(ipsData || null)
    
    if (ipsData) {
      // Reset form and prepare dynamic fields based on IPS strategies
      const newFormData: TradeFormData = {
        strategy: '',
        symbol: '',
        quantity: 1,
        expiration: '',
        notes: ''
      }
      
      // Set default strategy if IPS has only one strategy
      if (ipsData.strategies?.length === 1) {
        const strategy = availableStrategies.find(s => s.id === ipsData.strategies![0])
        newFormData.strategy = strategy?.name || ''
      }
      
      setTradeFormData(newFormData)
      setCalculatedScore(null)
    }
  }

  const calculateScore = async (): Promise<void> => {
    if (!selectedIPSData) return
    
    try {
      // Here we'll eventually integrate with the real scoring engine
      // For now, using a mock calculation
      const baseScore = 60
      const randomVariation = Math.floor(Math.random() * 30)
      const score = Math.min(100, baseScore + randomVariation)
      
      setCalculatedScore(score)
    } catch (error) {
      console.error('Error calculating trade score:', error)
    }
  }

  const addToPotentials = (): void => {
    // TODO: Save to database as potential trade
    setShowSuccess(true)
    setTimeout(() => {
      setShowSuccess(false)
      setCurrentView('potential')
    }, 1500)
  }

  const handleFormDataChange = (field: string, value: string | number): void => {
    setTradeFormData(prev => ({
      ...prev,
      [field]: value
    }))
  }

  const getScoreBadge = (score: number): ScoreBadgeConfig => {
    if (score >= 80) return { color: 'bg-green-500', text: 'Excellent' }
    if (score >= 60) return { color: 'bg-yellow-500', text: 'Good' }
    return { color: 'bg-red-500', text: 'Poor' }
  }

  const getStrategyOptions = () => {
    if (!selectedIPSData?.strategies) return availableStrategies
    
    // Filter strategies to only those supported by the selected IPS
    return availableStrategies.filter(strategy => 
      selectedIPSData.strategies!.includes(strategy.id)
    )
  }

  // Progress indicator for multi-step flow
  const renderProgressIndicator = () => {
    const steps = [
      { id: "selection", name: "Choose Method", active: currentView === "selection" },
      { id: "manual", name: "Enter Trade", active: currentView === "manual" },
      { id: "potential", name: "Review", active: currentView === "potential" },
      { id: "active", name: "Execute", active: currentView === "active" }
    ]

    return (
      <div className="mb-8">
        <div className="flex items-center justify-center space-x-8">
          {steps.map((step, index) => (
            <div key={step.id} className="flex items-center">
              <div className={`flex items-center justify-center w-8 h-8 rounded-full ${
                step.active ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-600'
              }`}>
                {index + 1}
              </div>
              <span className={`ml-2 text-sm font-medium ${
                step.active ? 'text-blue-600' : 'text-gray-500'
              }`}>
                {step.name}
              </span>
              {index < steps.length - 1 && (
                <div className="w-16 h-0.5 bg-gray-300 mx-4" />
              )}
            </div>
          ))}
        </div>
      </div>
    )
  }

  // Loading state
  if (isLoading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <p className="text-gray-600">Loading your IPSs...</p>
          </div>
        </div>
      </div>
    )
  }

  // Main selection view
  if (currentView === "selection") {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="mb-8 text-center">
          <h1 className="text-4xl font-bold text-gray-900 mb-4">Trades</h1>
          <p className="text-xl text-gray-600 mb-8">
            Choose how you'd like to work with trades today
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-6xl mx-auto">
          {/* Watchlist Screening */}
          <Card className="hover:shadow-xl transition-all duration-300 cursor-pointer transform hover:scale-105">
            <CardHeader className="text-center pb-4">
              <div className="mx-auto w-20 h-20 bg-gray-400 rounded-full flex items-center justify-center mb-4">
                <List className="h-10 w-10 text-white" />
              </div>
              <CardTitle className="text-xl mb-2">Screen Watchlist</CardTitle>
              <Badge className="mx-auto bg-gray-500">Coming Soon</Badge>
            </CardHeader>
            <CardContent className="text-center">
              <p className="text-gray-600 mb-6">
                Apply your IPS criteria to your watchlist and discover potential trades
              </p>
              <Button 
                disabled 
                className="w-full" 
                variant="outline"
                size="lg"
                onClick={() => handleOptionSelect('watchlist')}
              >
                Screen Watchlist
              </Button>
            </CardContent>
          </Card>

          {/* Smart Filter */}
          <Card className="hover:shadow-xl transition-all duration-300 cursor-pointer transform hover:scale-105">
            <CardHeader className="text-center pb-4">
              <div className="mx-auto w-20 h-20 bg-gray-400 rounded-full flex items-center justify-center mb-4">
                <Filter className="h-10 w-10 text-white" />
              </div>
              <CardTitle className="text-xl mb-2">Smart Filter</CardTitle>
              <Badge className="mx-auto bg-gray-500">Coming Soon</Badge>
            </CardHeader>
            <CardContent className="text-center">
              <p className="text-gray-600 mb-6">
                Automatically discover and filter trades that match your IPS requirements
              </p>
              <Button 
                disabled 
                className="w-full" 
                variant="outline"
                size="lg"
                onClick={() => handleOptionSelect('smart-filter')}
              >
                Smart Filter
              </Button>
            </CardContent>
          </Card>

          {/* Enter Manual Trades */}
          <Card className="hover:shadow-xl transition-all duration-300 cursor-pointer border-2 border-blue-500 bg-gradient-to-br from-blue-50 to-blue-100 transform hover:scale-105">
            <CardHeader className="text-center pb-4">
              <div className="mx-auto w-20 h-20 bg-blue-600 rounded-full flex items-center justify-center mb-4">
                <Plus className="h-10 w-10 text-white" />
              </div>
              <CardTitle className="text-xl mb-2">Enter Manual Trades</CardTitle>
              <Badge className="mx-auto bg-blue-600">Available Now</Badge>
            </CardHeader>
            <CardContent className="text-center">
              <p className="text-gray-700 mb-6">
                Manually enter trades and get real-time IPS scoring to guide your decisions
              </p>
              <Button 
                className="w-full bg-blue-600 hover:bg-blue-700" 
                size="lg"
                onClick={() => handleOptionSelect('manual')}
              >
                Start Manual Entry
              </Button>
            </CardContent>
          </Card>
        </div>

        {/* IPS Status Summary */}
        {activeIPSs.length > 0 && (
          <Card className="mt-12 max-w-4xl mx-auto">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Target className="h-5 w-5" />
                Your Active IPSs
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {activeIPSs.map(ips => (
                  <div key={ips.id} className="border rounded-lg p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                      <h4 className="font-medium">{ips.name}</h4>
                    </div>
                    <div className="flex flex-wrap gap-1 mt-2">
                      {ips.strategies?.map(strategyId => {
                        const strategy = availableStrategies.find(s => s.id === strategyId)
                        return strategy ? (
                          <Badge key={strategyId} variant="outline" className="text-xs">
                            {strategy.name}
                          </Badge>
                        ) : null
                      })}
                    </div>
                    <div className="text-xs text-gray-500 mt-2">
                      {ips.active_factors || 0} factors • Win rate: {ips.performance?.winRate || 0}%
                    </div>
                  </div>
                ))}
              </div>
              
              {activeIPSs.length === 0 && (
                <div className="text-center py-6">
                  <FileText className="h-12 w-12 text-gray-300 mx-auto mb-3" />
                  <p className="text-gray-600 mb-4">No active IPSs found</p>
                  <Button 
                    variant="outline"
                    onClick={() => router.push('/ips')}
                  >
                    Create Your First IPS
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Bottom Navigation */}
        <div className="mt-12 text-center">
          <div className="flex justify-center gap-4">
            <Button 
              variant="outline" 
              onClick={() => router.push('/ips')}
            >
              <Layers className="h-4 w-4 mr-2" />
              Manage IPSs
            </Button>
            <Button 
              variant="outline"
              onClick={() => router.push('/dashboard')}
            >
              <BarChart3 className="h-4 w-4 mr-2" />
              View Dashboard
            </Button>
          </div>
        </div>
      </div>
    )
  }

  // Manual trade entry view
  if (currentView === "manual") {
    return (
      <div className="container mx-auto px-4 py-8">
        {renderProgressIndicator()}
        <div className="max-w-2xl mx-auto">
          <div className="mb-6">
            <Button 
              variant="outline" 
              onClick={() => setCurrentView('selection')}
              className="mb-4"
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Trade Options
            </Button>
            <h1 className="text-3xl font-bold">Enter Manual Trade</h1>
            <p className="text-gray-600">Fill in trade details and get IPS assessment</p>
          </div>

          {/* IPS Selection */}
          <Card className="mb-6">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Target className="h-5 w-5" />
                Select IPS to Follow
              </CardTitle>
            </CardHeader>
            <CardContent>
              {activeIPSs.length === 0 ? (
                <div className="text-center py-6">
                  <FileText className="h-12 w-12 text-gray-300 mx-auto mb-3" />
                  <p className="text-gray-600 mb-4">No active IPSs available</p>
                  <p className="text-sm text-gray-500 mb-4">
                    You need at least one active IPS to score trades
                  </p>
                  <Button 
                    onClick={() => router.push('/ips')}
                    className="bg-blue-600 hover:bg-blue-700"
                  >
                    Create Your First IPS
                  </Button>
                </div>
              ) : (
                <>
                  <Select value={selectedIPS} onValueChange={handleIPSSelection}>
                    <SelectTrigger>
                      <SelectValue placeholder="Choose an active IPS" />
                    </SelectTrigger>
                    <SelectContent>
                      {activeIPSs.map(ips => (
                        <SelectItem key={ips.id} value={ips.id}>
                          <div className="flex items-center justify-between w-full">
                            <span>{ips.name}</span>
                            <div className="flex gap-1 ml-2">
                              {ips.strategies?.slice(0, 2).map(strategyId => {
                                const strategy = availableStrategies.find(s => s.id === strategyId)
                                return strategy ? (
                                  <Badge key={strategyId} variant="outline" className="text-xs">
                                    {strategy.name}
                                  </Badge>
                                ) : null
                              })}
                              {(ips.strategies?.length || 0) > 2 && (
                                <Badge variant="outline" className="text-xs">
                                  +{(ips.strategies?.length || 0) - 2}
                                </Badge>
                              )}
                            </div>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  
                  {/* Selected IPS Info */}
                  {selectedIPSData && (
                    <div className="mt-4 p-4 bg-blue-50 rounded-lg">
                      <div className="flex items-center justify-between mb-2">
                        <h4 className="font-medium text-blue-900">{selectedIPSData.name}</h4>
                        <Badge variant="secondary">
                          {selectedIPSData.active_factors || 0} factors
                        </Badge>
                      </div>
                      {selectedIPSData.description && (
                        <p className="text-sm text-blue-700 mb-2">{selectedIPSData.description}</p>
                      )}
                      <div className="flex flex-wrap gap-1">
                        {selectedIPSData.strategies?.map(strategyId => {
                          const strategy = availableStrategies.find(s => s.id === strategyId)
                          return strategy ? (
                            <Badge key={strategyId} variant="outline" className="text-xs">
                              {strategy.name}
                            </Badge>
                          ) : null
                        })}
                      </div>
                      {selectedIPSData.performance && (
                        <div className="grid grid-cols-3 gap-4 mt-3 text-sm">
                          <div className="text-center">
                            <p className="font-medium text-green-600">{selectedIPSData.performance.winRate}%</p>
                            <p className="text-xs text-gray-600">Win Rate</p>
                          </div>
                          <div className="text-center">
                            <p className="font-medium text-blue-600">{selectedIPSData.performance.avgROI}%</p>
                            <p className="text-xs text-gray-600">Avg ROI</p>
                          </div>
                          <div className="text-center">
                            <p className="font-medium">{selectedIPSData.performance.totalTrades}</p>
                            <p className="text-xs text-gray-600">Trades</p>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>

          {/* Trade Entry Form */}
          {selectedIPS && selectedIPSData && (
            <Card>
              <CardHeader>
                <CardTitle>Trade Details</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Strategy Selection */}
                <div>
                  <Label htmlFor="strategy">Trading Strategy</Label>
                  <Select 
                    value={tradeFormData.strategy} 
                    onValueChange={(value) => handleFormDataChange('strategy', value)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select strategy" />
                    </SelectTrigger>
                    <SelectContent>
                      {getStrategyOptions().map(strategy => (
                        <SelectItem key={strategy.id} value={strategy.name}>
                          {strategy.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Basic Trade Info */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="symbol">Symbol</Label>
                    <Input
                      id="symbol"
                      value={tradeFormData.symbol}
                      onChange={(e) => handleFormDataChange('symbol', e.target.value.toUpperCase())}
                      placeholder="e.g., AAPL"
                    />
                  </div>
                  <div>
                    <Label htmlFor="quantity">Quantity</Label>
                    <Input
                      id="quantity"
                      type="number"
                      value={tradeFormData.quantity}
                      onChange={(e) => handleFormDataChange('quantity', parseInt(e.target.value) || 1)}
                      min="1"
                    />
                  </div>
                </div>

                {/* Expiration (for options strategies) */}
                {selectedIPSData.strategies?.some(strategyId => 
                  ['put-credit-spreads', 'call-credit-spreads', 'long-calls', 'long-puts', 'iron-condors', 'covered-calls'].includes(strategyId)
                ) && (
                  <div>
                    <Label htmlFor="expiration">Expiration Date</Label>
                    <Input
                      id="expiration"
                      type="date"
                      value={tradeFormData.expiration}
                      onChange={(e) => handleFormDataChange('expiration', e.target.value)}
                    />
                  </div>
                )}

                {/* Notes */}
                <div>
                  <Label htmlFor="notes">Notes</Label>
                  <Textarea
                    id="notes"
                    value={tradeFormData.notes}
                    onChange={(e) => handleFormDataChange('notes', e.target.value)}
                    placeholder="Additional trade notes and analysis..."
                  />
                </div>

                {/* IPS Score Calculation */}
                <div className="border-t pt-4">
                  <div className="flex gap-3 items-center">
                    <Button 
                      onClick={calculateScore} 
                      variant="outline"
                      disabled={!tradeFormData.symbol || !tradeFormData.strategy}
                    >
                      <BarChart3 className="h-4 w-4 mr-2" />
                      Calculate IPS Score
                    </Button>
                    
                    {calculatedScore !== null && (
                      <div className="flex items-center gap-2">
                        <Badge className={getScoreBadge(calculatedScore).color}>
                          Score: {calculatedScore}/100
                        </Badge>
                        <Badge variant="outline">
                          {getScoreBadge(calculatedScore).text}
                        </Badge>
                        {calculatedScore >= 60 && (
                          <Button 
                            onClick={addToPotentials} 
                            disabled={showSuccess}
                            size="sm"
                          >
                            {showSuccess ? 'Added!' : 'Add to Potentials'}
                          </Button>
                        )}
                      </div>
                    )}
                  </div>
                  
                  {calculatedScore !== null && calculatedScore < 60 && (
                    <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-lg">
                      <p className="text-sm text-red-700">
                        This trade scores below your IPS threshold. Consider reviewing the factors or looking for better opportunities.
                      </p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    )
  }

  // Potential trades view
  if (currentView === "potential") {
    return (
      <div className="container mx-auto px-4 py-8">
        {renderProgressIndicator()}
        <div className="mb-6">
          <Button 
            variant="outline" 
            onClick={() => setCurrentView('selection')}
            className="mb-4"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Trade Options
          </Button>
          <h1 className="text-3xl font-bold">Potential Trades</h1>
          <p className="text-gray-600">Review and execute trades that meet your IPS criteria</p>
        </div>

        <Card>
          <CardContent className="py-8 text-center">
            <TrendingUp className="h-12 w-12 mx-auto text-gray-400 mb-4" />
            <h3 className="text-lg font-semibold mb-2">No Potential Trades</h3>
            <p className="text-gray-600 mb-4">
              You haven't added any potential trades yet. Start by entering a manual trade.
            </p>
            <Button onClick={() => setCurrentView('manual')}>
              Enter Manual Trade
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  // Active trades view
  if (currentView === "active") {
    return (
      <div className="container mx-auto px-4 py-8">
        {renderProgressIndicator()}
        <div className="mb-6 flex justify-between items-center">
          <div>
            <Button 
              variant="outline" 
              onClick={() => setCurrentView('selection')}
              className="mb-4"
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Trade Options
            </Button>
            <h1 className="text-3xl font-bold">Active Trades</h1>
            <p className="text-gray-600">Simple summary of your current active trades</p>
          </div>
          <Button 
            variant="outline"
            onClick={() => router.push('/dashboard')}
          >
            <BarChart3 className="h-4 w-4 mr-2" />
            Go to Dashboard
          </Button>
        </div>

        <Card>
          <CardContent className="py-8 text-center">
            <List className="h-12 w-12 mx-auto text-gray-400 mb-4" />
            <h3 className="text-lg font-semibold mb-2">No Active Trades</h3>
            <p className="text-gray-600 mb-4">
              You don't have any active trades yet. Execute some trades from your potentials list.
            </p>
            <Button onClick={() => setCurrentView('potential')}>
              View Potential Trades
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  return null
}