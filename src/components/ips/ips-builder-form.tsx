// src/components/ips/ips-builder-form.tsx
"use client"

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Switch } from '@/components/ui/switch'
import { Save, Calculator, Shield, Target, Settings, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { ipsDataService } from '@/lib/services/ips-data-service'

interface IPSFormData {
  name: string
  description: string
  // PCS Setup Criteria
  minIV: number
  minIVRank: number
  maxBidAskSpread: number
  minDeltaShortLeg: number
  maxDeltaShortLeg: number
  minPremiumPercent: number
  targetROI: number
  
  // DTE Preferences  
  preferredDTE: string
  minDTE: number
  maxDTE: number
  
  // Volume & Liquidity
  minStockVolume: number
  minOptionsVolume: number
  minOpenInterest: number
  
  // Risk Management
  maxOpenPositions: number
  maxCollateralPerTrade: number
  positionSizeLimit: number
  targetProfitPercent: number
  
  // Earnings & News
  avoidEarnings: boolean
  earningsBuffer: number
  
  // Rolling Rules
  rollEarlyDTE: number
  rollOnDeltaIncrease: boolean
}

const defaultFormData: IPSFormData = {
  name: "My Trading IPS",
  description: "A comprehensive investment policy statement for systematic trading",
  minIV: 40,
  minIVRank: 50,
  maxBidAskSpread: 0.10,
  minDeltaShortLeg: 0.10,
  maxDeltaShortLeg: 0.25,
  minPremiumPercent: 20,
  targetROI: 6,
  preferredDTE: "both",
  minDTE: 2,
  maxDTE: 14,
  minStockVolume: 1000000,
  minOptionsVolume: 10000,
  minOpenInterest: 500,
  maxOpenPositions: 3,
  maxCollateralPerTrade: 300,
  positionSizeLimit: 2,
  targetProfitPercent: 75,
  avoidEarnings: true,
  earningsBuffer: 0,
  rollEarlyDTE: 3,
  rollOnDeltaIncrease: true
}

interface IPSBuilderFormProps {
  onSave?: (ipsData: any) => void;
  existingIPS?: any;
  selectedStrategies?: string[];
}

export function IPSBuilderForm({ onSave, existingIPS, selectedStrategies = [] }: IPSBuilderFormProps) {
  const [formData, setFormData] = useState<IPSFormData>(defaultFormData)
  const [activeTab, setActiveTab] = useState("setup")
  const [isSaving, setIsSaving] = useState(false)

  // Load existing IPS data if editing
  useEffect(() => {
    if (existingIPS) {
      setFormData({
        name: existingIPS.name || defaultFormData.name,
        description: existingIPS.description || defaultFormData.description,
        minIV: existingIPS.criteria?.minIV || defaultFormData.minIV,
        minIVRank: existingIPS.criteria?.minIVRank || defaultFormData.minIVRank,
        maxBidAskSpread: existingIPS.criteria?.maxBidAskSpread || defaultFormData.maxBidAskSpread,
        minDeltaShortLeg: existingIPS.criteria?.minDeltaShortLeg || defaultFormData.minDeltaShortLeg,
        maxDeltaShortLeg: existingIPS.criteria?.maxDeltaShortLeg || defaultFormData.maxDeltaShortLeg,
        minPremiumPercent: existingIPS.criteria?.minPremiumPercent || defaultFormData.minPremiumPercent,
        targetROI: existingIPS.criteria?.targetROI || defaultFormData.targetROI,
        preferredDTE: existingIPS.criteria?.preferredDTE || defaultFormData.preferredDTE,
        minDTE: existingIPS.criteria?.minDTE || defaultFormData.minDTE,
        maxDTE: existingIPS.criteria?.maxDTE || defaultFormData.maxDTE,
        minStockVolume: existingIPS.criteria?.minStockVolume || defaultFormData.minStockVolume,
        minOptionsVolume: existingIPS.criteria?.minOptionsVolume || defaultFormData.minOptionsVolume,
        minOpenInterest: existingIPS.criteria?.minOpenInterest || defaultFormData.minOpenInterest,
        maxOpenPositions: existingIPS.criteria?.maxOpenPositions || defaultFormData.maxOpenPositions,
        maxCollateralPerTrade: existingIPS.criteria?.maxCollateralPerTrade || defaultFormData.maxCollateralPerTrade,
        positionSizeLimit: existingIPS.criteria?.positionSizeLimit || defaultFormData.positionSizeLimit,
        targetProfitPercent: existingIPS.criteria?.targetProfitPercent || defaultFormData.targetProfitPercent,
        avoidEarnings: existingIPS.criteria?.avoidEarnings ?? defaultFormData.avoidEarnings,
        earningsBuffer: existingIPS.criteria?.earningsBuffer || defaultFormData.earningsBuffer,
        rollEarlyDTE: existingIPS.criteria?.rollEarlyDTE || defaultFormData.rollEarlyDTE,
        rollOnDeltaIncrease: existingIPS.criteria?.rollOnDeltaIncrease ?? defaultFormData.rollOnDeltaIncrease
      })
    }
  }, [existingIPS])

  const handleInputChange = (field: keyof IPSFormData, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }))
  }

  const handleSave = async () => {
    if (!formData.name.trim()) {
      toast.error("IPS name is required")
      return
    }

    setIsSaving(true)
    
    try {
      // Prepare the complete IPS data
      const ipsData = {
        name: formData.name.trim(),
        description: formData.description.trim(),
        strategies: selectedStrategies,
        criteria: {
          minIV: formData.minIV,
          minIVRank: formData.minIVRank,
          maxBidAskSpread: formData.maxBidAskSpread,
          minDeltaShortLeg: formData.minDeltaShortLeg,
          maxDeltaShortLeg: formData.maxDeltaShortLeg,
          minPremiumPercent: formData.minPremiumPercent,
          targetROI: formData.targetROI,
          preferredDTE: formData.preferredDTE,
          minDTE: formData.minDTE,
          maxDTE: formData.maxDTE,
          minStockVolume: formData.minStockVolume,
          minOptionsVolume: formData.minOptionsVolume,
          minOpenInterest: formData.minOpenInterest,
          maxOpenPositions: formData.maxOpenPositions,
          maxCollateralPerTrade: formData.maxCollateralPerTrade,
          positionSizeLimit: formData.positionSizeLimit,
          targetProfitPercent: formData.targetProfitPercent,
          avoidEarnings: formData.avoidEarnings,
          earningsBuffer: formData.earningsBuffer,
          rollEarlyDTE: formData.rollEarlyDTE,
          rollOnDeltaIncrease: formData.rollOnDeltaIncrease
        }
      }

      // Call the parent component's save handler
      if (onSave) {
        await onSave(ipsData)
      }

      toast.success(`IPS "${formData.name}" has been saved successfully`)
      
    } catch (error) {
      console.error('Error saving IPS:', error)
      toast.error(error instanceof Error ? error.message : "Failed to save IPS")
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">
            {existingIPS ? 'Edit IPS Configuration' : 'Create New IPS'}
          </h1>
          <p className="text-gray-600 mt-1">
            Configure your Investment Policy Statement parameters
          </p>
        </div>
        <Button 
          onClick={handleSave} 
          disabled={isSaving}
          className="flex items-center gap-2"
        >
          {isSaving ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Save className="h-4 w-4" />
          )}
          {isSaving ? 'Saving...' : 'Save IPS'}
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5" />
            IPS Configuration
          </CardTitle>
        </CardHeader>
        <CardContent>
          {/* Basic Information */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            <div>
              <Label htmlFor="name">IPS Name *</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => handleInputChange('name', e.target.value)}
                placeholder="My Trading Strategy"
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={(e) => handleInputChange('description', e.target.value)}
                placeholder="Brief description of this IPS..."
                className="mt-1"
                rows={3}
              />
            </div>
          </div>

          {/* Selected Strategies Display */}
          {selectedStrategies.length > 0 && (
            <div className="mb-6">
              <Label>Selected Strategies</Label>
              <div className="flex flex-wrap gap-2 mt-2">
                {selectedStrategies.map(strategy => (
                  <Badge key={strategy} variant="secondary">
                    {strategy.replace('-', ' ').replace(/\b\w/g, l => l.toUpperCase())}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="grid w-full grid-cols-5">
              <TabsTrigger value="setup">Setup</TabsTrigger>
              <TabsTrigger value="dte">DTE</TabsTrigger>
              <TabsTrigger value="liquidity">Liquidity</TabsTrigger>
              <TabsTrigger value="risk">Risk</TabsTrigger>
              <TabsTrigger value="management">Management</TabsTrigger>
            </TabsList>

            <TabsContent value="setup" className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="minIV">Minimum IV (%)</Label>
                  <Input
                    id="minIV"
                    type="number"
                    value={formData.minIV}
                    onChange={(e) => handleInputChange('minIV', Number(e.target.value))}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label htmlFor="minIVRank">Minimum IV Rank (%)</Label>
                  <Input
                    id="minIVRank"
                    type="number"
                    value={formData.minIVRank}
                    onChange={(e) => handleInputChange('minIVRank', Number(e.target.value))}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label htmlFor="maxBidAskSpread">Max Bid-Ask Spread ($)</Label>
                  <Input
                    id="maxBidAskSpread"
                    type="number"
                    step="0.01"
                    value={formData.maxBidAskSpread}
                    onChange={(e) => handleInputChange('maxBidAskSpread', Number(e.target.value))}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label htmlFor="targetROI">Target ROI (%)</Label>
                  <Input
                    id="targetROI"
                    type="number"
                    value={formData.targetROI}
                    onChange={(e) => handleInputChange('targetROI', Number(e.target.value))}
                    className="mt-1"
                  />
                </div>
              </div>
              
              <div className="border-t pt-4">
                <h3 className="font-medium mb-3">Delta Range for Short Leg</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="minDeltaShortLeg">Minimum Delta</Label>
                    <Input
                      id="minDeltaShortLeg"
                      type="number"
                      step="0.01"
                      value={formData.minDeltaShortLeg}
                      onChange={(e) => handleInputChange('minDeltaShortLeg', Number(e.target.value))}
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <Label htmlFor="maxDeltaShortLeg">Maximum Delta</Label>
                    <Input
                      id="maxDeltaShortLeg"
                      type="number"
                      step="0.01"
                      value={formData.maxDeltaShortLeg}
                      onChange={(e) => handleInputChange('maxDeltaShortLeg', Number(e.target.value))}
                      className="mt-1"
                    />
                  </div>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="dte" className="space-y-4">
              <div>
                <Label htmlFor="preferredDTE">Preferred DTE Strategy</Label>
                <select
                  id="preferredDTE"
                  value={formData.preferredDTE}
                  onChange={(e) => handleInputChange('preferredDTE', e.target.value)}
                  className="w-full mt-1 p-2 border rounded-md"
                >
                  <option value="weekly">Weekly (0-7 DTE)</option>
                  <option value="monthly">Monthly (14-45 DTE)</option>
                  <option value="both">Both Weekly & Monthly</option>
                </select>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="minDTE">Minimum DTE</Label>
                  <Input
                    id="minDTE"
                    type="number"
                    value={formData.minDTE}
                    onChange={(e) => handleInputChange('minDTE', Number(e.target.value))}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label htmlFor="maxDTE">Maximum DTE</Label>
                  <Input
                    id="maxDTE"
                    type="number"
                    value={formData.maxDTE}
                    onChange={(e) => handleInputChange('maxDTE', Number(e.target.value))}
                    className="mt-1"
                  />
                </div>
              </div>
            </TabsContent>

            <TabsContent value="liquidity" className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="minStockVolume">Min Stock Volume</Label>
                  <Input
                    id="minStockVolume"
                    type="number"
                    value={formData.minStockVolume}
                    onChange={(e) => handleInputChange('minStockVolume', Number(e.target.value))}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label htmlFor="minOptionsVolume">Min Options Volume</Label>
                  <Input
                    id="minOptionsVolume"
                    type="number"
                    value={formData.minOptionsVolume}
                    onChange={(e) => handleInputChange('minOptionsVolume', Number(e.target.value))}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label htmlFor="minOpenInterest">Min Open Interest</Label>
                  <Input
                    id="minOpenInterest"
                    type="number"
                    value={formData.minOpenInterest}
                    onChange={(e) => handleInputChange('minOpenInterest', Number(e.target.value))}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label htmlFor="minPremiumPercent">Min Premium (%)</Label>
                  <Input
                    id="minPremiumPercent"
                    type="number"
                    value={formData.minPremiumPercent}
                    onChange={(e) => handleInputChange('minPremiumPercent', Number(e.target.value))}
                    className="mt-1"
                  />
                </div>
              </div>
            </TabsContent>

            <TabsContent value="risk" className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="maxOpenPositions">Max Open Positions</Label>
                  <Input
                    id="maxOpenPositions"
                    type="number"
                    value={formData.maxOpenPositions}
                    onChange={(e) => handleInputChange('maxOpenPositions', Number(e.target.value))}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label htmlFor="maxCollateralPerTrade">Max Collateral per Trade ($)</Label>
                  <Input
                    id="maxCollateralPerTrade"
                    type="number"
                    value={formData.maxCollateralPerTrade}
                    onChange={(e) => handleInputChange('maxCollateralPerTrade', Number(e.target.value))}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label htmlFor="positionSizeLimit">Position Size Limit ($)</Label>
                  <Input
                    id="positionSizeLimit"
                    type="number"
                    value={formData.positionSizeLimit}
                    onChange={(e) => handleInputChange('positionSizeLimit', Number(e.target.value))}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label htmlFor="targetProfitPercent">Target Profit (%)</Label>
                  <Input
                    id="targetProfitPercent"
                    type="number"
                    value={formData.targetProfitPercent}
                    onChange={(e) => handleInputChange('targetProfitPercent', Number(e.target.value))}
                    className="mt-1"
                  />
                </div>
              </div>

              <div className="border-t pt-4">
                <h3 className="font-medium mb-3">Earnings Management</h3>
                <div className="flex items-center space-x-2 mb-4">
                  <Switch
                    id="avoidEarnings"
                    checked={formData.avoidEarnings}
                    onCheckedChange={(checked) => handleInputChange('avoidEarnings', checked)}
                  />
                  <Label htmlFor="avoidEarnings">Avoid Earnings Announcements</Label>
                </div>
                
                {formData.avoidEarnings && (
                  <div>
                    <Label htmlFor="earningsBuffer">Earnings Buffer (days)</Label>
                    <Input
                      id="earningsBuffer"
                      type="number"
                      value={formData.earningsBuffer}
                      onChange={(e) => handleInputChange('earningsBuffer', Number(e.target.value))}
                      className="mt-1"
                      placeholder="0"
                    />
                  </div>
                )}
              </div>
            </TabsContent>

            <TabsContent value="management" className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="rollEarlyDTE">Roll Early at DTE</Label>
                  <Input
                    id="rollEarlyDTE"
                    type="number"
                    value={formData.rollEarlyDTE}
                    onChange={(e) => handleInputChange('rollEarlyDTE', Number(e.target.value))}
                    className="mt-1"
                  />
                </div>
                <div className="flex items-center space-x-2">
                  <Switch
                    id="rollOnDeltaIncrease"
                    checked={formData.rollOnDeltaIncrease}
                    onCheckedChange={(checked) => handleInputChange('rollOnDeltaIncrease', checked)}
                  />
                  <Label htmlFor="rollOnDeltaIncrease">Roll on Delta Increase</Label>
                </div>
              </div>

              <div className="border-t pt-4">
                <h3 className="font-medium mb-3">Summary</h3>
                <div className="bg-gray-50 p-4 rounded-lg space-y-2">
                  <div className="flex justify-between">
                    <span>Target ROI:</span>
                    <span className="font-medium">{formData.targetROI}%</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Max Positions:</span>
                    <span className="font-medium">{formData.maxOpenPositions}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>DTE Range:</span>
                    <span className="font-medium">{formData.minDTE} - {formData.maxDTE} days</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Delta Range:</span>
                    <span className="font-medium">{formData.minDeltaShortLeg} - {formData.maxDeltaShortLeg}</span>
                  </div>
                </div>
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  )
}