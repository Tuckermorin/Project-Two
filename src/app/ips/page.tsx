/**
 * Enhanced IPS Page with Strategy Selection - Complete Version
 * Copy this into: src/app/ips/page.tsx
 */

"use client"

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Progress } from '@/components/ui/progress';
import { 
  FileText, 
  Settings, 
  CheckCircle, 
  ArrowLeft, 
  ArrowRight,
  Target,
  BarChart3,
  Download,
  Save,
  PlusCircle,
  Eye,
  EyeOff,
  Edit,
  Copy,
  Archive,
  MoreVertical,
  TrendingUp,
  Shield,
  Layers,
  Trash2
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

// Import components
import { IPSStrategySelector } from '@/components/ips/ips-strategy-selector';
import { IPSFactorSelector } from '@/components/ips/ips-factor-selector';
import { IPSFactorConfiguration } from '@/components/ips/ips-factor-configuration'; 
import { IPSSummary } from '@/components/ips/ips-summary';
import { TradeScoreDisplay } from '@/components/ips/trade-score-display';

// Import services
import { ipsDataService, type IPSConfiguration, type TradingStrategy } from '@/lib/services/ips-data-service';
import { TradeScorer } from '@/lib/trade-scorer';

// Types
interface IPSFlowState {
  step: 'list' | 'strategies' | 'selection' | 'configuration' | 'summary' | 'scoring';
  selectedStrategies: string[];
  selectedFactors: Set<string>;
  factorConfigurations: Record<string, any>;
  currentIPSId: string | null;
  isLoading: boolean;
}

export default function IPSPage() {
  const [state, setState] = useState<IPSFlowState>({
    step: 'list',
    selectedStrategies: [],
    selectedFactors: new Set(),
    factorConfigurations: {},
    currentIPSId: null,
    isLoading: true
  });

  const [allIPSs, setAllIPSs] = useState<IPSConfiguration[]>([]);
  const [showInactive, setShowInactive] = useState(false);
  const [availableStrategies, setAvailableStrategies] = useState<TradingStrategy[]>([]);
  const [factorDefinitions, setFactorDefinitions] = useState<any>(null);

  const userId = 'user-123'; // Replace with actual user ID from auth

  // Load data on component mount
  useEffect(() => {
    const loadData = async () => {
      setState(prev => ({ ...prev, isLoading: true }));
      
      try {
        const [userIPSs, strategiesRaw] = await Promise.all([
          ipsDataService.getAllUserIPSs(userId),
          Promise.resolve(ipsDataService.getAvailableStrategies())
        ]);
        
        setAllIPSs(userIPSs);
        // Fix requiredFactorTypes typing
        const strategies = strategiesRaw.map(s => ({
          ...s,
          requiredFactorTypes: (s.requiredFactorTypes ?? []).filter(
            (t: string): t is "qualitative" | "options" | "quantitative" =>
              ["qualitative", "options", "quantitative"].includes(t)
          )
        }));
        setAvailableStrategies(strategies);
        
      } catch (error) {
        console.error('Error loading IPS data:', error);
      } finally {
        setState(prev => ({ ...prev, isLoading: false }));
      }
    };

    loadData();
  }, [userId]);

  // Load factor definitions when strategies are selected
  useEffect(() => {
    const loadFactors = async () => {
      if (state.selectedStrategies.length > 0) {
        const factors = await ipsDataService.getFactorsForStrategies(state.selectedStrategies);
        setFactorDefinitions(factors);
      } else {
        setFactorDefinitions(null);
      }
    };

    loadFactors();
  }, [state.selectedStrategies]);

  // Navigation handlers
  const handleCreateNew = () => {
    setState(prev => ({
      ...prev,
      step: 'strategies',
      selectedStrategies: [],
      selectedFactors: new Set(),
      factorConfigurations: {},
      currentIPSId: null
    }));
  };

  const handleEditIPS = (ipsId: string) => {
    const ips = allIPSs.find(i => i.id === ipsId);
    if (ips) {
      setState(prev => ({
        ...prev,
        step: 'strategies',
        selectedStrategies: ips.strategies || [],
        selectedFactors: new Set(),
        factorConfigurations: {},
        currentIPSId: ipsId
      }));
    }
  };

  const handleStepNavigation = (step: IPSFlowState['step']) => {
    setState(prev => ({ ...prev, step }));
  };

  const handleStrategySelection = (selectedStrategies: string[]) => {
    setState(prev => ({
      ...prev,
      selectedStrategies,
      selectedFactors: new Set(), // Reset factor selection when strategies change
      factorConfigurations: {}
    }));
  };

  const handleFactorSelection = (selectedFactors: Set<string>) => {
    setState(prev => ({ ...prev, selectedFactors }));
  };

  const handleFactorConfiguration = (configurations: Record<string, any>) => {
    setState(prev => ({ ...prev, factorConfigurations: configurations }));
  };

  const handleSaveIPS = async (ipsData: any) => {
    try {
      const completeIPSData = {
        ...ipsData,
        strategies: state.selectedStrategies
      };

      let ipsConfig: IPSConfiguration;
      
      if (state.currentIPSId) {
        // Update existing
        ipsConfig = await ipsDataService.updateIPS(state.currentIPSId, completeIPSData);
        setAllIPSs(prevIPSs => 
          prevIPSs.map(ips => 
            ips.id === state.currentIPSId ? { ...ips, ...ipsConfig } : ips
          )
        );
      } else {
        // Create new
        ipsConfig = await ipsDataService.createIPS(userId, completeIPSData);
        setAllIPSs(prevIPSs => [...prevIPSs, ipsConfig]);
      }
      
      // Save factor configurations
      const factorConfigs = Array.from(state.selectedFactors).map(factorName => {
        const config = state.factorConfigurations[factorName];
        return {
          factorId: config.factorId,
          weight: config.weight,
          enabled: config.enabled,
          targetConfig: config.targetConfig
        };
      });
      
      await ipsDataService.saveFactorConfigurations(ipsConfig.id, factorConfigs);
      
      setState(prev => ({ 
        ...prev, 
        step: 'list', 
        currentIPSId: null,
        selectedStrategies: [],
        selectedFactors: new Set(),
        factorConfigurations: {}
      }));
      
    } catch (error) {
      console.error('Error saving IPS:', error);
      alert('Failed to save IPS. Please try again.');
    }
  };

  // IPS Action handlers
  const handleToggleIPSStatus = async (ipsId: string) => {
    try {
      const updatedIPS = await ipsDataService.toggleIPSStatus(ipsId);
      setAllIPSs(prevIPSs => 
        prevIPSs.map(ips => 
          ips.id === ipsId ? updatedIPS : ips
        )
      );
    } catch (error) {
      console.error('Error toggling IPS status:', error);
    }
  };

  const handleDuplicateIPS = async (ipsId: string) => {
    try {
      const duplicatedIPS = await ipsDataService.duplicateIPS(ipsId, userId);
      setAllIPSs(prevIPSs => [...prevIPSs, duplicatedIPS]);
    } catch (error) {
      console.error('Error duplicating IPS:', error);
    }
  };

  const handleDeleteIPS = async (ipsId: string) => {
    if (confirm('Are you sure you want to delete this IPS? This action cannot be undone.')) {
      try {
        await ipsDataService.deleteIPS(ipsId);
        setAllIPSs(prevIPSs => prevIPSs.filter(ips => ips.id !== ipsId));
      } catch (error) {
        console.error('Error deleting IPS:', error);
      }
    }
  };

  // Filter IPSs
  const activeIPSs = allIPSs.filter(ips => ips.is_active);
  const inactiveIPSs = allIPSs.filter(ips => !ips.is_active);
  const displayedIPSs = showInactive ? allIPSs : activeIPSs;

  // Loading state
  if (state.isLoading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <p className="text-gray-600">Loading IPS configurations...</p>
          </div>
        </div>
      </div>
    );
  }

  // IPS Builder Flow (when creating/editing)
  if (state.step !== 'list') {
    const steps = [
      { id: 'strategies', name: 'Strategies', icon: Layers },
      { id: 'selection', name: 'Factor Selection', icon: Target },
      { id: 'configuration', name: 'Configuration', icon: Settings },
      { id: 'summary', name: 'Summary', icon: CheckCircle },
      { id: 'scoring', name: 'Scoring', icon: BarChart3 }
    ];

    const currentStepIndex = steps.findIndex(s => s.id === state.step);

    const renderStepIndicator = () => (
      <div className="mb-8">
        <div className="flex items-center justify-between max-w-4xl mx-auto mb-4">
          {steps.map((step, index) => {
            const Icon = step.icon;
            const isActive = state.step === step.id;
            const isCompleted = index < currentStepIndex;
            
            return (
              <div key={step.id} className="flex items-center">
                <div 
                  className={`
                    flex items-center justify-center w-10 h-10 rounded-full border-2 
                    ${isActive ? 'border-blue-600 bg-blue-600 text-white' : 
                      isCompleted ? 'border-green-600 bg-green-600 text-white' :
                      'border-gray-300 bg-white text-gray-400'}
                  `}
                >
                  <Icon className="h-5 w-5" />
                </div>
                <span className={`ml-2 text-sm font-medium ${isActive ? 'text-blue-600' : isCompleted ? 'text-green-600' : 'text-gray-500'}`}>
                  {step.name}
                </span>
                {index < steps.length - 1 && (
                  <div className={`w-8 h-0.5 mx-4 ${isCompleted ? 'bg-green-600' : 'bg-gray-300'}`} />
                )}
              </div>
            );
          })}
        </div>
      </div>
    );

    return (
      <div className="container mx-auto px-4 py-8">
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-bold text-gray-900">
            {state.currentIPSId ? 'Edit IPS' : 'Create New IPS'}
          </h1>
          <p className="text-gray-600 mt-2">
            Configure your trading rules and risk parameters
          </p>
        </div>
        
        {renderStepIndicator()}

        {/* Render appropriate step component */}
        {state.step === 'strategies' && (
          <IPSStrategySelector
            availableStrategies={availableStrategies}
            selectedStrategies={state.selectedStrategies}
            onStrategySelection={handleStrategySelection}
            onNext={() => handleStepNavigation('selection')}
            onBack={() => handleStepNavigation('list')}
          />
        )}

        {state.step === 'selection' && (
          <IPSFactorSelector
            selectedFactors={state.selectedFactors}
            onFactorSelection={handleFactorSelection}
            onNext={() => handleStepNavigation('configuration')}
            onBack={() => handleStepNavigation('strategies')}
            factorDefinitions={factorDefinitions}
            selectedStrategies={state.selectedStrategies}
          />
        )}

        {state.step === 'configuration' && (
          <IPSFactorConfiguration
            selectedFactors={state.selectedFactors}
            factorConfigurations={state.factorConfigurations}
            onConfigurationChange={handleFactorConfiguration}
            onBack={() => handleStepNavigation('selection')}
            onNext={() => handleStepNavigation('summary')}
            factorDefinitions={factorDefinitions}
          />
        )}

        {state.step === 'summary' && (
          <IPSSummary
            selectedFactors={state.selectedFactors}
            factorConfigurations={state.factorConfigurations}
            onSave={handleSaveIPS}
            onBack={() => handleStepNavigation('configuration')}
            factorDefinitions={factorDefinitions}
          />
        )}

        {state.step === 'scoring' && (
          <TradeScoreDisplay
            onBack={() => handleStepNavigation('summary')}
          />
        )}
      </div>
    );
  }

  // Main IPS List View
  return (
    <div className="container mx-auto px-4 py-8">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">IPS Builder</h1>
            <p className="text-gray-600 mt-2">
              Manage your Investment Policy Statements and trading rules
            </p>
          </div>
          <Button 
            onClick={handleCreateNew}
            className="bg-blue-600 hover:bg-blue-700"
          >
            <PlusCircle className="h-4 w-4 mr-2" />
            Create New IPS
          </Button>
        </div>

        {/* View Toggle */}
        <div className="flex items-center gap-4">
          <div className="flex items-center space-x-2">
            <Switch
              id="show-inactive"
              checked={showInactive}
              onCheckedChange={setShowInactive}
            />
            <label htmlFor="show-inactive" className="text-sm font-medium">
              Show inactive IPSs ({inactiveIPSs.length})
            </label>
          </div>
        </div>
      </div>

      {/* IPS Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
        {displayedIPSs.map((ips) => (
          <Card key={ips.id} className={`relative ${!ips.is_active ? 'opacity-75' : ''}`}>
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <CardTitle className="text-lg flex items-center gap-2">
                    {ips.name}
                    {!ips.is_active && <EyeOff className="h-4 w-4 text-gray-400" />}
                  </CardTitle>
                  {ips.description && (
                    <p className="text-sm text-gray-600 mt-1 line-clamp-2">
                      {ips.description}
                    </p>
                  )}
                </div>
                
                {/* IPS Actions Dropdown */}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 w-8 p-0"
                    >
                      <MoreVertical className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => handleEditIPS(ips.id)}>
                      <Edit className="h-4 w-4 mr-2" />
                      Edit
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => handleDuplicateIPS(ips.id)}>
                      <Copy className="h-4 w-4 mr-2" />
                      Duplicate
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem 
                      onClick={() => handleToggleIPSStatus(ips.id)}
                      className={ips.is_active ? 'text-orange-600' : 'text-green-600'}
                    >
                      {ips.is_active ? (
                        <>
                          <EyeOff className="h-4 w-4 mr-2" />
                          Deactivate
                        </>
                      ) : (
                        <>
                          <Eye className="h-4 w-4 mr-2" />
                          Activate
                        </>
                      )}
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem 
                      onClick={() => handleDeleteIPS(ips.id)}
                      className="text-red-600"
                    >
                      <Trash2 className="h-4 w-4 mr-2" />
                      Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
              
              {/* Strategy Badges */}
              {ips.strategies && ips.strategies.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-2">
                  {ips.strategies.map(strategyId => {
                    const strategy = availableStrategies.find(s => s.id === strategyId);
                    return strategy ? (
                      <Badge key={strategyId} variant="outline" className="text-xs">
                        {strategy.name}
                      </Badge>
                    ) : null;
                  })}
                </div>
              )}
            </CardHeader>
            
            <CardContent className="space-y-4">
              {/* Performance Metrics */}
              {ips.performance && (
                <div className="grid grid-cols-3 gap-3 text-center">
                  <div>
                    <p className="text-lg font-semibold text-green-600">
                      {ips.performance.winRate}%
                    </p>
                    <p className="text-xs text-gray-500">Win Rate</p>
                  </div>
                  <div>
                    <p className="text-lg font-semibold text-blue-600">
                      {ips.performance.avgROI}%
                    </p>
                    <p className="text-xs text-gray-500">Avg ROI</p>
                  </div>
                  <div>
                    <p className="text-lg font-semibold text-gray-700">
                      {ips.performance.totalTrades}
                    </p>
                    <p className="text-xs text-gray-500">Trades</p>
                  </div>
                </div>
              )}

              {/* Factor Summary */}
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-600">
                  {ips.active_factors || 0} / {ips.total_factors || 0} factors active
                </span>
                <span className="text-gray-600">
                  Weight: {ips.total_weight || 0}%
                </span>
              </div>

              {/* Progress Bar */}
              <Progress 
                value={(ips.active_factors || 0) / Math.max(ips.total_factors || 1, 1) * 100} 
                className="h-2"
              />

              {/* Criteria Summary */}
              {ips.criteria && (
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="bg-gray-50 p-2 rounded">
                    <span className="text-gray-500">Min IV:</span>
                    <span className="font-medium ml-1">{ips.criteria.minIV}%</span>
                  </div>
                  <div className="bg-gray-50 p-2 rounded">
                    <span className="text-gray-500">Max Δ:</span>
                    <span className="font-medium ml-1">{ips.criteria.maxDelta}</span>
                  </div>
                  <div className="bg-gray-50 p-2 rounded">
                    <span className="text-gray-500">Target ROI:</span>
                    <span className="font-medium ml-1">{ips.criteria.targetROI}%</span>
                  </div>
                  <div className="bg-gray-50 p-2 rounded">
                    <span className="text-gray-500">Max Pos:</span>
                    <span className="font-medium ml-1">{ips.criteria.maxPositions}</span>
                  </div>
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex items-center gap-2 pt-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => console.log('View details for', ips.id)}
                  className="flex-1"
                >
                  <Eye className="h-3 w-3 mr-1" />
                  View Details
                </Button>
              </div>

              {/* Meta Information */}
              <div className="text-xs text-gray-400 pt-2 border-t">
                <div className="flex justify-between">
                  <span>Created: {new Date(ips.created_at).toLocaleDateString()}</span>
                  <span>Modified: {ips.last_modified}</span>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
        
        {/* Empty State */}
        {displayedIPSs.length === 0 && (
          <div className="col-span-full">
            <Card className="text-center py-12">
              <CardContent>
                <FileText className="h-16 w-16 text-gray-300 mx-auto mb-4" />
                <h3 className="text-xl font-semibold text-gray-700 mb-2">
                  {showInactive ? 'No inactive IPSs found' : 'No active IPSs found'}
                </h3>
                <p className="text-gray-500 mb-6">
                  {showInactive 
                    ? 'All your IPSs are currently active.'
                    : 'Create your first Investment Policy Statement to get started.'
                  }
                </p>
                {!showInactive && (
                  <Button onClick={handleCreateNew} className="bg-blue-600 hover:bg-blue-700">
                    <PlusCircle className="h-4 w-4 mr-2" />
                    Create Your First IPS
                  </Button>
                )}
              </CardContent>
            </Card>
          </div>
        )}
      </div>

      {/* Quick Stats */}
      {allIPSs.length > 0 && (
        <div className="mt-8 grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-4 text-center">
              <p className="text-2xl font-bold text-blue-600">{activeIPSs.length}</p>
              <p className="text-sm text-gray-600">Active IPSs</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <p className="text-2xl font-bold text-green-600">
                {activeIPSs.reduce((sum, ips) => sum + (ips.performance?.totalTrades || 0), 0)}
              </p>
              <p className="text-sm text-gray-600">Total Trades</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <p className="text-2xl font-bold text-purple-600">
                {activeIPSs.length > 0 
                  ? Math.round(activeIPSs.reduce((sum, ips) => sum + (ips.performance?.winRate || 0), 0) / activeIPSs.length)
                  : 0}%
              </p>
              <p className="text-sm text-gray-600">Avg Win Rate</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <p className="text-2xl font-bold text-orange-600">
                {Array.from(new Set(availableStrategies.map(s => s.id))).length}
              </p>
              <p className="text-sm text-gray-600">Available Strategies</p>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}