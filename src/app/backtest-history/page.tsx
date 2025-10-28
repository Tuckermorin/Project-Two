"use client";

/**
 * Backtest History Page
 *
 * Displays all completed backtests with ability to view detailed results
 */

import React, { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  CheckCircle,
  XCircle,
  Clock,
  TrendingUp,
  Calendar,
  BarChart3,
  Eye,
  Loader2,
  AlertCircle,
} from "lucide-react";
import { toast } from "sonner";

interface BacktestRun {
  id: string;
  ips_id: string;
  ips_name: string;
  start_date: string;
  end_date: string;
  total_days: number;
  symbols: string[] | null;
  status: string;
  started_at: string;
  completed_at: string;
  total_trades_analyzed: number;
  trades_passed: number;
  pass_rate: number;
  include_sentiment: boolean;
  sentiment_fetched: number;
  created_at: string;
}

interface BacktestResults {
  performance: {
    totalTrades: number;
    winRate: number;
    winningTrades: number;
    losingTrades: number;
  };
  roi: {
    average: number;
    median: number;
    best: number;
    worst: number;
  };
  risk: {
    sharpeRatio: number;
    sortinoRatio: number;
    maxDrawdown: number;
    profitFactor: number;
  };
  breakdown: {
    byStrategy: Record<string, any>;
    bySymbol: Record<string, any>;
  };
  sentiment?: {
    correlation: any;
    optimalRange: any;
  };
}

export default function BacktestHistoryPage() {
  const [backtests, setBacktests] = useState<BacktestRun[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedBacktest, setSelectedBacktest] = useState<{
    run: BacktestRun | null;
    results: BacktestResults | null;
    aiAnalysis: any | null;
    isLoading: boolean;
  }>({
    run: null,
    results: null,
    aiAnalysis: null,
    isLoading: false,
  });

  useEffect(() => {
    fetchBacktests();
  }, []);

  const fetchBacktests = async () => {
    setIsLoading(true);
    try {
      const response = await fetch("/api/backtest/history");
      if (!response.ok) {
        throw new Error("Failed to fetch backtests");
      }
      const data = await response.json();
      setBacktests(data.backtests || []);
    } catch (error) {
      console.error("Error fetching backtests:", error);
      toast.error("Failed to load backtest history");
    } finally {
      setIsLoading(false);
    }
  };

  const viewBacktestResults = async (runId: string) => {
    const run = backtests.find((b) => b.id === runId);
    if (!run) return;

    setSelectedBacktest({ run, results: null, aiAnalysis: null, isLoading: true });

    try {
      // Fetch results
      const resultsResponse = await fetch(`/api/backtest/${runId}/results`);
      if (!resultsResponse.ok) {
        throw new Error("Failed to fetch results");
      }
      const results = await resultsResponse.json();

      // Try to fetch AI analysis if it exists
      let aiAnalysis = null;
      try {
        const analysisResponse = await fetch(`/api/backtest/${runId}/analyze`);
        if (analysisResponse.ok) {
          const analysisData = await analysisResponse.json();
          aiAnalysis = analysisData.analysis;
        }
      } catch (e) {
        // AI analysis may not exist, that's okay
      }

      setSelectedBacktest({ run, results, aiAnalysis, isLoading: false });
    } catch (error) {
      console.error("Error fetching backtest details:", error);
      toast.error("Failed to load backtest details");
      setSelectedBacktest({ run: null, results: null, aiAnalysis: null, isLoading: false });
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "completed":
        return (
          <Badge className="bg-green-100 text-green-800 border-green-300">
            <CheckCircle className="h-3 w-3 mr-1" />
            Completed
          </Badge>
        );
      case "running":
        return (
          <Badge className="bg-blue-100 text-blue-800 border-blue-300">
            <Loader2 className="h-3 w-3 mr-1 animate-spin" />
            Running
          </Badge>
        );
      case "failed":
        return (
          <Badge className="bg-red-100 text-red-800 border-red-300">
            <XCircle className="h-3 w-3 mr-1" />
            Failed
          </Badge>
        );
      default:
        return (
          <Badge className="bg-gray-100 text-gray-800 border-gray-300">
            <Clock className="h-3 w-3 mr-1" />
            Pending
          </Badge>
        );
    }
  };

  if (isLoading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="text-center">
            <Loader2 className="h-12 w-12 animate-spin text-blue-600 mx-auto mb-4" />
            <p className="text-gray-600">Loading backtest history...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Backtest History</h1>
        <p className="text-gray-600 mt-2">
          View and analyze your IPS backtest results
        </p>
      </div>

      {/* Backtest List */}
      {backtests.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <BarChart3 className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">
              No backtests yet
            </h3>
            <p className="text-gray-600">
              Run your first backtest from the IPS Builder page
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {backtests.map((backtest) => (
            <Card
              key={backtest.id}
              className="hover:shadow-lg transition-shadow cursor-pointer"
              onClick={() => backtest.status === "completed" && viewBacktestResults(backtest.id)}
            >
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div>
                    <CardTitle className="text-lg">{backtest.ips_name}</CardTitle>
                    <div className="flex items-center gap-2 mt-2">
                      {getStatusBadge(backtest.status)}
                      {backtest.include_sentiment && (
                        <Badge variant="outline" className="text-xs">
                          + Sentiment Analysis
                        </Badge>
                      )}
                    </div>
                  </div>
                  {backtest.status === "completed" && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        viewBacktestResults(backtest.id);
                      }}
                    >
                      <Eye className="h-4 w-4 mr-2" />
                      View Results
                    </Button>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                  <div>
                    <p className="text-gray-600 flex items-center gap-1">
                      <Calendar className="h-4 w-4" />
                      Period
                    </p>
                    <p className="font-medium">
                      {new Date(backtest.start_date).toLocaleDateString()} -{" "}
                      {new Date(backtest.end_date).toLocaleDateString()}
                    </p>
                    <p className="text-xs text-gray-500">{backtest.total_days} days</p>
                  </div>
                  <div>
                    <p className="text-gray-600">Trades Analyzed</p>
                    <p className="font-medium text-lg">
                      {backtest.total_trades_analyzed || 0}
                    </p>
                  </div>
                  <div>
                    <p className="text-gray-600">Pass Rate</p>
                    <p className="font-medium text-lg text-green-600">
                      {backtest.pass_rate?.toFixed(1) || 0}%
                    </p>
                  </div>
                  <div>
                    <p className="text-gray-600">Symbols</p>
                    <p className="font-medium">
                      {backtest.symbols?.join(", ") || "All"}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Results Dialog */}
      <Dialog
        open={!!selectedBacktest.run}
        onOpenChange={() =>
          setSelectedBacktest({ run: null, results: null, aiAnalysis: null, isLoading: false })
        }
      >
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{selectedBacktest.run?.ips_name} - Backtest Results</DialogTitle>
            <DialogDescription>
              Tested from {selectedBacktest.run?.start_date} to{" "}
              {selectedBacktest.run?.end_date}
            </DialogDescription>
          </DialogHeader>

          {selectedBacktest.isLoading ? (
            <div className="py-12 text-center">
              <Loader2 className="h-8 w-8 animate-spin text-blue-600 mx-auto mb-4" />
              <p className="text-gray-600">Loading results...</p>
            </div>
          ) : selectedBacktest.results ? (
            <div className="space-y-6">
              {/* Performance Summary */}
              <Card className="border-green-200 bg-green-50">
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <TrendingUp className="h-5 w-5 text-green-600" />
                    Performance Summary
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div>
                      <p className="text-sm text-gray-600">Win Rate</p>
                      <p className="text-2xl font-bold text-green-600">
                        {selectedBacktest.results.performance.winRate.toFixed(1)}%
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-600">Avg ROI</p>
                      <p className="text-2xl font-bold">
                        {selectedBacktest.results.roi.average.toFixed(1)}%
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-600">Sharpe Ratio</p>
                      <p className="text-2xl font-bold">
                        {selectedBacktest.results.risk.sharpeRatio?.toFixed(2) || "N/A"}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-600">Total Trades</p>
                      <p className="text-2xl font-bold">
                        {selectedBacktest.results.performance.totalTrades}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* AI Analysis */}
              {selectedBacktest.aiAnalysis && (
                <Card className="border-purple-200 bg-purple-50">
                  <CardHeader>
                    <CardTitle className="text-lg">🤖 AI Analysis</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="mb-4">{selectedBacktest.aiAnalysis.summary}</p>

                    {selectedBacktest.aiAnalysis.optimizations?.length > 0 && (
                      <div>
                        <h4 className="font-semibold mb-2">Top Optimization Suggestions:</h4>
                        <ul className="space-y-2">
                          {selectedBacktest.aiAnalysis.optimizations
                            .filter((opt: any) => opt.priority === "high")
                            .slice(0, 3)
                            .map((opt: any, i: number) => (
                              <li key={i} className="text-sm">
                                <strong>{opt.title}:</strong> {opt.suggestion}
                              </li>
                            ))}
                        </ul>
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}

              {/* Strategy Breakdown */}
              {Object.keys(selectedBacktest.results.breakdown.byStrategy).length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Strategy Performance</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {Object.entries(selectedBacktest.results.breakdown.byStrategy).map(
                        ([strategy, perf]: [string, any]) => (
                          <div
                            key={strategy}
                            className="flex justify-between items-center p-2 bg-gray-50 rounded"
                          >
                            <span className="font-medium">{strategy}</span>
                            <div className="text-sm text-gray-600">
                              {perf.total} trades | {perf.winRate?.toFixed(1)}% win rate |{" "}
                              {perf.avgRoi?.toFixed(1)}% avg ROI
                            </div>
                          </div>
                        )
                      )}
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          ) : (
            <div className="py-12 text-center">
              <AlertCircle className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-600">No results available</p>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
