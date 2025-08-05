/**
 * Enhanced IPS Page with Multiple IPS Support (Error-Free Version)
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
  Shield
} from 'lucide-react';

// Import existing components
import { IPSFactorSelector } from '@/components/ips/ips-factor-selector';
import { IPSFactorConfiguration } from '@/components/ips/ips-factor-configuration'; 
import { IPSSummary } from '@/components/ips/ips-summary';
import { TradeScoreDisplay } from '@/components/ips/trade-score-display';

// Import services
import { ipsDataService } from '@/lib/ips-data-service';
import { TradeScorer } from '@/lib/trade-scorer';

// Types
interface IPSFlowState {
  step: 'list' | 'selection' | 'configuration' | 'summary' | 'scoring';
  selectedFactors: Set<string>;
  factorConfigurations: Record<string, any>;
  currentIPSId: string | null;
  isLoading: boolean;
}

interface IPSConfiguration {
  id: string;
  user_id: string;
  name: string;
  description?: string;
  is_active: boolean;
  total_factors?: number;
  active_factors?: number;
  total_weight?: number;
  avg_weight?: number;
  created_at: string;
  last_modified?: string;
  performance?: {
    winRate: number;
    avgROI: number;
    totalTrades: number;
  };
  criteria?: {
    minIV: number;
    maxDelta: number;
    targetROI: number;
    maxPositions: number;
  };
}

export default function IPSPage() {
  const [state, setState] = useState<IPSFlowState>({
    step: 'list',
    selectedFactors: new Set(),
    factorConfigurations: {},
    currentIPSId: null,
    isLoading: true
  });

  const [allIPSs, setAllIPSs] = useState<IPSConfiguration[]>([]);
  const [showInactive, setShowInactive] = useState(false);
  const [expandedIPS, setExpandedIPS] = useState<string | null>(null);
  const [factorDefinitions, setFactorDefinitions] = useState<any>(null);
  const [userId] = useState('demo-user-id'); // Get from auth context

  // Load initial data
  useEffect(() => {
    loadInitialData();
  }, []);

  const loadInitialData = async () => {
    try {
      setState(prev => ({ ...prev, isLoading: true }));
      
      // Load all user IPSs (use new method if available, fallback to existing)
      let userIPSs: IPSConfiguration[] = [];
      try {
        userIPSs = await ipsDataService.getAllUserIPSs(userId);
      } catch (error) {
        // Fallback to single IPS method
        const singleIPS = await ipsDataService.getActiveIPS(userId);
        if (singleIPS) {
          userIPSs = [singleIPS];
        }
      }
      setAllIPSs(userIPSs);
      
      // Load factor definitions
      const factors = await ipsDataService.getFactorDefinitions();
      setFactorDefinitions(factors);
      
      setState(prev => ({ ...prev, isLoading: false }));
    } catch (error) {
      console.error('Error loading initial data:', error);
      setState(prev => ({ ...prev, isLoading: false }));
    }
  };

  // Filter IPSs based on active/inactive toggle
  const activeIPSs = allIPSs.filter(ips => ips.is_active);
  const inactiveIPSs = allIPSs.filter(ips => !ips.is_active);
  const displayedIPSs = showInactive ? [...activeIPSs, ...inactiveIPSs] : activeIPSs;

  // Event handlers
  const handleActivateIPS = async (ipsId: string) => {
    try {
      await ipsDataService.activateIPS(ipsId);
      await loadInitialData(); // Refresh data
    } catch (error) {
      console.error('Error activating IPS:', error);
    }
  };

  const handleDeactivateIPS = async (ipsId: string) => {
    try {
      await ipsDataService.deactivateIPS(ipsId);
      await loadInitialData(); // Refresh data
    } catch (error) {
      console.error('Error deactivating IPS:', error);
    }
  };

  const handleEditIPS = (ipsId: string) => {
    setState(prev => ({ ...prev, step: 'configuration', currentIPSId: ipsId }));
  };

  const handleCreateNew = () => {
    setState(prev => ({ 
      ...prev, 
      step: 'selection', 
      currentIPSId: null,
      selectedFactors: new Set(),
      factorConfigurations: {}
    }));
  };

  const handleIPSClick = (ipsId: string) => {
    setExpandedIPS(expandedIPS === ipsId ? null : ipsId);
  };

  const handleDuplicateIPS = async (ipsId: string, newName: string) => {
    try {
      await ipsDataService.duplicateIPS(ipsId, newName);
      await loadInitialData(); // Refresh data
    } catch (error) {
      console.error('Error duplicating IPS:', error);
    }
  };

  const handleArchiveIPS = async (ipsId: string) => {
    try {
      await ipsDataService.deactivateIPS(ipsId);
      await loadInitialData(); // Refresh data
    } catch (error) {
      console.error('Error archiving IPS:', error);
    }
  };

  const handleDeleteIPS = async (ipsId: string) => {
    try {
      await ipsDataService.deleteIPS(ipsId);
      await loadInitialData(); // Refresh data
      // Close expanded view if this IPS was expanded
      if (expandedIPS === ipsId) {
        setExpandedIPS(null);
      }
    } catch (error) {
      console.error('Error deleting IPS:', error);
    }
  };

  const handleViewAnalytics = (ipsId: string) => {
    console.log(`Viewing analytics for IPS: ${ipsId}`);
    // In real app: router.push(`/ips/${ipsId}/analytics`);
  };

  const handleExportIPS = async (ipsId: string) => {
    try {
      const exportData = await ipsDataService.exportIPSConfiguration(ipsId);
      console.log('Exporting IPS:', exportData);
      // In real app, trigger download
    } catch (error) {
      console.error('Error exporting IPS:', error);
    }
  };

  const handleFactorSelection = (selectedFactors: Set<string>) => {
    setState(prev => ({ ...prev, selectedFactors }));
  };

  const handleFactorConfiguration = (configurations: Record<string, any>) => {
    setState(prev => ({ ...prev, factorConfigurations: configurations }));
  };

  const handleStepNavigation = (newStep: string) => {
    setState(prev => ({ ...prev, step: newStep as any }));
  };

  const handleSaveIPS = async (ipsData: any) => {
    try {
      let ipsConfig;
      
      if (state.currentIPSId) {
        // Update existing
        ipsConfig = await ipsDataService.updateIPS(state.currentIPSId, ipsData);
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
      
      setState(prev => ({ ...prev, step: 'list', currentIPSId: null }));
      
      // Reload data to get fresh state
      await loadInitialData();
    } catch (error) {
      console.error('Error saving IPS:', error);
      alert('Failed to save IPS. Please try again.');
    }
  };

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
    // Step Progress Indicator
    const steps = [
      { id: 'selection', name: 'Factor Selection', icon: Target },
      { id: 'configuration', name: 'Configuration', icon: Settings },
      { id: 'summary', name: 'Summary', icon: CheckCircle },
      { id: 'scoring', name: 'Scoring', icon: BarChart3 }
    ];

    const currentStepIndex = steps.findIndex(s => s.id === state.step);

    const renderStepIndicator = () => (
      <div className="mb-8">
        <div className="flex items-center justify-between max-w-3xl mx-auto mb-4">
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
                <span className={`ml-2 text-sm font-medium ${isActive ? 'text-blue-600' : 'text-gray-500'}`}>
                  {step.name}
                </span>
                {index < steps.length - 1 && (
                  <div className={`w-12 h-0.5 ml-4 ${isCompleted ? 'bg-green-600' : 'bg-gray-300'}`} />
                )}
              </div>
            );
          })}
        </div>
        <Progress value={(currentStepIndex + 1) / steps.length * 100} className="max-w-3xl mx-auto" />
      </div>
    );

    return (
      <div className="container mx-auto px-4 py-8">
        <div className="mb-8">
          <Button 
            variant="outline" 
            onClick={() => setState(prev => ({ ...prev, step: 'list' }))}
            className="mb-4"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to IPS List
          </Button>
          <h1 className="text-3xl font-bold text-gray-900">
            {state.currentIPSId ? 'Edit IPS' : 'Create New IPS'}
          </h1>
          <p className="text-gray-600 mt-2">
            Configure your trading rules and risk parameters
          </p>
        </div>
        
        {renderStepIndicator()}

        {/* Render appropriate step component */}
        {state.step === 'selection' && (
          <IPSFactorSelector
            selectedFactors={state.selectedFactors}
            onFactorSelection={handleFactorSelection}
            onNext={() => handleStepNavigation('configuration')}
            onBack={() => handleStepNavigation('list')}
            factorDefinitions={factorDefinitions}
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
          {showInactive ? (
            <Badge variant="outline" className="flex items-center gap-1">
              <Eye className="h-3 w-3" />
              Showing all IPSs
            </Badge>
          ) : (
            <Badge variant="outline" className="flex items-center gap-1">
              <EyeOff className="h-3 w-3" />
              Active only
            </Badge>
          )}
        </div>
      </div>

      {/* IPS List */}
      <div className="space-y-4">
        {displayedIPSs.length === 0 ? (
          <Card>
            <CardContent className="p-12 text-center">
              <FileText className="h-16 w-16 text-gray-300 mx-auto mb-4" />
              <h3 className="text-xl font-semibold text-gray-900 mb-2">No IPSs Found</h3>
              <p className="text-gray-600 mb-6">
                {showInactive 
                  ? "You haven't created any Investment Policy Statements yet."
                  : "You don't have any active IPSs. Toggle to see inactive ones or create a new one."}
              </p>
              <Button onClick={handleCreateNew} className="bg-blue-600 hover:bg-blue-700">
                <PlusCircle className="h-4 w-4 mr-2" />
                Create Your First IPS
              </Button>
            </CardContent>
          </Card>
        ) : (
          displayedIPSs.map((ips) => (
            <Card 
              key={ips.id} 
              className={`${ips.is_active ? 'ring-2 ring-blue-200' : 'opacity-75'} cursor-pointer transition-all hover:shadow-md`}
            >
              {/* Compact Header - Always Visible */}
              <CardHeader 
                className="pb-4"
                onClick={() => handleIPSClick(ips.id)}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`h-3 w-3 rounded-full ${ips.is_active ? 'bg-green-500' : 'bg-gray-400'}`} />
                    <div>
                      <CardTitle className="text-lg">{ips.name}</CardTitle>
                      <p className="text-sm text-gray-600 mt-1">{ips.description}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    {/* Compact Stats */}
                    <div className="flex items-center gap-4 text-sm">
                      <span className="text-gray-600">
                        <Target className="h-4 w-4 inline mr-1" />
                        {ips.performance?.winRate || 0}% win rate
                      </span>
                      <span className="text-gray-600">
                        <TrendingUp className="h-4 w-4 inline mr-1" />
                        {ips.performance?.avgROI || 0}% ROI
                      </span>
                      <span className="text-gray-600">
                        {ips.active_factors || 0}/{ips.total_factors || 0} factors
                      </span>
                    </div>
                    <Badge variant={ips.is_active ? 'default' : 'secondary'}>
                      {ips.is_active ? 'Active' : 'Inactive'}
                    </Badge>
                    {/* Simple menu button for now */}
                    <Button 
                      variant="ghost" 
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleEditIPS(ips.id);
                      }}
                    >
                      <Edit className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              
              {/* Expanded Details - Only show when clicked */}
              {expandedIPS === ips.id && (
                <CardContent className="pt-0">
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-6">
                    {/* Factor Configuration */}
                    <div>
                      <h4 className="font-medium text-gray-900 mb-2">Factor Configuration</h4>
                      <div className="space-y-1 text-sm">
                        <div className="flex justify-between">
                          <span className="text-gray-600">Total Factors:</span>
                          <span className="font-medium">{ips.total_factors || 0}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-600">Active Factors:</span>
                          <span className="font-medium text-green-600">{ips.active_factors || 0}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-600">Avg Weight:</span>
                          <span className="font-medium">{ips.avg_weight || 0}</span>
                        </div>
                      </div>
                    </div>

                    {/* Key Criteria */}
                    <div>
                      <h4 className="font-medium text-gray-900 mb-2">Key Criteria</h4>
                      <div className="space-y-1 text-sm">
                        <div className="flex justify-between">
                          <span className="text-gray-600">Min IV:</span>
                          <span className="font-medium">{ips.criteria?.minIV || 0}%</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-600">Max Delta:</span>
                          <span className="font-medium">{ips.criteria?.maxDelta || 0}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-600">Target ROI:</span>
                          <span className="font-medium">{ips.criteria?.targetROI || 0}%</span>
                        </div>
                      </div>
                    </div>

                    {/* Performance */}
                    <div>
                      <h4 className="font-medium text-gray-900 mb-2">Performance</h4>
                      <div className="space-y-1 text-sm">
                        <div className="flex justify-between">
                          <span className="text-gray-600">Win Rate:</span>
                          <span className="font-medium text-green-600">{ips.performance?.winRate || 0}%</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-600">Avg ROI:</span>
                          <span className="font-medium">{ips.performance?.avgROI || 0}%</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-600">Total Trades:</span>
                          <span className="font-medium">{ips.performance?.totalTrades || 0}</span>
                        </div>
                      </div>
                    </div>

                    {/* Risk Management */}
                    <div>
                      <h4 className="font-medium text-gray-900 mb-2">Risk Limits</h4>
                      <div className="space-y-1 text-sm">
                        <div className="flex justify-between">
                          <span className="text-gray-600">Max Positions:</span>
                          <span className="font-medium">{ips.criteria?.maxPositions || 0}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-600">Last Modified:</span>
                          <span className="font-medium">{ips.last_modified || 'Never'}</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Action Buttons */}
                  <div className="flex items-center justify-between pt-4 border-t">
                    <div className="flex gap-2">
                      <Button 
                        variant="outline" 
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleEditIPS(ips.id);
                        }}
                      >
                        <Edit className="h-4 w-4 mr-1" />
                        Edit
                      </Button>
                      <Button 
                        variant="outline" 
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDuplicateIPS(ips.id, `${ips.name} (Copy)`);
                        }}
                      >
                        <Copy className="h-4 w-4 mr-1" />
                        Duplicate
                      </Button>
                      <Button 
                        variant="outline" 
                        size="sm" 
                        onClick={(e) => {
                          e.stopPropagation();
                          handleViewAnalytics(ips.id);
                        }}
                      >
                        <BarChart3 className="h-4 w-4 mr-1" />
                        Analytics
                      </Button>
                    </div>
                    
                    <div className="flex items-center gap-3">
                      <span className="text-sm text-gray-600">
                        {ips.is_active ? 'Currently active' : 'Inactive'}
                      </span>
                      <Switch
                        checked={ips.is_active}
                        onCheckedChange={(checked) => {
                          checked ? handleActivateIPS(ips.id) : handleDeactivateIPS(ips.id);
                        }}
                        onClick={(e) => e.stopPropagation()}
                      />
                    </div>
                  </div>
                </CardContent>
              )}
            </Card>
          ))
        )}
      </div>

      {/* Quick Actions Footer */}
      {displayedIPSs.length > 0 && (
        <Card className="mt-8">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-gray-900">Quick Actions</h3>
                <p className="text-sm text-gray-600 mt-1">
                  Manage your IPS configurations efficiently
                </p>
              </div>
              <div className="flex gap-3">
                <Button variant="outline">
                  <Archive className="h-4 w-4 mr-2" />
                  Archive Old IPSs
                </Button>
                <Button variant="outline">
                  <Download className="h-4 w-4 mr-2" />
                  Export All IPSs
                </Button>
                <Button onClick={handleCreateNew} className="bg-blue-600 hover:bg-blue-700">
                  <PlusCircle className="h-4 w-4 mr-2" />
                  Create New IPS
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}