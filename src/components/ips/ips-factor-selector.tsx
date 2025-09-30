/**
 * Fixed IPS Factor Selector Component with API Support Indicators
 * Copy this into: src/components/ips/ips-factor-selector.tsx
 */

import React, { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  ArrowLeft, 
  ArrowRight, 
  Search, 
  Calculator, 
  Users, 
  TrendingUp, 
  Database,
  Sparkles,
  CheckCircle,
  AlertCircle
} from 'lucide-react';

interface FactorDefinition {
  id: string;
  name: string;
  type: 'quantitative' | 'qualitative' | 'options';
  category: string;
  data_type: string;
  unit: string;
  source?: string;
}

interface FilteredFactors {
  raw: FactorDefinition[];
  grouped: Record<string, Record<string, FactorDefinition[]>>;
  recommendedFactors?: string[];
}

interface IPSFactorSelectorProps {
  factorDefinitions: {
    availableFactors: FactorDefinition[];
    recommendedFactors: string[];
    requiredTypes: string[];
  };
  selectedFactors: Set<string>;
  onFactorSelection: (selectedFactors: Set<string>) => void;
  onNext: () => void;
  onBack: () => void;
}

export function IPSFactorSelector({
  factorDefinitions,
  selectedFactors,
  onFactorSelection,
  onNext,
  onBack
}: IPSFactorSelectorProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [showRecommendedOnly, setShowRecommendedOnly] = useState(false);
  const [selectedTab, setSelectedTab] = useState('quantitative');

  const filteredFactors: FilteredFactors | null = useMemo(() => {
    if (!factorDefinitions?.availableFactors) return null;

    let factors = factorDefinitions.availableFactors;

    // Filter by search query
    if (searchQuery) {
      factors = factors.filter(factor =>
        factor.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        factor.category.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    // Filter by recommended only if enabled
    if (showRecommendedOnly && factorDefinitions.recommendedFactors) {
      factors = factors.filter(factor => 
        factorDefinitions.recommendedFactors!.includes(factor.name)
      );
    }
    
    // Group filtered factors
    const grouped = factors.reduce((acc: any, factor) => {
      if (!acc[factor.type]) acc[factor.type] = {};
      if (!acc[factor.type][factor.category]) acc[factor.type][factor.category] = [];
      acc[factor.type][factor.category].push(factor);
      return acc;
    }, {});

    return {
      raw: factors,
      grouped,
      recommendedFactors: factorDefinitions.recommendedFactors
    };
  }, [factorDefinitions, searchQuery, showRecommendedOnly]);

  const handleFactorToggle = (factorName: string) => {
    const newSelected = new Set(selectedFactors);
    if (newSelected.has(factorName)) {
      newSelected.delete(factorName);
    } else {
      newSelected.add(factorName);
    }
    onFactorSelection(newSelected);
  };

  const selectAllRecommended = () => {
    if (!filteredFactors?.recommendedFactors) return;
    
    const newSelected = new Set(selectedFactors);
    filteredFactors.recommendedFactors.forEach(factorName => {
      // Only add if the factor exists in our filtered results
      const factorExists = filteredFactors.raw.some(f => f.name === factorName);
      if (factorExists) {
        newSelected.add(factorName);
      }
    });
    onFactorSelection(newSelected);
  };

  const clearAllSelections = () => {
    onFactorSelection(new Set());
  };

  const getSelectedCountByType = (type: string) => {
    if (!filteredFactors?.grouped[type]) return 0;
    
    return Object.values(filteredFactors.grouped[type])
      .flat()
      .filter(factor => selectedFactors.has(factor.name))
      .length;
  };

  const getTabIcon = (type: string) => {
    switch (type) {
      case 'quantitative': return <Calculator className="h-4 w-4" />;
      case 'qualitative': return <Users className="h-4 w-4" />;
      case 'options': return <TrendingUp className="h-4 w-4" />;
      default: return <Database className="h-4 w-4" />;
    }
  };

  // Enhanced source badge - simplified without API indicators
  const getSourceBadge = (factor: FactorDefinition) => {
    if (factor.source === 'alpha_vantage' || factor.source === 'alpha_vantage_options') {
      const label = factor.source === 'alpha_vantage_options' ? 'Alpha Vantage Options' : 'Alpha Vantage';
      return <Badge variant="outline" className="text-xs bg-green-50 text-green-700">{label}</Badge>;
    }
    return null;
  };

  const isFactorRecommended = (factorName: string) => {
    return filteredFactors?.recommendedFactors?.includes(factorName) || false;
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
      
      {Object.keys(categories).length === 0 ? (
        <div className="text-center py-8 text-gray-500">
          <Database className="h-12 w-12 mx-auto mb-3 text-gray-300" />
          <p>No factors available for this strategy combination</p>
        </div>
      ) : (
        Object.entries(categories).map(([categoryName, categoryFactors]) => (
          <Card key={categoryName} className="border border-gray-200">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-gray-700">
                {categoryName}
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="grid gap-3">
                {categoryFactors.map((factor) => (
                  <div
                    key={factor.id}
                    className={`flex items-start gap-3 p-3 rounded-lg border transition-colors ${
                      selectedFactors.has(factor.name)
                        ? 'bg-blue-50 border-blue-200'
                        : 'bg-white border-gray-200 hover:bg-gray-50'
                    }`}
                  >
                    <Checkbox
                      checked={selectedFactors.has(factor.name)}
                      onCheckedChange={() => handleFactorToggle(factor.name)}
                      className="mt-0.5"
                    />
                    
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h4 className="text-sm font-medium text-gray-900">
                          {factor.name}
                        </h4>
                        {isFactorRecommended(factor.name) && (
                          <Badge variant="outline" className="text-xs bg-amber-50 text-amber-700 flex items-center gap-1">
                            <Sparkles className="h-3 w-3" />
                            Recommended
                          </Badge>
                        )}
                      </div>
                      
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-xs text-gray-500">
                          {factor.data_type} • {factor.unit}
                        </span>
                        {getSourceBadge(factor)}
                      </div>
                      
                      {/* Manual input indicator for non-Alpha Vantage factors */}
                      {!factor.source && (
                        <div className="flex items-center gap-1 text-xs">
                          <AlertCircle className="h-3 w-3 text-orange-600" />
                          <span className="text-orange-600">Requires manual input</span>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        ))
      )}
    </div>
  );

  if (!filteredFactors) {
    return (
      <div className="max-w-4xl mx-auto">
        <div className="text-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading factor definitions...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Header with Search and Controls */}
      <div className="space-y-4">
        <div className="text-center">
          <h2 className="text-2xl font-bold mb-2">Select Factors</h2>
          <p className="text-gray-600">
            Choose the factors that will determine your investment decisions
          </p>
        </div>

        {/* Search and Filter Controls */}
        <div className="flex flex-col sm:flex-row gap-4 items-center">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              placeholder="Search factors..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
          
          <div className="flex items-center gap-4">
            {filteredFactors.recommendedFactors && filteredFactors.recommendedFactors.length > 0 && (
              <>
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="show-recommended"
                    checked={showRecommendedOnly}
                    onCheckedChange={checked => setShowRecommendedOnly(checked === true)}
                  />
                  <label htmlFor="show-recommended" className="text-sm text-gray-700">
                    Show recommended only
                  </label>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={selectAllRecommended}
                  className="flex items-center gap-2"
                >
                  <Sparkles className="h-4 w-4" />
                  Select Recommended
                </Button>
              </>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={clearAllSelections}
            >
              Clear All
            </Button>
          </div>
        </div>

        {/* Selection Summary */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <span className="text-sm font-medium text-blue-900">
                {selectedFactors.size} factors selected
              </span>
              {filteredFactors.recommendedFactors && (
                <span className="text-xs text-blue-700">
                  {filteredFactors.recommendedFactors.filter(name => selectedFactors.has(name)).length} of {filteredFactors.recommendedFactors.length} recommended
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 text-xs text-blue-700">
              <div className="flex items-center gap-1">
                <CheckCircle className="h-3 w-3" />
                <span>Alpha Vantage = API</span>
              </div>
              <div className="flex items-center gap-1">
                <AlertCircle className="h-3 w-3" />
                <span>No badge = Manual</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Factor Tabs */}
      <Tabs value={selectedTab} onValueChange={setSelectedTab}>
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
          {renderFactorSection(
            'Quantitative Factors', 
            filteredFactors.grouped.quantitative || {}, 
            <Calculator className="h-5 w-5 text-blue-600" />
          )}
        </TabsContent>

        <TabsContent value="qualitative" className="mt-6">
          {renderFactorSection(
            'Qualitative Factors', 
            filteredFactors.grouped.qualitative || {}, 
            <Users className="h-5 w-5 text-green-600" />
          )}
        </TabsContent>

        <TabsContent value="options" className="mt-6">
          {renderFactorSection(
            'Options Factors', 
            filteredFactors.grouped.options || {}, 
            <TrendingUp className="h-5 w-5 text-purple-600" />
          )}
        </TabsContent>
      </Tabs>

      {/* Action Buttons */}
      <div className="flex items-center justify-between pt-6 border-t">
        <Button variant="outline" onClick={onBack}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Strategy Selection
        </Button>
        
        <div className="flex gap-3">
          <Button 
            variant="outline"
            disabled={selectedFactors.size === 0}
          >
            Save as Draft
          </Button>
          <Button 
            className="bg-blue-600 hover:bg-blue-700"
            disabled={selectedFactors.size === 0}
            onClick={onNext}
          >
            Configure Factors
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}