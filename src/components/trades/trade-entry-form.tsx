/**
 * Enhanced Trade Entry Form with IPS Factor Integration
 * Copy this into: src/components/trades/trade-entry-form.tsx
 */

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Separator } from '@/components/ui/separator';
import { 
  Calculator, 
  TrendingUp, 
  Target, 
  AlertCircle, 
  CheckCircle,
  Clock,
  DollarSign,
  BarChart3,
  Users,
  Sparkles
} from 'lucide-react';

interface IPSConfiguration {
  id: string;
  name: string;
  strategies: string[];
  factors?: Record<string, any>;
}

interface FactorDefinition {
  id: string;
  name: string;
  type: 'quantitative' | 'options';
  category: string;
  data_type: string;
  unit: string;
  source?: string;
}

interface TradeFormData {
  // Basic Trade Info
  name: string;
  symbol: string;
  currentPrice: number;
  expirationDate: string;
  contractType: 'put-credit-spread' | 'call-credit-spread' | 'long-call' | 'long-put' | 'iron-condor' | 'covered-call';
  numberOfContracts: number;
  shortStrike: number;
  longStrike: number;
  creditReceived: number;
  sector: string;
  
  // Calculated Fields (auto-filled or calculated)
  dte: number;
  spreadWidth: number;
  maxGain: number;
  maxLoss: number;
  percentCurrentToShort: number;
  deltaShortLeg: number;
  theta: number;
  vega: number;
  ivAtEntry: number;
  
  // IPS Factor Values (will be auto-fetched from APIs upon trade creation)
  ipsFactors: Record<string, any>;
}

interface TradeEntryFormProps {
  selectedIPS: IPSConfiguration;
  availableFactors: FactorDefinition[];
  onSubmit: (tradeData: TradeFormData) => void;
  onCalculateScore: (tradeData: TradeFormData) => void;
  onCancel: () => void;
}

export function TradeEntryForm({
  selectedIPS,
  availableFactors,
  onSubmit,
  onCalculateScore,
  onCancel
}: TradeEntryFormProps) {
  const [formData, setFormData] = useState<TradeFormData>({
    name: '',
    symbol: '',
    currentPrice: 0,
    expirationDate: '',
    contractType: 'put-credit-spread',
    numberOfContracts: 1,
    shortStrike: 0,
    longStrike: 0,
    creditReceived: 0,
    sector: '',
    dte: 0,
    spreadWidth: 0,
    maxGain: 0,
    maxLoss: 0,
    percentCurrentToShort: 0,
    deltaShortLeg: 0,
    theta: 0,
    vega: 0,
    ivAtEntry: 0,
    ipsFactors: {}
  });

  const [activeTab, setActiveTab] = useState('trade-details');
  const [isCalculating, setIsCalculating] = useState(false);
  const [completionScore, setCompletionScore] = useState(0);

  // Calculate DTE when expiration date changes
  useEffect(() => {
    if (formData.expirationDate) {
      const expDate = new Date(formData.expirationDate);
      const today = new Date();
      const timeDiff = expDate.getTime() - today.getTime();
      const daysDiff = Math.ceil(timeDiff / (1000 * 3600 * 24));
      setFormData(prev => ({ ...prev, dte: daysDiff }));
    }
  }, [formData.expirationDate]);

  // Calculate spread metrics when strikes change
  useEffect(() => {
    if (formData.shortStrike && formData.longStrike && formData.creditReceived) {
      const spreadWidth = Math.abs(formData.shortStrike - formData.longStrike);
      const maxGain = formData.creditReceived * 100 * formData.numberOfContracts;
      const maxLoss = (spreadWidth * 100 * formData.numberOfContracts) - maxGain;
      
      setFormData(prev => ({
        ...prev,
        spreadWidth,
        maxGain,
        maxLoss
      }));
    }
  }, [formData.shortStrike, formData.longStrike, formData.creditReceived, formData.numberOfContracts]);

  // Calculate % current to short strike
  useEffect(() => {
    if (formData.currentPrice && formData.shortStrike) {
      const percentToShort = ((formData.currentPrice - formData.shortStrike) / formData.shortStrike) * 100;
      setFormData(prev => ({ ...prev, percentCurrentToShort: percentToShort }));
    }
  }, [formData.currentPrice, formData.shortStrike]);

  // Calculate completion score
  useEffect(() => {
    const requiredFields = [
      'name', 'symbol', 'currentPrice', 'expirationDate', 'contractType',
      'numberOfContracts', 'shortStrike', 'longStrike', 'creditReceived', 'sector'
    ];
    
    const completedFields = requiredFields.filter(field => {
      const value = formData[field as keyof TradeFormData];
      return value !== '' && value !== 0;
    }).length;

    const manualFactors = getAllAPIFactors();
    const completedFactors = manualFactors.filter(factor => 
      formData.ipsFactors[factor.name] !== undefined && formData.ipsFactors[factor.name] !== ''
    ).length;

    const totalRequired = requiredFields.length + manualFactors.length;
    const totalCompleted = completedFields + completedFactors;
    
    setCompletionScore((totalCompleted / totalRequired) * 100);
  }, [formData, availableFactors]);

  const handleInputChange = (field: keyof TradeFormData, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleFactorChange = (factorName: string, value: any) => {
    setFormData(prev => ({
      ...prev,
      ipsFactors: { ...prev.ipsFactors, [factorName]: value }
    }));
  };

  // All factors are now API-based - they will be automatically collected when trade is saved
  const getAllAPIFactors = () => {
    return availableFactors;
  };

  const handleCalculateScore = async () => {
    setIsCalculating(true);
    try {
      await onCalculateScore(formData);
    } finally {
      setIsCalculating(false);
    }
  };

  const isFormValid = () => {
    const requiredFields = [
      'name', 'symbol', 'currentPrice', 'expirationDate', 'contractType',
      'numberOfContracts', 'shortStrike', 'longStrike', 'creditReceived', 'sector'
    ];
    
    const basicFieldsComplete = requiredFields.every(field => {
      const value = formData[field as keyof TradeFormData];
      return value !== '' && value !== 0;
    });

    const manualFactors = getAllAPIFactors();
    const factorsComplete = manualFactors.every(factor => 
      formData.ipsFactors[factor.name] !== undefined && formData.ipsFactors[factor.name] !== ''
    );

    return basicFieldsComplete && factorsComplete;
  };

  // Note: This function is no longer used since all factors are auto-fetched via API
  // Keeping for backwards compatibility but factors won't require manual input
  const renderFactorInput = (factor: FactorDefinition) => {
    return (
      <div className="text-sm text-gray-500 italic">
        Will be automatically collected from API
      </div>
    );
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">New Trade Entry</h2>
          <p className="text-gray-600">IPS: {selectedIPS.name}</p>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-right">
            <div className="text-sm text-gray-600">Completion</div>
            <div className="flex items-center gap-2">
              <Progress value={completionScore} className="w-24" />
              <span className="text-sm font-medium">{Math.round(completionScore)}%</span>
            </div>
          </div>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="trade-details" className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4" />
            Trade Details
          </TabsTrigger>
          <TabsTrigger value="ips-factors" className="flex items-center gap-2">
            <BarChart3 className="h-4 w-4" />
            IPS Factors ({getAllAPIFactors().length})
          </TabsTrigger>
          <TabsTrigger value="review" className="flex items-center gap-2">
            <Target className="h-4 w-4" />
            Review & Submit
          </TabsTrigger>
        </TabsList>

        {/* Trade Details Tab */}
        <TabsContent value="trade-details" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5" />
                Basic Trade Information
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                <div>
                  <Label htmlFor="name">Trade Name</Label>
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={(e) => handleInputChange('name', e.target.value)}
                    placeholder="e.g., AAPL Put Credit Spread"
                  />
                </div>

                <div>
                  <Label htmlFor="symbol">Symbol</Label>
                  <Input
                    id="symbol"
                    value={formData.symbol}
                    onChange={(e) => handleInputChange('symbol', e.target.value.toUpperCase())}
                    placeholder="AAPL"
                  />
                </div>

                <div>
                  <Label htmlFor="currentPrice">Current Price</Label>
                  <Input
                    id="currentPrice"
                    type="number"
                    step="0.01"
                    value={formData.currentPrice || ''}
                    onChange={(e) => handleInputChange('currentPrice', parseFloat(e.target.value) || 0)}
                    placeholder="150.00"
                  />
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

                <div>
                  <Label htmlFor="dte">DTE (Days to Expiration)</Label>
                  <Input
                    id="dte"
                    type="number"
                    value={formData.dte}
                    disabled
                    className="bg-gray-50"
                  />
                </div>

                <div>
                  <Label htmlFor="contractType">Contract Type</Label>
                  <Select
                    value={formData.contractType}
                    onValueChange={(value: any) => handleInputChange('contractType', value)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="put-credit-spread">Put Credit Spread</SelectItem>
                      <SelectItem value="call-credit-spread">Call Credit Spread</SelectItem>
                      <SelectItem value="long-call">Long Call</SelectItem>
                      <SelectItem value="long-put">Long Put</SelectItem>
                      <SelectItem value="iron-condor">Iron Condor</SelectItem>
                      <SelectItem value="covered-call">Covered Call</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label htmlFor="numberOfContracts"># of Contracts</Label>
                  <Input
                    id="numberOfContracts"
                    type="number"
                    min="1"
                    value={formData.numberOfContracts}
                    onChange={(e) => handleInputChange('numberOfContracts', parseInt(e.target.value) || 1)}
                  />
                </div>

                <div>
                  <Label htmlFor="shortStrike">Short Strike</Label>
                  <Input
                    id="shortStrike"
                    type="number"
                    step="0.50"
                    value={formData.shortStrike || ''}
                    onChange={(e) => handleInputChange('shortStrike', parseFloat(e.target.value) || 0)}
                    placeholder="145.00"
                  />
                </div>

                <div>
                  <Label htmlFor="longStrike">Long Strike</Label>
                  <Input
                    id="longStrike"
                    type="number"
                    step="0.50"
                    value={formData.longStrike || ''}
                    onChange={(e) => handleInputChange('longStrike', parseFloat(e.target.value) || 0)}
                    placeholder="140.00"
                  />
                </div>

                <div>
                  <Label htmlFor="creditReceived">Credit Received</Label>
                  <Input
                    id="creditReceived"
                    type="number"
                    step="0.01"
                    value={formData.creditReceived || ''}
                    onChange={(e) => handleInputChange('creditReceived', parseFloat(e.target.value) || 0)}
                    placeholder="1.25"
                  />
                </div>

                <div>
                  <Label htmlFor="sector">Sector</Label>
                  <Select
                    value={formData.sector}
                    onValueChange={(value) => handleInputChange('sector', value)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select sector" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="technology">Technology</SelectItem>
                      <SelectItem value="healthcare">Healthcare</SelectItem>
                      <SelectItem value="financials">Financials</SelectItem>
                      <SelectItem value="consumer-discretionary">Consumer Discretionary</SelectItem>
                      <SelectItem value="communication">Communication</SelectItem>
                      <SelectItem value="industrials">Industrials</SelectItem>
                      <SelectItem value="consumer-staples">Consumer Staples</SelectItem>
                      <SelectItem value="energy">Energy</SelectItem>
                      <SelectItem value="utilities">Utilities</SelectItem>
                      <SelectItem value="real-estate">Real Estate</SelectItem>
                      <SelectItem value="materials">Materials</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Calculated Metrics */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Calculator className="h-5 w-5" />
                Options Metrics (Manual Entry)
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <div>
                  <Label htmlFor="spreadWidth">Spread Width</Label>
                  <Input
                    id="spreadWidth"
                    type="number"
                    value={formData.spreadWidth}
                    disabled
                    className="bg-gray-50"
                  />
                </div>

                <div>
                  <Label htmlFor="maxGain">Max Gain ($)</Label>
                  <Input
                    id="maxGain"
                    type="number"
                    value={formData.maxGain}
                    disabled
                    className="bg-gray-50"
                  />
                </div>

                <div>
                  <Label htmlFor="maxLoss">Max Loss ($)</Label>
                  <Input
                    id="maxLoss"
                    type="number"
                    value={formData.maxLoss}
                    disabled
                    className="bg-gray-50"
                  />
                </div>

                <div>
                  <Label htmlFor="percentCurrentToShort">% Current to Short</Label>
                  <Input
                    id="percentCurrentToShort"
                    type="number"
                    value={formData.percentCurrentToShort.toFixed(2)}
                    disabled
                    className="bg-gray-50"
                  />
                </div>

                <div>
                  <Label htmlFor="deltaShortLeg">Delta (Short Leg)</Label>
                  <Input
                    id="deltaShortLeg"
                    type="number"
                    step="0.01"
                    value={formData.deltaShortLeg || ''}
                    onChange={(e) => handleInputChange('deltaShortLeg', parseFloat(e.target.value) || 0)}
                    placeholder="0.25"
                  />
                </div>

                <div>
                  <Label htmlFor="theta">Theta</Label>
                  <Input
                    id="theta"
                    type="number"
                    step="0.01"
                    value={formData.theta || ''}
                    onChange={(e) => handleInputChange('theta', parseFloat(e.target.value) || 0)}
                    placeholder="-0.05"
                  />
                </div>

                <div>
                  <Label htmlFor="vega">Vega</Label>
                  <Input
                    id="vega"
                    type="number"
                    step="0.01"
                    value={formData.vega || ''}
                    onChange={(e) => handleInputChange('vega', parseFloat(e.target.value) || 0)}
                    placeholder="0.15"
                  />
                </div>

                <div>
                  <Label htmlFor="ivAtEntry">IV at Entry (%)</Label>
                  <Input
                    id="ivAtEntry"
                    type="number"
                    step="0.1"
                    value={formData.ivAtEntry || ''}
                    onChange={(e) => handleInputChange('ivAtEntry', parseFloat(e.target.value) || 0)}
                    placeholder="25.5"
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* IPS Factors Tab */}
        <TabsContent value="ips-factors" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* API Factors (Read-only) */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <CheckCircle className="h-5 w-5 text-green-600" />
                  API Factors (Auto-populated)
                  <Badge variant="outline" className="bg-green-50 text-green-700">
                    Alpha Vantage
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {getApiFactors().map((factor) => (
                    <div key={factor.id} className="flex items-center justify-between p-3 bg-green-50 rounded-lg border border-green-200">
                      <div>
                        <div className="font-medium text-sm">{factor.name}</div>
                        <div className="text-xs text-gray-600">{factor.category}</div>
                      </div>
                      <div className="text-sm text-green-700">
                        Will be populated automatically
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Manual Factors */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Users className="h-5 w-5 text-orange-600" />
                  Manual Input Required
                  <Badge variant="outline" className="bg-orange-50 text-orange-700">
                    {getAllAPIFactors().length} factors
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {getAllAPIFactors().map((factor) => (
                    <div key={factor.id} className="space-y-2">
                      <Label htmlFor={factor.id} className="text-sm font-medium">
                        {factor.name}
                        <span className="text-xs text-gray-500 ml-2">({factor.unit})</span>
                      </Label>
                      {renderFactorInput(factor)}
                      <div className="text-xs text-gray-600">{factor.category}</div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Review Tab */}
        <TabsContent value="review" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Target className="h-5 w-5" />
                Review & Submit
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center justify-between p-4 bg-blue-50 rounded-lg border border-blue-200">
                <div>
                  <div className="font-medium">Form Completion</div>
                  <div className="text-sm text-gray-600">
                    {isFormValid() ? 'All required fields completed' : 'Some fields still need to be filled'}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Progress value={completionScore} className="w-32" />
                  <span className="font-medium">{Math.round(completionScore)}%</span>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <h4 className="font-medium mb-3">Trade Summary</h4>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span>Symbol:</span>
                      <span className="font-medium">{formData.symbol || 'Not set'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Strategy:</span>
                      <span className="font-medium">{formData.contractType || 'Not set'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Max Gain:</span>
                      <span className="font-medium text-green-600">${formData.maxGain.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Max Loss:</span>
                      <span className="font-medium text-red-600">${formData.maxLoss.toFixed(2)}</span>
                    </div>
                  </div>
                </div>

                <div>
                  <h4 className="font-medium mb-3">IPS Compliance</h4>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span>Selected IPS:</span>
                      <span className="font-medium">{selectedIPS.name}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Manual Factors:</span>
                      <span className="font-medium">{getAllAPIFactors().length} required</span>
                    </div>
                    <div className="flex justify-between">
                      <span>API Factors:</span>
                      <span className="font-medium">{getApiFactors().length} auto-filled</span>
                    </div>
                  </div>
                </div>
              </div>

              <Separator />

              <div className="flex items-center justify-between">
                <Button variant="outline" onClick={onCancel}>
                  Cancel
                </Button>

                <div className="flex gap-3">
                  <Button
                    variant="outline"
                    onClick={handleCalculateScore}
                    disabled={!isFormValid() || isCalculating}
                    className="flex items-center gap-2"
                  >
                    {isCalculating ? (
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
                    ) : (
                      <Calculator className="h-4 w-4" />
                    )}
                    Calculate IPS Score
                  </Button>

                  <Button
                    onClick={() => onSubmit(formData)}
                    disabled={!isFormValid()}
                    className="flex items-center gap-2"
                  >
                    <Sparkles className="h-4 w-4" />
                    Add to Potentials
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}