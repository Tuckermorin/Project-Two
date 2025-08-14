/**
 * Enhanced IPS Summary Component
 * Copy this into: src/components/ips/ips-summary.tsx (or create new file)
 */

"use client"

import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { 
  ArrowLeft, 
  Save, 
  CheckCircle, 
  Target,
  Shield,
  TrendingUp,
  FileText,
  BarChart3
} from 'lucide-react';

interface IPSSummaryProps {
  selectedFactors: Set<string>;
  factorConfigurations: Record<string, any>;
  onBack: () => void;
  onSave: (ipsData: any) => void;
  factorDefinitions: any;
  isEditing?: boolean;
}

export function IPSSummary({ 
  selectedFactors, 
  factorConfigurations, 
  onBack, 
  onSave, 
  factorDefinitions,
  isEditing = false 
}: IPSSummaryProps) {
  const [ipsName, setIPSName] = useState(isEditing ? 'Updated Strategy' : 'My Trading Strategy');
  const [ipsDescription, setIPSDescription] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const enabledFactors = Array.from(selectedFactors).filter(
    factorName => factorConfigurations[factorName]?.enabled
  );

  const totalWeight = Object.values(factorConfigurations)
    .filter((config: any) => config.enabled)
    .reduce((sum: number, config: any) => sum + config.weight, 0);

  const avgWeight = enabledFactors.length > 0 ? totalWeight / enabledFactors.length : 0;

  const getFactorsByType = (type: string) => {
    return enabledFactors.filter(factorName => {
      const config = factorConfigurations[factorName];
      return config?.type === type;
    });
  };

  const handleSave = async () => {
    if (!ipsName.trim()) {
      toast.error('Please enter an IPS name');
      return;
    }

    setIsSaving(true);
    
    try {
      const ipsData = {
        name: ipsName.trim(),
        description: ipsDescription.trim(),
        factors: enabledFactors,
        configurations: factorConfigurations,
        criteria: {
          // Extract some key criteria from configurations for quick access
          minIV: 40, // You could derive this from factor configurations
          maxDelta: 0.25,
          targetROI: 6,
          maxPositions: 3
        }
      };

      await onSave(ipsData);
    } catch (error) {
      console.error('Error saving IPS:', error);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto">
      {/* IPS Details Form */}
      <Card className="mb-8">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-blue-600" />
            IPS Details
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div>
            <Label htmlFor="ips-name">IPS Name *</Label>
            <Input
              id="ips-name"
              placeholder="e.g., Conservative PCS Strategy"
              value={ipsName}
              onChange={(e) => setIPSName(e.target.value)}
              className="mt-1"
            />
          </div>
          
          <div>
            <Label htmlFor="ips-description">Description</Label>
            <Textarea
              id="ips-description"
              placeholder="Describe your trading strategy and approach..."
              value={ipsDescription}
              onChange={(e) => setIPSDescription(e.target.value)}
              rows={3}
              className="mt-1"
            />
          </div>
        </CardContent>
      </Card>

      {/* Configuration Summary */}
      <Card className="mb-8">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CheckCircle className="h-5 w-5 text-green-600" />
            Configuration Summary
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
            {/* Overview Stats */}
            <div className="p-4 bg-blue-50 rounded-lg">
              <div className="flex items-center gap-2 mb-2">
                <Target className="h-4 w-4 text-blue-600" />
                <h4 className="font-medium text-blue-900">Factor Overview</h4>
              </div>
              <div className="space-y-1 text-sm">
                <div className="flex justify-between">
                  <span className="text-blue-700">Total Selected:</span>
                  <span className="font-medium">{selectedFactors.size}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-blue-700">Enabled:</span>
                  <span className="font-medium">{enabledFactors.length}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-blue-700">Total Weight:</span>
                  <span className="font-medium">{totalWeight}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-blue-700">Avg Weight:</span>
                  <span className="font-medium">{avgWeight.toFixed(1)}</span>
                </div>
              </div>
            </div>

            {/* Factor Breakdown */}
            <div className="p-4 bg-green-50 rounded-lg">
              <div className="flex items-center gap-2 mb-2">
                <BarChart3 className="h-4 w-4 text-green-600" />
                <h4 className="font-medium text-green-900">Factor Breakdown</h4>
              </div>
              <div className="space-y-1 text-sm">
                <div className="flex justify-between">
                  <span className="text-green-700">Quantitative:</span>
                  <span className="font-medium">{getFactorsByType('quantitative').length}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-green-700">Qualitative:</span>
                  <span className="font-medium">{getFactorsByType('qualitative').length}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-green-700">Options:</span>
                  <span className="font-medium">{getFactorsByType('options').length}</span>
                </div>
              </div>
            </div>

            {/* Weight Distribution */}
            <div className="p-4 bg-purple-50 rounded-lg">
              <div className="flex items-center gap-2 mb-2">
                <Shield className="h-4 w-4 text-purple-600" />
                <h4 className="font-medium text-purple-900">Weight Distribution</h4>
              </div>
              <div className="space-y-1 text-sm">
                <div className="flex justify-between">
                  <span className="text-purple-700">Highest Weight:</span>
                  <span className="font-medium">
                    {Math.max(...Object.values(factorConfigurations)
                      .filter((config: any) => config.enabled)
                      .map((config: any) => config.weight)
                    ) || 0}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-purple-700">Lowest Weight:</span>
                  <span className="font-medium">
                    {Math.min(...Object.values(factorConfigurations)
                      .filter((config: any) => config.enabled)
                      .map((config: any) => config.weight)
                    ) || 0}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-purple-700">Balanced:</span>
                  <span className="font-medium">
                    {totalWeight > 0 && totalWeight <= enabledFactors.length * 10 ? 'Yes' : 'Review'}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Factor List */}
          <div>
            <h4 className="font-medium text-gray-900 mb-3">Enabled Factors ({enabledFactors.length})</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {enabledFactors.map((factorName) => {
                const config = factorConfigurations[factorName];
                return (
                  <div 
                    key={factorName}
                    className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
                  >
                    <div>
                      <span className="text-sm font-medium">{factorName}</span>
                      <div className="flex items-center gap-2 mt-1">
                        <Badge 
                          variant="outline" 
                          className={`text-xs ${
                            config.type === 'quantitative' ? 'border-blue-200 text-blue-700' :
                            config.type === 'qualitative' ? 'border-green-200 text-green-700' :
                            'border-purple-200 text-purple-700'
                          }`}
                        >
                          {config.type}
                        </Badge>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-medium">Weight: {config.weight}</div>
                      <div className="text-xs text-gray-500">
                        {config.targetOperator} {config.targetValue}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Validation & Warnings */}
      <Card className="mb-8">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-yellow-600" />
            Validation & Recommendations
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {/* Weight Balance Check */}
            {totalWeight > enabledFactors.length * 10 && (
              <div className="flex items-center gap-2 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                <div className="h-2 w-2 bg-yellow-500 rounded-full" />
                <span className="text-sm text-yellow-800">
                  <strong>High total weight detected:</strong> Consider reducing some factor weights for better balance.
                </span>
              </div>
            )}

            {/* Factor Count Check */}
            {enabledFactors.length < 3 && (
              <div className="flex items-center gap-2 p-3 bg-orange-50 border border-orange-200 rounded-lg">
                <div className="h-2 w-2 bg-orange-500 rounded-full" />
                <span className="text-sm text-orange-800">
                  <strong>Few factors enabled:</strong> Consider adding more factors for comprehensive analysis.
                </span>
              </div>
            )}

            {/* Type Balance Check */}
            {getFactorsByType('quantitative').length === 0 && (
              <div className="flex items-center gap-2 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                <div className="h-2 w-2 bg-blue-500 rounded-full" />
                <span className="text-sm text-blue-800">
                  <strong>No quantitative factors:</strong> Consider adding financial metrics for data-driven decisions.
                </span>
              </div>
            )}

            {/* Success State */}
            {enabledFactors.length >= 5 && totalWeight <= enabledFactors.length * 8 && (
              <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-lg">
                <CheckCircle className="h-4 w-4 text-green-600" />
                <span className="text-sm text-green-800">
                  <strong>Configuration looks good!</strong> Your IPS is well-balanced and ready to use.
                </span>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Action Buttons */}
      <div className="flex items-center justify-between">
        <Button variant="outline" onClick={onBack}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Configuration
        </Button>
        
        <div className="flex gap-3">
          <Button variant="outline" disabled={isSaving}>
            Save as Draft
          </Button>
          <Button 
            className="bg-blue-600 hover:bg-blue-700"
            disabled={!ipsName.trim() || enabledFactors.length === 0 || isSaving}
            onClick={handleSave}
          >
            {isSaving ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2" />
                {isEditing ? 'Updating...' : 'Creating...'}
              </>
            ) : (
              <>
                <Save className="h-4 w-4 mr-2" />
                {isEditing ? 'Update IPS' : 'Create IPS'}
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}