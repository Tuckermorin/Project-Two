"use client"

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Switch } from '@/components/ui/switch'
import { Save, Calculator, Shield, Target, Settings } from 'lucide-react'

interface IPSFormData {
  name: string
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

export function IPSBuilderForm() {
  const [formData, setFormData] = useState<IPSFormData>(defaultFormData)
  const [activeTab, setActiveTab] = useState("setup")

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handleInputChange = (field: keyof IPSFormData, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }))
  }

  const handleSave = () => {
    // TODO: Save to database
    console.log("Saving IPS:", formData)
  }

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-6">
        <Input
          placeholder="IPS Name (e.g., Conservative PCS Strategy)"
          value={formData.name}
          onChange={(e) => handleInputChange('name', e.target.value)}
          className="text-lg font-semibold"
        />
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="setup" className="flex items-center gap-2">
            <Calculator className="h-4 w-4" />
            Setup Criteria
          </TabsTrigger>
          <TabsTrigger value="risk" className="flex items-center gap-2">
            <Shield className="h-4 w-4" />
            Risk Management
          </TabsTrigger>
          <TabsTrigger value="management" className="flex items-center gap-2">
            <Target className="h-4 w-4" />
            Trade Management
          </TabsTrigger>
          <TabsTrigger value="advanced" className="flex items-center gap-2">
            <Settings className="h-4 w-4" />
            Advanced
          </TabsTrigger>
        </TabsList>

        <TabsContent value="setup" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>PCS Setup Criteria</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-4">
                <div>
                  <Label htmlFor="minIV">Minimum IV (%)</Label>
                  <Input
                    id="minIV"
                    type="number"
                    value={formData.minIV}
                    onChange={(e) => handleInputChange('minIV', Number(e.target.value))}
                  />
                  <p className="text-xs text-gray-500 mt-1">Your target: ≥ 40%</p>
                </div>
                
                <div>
                  <Label htmlFor="minIVRank">Minimum IV Rank</Label>
                  <Input
                    id="minIVRank"
                    type="number"
                    value={formData.minIVRank}
                    onChange={(e) => handleInputChange('minIVRank', Number(e.target.value))}
                  />
                  <p className="text-xs text-gray-500 mt-1">0-100 scale, your target: &gt; 50</p>
                </div>

                <div>
                  <Label htmlFor="maxBidAskSpread">Max Bid-Ask Spread ($)</Label>
                  <Input
                    id="maxBidAskSpread"
                    type="number"
                    step="0.01"
                    value={formData.maxBidAskSpread}
                    onChange={(e) => handleInputChange('maxBidAskSpread', Number(e.target.value))}
                  />
                  <p className="text-xs text-gray-500 mt-1">For liquid contracts: ≤ $0.10</p>
                </div>
              </div>

              <div className="space-y-4">
                <div>
                  <Label htmlFor="minDeltaShortLeg">Min Delta (Short Leg)</Label>
                  <Input
                    id="minDeltaShortLeg"
                    type="number"
                    step="0.01"
                    value={formData.minDeltaShortLeg}
                    onChange={(e) => handleInputChange('minDeltaShortLeg', Number(e.target.value))}
                  />
                </div>

                <div>
                  <Label htmlFor="maxDeltaShortLeg">Max Delta (Short Leg)</Label>
                  <Input
                    id="maxDeltaShortLeg"
                    type="number"
                    step="0.01"
                    value={formData.maxDeltaShortLeg}
                    onChange={(e) => handleInputChange('maxDeltaShortLeg', Number(e.target.value))}
                  />
                  <p className="text-xs text-gray-500 mt-1">Your range: 0.10-0.25</p>
                </div>

                <div>
                  <Label htmlFor="minPremiumPercent">Min Premium (% of collateral)</Label>
                  <Input
                    id="minPremiumPercent"
                    type="number"
                    value={formData.minPremiumPercent}
                    onChange={(e) => handleInputChange('minPremiumPercent', Number(e.target.value))}
                  />
                  <p className="text-xs text-gray-500 mt-1">Your target: ≥ 20%</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>DTE & Volume Requirements</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-4">
                <div>
                  <Label htmlFor="minDTE">Minimum DTE</Label>
                  <Input
                    id="minDTE"
                    type="number"
                    value={formData.minDTE}
                    onChange={(e) => handleInputChange('minDTE', Number(e.target.value))}
                  />
                </div>

                <div>
                  <Label htmlFor="maxDTE">Maximum DTE</Label>
                  <Input
                    id="maxDTE"
                    type="number"
                    value={formData.maxDTE}
                    onChange={(e) => handleInputChange('maxDTE', Number(e.target.value))}
                  />
                  <p className="text-xs text-gray-500 mt-1">Your preference: 2-5 (weekly), 10-14 (bi-weekly)</p>
                </div>
              </div>

              <div className="space-y-4">
                <div>
                  <Label htmlFor="minStockVolume">Min Stock Volume</Label>
                  <Input
                    id="minStockVolume"
                    type="number"
                    value={formData.minStockVolume}
                    onChange={(e) => handleInputChange('minStockVolume', Number(e.target.value))}
                  />
                  <p className="text-xs text-gray-500 mt-1">Your target: &gt; 1M daily</p>
                </div>

                <div>
                  <Label htmlFor="minOptionsVolume">Min Options Volume</Label>
                  <Input
                    id="minOptionsVolume"
                    type="number"
                    value={formData.minOptionsVolume}
                    onChange={(e) => handleInputChange('minOptionsVolume', Number(e.target.value))}
                  />
                  <p className="text-xs text-gray-500 mt-1">Your target: &gt; 10k</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="risk" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Position & Risk Limits</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-4">
                <div>
                  <Label htmlFor="maxOpenPositions">Max Open Positions</Label>
                  <Input
                    id="maxOpenPositions"
                    type="number"
                    value={formData.maxOpenPositions}
                    onChange={(e) => handleInputChange('maxOpenPositions', Number(e.target.value))}
                  />
                  <p className="text-xs text-gray-500 mt-1">Your limit: 3 positions</p>
                </div>

                <div>
                  <Label htmlFor="maxCollateralPerTrade">Max Collateral per Trade ($)</Label>
                  <Input
                    id="maxCollateralPerTrade"
                    type="number"
                    value={formData.maxCollateralPerTrade}
                    onChange={(e) => handleInputChange('maxCollateralPerTrade', Number(e.target.value))}
                  />
                  <p className="text-xs text-gray-500 mt-1">Your limit: $300</p>
                </div>
              </div>

              <div className="space-y-4">
                <div>
                  <Label htmlFor="positionSizeLimit">Max Contracts per Setup</Label>
                  <Input
                    id="positionSizeLimit"
                    type="number"
                    value={formData.positionSizeLimit}
                    onChange={(e) => handleInputChange('positionSizeLimit', Number(e.target.value))}
                  />
                  <p className="text-xs text-gray-500 mt-1">Your limit: 1-2 contracts</p>
                </div>

                <div>
                  <Label htmlFor="targetProfitPercent">Target Profit (%)</Label>
                  <Input
                    id="targetProfitPercent"
                    type="number"
                    value={formData.targetProfitPercent}
                    onChange={(e) => handleInputChange('targetProfitPercent', Number(e.target.value))}
                  />
                  <p className="text-xs text-gray-500 mt-1">Close at X% of max gain (50-75%)</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="management" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Trade Management Rules</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <Label htmlFor="avoidEarnings">Avoid Earnings</Label>
                  <p className="text-xs text-gray-500">Don&apos;t hold PCS through earnings</p>
                </div>
                <Switch
                  id="avoidEarnings"
                  checked={formData.avoidEarnings}
                  onCheckedChange={(checked) => handleInputChange('avoidEarnings', checked)}
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <Label htmlFor="rollEarlyDTE">Roll Early DTE</Label>
                  <Input
                    id="rollEarlyDTE"
                    type="number"
                    value={formData.rollEarlyDTE}
                    onChange={(e) => handleInputChange('rollEarlyDTE', Number(e.target.value))}
                  />
                  <p className="text-xs text-gray-500 mt-1">Consider rolling at X DTE (3-4 days)</p>
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <Label htmlFor="rollOnDeltaIncrease">Roll on Delta Increase</Label>
                    <p className="text-xs text-gray-500">Roll if delta increases significantly</p>
                  </div>
                  <Switch
                    id="rollOnDeltaIncrease"
                    checked={formData.rollOnDeltaIncrease}
                    onCheckedChange={(checked) => handleInputChange('rollOnDeltaIncrease', checked)}
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="advanced" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Advanced Settings</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-gray-500 text-center py-8">
                Advanced settings like sector preferences, correlation filters, and custom scoring weights will be added here.
              </p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <div className="mt-8 flex justify-end gap-4">
        <Button variant="outline">Cancel</Button>
        <Button onClick={handleSave}>
          <Save className="h-4 w-4 mr-2" />
          Save IPS
        </Button>
      </div>
    </div>
  )
}