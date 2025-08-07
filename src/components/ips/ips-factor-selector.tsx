/**
 * Enhanced IPS Factor Selector with Search and Strategy Filtering
 * Copy this into: src/components/ips/ips-factor-selector.tsx
 */

import React, { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ChevronRight, Calculator, Users, TrendingUp, ArrowLeft, Search, Star, Database } from 'lucide-react';

interface FactorDefinition {
  id: string;
  name: string;
  type: 'quantitative' | 'qualitative' | 'options';
  category: string;
  description?: string;
  source?: string;
  data_type?: string;
  unit?: string;
}

interface IPSFactorSelectorProps {
  factorDefinitions: {
    raw: FactorDefinition[];
    grouped: Record<string, Record<string, FactorDefinition[]>>;
    recommendedFactors?: string[];
  } | null;
  selectedFactors: Set<string>;
  onFactorSelection: (selectedFactors: Set<string>) => void;
  onNext: () => void;
  onBack?: () => void;
  selectedStrategies?: string[];
}

export function IPSFactorSelector({
  factorDefinitions,
  selectedFactors,
  onFactorSelection,
  onNext,
  onBack,
  selectedStrategies = []
}: IPSFactorSelectorProps) {
  const [activeTab, setActiveTab] = useState("quantitative");
  const [searchQuery, setSearchQuery] = useState("");
  const [showRecommendedOnly, setShowRecommendedOnly] = useState(false);

  // Filter factors based on search query
  const filteredFactors = useMemo(() => {
    if (!factorDefinitions) return null;
    
    let factors = factorDefinitions.raw;
    
    // Apply search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      factors = factors.filter(factor => 
        factor.name.toLowerCase().includes(query) ||
        factor.category.toLowerCase().includes(query) ||
        (factor.description && factor.description.toLowerCase().includes(query))
      );
    }
    
    // Apply recommended filter
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

  const getSourceBadge = (source?: string) => {
    if (source === 'alpha_vantage') {
      return <Badge variant="outline" className="text-xs bg-green-50 text-green-700">Alpha Vantage</Badge>;
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
          <Database className="h-12 w-12 mx-auto mb-3 opacity-50" />
          <p>No {title.toLowerCase()} factors available for selected strategies</p>
          {searchQuery && <p className="text-sm">Try adjusting your search terms</p>}
        </div>
      ) : (
        Object.entries(categories).map(([category, factors]) => (
          <Card key={category} className="border-l-4 border-l-blue-500">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-gray-700 flex items-center justify-between">
                {category}
                <Badge variant="outline" className="text-xs">
                  {factors.filter(f => selectedFactors.has(f.name)).length}/{factors.length} selected
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="grid grid-cols-1 gap-3">
                {factors.map((factor) => {
                  const isRecommended = isFactorRecommended(factor.name);
                  const isSelected = selectedFactors.has(factor.name);
                  
                  return (
                    <div 
                      key={factor.id} 
                      className={`flex items-center justify-between p-3 rounded-lg border transition-colors ${
                        isSelected ? 'bg-blue-50 border-blue-200' : 'hover:bg-gray-50'
                      } ${isRecommended ? 'ring-1 ring-yellow-300' : ''}`}
                    >
                      <div className="flex items-center space-x-3 flex-1">
                        <Checkbox
                          id={factor.id}
                          checked={isSelected}
                          onCheckedChange={() => handleFactorToggle(factor.name)}
                        />
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <label 
                              htmlFor={factor.id}
                              className="text-sm font-medium cursor-pointer"
                            >
                              {factor.name}
                            </label>
                            {isRecommended && (
                              <Star className="h-3 w-3 text-yellow-500 fill-current" />
                            )}
                            {getSourceBadge(factor.source)}
                          </div>
                          {factor.description && (
                            <p className="text-xs text-gray-500 mt-1">{factor.description}</p>
                          )}
                          <div className="flex items-center gap-2 mt-1">
                            <Badge variant="outline" className="text-xs">
                              {factor.data_type || 'numeric'}
                            </Badge>
                            {factor.unit && (
                              <span className="text-xs text-gray-400">Unit: {factor.unit}</span>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
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
                    onCheckedChange={setShowRecommendedOnly}
                  />
                  <label htmlFor="show-recommended" className="text-sm font-medium">
                    Recommended only
                  </label>
                </div>
                
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={selectAllRecommended}
                  className="flex items-center gap-1"
                >
                  <Star className="h-3 w-3" />
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
        <div className="bg-gray-50 rounded-lg p-4">
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium">
              Total Selected: {selectedFactors.size} factors
            </span>
            <div className="flex gap-4">
              {Object.keys(filteredFactors.grouped).map(type => (
                <span key={type} className="text-gray-600">
                  {type.charAt(0).toUpperCase() + type.slice(1)}: {getSelectedCountByType(type)}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Factor Selection Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          {Object.keys(filteredFactors.grouped).map(type => {
            const Icon = getTabIcon(type);
            const count = getSelectedCountByType(type);
            const total = Object.values(filteredFactors.grouped[type] || {}).flat().length;
            
            return (
              <TabsTrigger 
                key={type} 
                value={type} 
                className="flex items-center gap-2"
              >
                {Icon}
                <span className="hidden sm:inline">
                  {type.charAt(0).toUpperCase() + type.slice(1)}
                </span>
                <Badge variant="secondary" className="ml-1">
                  {count}/{total}
                </Badge>
              </TabsTrigger>
            );
          })}
        </TabsList>

        {Object.entries(filteredFactors.grouped).map(([type, categories]) => (
          <TabsContent key={type} value={type} className="mt-6">
            {renderFactorSection(
              `${type.charAt(0).toUpperCase() + type.slice(1)} Factors`,
              categories as Record<string, FactorDefinition[]>,
              getTabIcon(type)
            )}
          </TabsContent>
        ))}
      </Tabs>

      {/* Navigation */}
      <div className="flex justify-between pt-6">
        <Button 
          variant="outline" 
          onClick={onBack}
          className="flex items-center gap-2"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Strategies
        </Button>
        
        <Button 
          onClick={onNext}
          disabled={selectedFactors.size === 0}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700"
        >
          Configure Factors ({selectedFactors.size})
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}