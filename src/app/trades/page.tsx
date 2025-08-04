"use client"

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { TrendingUp, Plus, List, Eye, Filter, ArrowLeft, Target, BarChart3 } from 'lucide-react'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { useRouter } from 'next/navigation'

// Types
interface ActiveIPS {
  id: string
  name: string
  factors: string[]
}

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

// Mock data for active IPSs
const mockActiveIPSs: ActiveIPS[] = [
  { id: 'ips-1', name: 'Conservative Growth Strategy', factors: ['Revenue', 'P/E Ratio', 'Delta', 'Theta'] },
  { id: 'ips-2', name: 'Aggressive Options Strategy', factors: ['Implied Volatility', 'Delta', 'Gamma', 'Revenue Growth'] },
  { id: 'ips-3', name: 'Value Investment Strategy', factors: ['P/E Ratio', 'Book Value', 'Revenue', 'Leadership Track Record'] }
]

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
  
  const router = useRouter()

  const handleOptionSelect = (option: OptionType): void => {
    if (option === 'watchlist') {
      // TODO: Navigate to watchlist when ready
      alert('Watchlist feature coming soon!')
    } else if (option === 'smart-filter') {
      // TODO: Navigate to smart filter when ready
      alert('IPS Smart Filter feature coming soon!')
    } else if (option === 'manual') {
      setCurrentView('manual')
    }
  }

  const handleIPSSelection = (ipsId: string): void => {
    setSelectedIPS(ipsId)
    const selectedIPSData = mockActiveIPSs.find(ips => ips.id === ipsId)
    if (selectedIPSData) {
      // Reset form with IPS-specific fields
      const newFormData: TradeFormData = {
        strategy: '',
        symbol: '',
        quantity: 1,
        expiration: '',
        notes: ''
      }
      
      // Add fields for each factor in the selected IPS
      selectedIPSData.factors.forEach(factor => {
        const fieldKey = factor.toLowerCase().replace(/\s+/g, '_')
        newFormData[fieldKey] = ''
      })
      
      setTradeFormData(newFormData)
    }
  }

  const calculateScore = (): void => {
    // Mock calculation
    const baseScore = 60
    const score = baseScore + Math.floor(Math.random() * 30)
    setCalculatedScore(score)
  }

  const addToPotentials = (): void => {
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

        <div className="max-w-4xl mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {/* View Watchlist */}
            <Card className="hover:shadow-xl transition-all duration-300 cursor-pointer border-2 hover:border-blue-200 opacity-60">
              <CardHeader className="text-center pb-4">
                <div className="mx-auto w-20 h-20 bg-blue-100 rounded-full flex items-center justify-center mb-4">
                  <Eye className="h-10 w-10 text-blue-600" />
                </div>
                <CardTitle className="text-xl mb-2">View Watchlist</CardTitle>
                <Badge variant="outline" className="mx-auto">Coming Soon</Badge>
              </CardHeader>
              <CardContent className="text-center">
                <p className="text-gray-600 mb-6">
                  Monitor your watchlist stocks for trading opportunities using your IPS criteria
                </p>
                <Button 
                  disabled 
                  className="w-full" 
                  variant="outline"
                  size="lg"
                >
                  View Watchlist
                </Button>
              </CardContent>
            </Card>

            {/* IPS Smart Filter */}
            <Card className="hover:shadow-xl transition-all duration-300 cursor-pointer border-2 hover:border-green-200 opacity-60">
              <CardHeader className="text-center pb-4">
                <div className="mx-auto w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mb-4">
                  <Filter className="h-10 w-10 text-green-600" />
                </div>
                <CardTitle className="text-xl mb-2">IPS Smart Filter</CardTitle>
                <Badge variant="outline" className="mx-auto">Coming Soon</Badge>
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

          {/* Bottom Navigation */}
          <div className="mt-12 text-center">
            <div className="flex justify-center gap-4">
              <Button 
                variant="outline" 
                onClick={() => setCurrentView('potential')}
                className="flex items-center gap-2"
              >
                <TrendingUp className="h-4 w-4" />
                View Potential Trades (2)
              </Button>
              <Button 
                variant="outline" 
                onClick={() => setCurrentView('active')}
                className="flex items-center gap-2"
              >
                <List className="h-4 w-4" />
                View Active Trades (1)
              </Button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // Progress indicator component
  const renderProgressIndicator = () => {
    const steps = [
      { id: 'manual', name: 'Enter Trade', icon: Plus, active: currentView === 'manual' },
      { id: 'potential', name: 'Potential', icon: TrendingUp, active: currentView === 'potential' },
      { id: 'active', name: 'Active', icon: List, active: currentView === 'active' }
    ]

    const handleStepClick = (stepId: string) => {
      setCurrentView(stepId as ViewType)
    }

    return (
      <div className="mb-8">
        <div className="flex items-center justify-center max-w-md mx-auto">
          {steps.map((step, index) => {
            const Icon = step.icon
            const isActive = step.active
            const isCompleted = 
              (step.id === 'potential' && (currentView === 'potential' || currentView === 'active')) ||
              (step.id === 'active' && currentView === 'active')
            
            return (
              <div key={step.id} className="flex items-center">
                <button
                  onClick={() => handleStepClick(step.id)}
                  className={`
                    flex items-center justify-center w-10 h-10 rounded-full border-2 transition-all cursor-pointer hover:scale-110
                    ${isActive ? 'border-blue-600 bg-blue-600 text-white' : 
                      isCompleted ? 'border-green-600 bg-green-600 text-white hover:bg-green-700' :
                      'border-gray-300 bg-white text-gray-400 hover:border-gray-400 hover:text-gray-500'}
                  `}
                  title={`Go to ${step.name}`}
                >
                  <Icon className="h-5 w-5" />
                </button>
                <button
                  onClick={() => handleStepClick(step.id)}
                  className="ml-2 mr-4 cursor-pointer"
                  title={`Go to ${step.name}`}
                >
                  <p className={`text-sm font-medium transition-colors hover:underline ${isActive ? 'text-blue-600' : isCompleted ? 'text-green-600' : 'text-gray-500 hover:text-gray-700'}`}>
                    {step.name}
                  </p>
                </button>
                {index < steps.length - 1 && (
                  <div className={`flex-1 h-0.5 mx-4 ${isCompleted ? 'bg-green-600' : 'bg-gray-300'}`} />
                )}
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  // Manual trade entry view
  if (currentView === "manual") {
    const selectedIPSData = mockActiveIPSs.find(ips => ips.id === selectedIPS)
    
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
              <Select value={selectedIPS} onValueChange={handleIPSSelection}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose an active IPS" />
                </SelectTrigger>
                <SelectContent>
                  {mockActiveIPSs.map(ips => (
                    <SelectItem key={ips.id} value={ips.id}>
                      {ips.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedIPSData && (
                <div className="mt-3 p-3 bg-blue-50 rounded-lg">
                  <p className="text-sm font-medium">Factors to assess:</p>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {selectedIPSData.factors.map(factor => (
                      <Badge key={factor} variant="outline">
                        {factor}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Trade Form */}
          {selectedIPS && (
            <Card>
              <CardHeader>
                <CardTitle>Trade Details & IPS Assessment</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Basic Trade Info */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="strategy">Strategy Type</Label>
                    <Select 
                      value={tradeFormData.strategy} 
                      onValueChange={(value) => handleFormDataChange('strategy', value)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select strategy" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="put-credit-spread">Put Credit Spread</SelectItem>
                        <SelectItem value="long-call">Long Call</SelectItem>
                        <SelectItem value="covered-call">Covered Call</SelectItem>
                        <SelectItem value="iron-condor">Iron Condor</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  
                  <div>
                    <Label htmlFor="symbol">Symbol</Label>
                    <Input
                      id="symbol"
                      value={tradeFormData.symbol}
                      onChange={(e) => handleFormDataChange('symbol', e.target.value.toUpperCase())}
                      placeholder="AAPL"
                    />
                  </div>
                  
                  <div>
                    <Label htmlFor="quantity">Quantity</Label>
                    <Input
                      id="quantity"
                      type="number"
                      value={tradeFormData.quantity}
                      onChange={(e) => handleFormDataChange('quantity', parseInt(e.target.value) || 1)}
                    />
                  </div>
                  
                  <div>
                    <Label htmlFor="expiration">Expiration Date</Label>
                    <Input
                      id="expiration"
                      type="date"
                      value={tradeFormData.expiration}
                      onChange={(e) => handleFormDataChange('expiration', e.target.value)}
                    />
                  </div>
                </div>

                {/* IPS Factors */}
                <div className="border-t pt-4">
                  <h3 className="font-semibold mb-3">IPS Factor Assessment</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {selectedIPSData?.factors.map(factor => (
                      <div key={factor}>
                        <Label htmlFor={factor.toLowerCase()}>{factor}</Label>
                        <Input
                          id={factor.toLowerCase()}
                          value={String(tradeFormData[factor.toLowerCase().replace(/\s+/g, '_')] || '')}
                          onChange={(e) => handleFormDataChange(
                            factor.toLowerCase().replace(/\s+/g, '_'), 
                            e.target.value
                          )}
                          placeholder={`Enter ${factor.toLowerCase()}`}
                        />
                      </div>
                    ))}
                  </div>
                </div>

                {/* Notes */}
                <div>
                  <Label htmlFor="notes">Notes</Label>
                  <Textarea
                    id="notes"
                    value={tradeFormData.notes}
                    onChange={(e) => handleFormDataChange('notes', e.target.value)}
                    placeholder="Additional trade notes..."
                  />
                </div>

                {/* Calculate Score */}
                <div className="flex gap-3 pt-4">
                  <Button onClick={calculateScore} variant="outline">
                    <BarChart3 className="h-4 w-4 mr-2" />
                    Calculate IPS Score
                  </Button>
                  
                  {calculatedScore !== null && (
                    <div className="flex items-center gap-2">
                      <Badge className={getScoreBadge(calculatedScore).color}>
                        Score: {calculatedScore}
                      </Badge>
                      {calculatedScore >= 60 && (
                        <Button onClick={addToPotentials} disabled={showSuccess}>
                          {showSuccess ? 'Added!' : 'Add to Potentials'}
                        </Button>
                      )}
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
            onClick={() => router.push('/')}
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