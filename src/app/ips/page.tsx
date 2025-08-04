/**
 * Complete IPS Page with Navigation
 * Copy this into: src/app/ips/page.tsx
 */

"use client"

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
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
  Save
} from 'lucide-react';

// Import our components
import { IPSFactorSelector } from '@/components/ips/ips-factor-selector';
import { IPSFactorConfiguration } from '@/components/ips/ips-factor-configuration'; 
import { IPSSummary } from '@/components/ips/ips-summary';
import { TradeScoreDisplay } from '@/components/ips/trade-score-display';

// Import services
import { ipsDataService } from '@/lib/ips-data-service';
import { TradeScorer } from '@/lib/trade-scorer';

// Types
interface IPSFlowState {
  step: 'overview' | 'selection' | 'configuration' | 'summary' | 'scoring';
  selectedFactors: Set<string>;
  factorConfigurations: Record<string, any>;
  ipsConfig: any;
  hasExistingIPS: boolean;
  isLoading: boolean;
}

export default function IPSPage() {
  const [state, setState] = useState<IPSFlowState>({
    step: 'overview',
    selectedFactors: new Set(),
    factorConfigurations: {},
    ipsConfig: null,
    hasExistingIPS: false,
    isLoading: true
  });

  const [factorDefinitions, setFactorDefinitions] = useState<any>(null);
  const [userId] = useState('demo-user-id'); // Get from auth context

  // Load initial data
  useEffect(() => {
    loadInitialData();
  }, []);

  const loadInitialData = async () => {
    try {
      setState(prev => ({ ...prev, isLoading: true }));
      
      // Check for existing IPS
      const existingIPS = await ipsDataService.getActiveIPS(userId);
      
      // Load factor definitions
      const factors = await ipsDataService.getFactorDefinitions();
      
      setState(prev => ({
        ...prev,
        hasExistingIPS: !!existingIPS,
        ipsConfig: existingIPS,
        isLoading: false
      }));
      
      setFactorDefinitions(factors);
      
      // If existing IPS, load its configurations
      if (existingIPS) {
        const configs = await ipsDataService.getIPSFactorConfigurations(existingIPS.id);
        const selectedFactors = new Set(configs.map((c: any) => c.factor_name));
        const factorConfigurations = configs.reduce((acc: any, config: any) => {
          acc[config.factor_name] = {
            weight: config.weight,
            enabled: config.is_enabled,
            targetConfig: config.target_config,
            factorId: config.factor_id,
            configId: config.config_id
          };
          return acc;
        }, {});
        
        setState(prev => ({
          ...prev,
          selectedFactors,
          factorConfigurations
        }));
      }
    } catch (error) {
      console.error('Error loading initial data:', error);
      setState(prev => ({ ...prev, isLoading: false }));
    }
  };

  const handleFactorSelection = (selectedFactors: Set<string>) => {
    setState(prev => ({ ...prev, selectedFactors }));
  };

  const handleFactorConfiguration = (configurations: Record<string, any>) => {
    setState(prev => ({ ...prev, factorConfigurations: configurations }));
  };

  const handleCreateNewIPS = () => {
    setState(prev => ({ 
      ...prev, 
      step: 'selection',
      hasExistingIPS: false,
      selectedFactors: new Set(),
      factorConfigurations: {},
      ipsConfig: null
    }));
  };

  const handleEditExistingIPS = () => {
    setState(prev => ({ ...prev, step: 'configuration' }));
  };

  const handleStepNavigation = (newStep: string) => {
    setState(prev => ({ ...prev, step: newStep as any }));
  };

  const handleSaveIPS = async (ipsData: any) => {
    try {
      let ipsConfig;
      
      if (state.ipsConfig?.id) {
        // Update existing
        ipsConfig = await ipsDataService.updateIPS(state.ipsConfig.id, ipsData);
      } else {
        // Create new
        ipsConfig = await ipsDataService.createIPS(userId, ipsData);
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
        ipsConfig,
        hasExistingIPS: true,
        step: 'overview'
      }));
      
      // Reload data to get fresh state
      await loadInitialData();
    } catch (error) {
      console.error('Error saving IPS:', error);
      alert('Failed to save IPS. Please try again.');
    }
  };

  const handleScoreTrade = async (tradeData: any) => {
    try {
      if (!state.ipsConfig) {
        alert('Please create an IPS first');
        return;
      }
      
      // Create scoring session
      const session = await ipsDataService.createScoringSession(
        state.ipsConfig.id,
        userId,
        `${tradeData.symbol} Analysis`
      );
      
      // Score the trade
      const scorer = new TradeScorer({
        name: state.ipsConfig.name,
        factors: state.factorConfigurations
      });
      
      const results = scorer.scoreTrace(tradeData);
      
      // Save results
      await ipsDataService.saveTradeScore(session.id, state.ipsConfig.id, {
        symbol: tradeData.symbol,
        tradeName: tradeData.name,
        tradeData,
        ...results
      });
      
      setState(prev => ({ ...prev, step: 'scoring' }));
    } catch (error) {
      console.error('Error scoring trade:', error);
      alert('Failed to score trade. Please try again.');
    }
  };

  if (state.isLoading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <p className="text-gray-600">Loading IPS configuration...</p>
          </div>
        </div>
      </div>
    );
  }

  // Step Progress Indicator
  const steps = [
    { id: 'overview', name: 'Overview', icon: FileText },
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
          const isAccessible = index <= currentStepIndex || state.hasExistingIPS;
          
          return (
            <div key={step.id} className="flex items-center">
              <div 
                className={`
                  flex items-center justify-center w-10 h-10 rounded-full border-2 
                  ${isActive ? 'border-blue-600 bg-blue-600 text-white' : 
                    isCompleted ? 'border-green-600 bg-green-600 text-white' :
                    isAccessible ? 'border-gray-300 bg-white text-gray-600 cursor-pointer hover:border-blue-400' :
                    'border-gray-200 bg-gray-100 text-gray-400'}
                `}
                onClick={() => isAccessible && handleStepNavigation(step.id)}
              >
                {isCompleted ? (
                  <CheckCircle className="h-5 w-5" />
                ) : (
                  <Icon className="h-5 w-5" />
                )}
              </div>
              <div className="ml-3">
                <p className={`text-sm font-medium ${isActive ? 'text-blue-600' : 'text-gray-600'}`}>
                  {step.name}
                </p>
              </div>
              {index < steps.length - 1 && (
                <div className="flex-1 mx-4 h-0.5 bg-gray-200">
                  <div 
                    className={`h-full transition-all duration-300 ${
                      isCompleted ? 'bg-green-600' : 'bg-gray-200'
                    }`} 
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>
      
      {/* Step Counter */}
      <div className="text-center">
        <div className="text-sm text-gray-500">
          Step {currentStepIndex + 1} of {steps.length - 1}
        </div>
      </div>
    </div>
  );

  const renderNavigation = () => {
    // Navigation is now handled by individual components
    return null;
  };

  const renderOverview = () => (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Investment Policy Statement</h1>
        <p className="text-gray-600 mt-2">
          Define your trading rules and criteria for consistent decision-making
        </p>
      </div>

      {!state.hasExistingIPS ? (
        <div className="max-w-2xl mx-auto">
          <Card>
            <CardHeader className="text-center">
              <div className="flex justify-center mb-4">
                <FileText className="h-12 w-12 text-blue-600" />
              </div>
              <CardTitle className="text-2xl">Create Your IPS</CardTitle>
              <p className="text-gray-600">
                Set up your trading rules based on your risk tolerance and strategy preferences
              </p>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-4 border rounded-lg">
                  <h3 className="font-semibold mb-2">Dynamic Factor Selection</h3>
                  <ul className="text-sm text-gray-600 space-y-1">
                    <li>• Choose from 100+ quantitative factors</li>
                    <li>• Qualitative assessment criteria</li>
                    <li>• Options-specific metrics</li>
                    <li>• Custom weight assignments</li>
                  </ul>
                </div>
                <div className="p-4 border rounded-lg">
                  <h3 className="font-semibold mb-2">Automated Scoring</h3>
                  <ul className="text-sm text-gray-600 space-y-1">
                    <li>• Real-time trade compliance</li>
                    <li>• Weighted factor analysis</li>
                    <li>• Historical performance tracking</li>
                    <li>• Export capabilities</li>
                  </ul>
                </div>
              </div>
              
              <div className="text-center">
                <Button size="lg" onClick={handleCreateNewIPS}>
                  <Settings className="h-4 w-4 mr-2" />
                  Build My IPS
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      ) : (
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <CheckCircle className="h-5 w-5 text-green-600" />
                  <CardTitle>Active IPS Configuration</CardTitle>
                </div>
                <Badge variant="default">Active</Badge>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div>
                  <h3 className="font-semibold mb-3">Configuration</h3>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span>Name:</span>
                      <span className="font-medium">{state.ipsConfig?.name}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Total Factors:</span>
                      <span className="font-medium">{state.ipsConfig?.total_factors || 0}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Active Factors:</span>
                      <span className="font-medium">{state.ipsConfig?.active_factors || 0}</span>
                    </div>
                  </div>
                </div>
                
                <div>
                  <h3 className="font-semibold mb-3">Weighting</h3>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span>Total Weight:</span>
                      <span className="font-medium">{state.ipsConfig?.total_weight || 0}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Average Weight:</span>
                      <span className="font-medium">{state.ipsConfig?.avg_weight || 0}</span>
                    </div>
                  </div>
                </div>

                <div>
                  <h3 className="font-semibold mb-3">Actions</h3>
                  <div className="space-y-2">
                    <Button 
                      variant="outline" 
                      size="sm" 
                      className="w-full"
                      onClick={handleEditExistingIPS}
                    >
                      <Settings className="h-4 w-4 mr-2" />
                      Edit Configuration
                    </Button>
                    <Button 
                      variant="outline" 
                      size="sm" 
                      className="w-full"
                      onClick={() => handleStepNavigation('summary')}
                    >
                      <FileText className="h-4 w-4 mr-2" />
                      View Summary
                    </Button>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Quick Trade Scoring */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BarChart3 className="h-5 w-5" />
                Quick Trade Analysis
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-gray-600 mb-4">
                Test your IPS against sample trade data or score a new opportunity
              </p>
              <div className="flex gap-3">
                <Button onClick={() => handleScoreTrade({
                  symbol: 'AAPL',
                  'Revenue': '394328000000',
                  'P/E Ratio': '25.5',
                  'Revenue Growth': '8.2',
                  'Leadership Track Record': 5,
                  'Implied Volatility (IV)': '35.2'
                })}>
                  Score Sample Trade
                </Button>
                <Button variant="outline">
                  <Target className="h-4 w-4 mr-2" />
                  New Trade Analysis
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50">
      {state.step !== 'overview' && state.step !== 'scoring' && renderStepIndicator()}
      
      {state.step === 'overview' && renderOverview()}
      
      {state.step === 'selection' && (
        <div className="container mx-auto px-4 py-8">
          <IPSFactorSelector 
            factorDefinitions={factorDefinitions}
            selectedFactors={state.selectedFactors}
            onFactorSelection={handleFactorSelection}
            onNext={() => handleStepNavigation('configuration')}
            onBack={() => handleStepNavigation('overview')}
          />
        </div>
      )}
      
      {state.step === 'configuration' && (
        <div className="container mx-auto px-4 py-8">
          <IPSFactorConfiguration
            selectedFactors={state.selectedFactors}
            factorConfigurations={state.factorConfigurations}
            onConfigurationChange={handleFactorConfiguration}
            onNext={() => handleStepNavigation('summary')}
            onBack={() => handleStepNavigation('selection')}
            factorDefinitions={factorDefinitions}
          />
        </div>
      )}
      
      {state.step === 'summary' && (
        <div className="container mx-auto px-4 py-8">
          <IPSSummary
            selectedFactors={state.selectedFactors}
            factorConfigurations={state.factorConfigurations}
            ipsConfig={state.ipsConfig}
            onSave={handleSaveIPS}
            onBack={() => handleStepNavigation('configuration')}
          />
        </div>
      )}
      
      {state.step === 'scoring' && (
        <div className="container mx-auto px-4 py-8">
          <TradeScoreDisplay onBack={() => handleStepNavigation('overview')} />
        </div>
      )}
    </div>
  );
}