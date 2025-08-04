/**
 * IPS Summary Component
 * Copy this into: src/components/ips/ips-summary.tsx
 */

import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { 
  Save, 
  Download, 
  FileText, 
  Code, 
  Eye,
  Calculator,
  Users,
  TrendingUp,
  Target,
  Weight,
  Check
} from 'lucide-react';

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

interface IPSSummaryProps {
  selectedFactors: Set<string>;
  factorConfigurations: Record<string, FactorConfiguration>;
  ipsConfig: any;
  onSave: (ipsData: any) => void;
  onBack: () => void;
}

export function IPSSummary({
  selectedFactors,
  factorConfigurations,
  ipsConfig,
  onSave,
  onBack
}: IPSSummaryProps) {
  const [ipsName, setIpsName] = useState(ipsConfig?.name || 'My Trading IPS');
  const [ipsDescription, setIpsDescription] = useState(ipsConfig?.description || '');
  const [isSaving, setIsSaving] = useState(false);
  const [isSaved, setIsSaved] = useState(false);

  const getFactorsByType = (type: string) => {
    return Array.from(selectedFactors)
      .filter(factorName => factorConfigurations[factorName]?.type === type && factorConfigurations[factorName]?.enabled)
      .map(factorName => ({ name: factorName, ...factorConfigurations[factorName] }));
  };

  const getTotalWeight = () => {
    return Object.values(factorConfigurations)
      .filter(config => config.enabled)
      .reduce((sum, config) => sum + config.weight, 0);
  };

  const getWeightedScore = () => {
    const enabledFactors = Object.values(factorConfigurations).filter(c => c.enabled);
    return enabledFactors.length > 0 ? getTotalWeight() / enabledFactors.length : 0;
  };

  const formatTargetCriteria = (factor: FactorConfiguration) => {
    if (factor.type === 'qualitative') {
      const ratings = { 1: 'Poor', 2: 'Below Average', 3: 'Average', 4: 'Good', 5: 'Excellent' };
      return `Minimum ${ratings[factor.targetValue as keyof typeof ratings]} (${factor.targetValue}/5)`;
    }
    
    switch (factor.targetOperator) {
      case 'gte':
        return `≥ ${factor.targetValue}`;
      case 'lte':
        return `≤ ${factor.targetValue}`;
      case 'eq':
        return `= ${factor.targetValue}`;
      case 'range':
        return `${factor.targetValue} - ${factor.targetValueMax}`;
      default:
        return factor.targetValue;
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await onSave({
        name: ipsName,
        description: ipsDescription,
        strategyType: 'dynamic_factors'
      });
      setIsSaved(true);
      setTimeout(() => setIsSaved(false), 3000);
    } catch (error) {
      console.error('Error saving IPS:', error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleExportJSON = () => {
    const exportData = {
      name: ipsName,
      description: ipsDescription,
      factors: factorConfigurations,
      selectedFactors: Array.from(selectedFactors),
      exportedAt: new Date().toISOString(),
      version: '1.0'
    };
    
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${ipsName.replace(/\s+/g, '_')}_IPS.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const renderFactorSummary = (factors: any[], title: string, icon: React.ReactNode, colorClass: string) => (
    <Card className={`border-l-4 ${colorClass}`}>
      <CardHeader className="pb-4">
        <CardTitle className="flex items-center gap-2 text-lg">
          {icon}
          {title}
          <Badge variant="secondary">{factors.length} factors</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {factors.map((factor) => (
            <div key={factor.name} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
              <div className="flex-1">
                <h4 className="font-medium text-sm">{factor.name}</h4>
                <p className="text-xs text-gray-600">{factor.category}</p>
                <p className="text-xs text-blue-600 mt-1">
                  Target: {formatTargetCriteria(factor)}
                </p>
              </div>
              <div className="text-right">
                <div className="flex items-center gap-2">
                  <Weight className="h-3 w-3 text-gray-400" />
                  <Badge variant="outline" className="text-xs font-mono">
                    {factor.weight}/10
                  </Badge>
                </div>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );

  return (
    <div className="max-w-6xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">IPS Summary</h1>
        <p className="text-gray-600">
          Review your Investment Policy Statement and export for use
        </p>
      </div>

      {/* IPS Header Information */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Investment Policy Statement Details
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="ips-name">IPS Name</Label>
              <Input
                id="ips-name"
                value={ipsName}
                onChange={(e) => setIpsName(e.target.value)}
                placeholder="Enter IPS name"
              />
            </div>
            <div>
              <Label htmlFor="created-date">Created Date</Label>
              <Input
                id="created-date"
                value={new Date().toISOString().split('T')[0]}
                readOnly
                className="bg-gray-50"
              />
            </div>
          </div>
          <div>
            <Label htmlFor="ips-description">Description (Optional)</Label>
            <Textarea
              id="ips-description"
              value={ipsDescription}
              onChange={(e) => setIpsDescription(e.target.value)}
              placeholder="Add a description of your investment strategy and objectives..."
              rows={3}
            />
          </div>
        </CardContent>
      </Card>

      {/* Summary Statistics */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <Card>
          <CardContent className="pt-6 text-center">
            <div className="text-2xl font-bold text-blue-600">
              {selectedFactors.size}
            </div>
            <p className="text-sm text-muted-foreground">Total Factors</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 text-center">
            <div className="text-2xl font-bold text-green-600">
              {Object.values(factorConfigurations).filter(c => c.enabled).length}
            </div>
            <p className="text-sm text-muted-foreground">Active Factors</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 text-center">
            <div className="text-2xl font-bold text-purple-600">
              {getTotalWeight()}
            </div>
            <p className="text-sm text-muted-foreground">Total Weight</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 text-center">
            <div className="text-2xl font-bold text-orange-600">
              {getWeightedScore().toFixed(1)}
            </div>
            <p className="text-sm text-muted-foreground">Avg Weight</p>
          </CardContent>
        </Card>
      </div>

      {/* Factor Categories */}
      <div className="space-y-6">
        {renderFactorSummary(
          getFactorsByType('quantitative'),
          'Quantitative Factors',
          <Calculator className="h-5 w-5" />,
          'border-l-blue-500'
        )}
        
        {renderFactorSummary(
          getFactorsByType('qualitative'),
          'Qualitative Factors',
          <Users className="h-5 w-5" />,
          'border-l-green-500'
        )}
        
        {renderFactorSummary(
          getFactorsByType('options'),
          'Options Factors',
          <TrendingUp className="h-5 w-5" />,
          'border-l-purple-500'
        )}
      </div>

      {/* Scoring Methodology */}
      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Target className="h-5 w-5" />
            Scoring Methodology
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="bg-blue-50 p-4 rounded-lg">
            <h4 className="font-medium mb-2">How Trade Scoring Works:</h4>
            <ul className="text-sm space-y-1 text-gray-700">
              <li>• Each factor gets scored 0-100 based on how well it meets your target criteria</li>
              <li>• Factor scores are multiplied by their importance weights (1-10)</li>
              <li>• Final trade score = Sum of (Factor Score × Weight) ÷ Total Weight</li>
              <li>• Trades scoring 70+ are considered strong matches to your IPS</li>
            </ul>
          </div>
        </CardContent>
      </Card>

      {/* Action Buttons */}
      <div className="flex items-center justify-between mt-8 pt-6 border-t">
        <div className="flex gap-3">
          <Button variant="outline" onClick={handleExportJSON}>
            <Code className="h-4 w-4 mr-2" />
            Export JSON
          </Button>
          <Button variant="outline" onClick={() => alert('PDF export coming soon!')}>
            <FileText className="h-4 w-4 mr-2" />
            Export PDF
          </Button>
        </div>
        
        <div className="flex gap-3">
          <Button variant="outline" onClick={onBack}>
            Back to Configuration
          </Button>
          <Button 
            onClick={handleSave}
            disabled={isSaving}
            className="bg-green-600 hover:bg-green-700"
          >
            {isSaving ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                Saving...
              </>
            ) : isSaved ? (
              <>
                <Check className="h-4 w-4 mr-2" />
                Saved!
              </>
            ) : (
              <>
                <Save className="h-4 w-4 mr-2" />
                Save IPS
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}