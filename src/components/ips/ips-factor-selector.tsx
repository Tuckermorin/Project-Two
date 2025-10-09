"use client"

import React, { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Slider } from '@/components/ui/slider';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  ArrowLeft,
  ArrowRight,
  AlertCircle,
  Zap,
  Info,
  Search,
  X,
  Plus
} from 'lucide-react';

interface FactorDefinition {
  id: string;
  name: string;
  type: 'quantitative' | 'qualitative' | 'options';
  category: string;
  data_type: string;
  unit: string;
  source?: string;
  description?: string;
  collection_method?: 'api' | 'manual' | 'calculated';
}

interface FactorConfiguration {
  factorName: string;
  weight: number;
  targetOperator: 'gte' | 'lte' | 'eq' | 'range';
  targetValue: number | null;
  targetValueMax?: number | null;
}

interface IPSFactorSelectorProps {
  factorDefinitions: {
    availableFactors: FactorDefinition[];
    recommendedFactors: string[];
    requiredTypes: string[];
  };
  selectedFactors: Set<string>;
  onFactorSelection: (selectedFactors: Set<string>) => void;
  factorConfigurations: Record<string, any>;
  onFactorConfiguration: (configurations: Record<string, any>) => void;
  onNext: () => void;
  onBack: () => void;
}

export function IPSFactorSelector({
  factorDefinitions,
  selectedFactors,
  onFactorSelection,
  factorConfigurations,
  onFactorConfiguration,
  onNext,
  onBack
}: IPSFactorSelectorProps) {
  const [searchQuery, setSearchQuery] = useState('');

  // Group factors by category
  const factorsByCategory = useMemo(() => {
    if (!factorDefinitions?.availableFactors) return {};

    // Deduplicate by name
    const seenNames = new Set<string>();
    const uniqueFactors = factorDefinitions.availableFactors.filter(factor => {
      if (seenNames.has(factor.name)) return false;
      seenNames.add(factor.name);
      return true;
    });

    // Filter by search query
    const filteredFactors = searchQuery
      ? uniqueFactors.filter(factor =>
          factor.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          factor.description?.toLowerCase().includes(searchQuery.toLowerCase())
        )
      : uniqueFactors;

    // Group by category
    const grouped: Record<string, FactorDefinition[]> = {};
    filteredFactors.forEach(factor => {
      if (!grouped[factor.category]) {
        grouped[factor.category] = [];
      }
      grouped[factor.category].push(factor);
    });

    return grouped;
  }, [factorDefinitions, searchQuery]);

  const toggleFactor = (factorName: string) => {
    const newSelected = new Set(selectedFactors);
    if (newSelected.has(factorName)) {
      newSelected.delete(factorName);
      // Remove configuration when factor is deselected
      const newConfigs = { ...factorConfigurations };
      delete newConfigs[factorName];
      onFactorConfiguration(newConfigs);
    } else {
      newSelected.add(factorName);
      // Initialize default configuration
      const newConfigs = { ...factorConfigurations };
      newConfigs[factorName] = {
        weight: 1,
        targetOperator: 'gte',
        targetValue: null,
        targetValueMax: null,
      };
      onFactorConfiguration(newConfigs);
    }
    onFactorSelection(newSelected);
  };

  const updateFactorConfig = (factorName: string, updates: Partial<FactorConfiguration>) => {
    const newConfigs = { ...factorConfigurations };
    const existing = newConfigs[factorName] || {
      weight: 1,
      targetOperator: 'gte' as const,
      targetValue: null,
      targetValueMax: null,
    };
    newConfigs[factorName] = { ...existing, ...updates };
    onFactorConfiguration(newConfigs);
  };

  const getFactorDetails = (factorName: string): FactorDefinition | undefined => {
    return factorDefinitions.availableFactors.find(f => f.name === factorName);
  };

  const selectedFactorsList = useMemo(() => {
    return Array.from(selectedFactors)
      .map(name => getFactorDetails(name))
      .filter((f): f is FactorDefinition => f !== undefined);
  }, [selectedFactors, factorDefinitions]);

  const getCollectionMethodBadge = (factor: FactorDefinition) => {
    const method = factor.collection_method || (factor.source ? 'api' : 'manual');

    if (method === 'api') {
      return (
        <Badge variant="outline" className="text-xs bg-green-50 text-green-700 border-green-200 flex items-center gap-1">
          <Zap className="h-3 w-3" />
          API
        </Badge>
      );
    } else if (method === 'manual') {
      return (
        <Badge variant="outline" className="text-xs bg-orange-50 text-orange-700 border-orange-200 flex items-center gap-1">
          <AlertCircle className="h-3 w-3" />
          Manual
        </Badge>
      );
    } else if (method === 'calculated') {
      return (
        <Badge variant="outline" className="text-xs bg-blue-50 text-blue-700 border-blue-200 flex items-center gap-1">
          Calculated
        </Badge>
      );
    }
    return null;
  };

  const clearAllSelections = () => {
    onFactorSelection(new Set());
    setFactorConfigs(new Map());
  };

  if (!factorDefinitions?.availableFactors) {
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
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="space-y-2">
        <h2 className="text-2xl font-bold">Factor Selection & Configuration</h2>
        <p className="text-gray-600">
          Select factors and configure their weights and target values for your Investment Policy Statement.
        </p>
      </div>

      {/* Summary Bar */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <span className="text-sm font-medium text-blue-900">
              {selectedFactors.size} factors selected
            </span>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 text-xs text-blue-700">
              <div className="flex items-center gap-1">
                <Zap className="h-3 w-3" />
                <span>API = Auto-collected</span>
              </div>
              <div className="flex items-center gap-1">
                <AlertCircle className="h-3 w-3" />
                <span>Manual = User input</span>
              </div>
            </div>
            {selectedFactors.size > 0 && (
              <Button variant="outline" size="sm" onClick={clearAllSelections}>
                Clear All
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Two-Column Layout */}
      <div className="grid grid-cols-2 gap-6">
        {/* LEFT COLUMN: Available Factors */}
        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="text-lg">Available Factors</CardTitle>
            <div className="relative mt-2">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
              <Input
                type="text"
                placeholder="Search factors..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
          </CardHeader>
          <CardContent>
            <div className="overflow-y-auto h-[600px] space-y-6 pr-2">
              {Object.entries(factorsByCategory).map(([category, factors]) => (
                <div key={category}>
                  <h4 className="font-semibold text-foreground mb-3 text-sm uppercase tracking-wide sticky top-0 bg-background pb-2">
                    {category}
                  </h4>
                  <div className="space-y-2">
                    {factors.map(factor => (
                      <TooltipProvider key={factor.id}>
                        <div className="flex items-start gap-2 p-2 hover:bg-muted/40 rounded-md transition-colors">
                          <Checkbox
                            id={factor.id}
                            checked={selectedFactors.has(factor.name)}
                            onCheckedChange={() => toggleFactor(factor.name)}
                            className="mt-0.5"
                          />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <label
                                htmlFor={factor.id}
                                className="text-sm font-medium cursor-pointer"
                              >
                                {factor.name}
                              </label>
                              {factor.description && (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Info className="h-3.5 w-3.5 text-gray-400 hover:text-gray-600 cursor-help flex-shrink-0" />
                                  </TooltipTrigger>
                                  <TooltipContent side="right" className="max-w-xs">
                                    <p className="text-xs">{factor.description}</p>
                                  </TooltipContent>
                                </Tooltip>
                              )}
                              {getCollectionMethodBadge(factor)}
                            </div>
                            <div className="text-xs text-gray-500 mt-0.5">
                              {factor.data_type} • {factor.unit}
                            </div>
                          </div>
                        </div>
                      </TooltipProvider>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* RIGHT COLUMN: Selected Factors with Configuration */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Selected Factors ({selectedFactors.size})</CardTitle>
            <CardDescription>Configure weights and target values</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-y-auto h-[600px] space-y-3 pr-2">
              {selectedFactorsList.length === 0 ? (
                <div className="text-center py-20 text-gray-400">
                  <Plus className="w-12 h-12 mx-auto mb-3 opacity-50" />
                  <p className="text-sm">Select factors from the left to configure them</p>
                </div>
              ) : (
                selectedFactorsList.map(factor => {
                  const config = factorConfigurations[factor.name];
                  return (
                    <div key={factor.id} className="border border-[var(--glass-border)] rounded-lg p-4 bg-background shadow-sm">
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-foreground text-sm">{factor.name}</span>
                            {getCollectionMethodBadge(factor)}
                          </div>
                          <p className="text-xs text-muted-foreground mt-1">{factor.category}</p>
                        </div>
                        <button
                          onClick={() => toggleFactor(factor.name)}
                          className="text-red-600 hover:text-red-700 flex-shrink-0 ml-2"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>

                      {/* Configuration Inputs */}
                      <div className="space-y-3">
                        {/* Weight Slider */}
                        <div>
                          <div className="flex items-center justify-between mb-2">
                            <label className="text-xs font-medium text-gray-700">
                              Weight
                            </label>
                            <span className="text-xs font-semibold text-blue-600 bg-blue-50 px-2 py-0.5 rounded">
                              {config?.weight || 1}
                            </span>
                          </div>
                          <Slider
                            value={[config?.weight || 1]}
                            onValueChange={(values) => {
                              updateFactorConfig(factor.name, { weight: values[0] });
                            }}
                            min={1}
                            max={10}
                            step={1}
                            className="w-full"
                          />
                          <div className="flex justify-between mt-1">
                            <span className="text-xs text-gray-500">1 (Low)</span>
                            <span className="text-xs text-gray-500">10 (High)</span>
                          </div>
                        </div>

                        {/* Operator Select */}
                        <div>
                          <label className="block text-xs font-medium text-gray-700 mb-1">
                            Operator
                          </label>
                          <Select
                            value={config?.targetOperator || 'gte'}
                            onValueChange={(value) =>
                              updateFactorConfig(factor.name, {
                                targetOperator: value as any,
                                targetValueMax: value === 'range' ? config?.targetValueMax || null : null
                              })
                            }
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="gte">≥ Greater than or equal</SelectItem>
                              <SelectItem value="lte">≤ Less than or equal</SelectItem>
                              <SelectItem value="eq">= Equal to</SelectItem>
                              <SelectItem value="range">Range (between)</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>

                        {/* Target Value(s) */}
                        {config?.targetOperator === 'range' ? (
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <label className="block text-xs font-medium text-gray-700 mb-1">
                                Min Value
                              </label>
                              <Input
                                type="number"
                                step="any"
                                placeholder={
                                  factor.data_type === 'percentage'
                                    ? '0.04 (4%)'
                                    : factor.data_type === 'currency'
                                    ? '100.00'
                                    : 'Min...'
                                }
                                value={config?.targetValue ?? ''}
                                onChange={(e) =>
                                  updateFactorConfig(factor.name, {
                                    targetValue: e.target.value ? parseFloat(e.target.value) : null
                                  })
                                }
                                onWheel={(e) => e.currentTarget.blur()}
                              />
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-gray-700 mb-1">
                                Max Value
                              </label>
                              <Input
                                type="number"
                                step="any"
                                placeholder={
                                  factor.data_type === 'percentage'
                                    ? '0.08 (8%)'
                                    : factor.data_type === 'currency'
                                    ? '200.00'
                                    : 'Max...'
                                }
                                value={config?.targetValueMax ?? ''}
                                onChange={(e) =>
                                  updateFactorConfig(factor.name, {
                                    targetValueMax: e.target.value ? parseFloat(e.target.value) : null
                                  })
                                }
                                onWheel={(e) => e.currentTarget.blur()}
                              />
                            </div>
                          </div>
                        ) : (
                          <div>
                            <label className="block text-xs font-medium text-gray-700 mb-1">
                              Target Value
                            </label>
                            <Input
                              type="number"
                              step="any"
                              placeholder={
                                factor.data_type === 'percentage'
                                  ? 'e.g., 0.04 for 4%'
                                  : factor.data_type === 'currency'
                                  ? 'e.g., 100.00'
                                  : 'Enter target...'
                              }
                              value={config?.targetValue ?? ''}
                              onChange={(e) =>
                                updateFactorConfig(factor.name, {
                                  targetValue: e.target.value ? parseFloat(e.target.value) : null
                                })
                              }
                              onWheel={(e) => e.currentTarget.blur()}
                            />
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Navigation */}
      <div className="flex items-center justify-between pt-6 border-t">
        <Button variant="outline" onClick={onBack}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back
        </Button>
        <Button
          onClick={onNext}
          disabled={selectedFactors.size === 0}
          className="bg-blue-600 hover:bg-blue-700"
        >
          Continue
          <ArrowRight className="h-4 w-4 ml-2" />
        </Button>
      </div>
    </div>
  );
}
function setFactorConfigs(arg0: Map<any, any>) {
  throw new Error('Function not implemented.');
}

