/**
 * Trade Score Display Component
 * Copy this into: src/components/ips/trade-score-display.tsx
 */

import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  TrendingUp, 
  TrendingDown, 
  Target, 
  AlertCircle, 
  CheckCircle, 
  XCircle,
  Eye,
  BarChart3,
  Calculator,
  Users,
  ChevronDown,
  ChevronRight,
  ArrowLeft
} from 'lucide-react';

// Mock scoring data - would come from the TradeScorer
const SAMPLE_SCORE_DATA = {
  symbol: "AAPL",
  finalScore: 76.8,
  grade: "B",
  compliance: "Good",
  factorScores: {
    "Revenue": 95,
    "P/E Ratio": 85,
    "Revenue Growth": 54,
    "Leadership Track Record": 100,
    "Implied Volatility (IV)": 85
  },
  factorDetails: {
    "Revenue": {
      score: 95,
      weight: 8,
      weightedScore: 760,
      value: "394328000000",
      target: "≥ 1000000000",
      met: true,
      type: "quantitative",
      category: "Income Statement"
    },
    "P/E Ratio": {
      score: 85,
      weight: 7,
      weightedScore: 595,
      value: "25.5",
      target: "15 - 30",
      met: true,
      type: "quantitative",
      category: "Valuation"
    },
    "Revenue Growth": {
      score: 54,
      weight: 9,
      weightedScore: 486,
      value: "8.2",
      target: "≥ 15",
      met: false,
      type: "quantitative",
      category: "Growth"
    },
    "Leadership Track Record": {
      score: 100,
      weight: 6,
      weightedScore: 600,
      value: 5,
      target: "Minimum Good (4/5)",
      met: true,
      type: "qualitative",
      category: "Management & Governance"
    },
    "Implied Volatility (IV)": {
      score: 85,
      weight: 7,
      weightedScore: 595,
      value: "35.2",
      target: "≥ 30",
      met: true,
      type: "options",
      category: "Options Metrics"
    }
  },
  summary: {
    totalFactors: 5,
    scoredFactors: 5,
    missingFactors: 0,
    targetsMet: 4,
    totalWeightedScore: 3036,
    totalAvailableWeight: 37,
    weightCoverage: 1.0
  }
};

interface TradeScoreDisplayProps {
  onBack: () => void;
}

export function TradeScoreDisplay({ onBack }: TradeScoreDisplayProps) {
  const [expandedFactors, setExpandedFactors] = useState(new Set<string>());
  const [activeTab, setActiveTab] = useState("overview");

  const scoreData = SAMPLE_SCORE_DATA;

  const toggleFactorExpansion = (factorName: string) => {
    const newExpanded = new Set(expandedFactors);
    if (newExpanded.has(factorName)) {
      newExpanded.delete(factorName);
    } else {
      newExpanded.add(factorName);
    }
    setExpandedFactors(newExpanded);
  };

  const getScoreColor = (score: number) => {
    if (score >= 85) return "text-green-600";
    if (score >= 75) return "text-blue-600";
    if (score >= 65) return "text-yellow-600";
    if (score >= 50) return "text-orange-600";
    return "text-red-600";
  };

  const getScoreIcon = (met: boolean) => {
    return met ? (
      <CheckCircle className="h-4 w-4 text-green-600" />
    ) : (
      <XCircle className="h-4 w-4 text-red-600" />
    );
  };

  const getGradeBadgeColor = (grade: string) => {
    const colors = {
      'A': 'bg-green-100 text-green-800 border-green-200',
      'B': 'bg-blue-100 text-blue-800 border-blue-200', 
      'C': 'bg-yellow-100 text-yellow-800 border-yellow-200',
      'D': 'bg-orange-100 text-orange-800 border-orange-200',
      'F': 'bg-red-100 text-red-800 border-red-200'
    };
    return colors[grade as keyof typeof colors] || colors['F'];
  };

  const formatValue = (value: any, type: string) => {
    if (type === 'qualitative') {
      const ratings = { 1: 'Poor', 2: 'Below Avg', 3: 'Average', 4: 'Good', 5: 'Excellent' };
      return `${ratings[value as keyof typeof ratings]} (${value}/5)`;
    }
    
    const num = parseFloat(value);
    if (num >= 1000000000) {
      return `$${(num / 1000000000).toFixed(1)}B`;
    } else if (num >= 1000000) {
      return `$${(num / 1000000).toFixed(1)}M`;
    } else if (num >= 1000) {
      return `$${(num / 1000).toFixed(1)}K`;
    }
    return value;
  };

  const getFactorsByType = (type: string) => {
    return Object.entries(scoreData.factorDetails)
      .filter(([_, details]) => details.type === type)
      .map(([name, details]) => ({ name, ...details }));
  };

  const renderFactorCard = (factorName: string, details: any) => {
    const isExpanded = expandedFactors.has(factorName);
    
    return (
      <Card key={factorName} className="border-l-4 border-l-blue-500">
        <CardContent className="p-4">
          <div 
            className="flex items-center justify-between cursor-pointer"
            onClick={() => toggleFactorExpansion(factorName)}
          >
            <div className="flex items-center gap-3 flex-1">
              {getScoreIcon(details.met)}
              <div className="flex-1">
                <h4 className="font-medium text-sm">{factorName}</h4>
                <p className="text-xs text-gray-500">{details.category}</p>
              </div>
              <div className="text-right">
                <div className={`text-lg font-bold ${getScoreColor(details.score)}`}>
                  {details.score}
                </div>
                <div className="text-xs text-gray-500">Weight: {details.weight}</div>
              </div>
            </div>
            {isExpanded ? (
              <ChevronDown className="h-4 w-4 text-gray-400 ml-2" />
            ) : (
              <ChevronRight className="h-4 w-4 text-gray-400 ml-2" />
            )}
          </div>
          
          {isExpanded && (
            <div className="mt-4 pt-4 border-t space-y-3">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-gray-600">Current Value:</span>
                  <div className="font-medium">
                    {formatValue(details.value, details.type)}
                  </div>
                </div>
                <div>
                  <span className="text-gray-600">Target:</span>
                  <div className="font-medium">{details.target}</div>
                </div>
                <div>
                  <span className="text-gray-600">Score:</span>
                  <div className={`font-medium ${getScoreColor(details.score)}`}>
                    {details.score}/100
                  </div>
                </div>
                <div>
                  <span className="text-gray-600">Weighted Score:</span>
                  <div className="font-medium">{details.weightedScore}</div>
                </div>
              </div>
              
              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span>Score Progress</span>
                  <span>{details.score}%</span>
                </div>
                <Progress value={details.score} className="h-2" />
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="max-w-6xl mx-auto">
      {/* Back Button */}
      <div className="mb-6">
        <Button variant="outline" onClick={onBack}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to IPS Overview
        </Button>
      </div>

      {/* Header with Overall Score */}
      <Card className="mb-6 bg-gradient-to-r from-blue-50 to-purple-50 border-blue-200">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-2xl font-bold text-gray-900">
                {scoreData.symbol} - IPS Compliance Score
              </CardTitle>
              <p className="text-gray-600 mt-1">
                Trade alignment with your Investment Policy Statement
              </p>
            </div>
            <div className="text-right">
              <div className="text-4xl font-bold text-blue-600 mb-1">
                {scoreData.finalScore}
              </div>
              <Badge className={`${getGradeBadgeColor(scoreData.grade)} border text-sm`}>
                Grade {scoreData.grade}
              </Badge>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="text-center">
              <div className="text-xl font-bold text-green-600">
                {scoreData.summary.targetsMet}/{scoreData.summary.totalFactors}
              </div>
              <p className="text-xs text-gray-600">Targets Met</p>
            </div>
            <div className="text-center">
              <div className="text-xl font-bold text-blue-600">
                {scoreData.compliance}
              </div>
              <p className="text-xs text-gray-600">Compliance Level</p>
            </div>
            <div className="text-center">
              <div className="text-xl font-bold text-purple-600">
                {scoreData.summary.totalAvailableWeight}
              </div>
              <p className="text-xs text-gray-600">Total Weight</p>
            </div>
            <div className="text-center">
              <div className="text-xl font-bold text-orange-600">
                {(scoreData.summary.weightCoverage * 100).toFixed(0)}%
              </div>
              <p className="text-xs text-gray-600">Data Coverage</p>
            </div>
          </div>
          
          <div className="mt-4">
            <div className="flex justify-between text-sm mb-2">
              <span>Overall IPS Compliance</span>
              <span>{scoreData.finalScore}/100</span>
            </div>
            <Progress value={scoreData.finalScore} className="h-3" />
          </div>
        </CardContent>
      </Card>

      {/* Detailed Factor Analysis */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="quantitative" className="flex items-center gap-2">
            <Calculator className="h-4 w-4" />
            Quantitative
          </TabsTrigger>
          <TabsTrigger value="qualitative" className="flex items-center gap-2">
            <Users className="h-4 w-4" />
            Qualitative
          </TabsTrigger>
          <TabsTrigger value="options" className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4" />
            Options
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-6">
          <div className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <BarChart3 className="h-5 w-5" />
                  Score Breakdown
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {Object.entries(scoreData.factorDetails)
                    .sort(([,a], [,b]) => b.weightedScore - a.weightedScore)
                    .map(([factorName, details]) => (
                      <div key={factorName} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                        <div className="flex items-center gap-3">
                          {getScoreIcon(details.met)}
                          <div>
                            <div className="font-medium text-sm">{factorName}</div>
                            <div className="text-xs text-gray-500">
                              Weight: {details.weight} | Category: {details.category}
                            </div>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className={`font-bold ${getScoreColor(details.score)}`}>
                            {details.score}/100
                          </div>
                          <div className="text-xs text-gray-500">
                            Weighted: {details.weightedScore}
                          </div>
                        </div>
                      </div>
                    ))}
                </div>
              </CardContent>
            </Card>

            {scoreData.summary.targetsMet < scoreData.summary.totalFactors && (
              <Card className="border-orange-200 bg-orange-50">
                <CardContent className="pt-6">
                  <div className="flex items-start gap-3">
                    <AlertCircle className="h-5 w-5 text-orange-600 mt-0.5" />
                    <div>
                      <h4 className="font-medium text-orange-900">Areas for Improvement</h4>
                      <p className="text-sm text-orange-800 mt-1">
                        {scoreData.summary.totalFactors - scoreData.summary.targetsMet} factor(s) below target. 
                        Consider reviewing these criteria or finding alternative opportunities.
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>

        <TabsContent value="quantitative" className="mt-6">
          <div className="space-y-4">
            {getFactorsByType('quantitative').map(factor => 
              renderFactorCard(factor.name, factor)
            )}
          </div>
        </TabsContent>

        <TabsContent value="qualitative" className="mt-6">
          <div className="space-y-4">
            {getFactorsByType('qualitative').map(factor => 
              renderFactorCard(factor.name, factor)
            )}
          </div>
        </TabsContent>

        <TabsContent value="options" className="mt-6">
          <div className="space-y-4">
            {getFactorsByType('options').map(factor => 
              renderFactorCard(factor.name, factor)
            )}
          </div>
        </TabsContent>
      </Tabs>

      {/* Action Buttons */}
      <div className="flex items-center justify-between mt-8 pt-6 border-t">
        <div className="flex gap-3">
          <Button variant="outline">
            <Eye className="h-4 w-4 mr-2" />
            View IPS Details
          </Button>
          <Button variant="outline">
            <BarChart3 className="h-4 w-4 mr-2" />
            Compare Trades
          </Button>
        </div>
        
        <div className="flex gap-3">
          <Button variant="outline">
            Save Analysis
          </Button>
          <Button className="bg-blue-600 hover:bg-blue-700">
            {scoreData.finalScore >= 75 ? "Proceed with Trade" : "Review Trade"}
          </Button>
        </div>
      </div>
    </div>
  );
}