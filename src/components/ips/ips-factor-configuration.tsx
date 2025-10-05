/**
 * IPS Factor Configuration Component
 * Copy this into: src/components/ips/ips-factor-configuration.tsx
 */

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Switch } from '@/components/ui/switch';
import { Calculator, Users, TrendingUp, ChevronRight, Target, Weight, ArrowLeft } from 'lucide-react';
import { ALL_FACTORS } from '@/lib/services/ips-data-service';

interface FactorConfiguration {
  weight: number;
  enabled: boolean;
  targetType: 'rating' | 'numeric';
  targetValue: string | number;
  targetOperator: 'gte' | 'lte' | 'eq' | 'range';
  targetValueMax?: string;
  preferenceDirection: 'higher' | 'lower' | 'target';
  factorId: string;
  type: 'quantitative' | 'qualitative' | 'options';
  category: string;
}

interface IPSFactorConfigurationProps {
  selectedFactors: Set<string>;
  factorConfigurations: Record<string, FactorConfiguration>;
  onConfigurationChange: (configurations: Record<string, FactorConfiguration>) => void;
  onNext: () => void;
  onBack?: () => void;
  factorDefinitions?: any; // Add factor definitions prop
}

export function IPSFactorConfiguration({
  selectedFactors,
  factorConfigurations,
  onConfigurationChange,
  onNext,
  onBack,
  factorDefinitions
}: IPSFactorConfigurationProps) {
  const [configurations, setConfigurations] = useState<Record<string, FactorConfiguration>>({});
  const [activeTab, setActiveTab] = useState("quantitative");

  // Helper function to get factor info from definitions
const getFactorInfo = (factorName: string) => {
  // Look for the factor in ALL_FACTORS by name
  const factor = ALL_FACTORS.find((f: any) => f.name === factorName);
  
  if (factor) {
    return {
      type: factor.type as 'quantitative' | 'qualitative' | 'options',
      category: factor.category,
      id: factor.id  // This will be the correct ID like 'opt-delta', 'av-pe-ratio', etc.
    };
  }
  
  // Fallback if not found (shouldn't happen if factors are selected from the list)
  console.warn(`Factor "${factorName}" not found in ALL_FACTORS`);
  return {
    type: 'quantitative' as const,
    category: 'Unknown',
    id: `unknown-${factorName.toLowerCase().replace(/\s+/g, '-')}`
  };
};

  // Initialize configurations if not provided
  useEffect(() => {
    if (Object.keys(factorConfigurations).length > 0) {
      setConfigurations(factorConfigurations);
    } else {
      // Create default configurations for selected factors
      const defaultConfigs: Record<string, FactorConfiguration> = {};
      Array.from(selectedFactors).forEach(factorName => {
        const factorInfo = getFactorInfo(factorName);
        
        defaultConfigs[factorName] = {
          weight: 5,
          enabled: true,
          targetType: factorInfo.type === 'qualitative' ? 'rating' : 'numeric',
          targetValue: factorInfo.type === 'qualitative' ? 4 : '',
          targetOperator: 'gte',
          targetValueMax: '',
          preferenceDirection: 'higher',
          factorId: factorInfo.id,
          type: factorInfo.type,
          category: factorInfo.category
        };
      });
      setConfigurations(defaultConfigs);
    }
  }, [selectedFactors, factorConfigurations, factorDefinitions]);

  const updateConfiguration = (factorName: string, field: keyof FactorConfiguration, value: any) => {
    const newConfigurations = {
      ...configurations,
      [factorName]: {
        ...configurations[factorName],
        [field]: value
      }
    };
    setConfigurations(newConfigurations);
    onConfigurationChange(newConfigurations);
  };

  const getFactorsByType = (type: string) => {
    return Array.from(selectedFactors).filter(factorName => {
      const config = configurations[factorName];
      return config?.type === type;
    });
  };

  const getTotalWeight = () => {
    return Object.values(configurations)
      .filter(config => config.enabled)
      .reduce((sum, config) => sum + config.weight, 0);
  };

  const getAverageWeight = () => {
    const enabledConfigs = Object.values(configurations).filter(config => config.enabled);
    return enabledConfigs.length > 0 ? getTotalWeight() / enabledConfigs.length : 0;
  };

  // Helper to get factor unit and data type hints
  const getFactorHint = (factorName: string): string => {
    const factor = ALL_FACTORS.find((f: any) => f.name === factorName);
    if (!factor) return '';

    const hints: Record<string, string> = {
      // Percentages (enter as decimal, e.g., 4% = 0.04 or 4 for whole number)
      'Inflation Rate': 'Enter as percentage (e.g., 4 for 4%)',
      'Dividend Yield': 'Enter as percentage (e.g., 2.5 for 2.5%)',
      'IV Percentile': 'Enter as percentile (0-100)',
      'IV Rank': 'Enter as percentile (0-100)',

      // Decimals
      'Delta (Short Leg)': 'Enter as decimal (e.g., 0.15 for 15 delta)',
      'Delta': 'Enter as decimal (e.g., 0.15 for 15 delta)',
      'Theta': 'Enter as decimal (e.g., -0.14)',
      'Vega': 'Enter as decimal (e.g., 0.08)',
      'Gamma': 'Enter as decimal',
      'Implied Volatility': 'Enter as decimal (e.g., 0.51 for 51%)',
      'Bid-Ask Spread': 'Enter as dollars (e.g., 0.03)',

      // Ratios
      'Put/Call Ratio': 'Enter as ratio (e.g., 0.85)',
      'Put/Call OI Ratio': 'Enter as ratio (e.g., 0.90)',

      // Sentiment scores
      'News Sentiment Score': 'Enter as decimal 0-1 (e.g., 0.5 for neutral)',
      'Social Media Sentiment': 'Enter as decimal -1 to 1 (0 = neutral)',

      // Whole numbers
      'News Volume': 'Enter as count (whole number)',
      'Open Interest': 'Enter as contracts (whole number)',
      'Volume': 'Enter as shares/contracts (whole number)',
      'Market Cap Category': 'Enter in dollars (e.g., 2000000000)',

      // Momentum/Moving Averages
      'Momentum': 'Enter as percentage (e.g., 20 for 20%)',
      '50 Day Moving Average': 'Enter as ratio (e.g., 1.05 for 5% above)',
      '200 Day Moving Average': 'Enter as ratio (e.g., 1.10 for 10% above)',
      '52W Range Position': 'Enter as decimal 0-1 (e.g., 0.8 for 80%)',
      'Distance from 52W High': 'Enter as percentage (e.g., 15 for 15% below)',
    };

    return hints[factorName] || (factor.unit ? `Unit: ${factor.unit}` : '');
  };

  const renderFactorConfiguration = (factorName: string) => {
    const config = configurations[factorName];
    if (!config) return null;
    
    return (
      <Card key={factorName} className="border-l-4 border-l-blue-500">
        <CardHeader className="pb-4">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base font-medium">{factorName}</CardTitle>
              <p className="text-sm text-gray-500">{config.category}</p>
            </div>
            <div className="flex items-center gap-3">
              <Badge variant={config.enabled ? "default" : "secondary"}>
                {config.enabled ? "Active" : "Disabled"}
              </Badge>
              <Switch
                checked={config.enabled}
                onCheckedChange={(checked) => updateConfiguration(factorName, 'enabled', checked)}
              />
            </div>
          </div>
        </CardHeader>
        
        <CardContent className="space-y-4">
          {config.enabled && (
            <>
              {/* Weight Configuration */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-medium flex items-center gap-2">
                    <Weight className="h-4 w-4" />
                    Importance Weight
                  </Label>
                  <Badge variant="outline" className="text-sm font-mono">
                    {config.weight}/10
                  </Badge>
                </div>
                <Slider
                  value={[config.weight]}
                  onValueChange={([value]) => updateConfiguration(factorName, 'weight', value)}
                  min={1}
                  max={10}
                  step={1}
                  className="w-full"
                />
                <div className="flex justify-between text-xs text-gray-500">
                  <span>Low Priority</span>
                  <span>Critical</span>
                </div>
              </div>

              {/* Target Configuration */}
              <div className="space-y-3">
                <Label className="text-sm font-medium flex items-center gap-2">
                  <Target className="h-4 w-4" />
                  Target Criteria
                </Label>
                
                {config.type === 'qualitative' ? (
                  // Qualitative factors use rating scale
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-xs">Minimum Rating</Label>
                      <Select 
                        value={config.targetValue.toString()} 
                        onValueChange={(value) => updateConfiguration(factorName, 'targetValue', parseInt(value))}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select rating" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="1">1 - Poor</SelectItem>
                          <SelectItem value="2">2 - Below Average</SelectItem>
                          <SelectItem value="3">3 - Average</SelectItem>
                          <SelectItem value="4">4 - Good</SelectItem>
                          <SelectItem value="5">5 - Excellent</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-xs">Preference</Label>
                      <Select 
                        value={config.preferenceDirection} 
                        onValueChange={(value) => updateConfiguration(factorName, 'preferenceDirection', value)}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="higher">Higher is Better</SelectItem>
                          <SelectItem value="target">Target Value</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                ) : (
                  // Quantitative factors use numeric inputs
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <Label className="text-xs">Operator</Label>
                      <Select 
                        value={config.targetOperator} 
                        onValueChange={(value) => updateConfiguration(factorName, 'targetOperator', value)}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="gte">Greater Than ≥</SelectItem>
                          <SelectItem value="lte">Less Than ≤</SelectItem>
                          <SelectItem value="eq">Equals =</SelectItem>
                          <SelectItem value="range">Range</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-xs">
                        {config.targetOperator === 'range' ? 'Min Value' : 'Target Value'}
                      </Label>
                      <Input
                        type="number"
                        value={config.targetValue}
                        onChange={(e) => updateConfiguration(factorName, 'targetValue', e.target.value)}
                        placeholder="Enter value"
                        className="text-sm"
                        step="any"
                      />
                      {getFactorHint(factorName) && (
                        <p className="text-xs text-gray-500 mt-1">{getFactorHint(factorName)}</p>
                      )}
                    </div>
                    {config.targetOperator === 'range' && (
                      <div>
                        <Label className="text-xs">Max Value</Label>
                        <Input
                          type="number"
                          value={config.targetValueMax || ''}
                          onChange={(e) => updateConfiguration(factorName, 'targetValueMax', e.target.value)}
                          placeholder="Max value"
                          className="text-sm"
                        />
                      </div>
                    )}
                  </div>
                )}
              </div>
            </>
          )}
        </CardContent>
      </Card>
    );
  };

  const renderTabContent = (type: string, icon: React.ReactNode, title: string) => {
    const factors = getFactorsByType(type);
    const enabledFactors = factors.filter(f => configurations[f]?.enabled);
    
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {icon}
            <h3 className="text-lg font-semibold">{title}</h3>
            <Badge variant="secondary">
              {enabledFactors.length} of {factors.length} active
            </Badge>
          </div>
          <div className="text-sm text-gray-600">
            Total Weight: {enabledFactors.reduce((sum, f) => sum + (configurations[f]?.weight || 0), 0)}
          </div>
        </div>
        
        <div className="space-y-4">
          {factors.map(renderFactorConfiguration)}
        </div>
      </div>
    );
  };

  return (
    <div className="max-w-6xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">
          Configure Factor Weights & Targets
        </h1>
        <p className="text-gray-600">
          Set importance weights (1-10) and target criteria for each selected factor
        </p>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold">{selectedFactors.size}</div>
            <p className="text-xs text-muted-foreground">Total Factors</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold text-green-600">
              {Object.values(configurations).filter(c => c.enabled).length}
            </div>
            <p className="text-xs text-muted-foreground">Active Factors</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold text-blue-600">
              {getTotalWeight()}
            </div>
            <p className="text-xs text-muted-foreground">Total Weight</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold text-purple-600">
              {getAverageWeight().toFixed(1)}
            </div>
            <p className="text-xs text-muted-foreground">Average Weight</p>
          </CardContent>
        </Card>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="quantitative" className="flex items-center gap-2">
            <Calculator className="h-4 w-4" />
            Quantitative ({getFactorsByType('quantitative').filter(f => configurations[f]?.enabled).length})
          </TabsTrigger>
          <TabsTrigger value="qualitative" className="flex items-center gap-2">
            <Users className="h-4 w-4" />
            Qualitative ({getFactorsByType('qualitative').filter(f => configurations[f]?.enabled).length})
          </TabsTrigger>
          <TabsTrigger value="options" className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4" />
            Options ({getFactorsByType('options').filter(f => configurations[f]?.enabled).length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="quantitative" className="mt-6">
          {renderTabContent('quantitative', <Calculator className="h-5 w-5 text-blue-600" />, "Quantitative Factors")}
        </TabsContent>

        <TabsContent value="qualitative" className="mt-6">
          {renderTabContent('qualitative', <Users className="h-5 w-5 text-green-600" />, "Qualitative Factors")}
        </TabsContent>

        <TabsContent value="options" className="mt-6">
          {renderTabContent('options', <TrendingUp className="h-5 w-5 text-purple-600" />, "Options Factors")}
        </TabsContent>
      </Tabs>

      {/* Action Buttons */}
      <div className="flex items-center justify-between mt-8 pt-6 border-t">
        <Button variant="outline" onClick={onBack}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Factor Selection
        </Button>
        
        <div className="flex gap-3">
          <Button variant="outline">
            Save as Draft
          </Button>
          <Button 
            className="bg-blue-600 hover:bg-blue-700"
            disabled={Object.values(configurations).filter(c => c.enabled).length === 0}
            onClick={onNext}
          >
            Generate IPS Summary
            <ChevronRight className="ml-2 h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}