"use client"

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Calculator, TrendingUp, AlertTriangle, CheckCircle } from 'lucide-react'
import { useTradesStore } from '@/lib/stores/trades-store'
import { useRouter } from 'next/navigation'

interface TradeFormData {
  type: 'put-credit-spread' | 'long-call'
  symbol: string
  expirationDate: string
  quantity: number
  
  // Put Credit Spread fields
  shortStrike?: number
  longStrike?: number
  creditReceived?: number
  
  // Long Call fields
  callStrike?: number
  premiumPaid?: number
  
  // Optional analysis fields
  currentPrice?: number
  iv?: number
  delta?: number
  
  notes?: string
}

const initialFormData: TradeFormData = {
  type: 'put-credit-spread',
  symbol: '',
  expirationDate: '',
  quantity: 1,
  notes: ''
}

export function TradeEntryForm() {
  const [formData, setFormData] = useState<TradeFormData>(initialFormData)
  const [ipsScore, setIpsScore] = useState<number | null>(null)
  const [isCalculating, setIsCalculating] = useState(false)

    const { addTrade } = useTradesStore()
  const router = useRouter()
  const [isSaving, setIsSaving] = useState(false)
  const [showSuccess, setShowSuccess] = useState(false)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handleInputChange = (field: keyof TradeFormData, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }))
    // Reset IPS score when trade details change
    setIpsScore(null)
  }

  const calculateIPSScore = async () => {
    setIsCalculating(true)
    
    // TODO: Implement actual IPS scoring logic
    // For now, simulate calculation
    await new Promise(resolve => setTimeout(resolve, 1000))
    
    // Mock scoring based on some basic criteria
    let score = 70 // Base score
    
    if (formData.iv && formData.iv >= 40) score += 10
    if (formData.delta && formData.delta >= 0.10 && formData.delta <= 0.25) score += 10
    if (formData.symbol && formData.symbol.length > 0) score += 5
    
    // Add some randomness for demo
    score += Math.floor(Math.random() * 10) - 5
    score = Math.max(0, Math.min(100, score))
    
    setIpsScore(score)
    setIsCalculating(false)
  }

  const getScoreColor = (score: number) => {
    if (score >= 80) return 'text-green-600'
    if (score >= 60) return 'text-yellow-600'
    return 'text-red-600'
  }

  const getScoreBadge = (score: number) => {
    if (score >= 80) return { variant: 'default' as const, text: 'Excellent Fit' }
    if (score >= 60) return { variant: 'secondary' as const, text: 'Good Fit' }
    return { variant: 'destructive' as const, text: 'Poor Fit' }
  }

  const isPutCreditSpread = formData.type === 'put-credit-spread'

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Trade Entry Form */}
      <div className="lg:col-span-2">
        <Card>
          <CardHeader>
            <CardTitle>Trade Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Strategy Type */}
            <div>
              <Label>Strategy Type</Label>
              <Select 
                value={formData.type} 
                onValueChange={(value: 'put-credit-spread' | 'long-call') => 
                  handleInputChange('type', value)
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="put-credit-spread">Put Credit Spread</SelectItem>
                  <SelectItem value="long-call">Long Call</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Basic Details */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="symbol">Symbol</Label>
                <Input
                  id="symbol"
                  placeholder="e.g., AAPL"
                  value={formData.symbol}
                  onChange={(e) => handleInputChange('symbol', e.target.value.toUpperCase())}
                />
              </div>
              
              <div>
                <Label htmlFor="quantity">Quantity (Contracts)</Label>
                <Input
                  id="quantity"
                  type="number"
                  min="1"
                  value={formData.quantity}
                  onChange={(e) => handleInputChange('quantity', parseInt(e.target.value) || 1)}
                />
              </div>
            </div>

            <div>
              <Label htmlFor="expirationDate">Expiration Date</Label>
              <Input
                id="expirationDate"
                type="date"
                value={formData.expirationDate}
                onChange={(e) => handleInputChange('expirationDate', e.target.value)}
              />
            </div>

            {/* Strategy-Specific Fields */}
            {isPutCreditSpread ? (
              <div className="space-y-4">
                <h3 className="font-semibold">Put Credit Spread Details</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <Label htmlFor="shortStrike">Short Strike</Label>
                    <Input
                      id="shortStrike"
                      type="number"
                      step="0.50"
                      placeholder="e.g., 150"
                      value={formData.shortStrike || ''}
                      onChange={(e) => handleInputChange('shortStrike', parseFloat(e.target.value) || undefined)}
                    />
                  </div>
                  
                  <div>
                    <Label htmlFor="longStrike">Long Strike (Protection)</Label>
                    <Input
                      id="longStrike"
                      type="number"
                      step="0.50"
                      placeholder="e.g., 145"
                      value={formData.longStrike || ''}
                      onChange={(e) => handleInputChange('longStrike', parseFloat(e.target.value) || undefined)}
                    />
                  </div>
                  
                  <div>
                    <Label htmlFor="creditReceived">Credit Received</Label>
                    <Input
                      id="creditReceived"
                      type="number"
                      step="0.01"
                      placeholder="e.g., 0.85"
                      value={formData.creditReceived || ''}
                      onChange={(e) => handleInputChange('creditReceived', parseFloat(e.target.value) || undefined)}
                    />
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <h3 className="font-semibold">Long Call Details</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="callStrike">Strike Price</Label>
                    <Input
                      id="callStrike"
                      type="number"
                      step="0.50"
                      placeholder="e.g., 155"
                      value={formData.callStrike || ''}
                      onChange={(e) => handleInputChange('callStrike', parseFloat(e.target.value) || undefined)}
                    />
                  </div>
                  
                  <div>
                    <Label htmlFor="premiumPaid">Premium Paid</Label>
                    <Input
                      id="premiumPaid"
                      type="number"
                      step="0.01"
                      placeholder="e.g., 2.50"
                      value={formData.premiumPaid || ''}
                      onChange={(e) => handleInputChange('premiumPaid', parseFloat(e.target.value) || undefined)}
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Optional Analysis Fields */}
            <div className="space-y-4">
              <h3 className="font-semibold">Analysis (Optional)</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <Label htmlFor="currentPrice">Current Stock Price</Label>
                  <Input
                    id="currentPrice"
                    type="number"
                    step="0.01"
                    placeholder="e.g., 152.50"
                    value={formData.currentPrice || ''}
                    onChange={(e) => handleInputChange('currentPrice', parseFloat(e.target.value) || undefined)}
                  />
                </div>
                
                <div>
                  <Label htmlFor="iv">IV (%)</Label>
                  <Input
                    id="iv"
                    type="number"
                    step="0.1"
                    placeholder="e.g., 45.2"
                    value={formData.iv || ''}
                    onChange={(e) => handleInputChange('iv', parseFloat(e.target.value) || undefined)}
                  />
                </div>
                
                <div>
                  <Label htmlFor="delta">Delta</Label>
                  <Input
                    id="delta"
                    type="number"
                    step="0.01"
                    placeholder="e.g., 0.15"
                    value={formData.delta || ''}
                    onChange={(e) => handleInputChange('delta', parseFloat(e.target.value) || undefined)}
                  />
                </div>
              </div>
            </div>

            {/* Notes */}
            <div>
              <Label htmlFor="notes">Notes</Label>
              <Textarea
                id="notes"
                placeholder="Trade thesis, market conditions, etc."
                value={formData.notes || ''}
                onChange={(e) => handleInputChange('notes', e.target.value)}
                rows={3}
              />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* IPS Scoring Panel */}
      <div>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calculator className="h-5 w-5" />
              IPS Score
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {ipsScore === null ? (
              <div className="text-center py-6">
                <p className="text-gray-500 mb-4">Enter trade details and calculate IPS score</p>
                <Button 
                  onClick={calculateIPSScore}
                  disabled={!formData.symbol || isCalculating}
                >
                  {isCalculating ? 'Calculating...' : 'Calculate Score'}
                </Button>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="text-center">
                  <div className={`text-4xl font-bold ${getScoreColor(ipsScore)}`}>
                    {ipsScore}/100
                  </div>
                  <Badge {...getScoreBadge(ipsScore)} className="mt-2">
                    {getScoreBadge(ipsScore).text}
                  </Badge>
                </div>

                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-sm">
                    {formData.iv && formData.iv >= 40 ? (
                      <CheckCircle className="h-4 w-4 text-green-600" />
                    ) : (
                      <AlertTriangle className="h-4 w-4 text-yellow-600" />
                    )}
                    <span>IV Requirement ({formData.iv || 'N/A'}%)</span>
                  </div>
                  
                  <div className="flex items-center gap-2 text-sm">
                    {formData.delta && formData.delta >= 0.10 && formData.delta <= 0.25 ? (
                      <CheckCircle className="h-4 w-4 text-green-600" />
                    ) : (
                      <AlertTriangle className="h-4 w-4 text-yellow-600" />
                    )}
                    <span>Delta Range ({formData.delta || 'N/A'})</span>
                  </div>
                </div>

                <div className="pt-4 space-y-2">
                <Button 
                    className="w-full" 
                    disabled={ipsScore === null || ipsScore < 60 || isSaving}
                    onClick={async () => {
                    if (ipsScore === null) return
                    
                    setIsSaving(true)
                    
                    // Prepare trade data
                    const tradeData = {
                        type: formData.type,
                        symbol: formData.symbol,
                        expirationDate: formData.expirationDate,
                        quantity: formData.quantity,
                        shortStrike: formData.shortStrike,
                        longStrike: formData.longStrike,
                        creditReceived: formData.creditReceived,
                        callStrike: formData.callStrike,
                        premiumPaid: formData.premiumPaid,
                        currentPrice: formData.currentPrice,
                        iv: formData.iv,
                        delta: formData.delta,
                        status: 'potential' as const,
                        entryDate: new Date().toISOString(),
                        ipsScore,
                        ipsNotes: `Score: ${ipsScore}/100. ${ipsScore >= 80 ? 'Excellent' : ipsScore >= 60 ? 'Good' : 'Poor'} fit for IPS criteria.`,
                        notes: formData.notes,
                    }
                    
                    // Save to store
                    addTrade(tradeData)
                    
                    // Show success state
                    setShowSuccess(true)
                    
                    // Reset after delay
                    setTimeout(() => {
                        setIsSaving(false)
                        setShowSuccess(false)
                        setFormData(initialFormData)
                        setIpsScore(null)
                    }, 2000)
                    }}
                >
                    {isSaving ? (
                    <>
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                        Saving...
                    </>
                    ) : showSuccess ? (
                    <>
                        <CheckCircle className="h-4 w-4 mr-2" />
                        Added Successfully!
                    </>
                    ) : (
                    <>
                        <TrendingUp className="h-4 w-4 mr-2" />
                        Add to Potential Trades
                    </>
                    )}
                </Button>
                <p className="text-xs text-gray-500 text-center">
                    {ipsScore === null ? 'Calculate score first' :
                    ipsScore >= 60 ? 'Meets IPS criteria' : 'Below IPS threshold (60)'}
                </p>
                {showSuccess && (
                    <div className="text-center">
                    <Button 
                        variant="outline" 
                        size="sm"
                        onClick={() => router.push('/trades?tab=potential')}
                        className="text-xs"
                    >
                        View Potential Trades
                    </Button>
                    </div>
                )}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}