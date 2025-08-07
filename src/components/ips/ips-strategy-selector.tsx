/**
 * IPS Strategy Selector Component
 * Copy this into: src/components/ips/ips-strategy-selector.tsx
 */

import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { ChevronRight, ArrowLeft, Target, TrendingUp, Shield, Zap } from 'lucide-react';

interface TradingStrategy {
  id: string;
  name: string;
  description: string;
  requiredFactorTypes: ('quantitative' | 'qualitative' | 'options')[];
  recommendedFactors: string[];
}

interface IPSStrategySelectorProps {
  availableStrategies: TradingStrategy[];
  selectedStrategies: string[];
  onStrategySelection: (selectedStrategies: string[]) => void;
  onNext: () => void;
  onBack?: () => void;
}

export function IPSStrategySelector({
  availableStrategies,
  selectedStrategies,
  onStrategySelection,
  onNext,
  onBack
}: IPSStrategySelectorProps) {
  const handleStrategyToggle = (strategyId: string) => {
    const newSelected = selectedStrategies.includes(strategyId)
      ? selectedStrategies.filter(id => id !== strategyId)
      : [...selectedStrategies, strategyId];
    
    onStrategySelection(newSelected);
  };

  const getStrategyIcon = (strategyId: string) => {
    switch (strategyId) {
      case 'buy-hold-stocks': return <TrendingUp className="h-5 w-5" />;
      case 'put-credit-spreads': return <Shield className="h-5 w-5" />;
      case 'call-credit-spreads': return <Target className="h-5 w-5" />;
      case 'long-calls': return <Zap className="h-5 w-5" />;
      case 'long-puts': return <Shield className="h-5 w-5" />;
      case 'iron-condors': return <Target className="h-5 w-5" />;
      case 'covered-calls': return <TrendingUp className="h-5 w-5" />;
      default: return <Target className="h-5 w-5" />;
    }
  };

  const getFactorTypeColor = (type: string) => {
    switch (type) {
      case 'quantitative': return 'bg-blue-100 text-blue-800';
      case 'qualitative': return 'bg-green-100 text-green-800';
      case 'options': return 'bg-purple-100 text-purple-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const isValid = selectedStrategies.length > 0;

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="text-center mb-8">
        <h2 className="text-2xl font-bold mb-2">Select Trading Strategies</h2>
        <p className="text-gray-600">
          Choose the strategies this IPS will be used for. This determines which factors are available.
        </p>
      </div>

      {/* Strategy Selection Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {availableStrategies.map((strategy) => {
          const isSelected = selectedStrategies.includes(strategy.id);
          
          return (
            <Card 
              key={strategy.id} 
              className={`cursor-pointer transition-all hover:shadow-md ${
                isSelected ? 'ring-2 ring-blue-500 bg-blue-50' : 'hover:bg-gray-50'
              }`}
              onClick={() => handleStrategyToggle(strategy.id)}
            >
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-lg ${isSelected ? 'bg-blue-500 text-white' : 'bg-gray-100'}`}>
                      {getStrategyIcon(strategy.id)}
                    </div>
                    <div>
                      <CardTitle className="text-lg">{strategy.name}</CardTitle>
                      <p className="text-sm text-gray-600 mt-1">
                        {strategy.description}
                      </p>
                    </div>
                  </div>
                  <Checkbox 
                    checked={isSelected}
                    onChange={() => {}} // Handled by card click
                  />
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="space-y-3">
                  {/* Required Factor Types */}
                  <div>
                    <p className="text-xs font-medium text-gray-500 mb-2">Required Factor Types:</p>
                    <div className="flex flex-wrap gap-1">
                      {strategy.requiredFactorTypes.map(type => (
                        <Badge 
                          key={type} 
                          variant="secondary" 
                          className={`text-xs ${getFactorTypeColor(type)}`}
                        >
                          {type.charAt(0).toUpperCase() + type.slice(1)}
                        </Badge>
                      ))}
                    </div>
                  </div>

                  {/* Recommended Factors Preview */}
                  <div>
                    <p className="text-xs font-medium text-gray-500 mb-2">
                      Key Factors ({strategy.recommendedFactors.length}):
                    </p>
                    <p className="text-xs text-gray-600 line-clamp-2">
                      {strategy.recommendedFactors.slice(0, 4).join(', ')}
                      {strategy.recommendedFactors.length > 4 && '...'}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Strategy Summary */}
      {selectedStrategies.length > 0 && (
        <Card className="bg-blue-50 border-blue-200">
          <CardHeader>
            <CardTitle className="text-lg text-blue-900">Strategy Summary</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <p className="text-sm text-blue-800">
                Selected {selectedStrategies.length} strateg{selectedStrategies.length === 1 ? 'y' : 'ies'}:
                <span className="font-medium ml-1">
                  {availableStrategies
                    .filter(s => selectedStrategies.includes(s.id))
                    .map(s => s.name)
                    .join(', ')}
                </span>
              </p>
              
              {/* Factor Types Summary */}
              <div>
                <p className="text-xs font-medium text-blue-700 mb-2">Available Factor Types:</p>
                <div className="flex flex-wrap gap-1">
                  {Array.from(new Set(
                    availableStrategies
                      .filter(s => selectedStrategies.includes(s.id))
                      .flatMap(s => s.requiredFactorTypes)
                  )).map(type => (
                    <Badge 
                      key={type} 
                      variant="secondary" 
                      className={`text-xs ${getFactorTypeColor(type)}`}
                    >
                      {type.charAt(0).toUpperCase() + type.slice(1)}
                    </Badge>
                  ))}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Navigation */}
      <div className="flex justify-between">
        <Button 
          variant="outline" 
          onClick={onBack}
          className="flex items-center gap-2"
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </Button>
        
        <Button 
          onClick={onNext}
          disabled={!isValid}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700"
        >
          Next: Select Factors
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}