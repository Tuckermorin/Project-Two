// src/app/trades/page.tsx
"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  TrendingUp,
  Plus,
  List,
  ArrowLeft,
  Target,
  BarChart3,
  FileText,
  CheckCircle,
  AlertCircle,
  Database,
  Users,
  DollarSign,
  Calculator,
  RefreshCw,
  Wifi,
  WifiOff,
} from "lucide-react";

// Import existing services
import { ipsDataService, type IPSConfiguration, ALL_FACTORS } from "@/lib/services/ips-data-service";

// Types
interface TradeFormData {
  name: string;
  symbol: string;
  currentPrice: number;
  expirationDate: string;
  contractType: string;
  numberOfContracts: number;
  shortStrike: number;
  longStrike: number;
  creditReceived: number;
  ipsFactors: Record<string, any>;
  apiFactors: Record<string, any>;
}

type ViewType = "selection" | "entry" | "prospective" | "active";

export default function TradesPage() {
  const [currentView, setCurrentView] = useState<ViewType>("selection");
  const [selectedIPS, setSelectedIPS] = useState<IPSConfiguration | null>(null);
  const [activeIPSs, setActiveIPSs] = useState<IPSConfiguration[]>([]);
  const [calculatedScore, setCalculatedScore] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const userId = 'user-123'; // Replace with actual user ID from auth

  // Load IPS configurations on mount
  useEffect(() => {
    const loadIPSData = async () => {
      try {
        setIsLoading(true);
        const userIPSs = await ipsDataService.getAllUserIPSs(userId);
        const activeOnly = userIPSs.filter(ips => ips.is_active);
        setActiveIPSs(activeOnly);
      } catch (error) {
        console.error('Error loading IPS data:', error);
      } finally {
        setIsLoading(false);
      }
    };

    loadIPSData();
  }, [userId]);

  const handleIPSSelection = (ips: IPSConfiguration) => {
    setSelectedIPS(ips);
    setCurrentView("entry");
    setCalculatedScore(null);
  };

  const handleTradeSubmit = async (formData: TradeFormData) => {
    try {
      setIsLoading(true);

      // In a real implementation, you'd save to your database
      // For now, just simulate the save
      const tradeId = `trade-${Date.now()}`;
      
      console.log('Saving trade:', {
        tradeId,
        ipsId: selectedIPS?.id,
        formData,
        timestamp: new Date().toISOString()
      });

      // Simulate API delay
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      alert('Trade saved to prospective trades!');
      setCurrentView("prospective");
      
    } catch (error) {
      console.error("Error submitting trade:", error);
      alert("Error saving trade. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleCalculateScore = async (formData: TradeFormData) => {
    if (!selectedIPS) return;
    
    try {
      setIsLoading(true);

      // Combine all factor values
      const allFactors = {
        ...formData.apiFactors,
        ...formData.ipsFactors,
      };

      // Simple scoring algorithm (you can replace with your actual scoring logic)
      const factorValues = Object.values(allFactors).filter(v => v !== undefined && v !== '');
      const factorCount = Object.keys(allFactors).length;
      
      if (factorValues.length === 0) {
        throw new Error('No factor values available for scoring');
      }

      // Simulate score calculation delay
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      // Basic scoring: normalize qualitative factors (1-5) and quantitative factors
      const normalizedScores = factorValues.map(value => {
        if (typeof value === 'number') {
          if (value >= 1 && value <= 5) {
            // Qualitative factor (1-5 scale) -> convert to 0-100
            return (value - 1) * 25;
          } else {
            // Quantitative factor - apply basic normalization
            return Math.min(100, Math.max(0, value * 2 + 50));
          }
        }
        return 50; // Default for non-numeric
      });

      const averageScore = normalizedScores.reduce((sum, score) => sum + score, 0) / normalizedScores.length;
      
      // Add some randomization to make it realistic
      const finalScore = Math.min(100, Math.max(0, averageScore + (Math.random() - 0.5) * 10));
      
      setCalculatedScore(finalScore);
      
    } catch (error) {
      console.error("Error calculating score:", error);
      alert("Error calculating IPS score. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading && currentView === "selection") {
    return (
      <div className="max-w-6xl mx-auto p-6">
        <div className="flex items-center justify-center py-12">
          <RefreshCw className="h-8 w-8 animate-spin text-blue-600" />
          <span className="ml-2 text-gray-600">Loading IPS configurations...</span>
        </div>
      </div>
    );
  }

  // IPS Selection View
  if (currentView === "selection") {
    return (
      <div className="max-w-6xl mx-auto p-6">
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2">Select Investment Performance System</h1>
          <p className="text-gray-600">
            Choose an IPS configuration to build your trade upon
          </p>
        </div>

        {activeIPSs.length === 0 ? (
          <Card>
            <CardContent className="text-center py-12">
              <Target className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">No Active IPS Configurations</h3>
              <p className="text-gray-600 mb-6">Create an IPS configuration first to start trading</p>
              <Button onClick={() => window.location.href = '/ips'}>
                <Plus className="h-4 w-4 mr-2" />
                Create IPS Configuration
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {activeIPSs.map((ips) => {
              // Get factor breakdown using actual factor definitions
              const ipsFactorNames = ips.strategies.flatMap(strategyId => {
                const strategy = ipsDataService.getAvailableStrategies().find(s => s.id === strategyId);
                return strategy?.recommendedFactors || [];
              });
              
              const uniqueFactors = [...new Set(ipsFactorNames)];
              
              const apiFactors = ALL_FACTORS.filter(f => 
                uniqueFactors.includes(f.name) && f.source === 'alpha_vantage'
              );
              
              const manualFactors = ALL_FACTORS.filter(f => 
                uniqueFactors.includes(f.name) && !f.source
              );

              return (
                <Card
                  key={ips.id}
                  className="cursor-pointer hover:shadow-lg transition-shadow"
                >
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-lg">{ips.name}</CardTitle>
                      <Badge variant="outline" className="bg-green-50 text-green-700">
                        Active
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <p className="text-sm text-gray-600">{ips.description}</p>

                    <div className="space-y-2 text-sm">
                      <div className="flex items-center justify-between">
                        <span className="text-gray-600">Strategies:</span>
                        <span className="font-medium">{ips.strategies.length}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-gray-600">Factors:</span>
                        <div className="flex items-center gap-3">
                          <div className="flex items-center gap-1">
                            <Database className="h-3 w-3 text-blue-600" />
                            <span className="font-medium">{apiFactors.length} API</span>
                          </div>
                          <div className="flex items-center gap-1">
                            <Users className="h-3 w-3 text-orange-600" />
                            <span className="font-medium">{manualFactors.length} Manual</span>
                          </div>
                        </div>
                      </div>
                    </div>

                    {ips.performance && (
                      <div className="pt-3 border-t">
                        <div className="grid grid-cols-3 gap-2 text-xs">
                          <div className="text-center">
                            <div className="font-medium text-green-600">
                              {ips.performance.winRate}%
                            </div>
                            <div className="text-gray-500">Win Rate</div>
                          </div>
                          <div className="text-center">
                            <div className="font-medium text-blue-600">
                              {ips.performance.avgROI}%
                            </div>
                            <div className="text-gray-500">Avg ROI</div>
                          </div>
                          <div className="text-center">
                            <div className="font-medium text-gray-700">
                              {ips.performance.totalTrades}
                            </div>
                            <div className="text-gray-500">Trades</div>
                          </div>
                        </div>
                      </div>
                    )}

                    <Button onClick={() => handleIPSSelection(ips)} className="w-full mt-4">
                      Select This IPS
                    </Button>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  // Trade Entry View
  if (currentView === "entry" && selectedIPS) {
    return (
      <div className="max-w-6xl mx-auto p-6">
        <div className="mb-6 flex items-center gap-4">
          <Button
            variant="outline"
            onClick={() => setCurrentView("selection")}
            className="flex items-center gap-2"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to IPS Selection
          </Button>
          <div>
            <h1 className="text-3xl font-bold">New Trade Entry</h1>
            <p className="text-gray-600">IPS: {selectedIPS.name}</p>
          </div>
        </div>

        <EnhancedTradeEntryForm
          selectedIPS={selectedIPS}
          onSubmit={handleTradeSubmit}
          onCalculateScore={handleCalculateScore}
          onCancel={() => setCurrentView("selection")}
          isLoading={isLoading}
          calculatedScore={calculatedScore}
        />
      </div>
    );
  }

  // Prospective Trades View
  if (currentView === "prospective") {
    return (
      <div className="max-w-6xl mx-auto p-6">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Prospective Trades</h1>
            <p className="text-gray-600">Review and manage trades before execution</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setCurrentView("selection")}>
              <Plus className="h-4 w-4 mr-2" />
              New Trade
            </Button>
            <Button variant="outline" onClick={() => setCurrentView("active")}>
              View Active Trades
            </Button>
          </div>
        </div>

        <div className="space-y-6">
          {/* Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2">
                  <FileText className="h-5 w-5 text-blue-600" />
                  <div>
                    <div className="text-2xl font-bold">0</div>
                    <div className="text-sm text-gray-600">Pending</div>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2">
                  <Target className="h-5 w-5 text-green-600" />
                  <div>
                    <div className="text-2xl font-bold">$0</div>
                    <div className="text-sm text-gray-600">Potential Credit</div>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2">
                  <BarChart3 className="h-5 w-5 text-purple-600" />
                  <div>
                    <div className="text-2xl font-bold">0</div>
                    <div className="text-sm text-gray-600">Avg Score</div>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2">
                  <TrendingUp className="h-5 w-5 text-orange-600" />
                  <div>
                    <div className="text-2xl font-bold">0%</div>
                    <div className="text-sm text-gray-600">Win Rate</div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Prospective Trades Table */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Pending Trades
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-center py-12">
                <TrendingUp className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">
                  No prospective trades
                </h3>
                <p className="text-gray-600 mb-6">
                  Create your first trade using an IPS configuration
                </p>
                <Button onClick={() => setCurrentView("selection")}>
                  <Plus className="h-4 w-4 mr-2" />
                  Create New Trade
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  // Active Trades View
  if (currentView === "active") {
    return (
      <div className="max-w-6xl mx-auto p-6">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Active Trades</h1>
            <p className="text-gray-600">Monitor your current positions</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setCurrentView("selection")}>
              <Plus className="h-4 w-4 mr-2" />
              New Trade
            </Button>
            <Button variant="outline" onClick={() => setCurrentView("prospective")}>
              View Prospective
            </Button>
          </div>
        </div>

        <div className="space-y-6">
          {/* Portfolio Summary */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2">
                  <List className="h-5 w-5 text-blue-600" />
                  <div>
                    <div className="text-2xl font-bold">0</div>
                    <div className="text-sm text-gray-600">Active Positions</div>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2">
                  <DollarSign className="h-5 w-5 text-green-600" />
                  <div>
                    <div className="text-2xl font-bold">$0</div>
                    <div className="text-sm text-gray-600">Total P&L</div>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2">
                  <Target className="h-5 w-5 text-purple-600" />
                  <div>
                    <div className="text-2xl font-bold">$0</div>
                    <div className="text-sm text-gray-600">Buying Power Used</div>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2">
                  <BarChart3 className="h-5 w-5 text-orange-600" />
                  <div>
                    <div className="text-2xl font-bold">0</div>
                    <div className="text-sm text-gray-600">Portfolio Delta</div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Active Trades Table */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <List className="h-5 w-5" />
                Current Positions
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-center py-12">
                <BarChart3 className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">
                  No active trades
                </h3>
                <p className="text-gray-600 mb-6">
                  Your executed trades will appear here with real-time P&L tracking
                </p>
                <Button onClick={() => setCurrentView("selection")}>
                  <Plus className="h-4 w-4 mr-2" />
                  Create New Trade
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return null;
}

// Enhanced Trade Entry Form Component
interface EnhancedTradeEntryFormProps {
  selectedIPS: IPSConfiguration;
  onSubmit: (formData: TradeFormData) => void;
  onCalculateScore: (formData: TradeFormData) => void;
  onCancel: () => void;
  isLoading: boolean;
  calculatedScore: number | null;
}

function EnhancedTradeEntryForm({
  selectedIPS,
  onSubmit,
  onCalculateScore,
  onCancel,
  isLoading,
  calculatedScore,
}: EnhancedTradeEntryFormProps) {
  const [formData, setFormData] = useState<TradeFormData>({
    name: "",
    symbol: "",
    currentPrice: 0,
    expirationDate: "",
    contractType: "put-credit-spread",
    numberOfContracts: 1,
    shortStrike: 0,
    longStrike: 0,
    creditReceived: 0,
    ipsFactors: {},
    apiFactors: {},
  });

  const [apiStatus, setApiStatus] = useState<"connected" | "disconnected" | "loading">("connected");
  const [completionScore, setCompletionScore] = useState(0);
  const [localCalculatedScore, setLocalCalculatedScore] = useState<number | null>(calculatedScore);

  // Get factors for this IPS using the actual service
  const getIPSFactors = () => {
    const strategies = ipsDataService.getAvailableStrategies();
    const ipsStrategies = strategies.filter(s => selectedIPS.strategies.includes(s.id));
    
    const allFactorNames = new Set<string>();
    ipsStrategies.forEach(strategy => {
      strategy.recommendedFactors.forEach(factor => allFactorNames.add(factor));
    });
    
    return Array.from(allFactorNames);
  };

  const getAPIFactors = (): string[] => {
    const allFactors = getIPSFactors();
    return ALL_FACTORS
      .filter(f => allFactors.includes(f.name) && f.source === 'alpha_vantage')
      .map(f => f.name);
  };

  const getManualFactors = (): string[] => {
    const allFactors = getIPSFactors();
    return ALL_FACTORS
      .filter(f => allFactors.includes(f.name) && !f.source)
      .map(f => f.name);
  };

    useEffect(() => {
    setLocalCalculatedScore(calculatedScore);
  }, [calculatedScore]);

  // Load API factors when symbol changes
  useEffect(() => {
    if (formData.symbol && formData.symbol.length >= 2) {
      loadAPIFactors(formData.symbol, selectedIPS.id);
    }
  }, [formData.symbol, selectedIPS.id]);

  // Calculate completion score
  useEffect(() => {
    const requiredFields = [
      "name", "symbol", "currentPrice", "expirationDate", 
      "numberOfContracts", "shortStrike", "longStrike", "creditReceived"
    ];
    const manualFactors = getManualFactors();

    const completedFields = requiredFields.filter((field) => {
      const value = formData[field as keyof TradeFormData];
      return value !== "" && value !== 0;
    }).length;

    const completedFactors = manualFactors.filter(
      (factor) => formData.ipsFactors[factor] !== undefined && formData.ipsFactors[factor] !== ""
    ).length;

    const totalRequired = requiredFields.length + manualFactors.length;
    const totalCompleted = completedFields + completedFactors;

    setCompletionScore(totalRequired ? (totalCompleted / totalRequired) * 100 : 0);
  }, [formData]);

  const loadAPIFactors = async (symbol: string, ipsId: string) => {
    setApiStatus("loading");
    try {
      const response = await fetch(`/api/trades/factors?symbol=${symbol}&ipsId=${ipsId}`);
      const data = await response.json();
      
      if (data.success && Object.keys(data.data.factors).length > 0) {
        // Convert factor objects back to simple values for the form
        const factorValues: Record<string, number> = {};
        Object.entries(data.data.factors).forEach(([name, factorData]: [string, any]) => {
          factorValues[name] = factorData.value;
        });
        
        setFormData(prev => ({ ...prev, apiFactors: factorValues }));
        setApiStatus('connected');
      } else {
        // API failed or no data - user must enter manually
        setApiStatus('disconnected');
      }
    } catch (error) {
      console.error("API Error:", error);
      setApiStatus("disconnected");
      // User can still complete trade manually
    }
  };

  const handleInputChange = (field: keyof TradeFormData, value: any) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleFactorChange = (factorName: string, value: any) => {
    setFormData((prev) => ({
      ...prev,
      ipsFactors: { ...prev.ipsFactors, [factorName]: value },
    }));
  };

  const handleAPIFactorOverride = (factorName: string, value: any) => {
    setFormData((prev) => ({
      ...prev,
      apiFactors: { ...prev.apiFactors, [factorName]: value },
    }));
  };

  const isFormValid = () => {
    const requiredFields = [
      "name", "symbol", "currentPrice", "expirationDate",
      "numberOfContracts", "shortStrike", "longStrike", "creditReceived"
    ];
    const manualFactors = getManualFactors();

    const basicFieldsComplete = requiredFields.every((field) => {
      const value = formData[field as keyof TradeFormData];
      return value !== "" && value !== 0;
    });

    const factorsComplete = manualFactors.every(
      (factor) => formData.ipsFactors[factor] !== undefined && formData.ipsFactors[factor] !== ""
    );

    return basicFieldsComplete && factorsComplete;
  };

  return (
    <div className="space-y-6">
      {/* Progress Header */}
      <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
        <div className="flex items-center gap-4">
          <div className="text-sm text-gray-600">Progress:</div>
          <Progress value={completionScore} className="w-48" />
          <span className="text-sm font-medium">{Math.round(completionScore)}%</span>
        </div>
        <div className="flex items-center gap-4 text-sm">
          <div className="flex items-center gap-2">
            <Database className="h-4 w-4 text-blue-600" />
            <span>{getAPIFactors().length} API Factors</span>
            {apiStatus === "connected" && <Wifi className="h-3 w-3 text-green-600" />}
            {apiStatus === "disconnected" && <WifiOff className="h-3 w-3 text-red-600" />}
            {apiStatus === "loading" && <RefreshCw className="h-3 w-3 animate-spin text-blue-600" />}
          </div>
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-orange-600" />
            <span>{getManualFactors().length} Manual Factors</span>
          </div>
        </div>
      </div>

      {/* Basic Trade Details */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5" />
            Trade Details
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div>
              <Label htmlFor="expirationDate">Expiration Date</Label>
              <Input
                id="expirationDate"
                type="date"
                value={formData.expirationDate}
                onChange={(e) => handleInputChange("expirationDate", e.target.value)}
                min={new Date().toISOString().split("T")[0]}
              />
            </div>

            <div>
              <Label htmlFor="contractType">Contract Type</Label>
              <select
                id="contractType"
                value={formData.contractType}
                onChange={(e) => handleInputChange("contractType", e.target.value)}
                className="w-full p-2 border border-gray-300 rounded-md"
              >
                <option value="put-credit-spread">Put Credit Spread</option>
                <option value="call-credit-spread">Call Credit Spread</option>
                <option value="long-call">Long Call</option>
                <option value="long-put">Long Put</option>
                <option value="iron-condor">Iron Condor</option>
                <option value="covered-call">Covered Call</option>
              </select>
            </div>

            <div>
              <Label htmlFor="numberOfContracts">Number of Contracts</Label>
              <Input
                id="numberOfContracts"
                type="number"
                min={1}
                value={formData.numberOfContracts || ""}
                onChange={(e) => handleInputChange("numberOfContracts", parseInt(e.target.value) || 1)}
                placeholder="1"
              />
            </div>

            <div>
              <Label htmlFor="shortStrike">Short Strike</Label>
              <Input
                id="shortStrike"
                type="number"
                step="0.01"
                value={formData.shortStrike || ""}
                onChange={(e) => handleInputChange("shortStrike", parseFloat(e.target.value) || 0)}
                placeholder="145.00"
              />
            </div>

            <div>
              <Label htmlFor="longStrike">Long Strike</Label>
              <Input
                id="longStrike"
                type="number"
                step="0.01"
                value={formData.longStrike || ""}
                onChange={(e) => handleInputChange("longStrike", parseFloat(e.target.value) || 0)}
                placeholder="140.00"
              />
            </div>

            <div>
              <Label htmlFor="creditReceived">Premium Paid/Collected</Label>
              <Input
                id="creditReceived"
                type="number"
                step="0.01"
                value={formData.creditReceived || ""}
                onChange={(e) => handleInputChange("creditReceived", parseFloat(e.target.value) || 0)}
                placeholder="1.25"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* IPS Factors Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* API Factors */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Database className="h-5 w-5 text-blue-600" />
              API Factors ({getAPIFactors().length})
              <Badge variant="outline" className={`${
                apiStatus === "connected" ? "bg-green-50 text-green-700" : 
                apiStatus === "disconnected" ? "bg-red-50 text-red-700" : 
                "bg-yellow-50 text-yellow-700"
              }`}>
                {apiStatus === "connected" ? "Auto-populated" : 
                 apiStatus === "disconnected" ? "Manual Entry Required" : 
                 "Loading..."}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {apiStatus === "disconnected" && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
                <div className="flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 text-red-600" />
                  <span className="text-sm text-red-700">
                    API connection failed. Please enter values manually below.
                  </span>
                </div>
              </div>
            )}

            <div className="space-y-4">
              {getAPIFactors().map((factorName) => {
                const hasValue = formData.apiFactors[factorName] !== undefined;
                const value = formData.apiFactors[factorName];
                const factor = ALL_FACTORS.find(f => f.name === factorName);

                return (
                  <div
                    key={factorName}
                    className={`p-3 rounded-lg border ${
                      apiStatus === "connected" && hasValue
                        ? "bg-green-50 border-green-200"
                        : apiStatus === "loading"
                        ? "bg-yellow-50 border-yellow-200"
                        : "bg-gray-50 border-gray-200"
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div>
                        <Label className="font-medium text-sm">{factorName}</Label>
                        <div className="text-xs text-gray-500">{factor?.category || 'Financial'}</div>
                      </div>
                      <div className="flex items-center gap-2">
                        {apiStatus === "connected" && hasValue ? (
                          <>
                            <CheckCircle className="h-4 w-4 text-green-600" />
                            <span className="text-sm font-medium text-green-700">
                              {typeof value === "number" ? value.toFixed(2) : value}
                              <span className="text-xs ml-1">{factor?.unit || ''}</span>
                            </span>
                          </>
                        ) : apiStatus === "loading" ? (
                          <>
                            <RefreshCw className="h-4 w-4 animate-spin text-blue-600" />
                            <span className="text-sm text-blue-700">Loading...</span>
                          </>
                        ) : (
                          <span className="text-sm text-gray-600">
                            {apiStatus === "disconnected" ? "Manual input required" : "Will auto-populate"}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Manual input when API is down or for override */}
                    {(apiStatus === "disconnected" || !hasValue) && (
                      <Input
                        type="number"
                        step={factor?.data_type === 'percentage' ? "0.01" : "0.01"}
                        value={formData.apiFactors[factorName] ?? ""}
                        onChange={(e) => handleAPIFactorOverride(factorName, parseFloat(e.target.value) || "")}
                        placeholder={`Enter ${factorName.toLowerCase()}`}
                        className="mt-2"
                      />
                    )}
                  </div>
                );
              })}
            </div>

            {/* Refresh API Button */}
            {formData.symbol && (
              <div className="mt-4 pt-4 border-t">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => loadAPIFactors(formData.symbol, selectedIPS.id)}
                  disabled={apiStatus === "loading"}
                  className="w-full flex items-center gap-2"
                >
                  {apiStatus === "loading" ? (
                    <>
                      <RefreshCw className="h-4 w-4 animate-spin" />
                      Loading API Data...
                    </>
                  ) : (
                    <>
                      <Database className="h-4 w-4" />
                      Refresh API Data
                    </>
                  )}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Manual Factors */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5 text-orange-600" />
              Manual Input Required ({getManualFactors().length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {getManualFactors().map((factorName) => {
                const value = formData.ipsFactors[factorName];
                const hasValue = value !== undefined && value !== "";
                const factor = ALL_FACTORS.find(f => f.name === factorName);

                return (
                  <div key={factorName} className="space-y-2">
                    <div className="flex items-center gap-2">
                      <Label className="font-medium text-sm">{factorName}</Label>
                      {hasValue && <CheckCircle className="h-4 w-4 text-green-600" />}
                    </div>
                    <div className="text-xs text-gray-500 mb-1">{factor?.category || 'Management'}</div>
                    <select
                      value={value ?? ""}
                      onChange={(e) => handleFactorChange(factorName, parseInt(e.target.value))}
                      className={`w-full p-2 border rounded-md ${
                        hasValue ? "border-green-300 bg-green-50" : "border-gray-300"
                      }`}
                    >
                      <option value="">Select rating</option>
                      <option value="1">1 - Poor</option>
                      <option value="2">2 - Below Average</option>
                      <option value="3">3 - Average</option>
                      <option value="4">4 - Good</option>
                      <option value="5">5 - Excellent</option>
                    </select>
                    <div className="text-xs text-gray-500">
                      Rate this factor from 1 (poor) to 5 (excellent)
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Score Calculation and Actions */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calculator className="h-5 w-5" />
            IPS Score & Actions
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="font-medium">Calculate IPS Score</div>
              <div className="text-sm text-gray-600">
                {isFormValid() ? 
                  `Ready to calculate using ${getAPIFactors().length} API + ${getManualFactors().length} manual factors` : 
                  "Complete all fields to enable calculation"}
              </div>
            </div>
            <Button
              onClick={() => onCalculateScore(formData)}
              disabled={!isFormValid() || isLoading}
              className="flex items-center gap-2"
            >
              {isLoading ? (
                <>
                  <RefreshCw className="h-4 w-4 animate-spin" />
                  Calculating...
                </>
              ) : (
                <>
                  <Calculator className="h-4 w-4" />
                  Calculate Score
                </>
              )}
            </Button>
          </div>

          {calculatedScore !== null && (
            <div className="p-4 bg-gradient-to-r from-blue-50 to-purple-50 rounded-lg border border-blue-200">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-xl font-bold text-blue-900">
                    IPS Score: {calculatedScore.toFixed(1)}
                  </div>
                  <div className="text-sm text-blue-700">
                    {calculatedScore >= 80 ? "Excellent Trade Opportunity" : 
                     calculatedScore >= 70 ? "Good Trade Setup" : 
                     calculatedScore >= 60 ? "Average Trade" : 
                     "Poor Trade - Consider Alternatives"}
                  </div>
                  <div className="text-xs text-gray-600 mt-1">
                    Based on {getAPIFactors().length} API factors + {getManualFactors().length} manual factors
                  </div>
                </div>
                <div className="text-right">
                  <Progress value={calculatedScore} className="w-24 mb-2" />
                  <div className={`inline-block px-3 py-1 rounded-full text-xs font-medium ${
                    calculatedScore >= 80 ? "bg-green-100 text-green-800" :
                    calculatedScore >= 70 ? "bg-blue-100 text-blue-800" :
                    calculatedScore >= 60 ? "bg-yellow-100 text-yellow-800" :
                    "bg-red-100 text-red-800"
                  }`}>
                    {calculatedScore >= 80 ? "EXCELLENT" : 
                     calculatedScore >= 70 ? "GOOD" : 
                     calculatedScore >= 60 ? "AVERAGE" : "POOR"}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex items-center justify-between pt-4 border-t">
            <Button
              variant="outline"
              onClick={() => {
                if (confirm("Delete this trade and start over?")) {
                  setFormData({
                    name: "",
                    symbol: "",
                    currentPrice: 0,
                    expirationDate: "",
                    contractType: "put-credit-spread",
                    numberOfContracts: 1,
                    shortStrike: 0,
                    longStrike: 0,
                    creditReceived: 0,
                    ipsFactors: {},
                    apiFactors: {},
                  });
                  setLocalCalculatedScore(null);
                }
              }}
              className="text-red-600 border-red-200 hover:bg-red-50"
            >
              Delete & Start Over
            </Button>

            <div className="flex items-center gap-3">
              <Button variant="outline" onClick={onCancel}>
                Cancel
              </Button>

              <Button
                onClick={() => onSubmit(formData)}
                disabled={!isFormValid() || isLoading}
                className="flex items-center gap-2"
              >
                <Target className="h-4 w-4" />
                {isLoading ? "Saving..." : "Move to Prospective Trades"}
              </Button>
            </div>
          </div>

          {/* Trade Summary */}
          {isFormValid() && (
            <div className="mt-6 p-4 bg-gray-50 rounded-lg">
              <h4 className="font-medium mb-3">Trade Summary</h4>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                <div>
                  <div className="text-gray-600">Symbol</div>
                  <div className="font-medium">{formData.symbol}</div>
                </div>
                <div>
                  <div className="text-gray-600">Strategy</div>
                  <div className="font-medium">{formData.contractType.replace('-', ' ').toUpperCase()}</div>
                </div>
                <div>
                  <div className="text-gray-600">Credit/Debit</div>
                  <div className="font-medium">${formData.creditReceived}</div>
                </div>
                <div>
                  <div className="text-gray-600">Contracts</div>
                  <div className="font-medium">{formData.numberOfContracts}</div>
                </div>
                <div>
                  <div className="text-gray-600">Short Strike</div>
                  <div className="font-medium">${formData.shortStrike}</div>
                </div>
                <div>
                  <div className="text-gray-600">Long Strike</div>
                  <div className="font-medium">${formData.longStrike}</div>
                </div>
                <div>
                  <div className="text-gray-600">Max Gain</div>
                  <div className="font-medium text-green-600">
                    ${(formData.creditReceived * formData.numberOfContracts * 100).toFixed(0)}
                  </div>
                </div>
                <div>
                  <div className="text-gray-600">Max Loss</div>
                  <div className="font-medium text-red-600">
                    ${((Math.abs(formData.shortStrike - formData.longStrike) - formData.creditReceived) * formData.numberOfContracts * 100).toFixed(0)}
                  </div>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}