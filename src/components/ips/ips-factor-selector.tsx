/**
 * IPS Factor Selector Component
 * Copy this into: src/components/ips/ips-factor-selector.tsx
 */

import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ChevronRight, Calculator, Users, TrendingUp, ArrowLeft } from 'lucide-react';

interface FactorDefinition {
  id: string;
  name: string;
  type: 'quantitative' | 'qualitative' | 'options';
  category: string;
  description?: string;
}

interface IPSFactorSelectorProps {
  factorDefinitions: {
    raw: FactorDefinition[];
    grouped: Record<string, Record<string, FactorDefinition[]>>;
  } | null;
  selectedFactors: Set<string>;
  onFactorSelection: (selectedFactors: Set<string>) => void;
  onNext: () => void;
  onBack?: () => void;
}

export function IPSFactorSelector({
  factorDefinitions,
  selectedFactors,
  onFactorSelection,
  onNext,
  onBack
}: IPSFactorSelectorProps) {
  const [activeTab, setActiveTab] = useState("quantitative");

  const handleFactorToggle = (factorName: string) => {
    const newSelected = new Set(selectedFactors);
    if (newSelected.has(factorName)) {
      newSelected.delete(factorName);
    } else {
      newSelected.add(factorName);
    }
    onFactorSelection(newSelected);
  };

  const getSelectedCountByType = (type: string) => {
    if (!factorDefinitions?.grouped[type]) return 0;
    
    return Object.values(factorDefinitions.grouped[type])
      .flat()
      .filter(factor => selectedFactors.has(factor.name))
      .length;
  };

  const renderFactorSection = (title: string, categories: Record<string, FactorDefinition[]>, icon: React.ReactNode) => (
    <div className="space-y-4">
      <div className="flex items-center gap-2 mb-4">
        {icon}
        <h3 className="text-lg font-semibold">{title}</h3>
        <Badge variant="secondary">
          {Object.values(categories).flat().filter(f => selectedFactors.has(f.name)).length} selected
        </Badge>
      </div>
      
      {Object.entries(categories).map(([category, factors]) => (
        <Card key={category} className="border-l-4 border-l-blue-500">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-gray-700">
              {category}
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {factors.map((factor) => (
                <div key={factor.id} className="flex items-center space-x-3">
                  <Checkbox
                    id={factor.id}
                    checked={selectedFactors.has(factor.name)}
                    onCheckedChange={() => handleFactorToggle(factor.name)}
                    className="data-[state=checked]:bg-blue-600"
                  />
                  <label
                    htmlFor={factor.id}
                    className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                  >
                    {factor.name}
                  </label>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );

  if (!factorDefinitions) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading factor definitions...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">
          Select IPS Monitoring Factors
        </h1>
        <p className="text-gray-600">
          Choose the factors you want to monitor and score for your investment decisions
        </p>
      </div>

      {/* Selected Factors Summary */}
      {selectedFactors.size > 0 && (
        <Card className="mb-6 bg-blue-50 border-blue-200">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-blue-900">
                  {selectedFactors.size} Factors Selected
                </h3>
                <p className="text-sm text-blue-700">
                  Ready to configure weights and target values
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="quantitative" className="flex items-center gap-2">
            <Calculator className="h-4 w-4" />
            Quantitative ({getSelectedCountByType('quantitative')})
          </TabsTrigger>
          <TabsTrigger value="qualitative" className="flex items-center gap-2">
            <Users className="h-4 w-4" />
            Qualitative ({getSelectedCountByType('qualitative')})
          </TabsTrigger>
          <TabsTrigger value="options" className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4" />
            Options ({getSelectedCountByType('options')})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="quantitative" className="mt-6">
          {factorDefinitions.grouped.quantitative && renderFactorSection(
            "Quantitative Factors",
            factorDefinitions.grouped.quantitative,
            <Calculator className="h-5 w-5 text-blue-600" />
          )}
        </TabsContent>

        <TabsContent value="qualitative" className="mt-6">
          {factorDefinitions.grouped.qualitative && renderFactorSection(
            "Qualitative Factors",
            factorDefinitions.grouped.qualitative,
            <Users className="h-5 w-5 text-green-600" />
          )}
        </TabsContent>

        <TabsContent value="options" className="mt-6">
          {factorDefinitions.grouped.options && renderFactorSection(
            "Options Factors",
            factorDefinitions.grouped.options,
            <TrendingUp className="h-5 w-5 text-purple-600" />
          )}
        </TabsContent>
      </Tabs>

      {/* Debug Info */}
      {selectedFactors.size > 0 && (
        <Card className="mt-8 bg-gray-50">
          <CardHeader>
            <CardTitle className="text-sm">Selected Factors Preview</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {Array.from(selectedFactors).map(factorName => {
                const factor = factorDefinitions.raw.find(f => f.name === factorName);
                return (
                  <div key={factorName} className="flex justify-between text-sm">
                    <span>{factorName}</span>
                    <div className="flex gap-2">
                      <Badge variant="outline" className="text-xs">
                        {factor?.type}
                      </Badge>
                      <Badge variant="secondary" className="text-xs">
                        {factor?.category}
                      </Badge>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Action Buttons */}
      <div className="flex items-center justify-between mt-8 pt-6 border-t">
        <Button variant="outline" onClick={onBack}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Overview
        </Button>
        
        <Button 
          className="bg-blue-600 hover:bg-blue-700"
          disabled={selectedFactors.size === 0}
          onClick={onNext}
        >
          Configure Factors
          <ChevronRight className="ml-2 h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}