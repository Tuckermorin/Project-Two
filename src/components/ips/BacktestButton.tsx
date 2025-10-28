"use client";

/**
 * Backtest Button Component
 *
 * Allows users to backtest their IPS configuration with Greeks + Sentiment
 * Displays progress modal and results
 */

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Loader2, CheckCircle, XCircle, TrendingUp } from "lucide-react";

interface BacktestButtonProps {
  ipsId: string;
  ipsName: string;
  onComplete?: (results: any) => void;
}

interface BacktestStatus {
  status: "pending" | "running" | "completed" | "failed";
  progress: {
    percent: number;
    tradesAnalyzed: number;
    sentimentFetched: number;
  };
  timing: {
    startedAt?: string;
    completedAt?: string;
  };
  error?: string;
}

export function BacktestButton({
  ipsId,
  ipsName,
  onComplete,
}: BacktestButtonProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [view, setView] = useState<"history" | "new" | "running">("history"); // Default to history view
  const [isLoading, setIsLoading] = useState(false);
  const [runId, setRunId] = useState<string | null>(null);
  const [status, setStatus] = useState<BacktestStatus | null>(null);
  const [results, setResults] = useState<any>(null);
  const [aiAnalysis, setAiAnalysis] = useState<any>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [history, setHistory] = useState<any[]>([]);

  // Configuration state
  const [timePeriod, setTimePeriod] = useState<string>("2y"); // Default: 2 years
  const [customStart, setCustomStart] = useState<string>("");
  const [customEnd, setCustomEnd] = useState<string>("");

  const getDateRange = () => {
    const today = new Date();
    const todayStr = today.toISOString().split("T")[0];
    const dataInceptionDate = "2022-10-18"; // Earliest data available

    if (timePeriod === "custom") {
      return { startDate: customStart, endDate: customEnd };
    }

    if (timePeriod === "inception") {
      return { startDate: dataInceptionDate, endDate: todayStr };
    }

    const startDate = new Date();
    switch (timePeriod) {
      case "1y":
        startDate.setFullYear(today.getFullYear() - 1);
        break;
      case "2y":
        startDate.setFullYear(today.getFullYear() - 2);
        break;
      default:
        startDate.setFullYear(today.getFullYear() - 1);
    }

    // Ensure we don't go before inception date
    const calculatedStart = startDate.toISOString().split("T")[0];
    const finalStart = calculatedStart < dataInceptionDate ? dataInceptionDate : calculatedStart;

    return {
      startDate: finalStart,
      endDate: todayStr,
    };
  };

  const [symbols, setSymbols] = useState<string[]>([]);
  const [symbolInput, setSymbolInput] = useState<string>("");
  const [includeSentiment, setIncludeSentiment] = useState(true);
  const [availableSymbols, setAvailableSymbols] = useState<string[]>([]);
  const [loadingSymbols, setLoadingSymbols] = useState(false);

  // Watchlist dialog state
  const [watchlistDialogOpen, setWatchlistDialogOpen] = useState(false);
  const [watchlistItems, setWatchlistItems] = useState<Array<{ symbol: string; company_name?: string }>>([]);
  const [selectedWatchlistSymbols, setSelectedWatchlistSymbols] = useState<Set<string>>(new Set());
  const [loadingWatchlist, setLoadingWatchlist] = useState(false);

  /**
   * Fetch available symbols from historical data
   */
  const fetchAvailableSymbols = async () => {
    setLoadingSymbols(true);
    try {
      const response = await fetch("/api/backtest/available-symbols");
      if (!response.ok) {
        throw new Error("Failed to fetch available symbols");
      }
      const data = await response.json();
      setAvailableSymbols(data.symbols || []);
    } catch (error) {
      console.error("Error fetching available symbols:", error);
      // Fallback to empty array - user can still leave blank to test all
    } finally {
      setLoadingSymbols(false);
    }
  };

  /**
   * Load watchlist data from API
   */
  const loadWatchlist = async (symbolsToFilter: string[]) => {
    setLoadingWatchlist(true);
    try {
      const res = await fetch("/api/watchlist");
      const json = await res.json();
      if (res.ok && json.data) {
        // Filter to only show watchlist items that have historical data
        const validWatchlistItems = json.data.filter((item: any) =>
          symbolsToFilter.includes(item.symbol)
        );
        setWatchlistItems(validWatchlistItems);
      }
    } catch (e) {
      console.error("Failed to load watchlist:", e);
    } finally {
      setLoadingWatchlist(false);
    }
  };

  /**
   * Open watchlist dialog
   */
  const handleOpenWatchlistDialog = async () => {
    setWatchlistDialogOpen(true);

    // Ensure available symbols are loaded first
    let symbolsList = availableSymbols;
    if (symbolsList.length === 0) {
      try {
        const response = await fetch("/api/backtest/available-symbols");
        if (response.ok) {
          const data = await response.json();
          symbolsList = data.symbols || [];
          setAvailableSymbols(symbolsList);
        }
      } catch (error) {
        console.error("Error fetching available symbols:", error);
      }
    }

    // Then load watchlist (which filters by available symbols)
    await loadWatchlist(symbolsList);
  };

  /**
   * Select all watchlist symbols
   */
  const handleSelectAllWatchlist = () => {
    setSelectedWatchlistSymbols(new Set(watchlistItems.map((item) => item.symbol)));
  };

  /**
   * Deselect all watchlist symbols
   */
  const handleDeselectAllWatchlist = () => {
    setSelectedWatchlistSymbols(new Set());
  };

  /**
   * Toggle individual watchlist symbol
   */
  const handleToggleWatchlistSymbol = (symbol: string) => {
    const newSet = new Set(selectedWatchlistSymbols);
    if (newSet.has(symbol)) {
      newSet.delete(symbol);
    } else {
      newSet.add(symbol);
    }
    setSelectedWatchlistSymbols(newSet);
  };

  /**
   * Apply watchlist selection to symbol input
   */
  const handleApplyWatchlistSelection = () => {
    const selectedSymbolsArray = Array.from(selectedWatchlistSymbols);
    setSymbolInput(selectedSymbolsArray.join(", "));
    setWatchlistDialogOpen(false);
    setSelectedWatchlistSymbols(new Set());
  };

  /**
   * Fetch backtest history for this IPS
   */
  const fetchHistory = async () => {
    try {
      const response = await fetch(`/api/backtest/history?ipsId=${ipsId}`);
      if (response.ok) {
        const data = await response.json();
        setHistory(data.runs || []);
      }
    } catch (error) {
      console.error("Error fetching backtest history:", error);
    }
  };

  // Fetch history and available symbols when modal opens
  useEffect(() => {
    if (isOpen) {
      fetchHistory();
      if (availableSymbols.length === 0) {
        fetchAvailableSymbols();
      }
    }
  }, [isOpen, availableSymbols.length]);

  /**
   * Validate and parse symbol input
   */
  const parseSymbolInput = (input: string): string[] => {
    const inputSymbols = input
      .split(",")
      .map((s) => s.trim().toUpperCase())
      .filter(Boolean);

    // If we have available symbols list, validate against it
    if (availableSymbols.length > 0) {
      const invalidSymbols = inputSymbols.filter(
        (s) => !availableSymbols.includes(s)
      );

      if (invalidSymbols.length > 0) {
        alert(
          `Warning: The following symbols have no historical data and will be skipped:\n${invalidSymbols.join(", ")}\n\nAvailable symbols:\n${availableSymbols.join(", ")}`
        );
      }

      // Return only valid symbols
      return inputSymbols.filter((s) => availableSymbols.includes(s));
    }

    // If no validation data available, return all input symbols (backend will validate)
    return inputSymbols;
  };

  /**
   * Start the backtest
   */
  const startBacktest = async () => {
    setIsLoading(true);
    setResults(null);
    setStatus(null);

    const { startDate, endDate } = getDateRange();

    if (!startDate || !endDate) {
      alert("Please select a valid date range");
      setIsLoading(false);
      return;
    }

    // Parse and validate symbols
    const validSymbols = symbolInput.trim()
      ? parseSymbolInput(symbolInput)
      : [];

    if (symbolInput.trim() && validSymbols.length === 0) {
      alert("No valid symbols entered. Please use symbols from the watchlist.");
      setIsLoading(false);
      return;
    }

    try {
      // Call API to start backtest
      const response = await fetch("/api/backtest/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ipsId,
          startDate,
          endDate,
          symbols: validSymbols.length > 0 ? validSymbols : undefined,
          includeSentiment,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to start backtest");
      }

      const data = await response.json();
      setRunId(data.runId);
      setView("running"); // Switch to running view

      // Start polling for status
      pollStatus(data.runId);
    } catch (error: any) {
      console.error("Error starting backtest:", error);
      alert(`Error: ${error.message}`);
      setIsLoading(false);
    }
  };

  /**
   * Poll for backtest status
   */
  const pollStatus = async (id: string) => {
    const poll = async () => {
      try {
        const response = await fetch(`/api/backtest/${id}/status`);
        if (!response.ok) {
          throw new Error("Failed to fetch status");
        }

        const statusData = await response.json();
        setStatus(statusData);

        // If completed or failed, fetch results
        if (statusData.status === "completed") {
          await fetchResults(id);
          setIsLoading(false);
        } else if (statusData.status === "failed") {
          setIsLoading(false);
        } else {
          // Continue polling
          setTimeout(poll, 3000); // Poll every 3 seconds
        }
      } catch (error) {
        console.error("Error polling status:", error);
        setIsLoading(false);
      }
    };

    poll();
  };

  /**
   * Fetch final results
   */
  const fetchResults = async (id: string) => {
    try {
      const response = await fetch(`/api/backtest/${id}/results`);
      if (!response.ok) {
        throw new Error("Failed to fetch results");
      }

      const resultsData = await response.json();
      setResults(resultsData);

      if (onComplete) {
        onComplete(resultsData);
      }

      // Automatically trigger AI analysis
      await triggerAIAnalysis(id);
    } catch (error) {
      console.error("Error fetching results:", error);
    }
  };

  /**
   * Trigger AI analysis of backtest results
   */
  const triggerAIAnalysis = async (id: string) => {
    setIsAnalyzing(true);
    try {
      const response = await fetch(`/api/backtest/${id}/analyze`, {
        method: "POST",
      });

      if (!response.ok) {
        throw new Error("Failed to generate AI analysis");
      }

      const data = await response.json();
      setAiAnalysis(data.analysis);
    } catch (error) {
      console.error("Error generating AI analysis:", error);
      // Don't block user if AI analysis fails
    } finally {
      setIsAnalyzing(false);
    }
  };

  /**
   * Accept IPS and train RAG
   */
  const acceptAndTrainRAG = async () => {
    if (!runId) return;

    try {
      // Call API to index backtest lessons into RAG
      const response = await fetch(`/api/backtest/${runId}/index-rag`, {
        method: "POST",
      });

      if (!response.ok) {
        throw new Error("Failed to index RAG");
      }

      alert("IPS validated and lessons indexed into AI system!");
      setIsOpen(false);
    } catch (error: any) {
      alert(`Error: ${error.message}`);
    }
  };

  const handleClose = () => {
    setIsOpen(false);
    setView("history"); // Reset to history view
    setRunId(null);
    setResults(null);
    setStatus(null);
    setAiAnalysis(null);
  };

  return (
    <>
      <Button
        onClick={() => setIsOpen(true)}
        variant="outline"
        className="flex-1 gap-1 font-medium"
        size="sm"
      >
        <TrendingUp className="h-4 w-4" />
        Backtest
      </Button>

      <Dialog open={isOpen} onOpenChange={handleClose}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {view === "history" ? `Backtest History: ${ipsName}` : `Backtest IPS: ${ipsName}`}
            </DialogTitle>
            <DialogDescription>
              {view === "history"
                ? "View past backtest results or start a new backtest"
                : "Simulate how certain factors of your IPS would have performed using historical options Greeks (Delta, Theta, IV, etc.) and market sentiment data. Test against up to 3 years of data (Oct 2022 - Present) to partially validate your strategy before going live."}
            </DialogDescription>
          </DialogHeader>

          {/* History View */}
          {view === "history" && (
            <div className="space-y-4">
              {history.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-muted-foreground mb-4">
                    No backtest history yet
                  </p>
                  <Button onClick={() => setView("new")}>
                    Start First Backtest
                  </Button>
                </div>
              ) : (
                <>
                  <Button onClick={() => setView("new")} className="w-full">
                    Start New Backtest
                  </Button>
                  <div className="space-y-2">
                    {history.map((run) => (
                      <Card
                        key={run.id}
                        className="p-4 cursor-pointer hover:bg-gray-50"
                        onClick={() => {
                          setRunId(run.id);
                          setView("running");
                          fetchResults(run.id);
                        }}
                      >
                        <div className="flex justify-between items-start">
                          <div>
                            <p className="font-medium">
                              {run.symbols?.join(", ") || "All symbols"}
                            </p>
                            <p className="text-sm text-muted-foreground">
                              {new Date(run.created_at).toLocaleDateString()} -{" "}
                              {run.start_date} to {run.end_date}
                            </p>
                          </div>
                          <div className="text-right">
                            <span
                              className={`text-sm px-2 py-1 rounded ${
                                run.status === "completed"
                                  ? "bg-green-100 text-green-800"
                                  : run.status === "failed"
                                  ? "bg-red-100 text-red-800"
                                  : "bg-yellow-100 text-yellow-800"
                              }`}
                            >
                              {run.status}
                            </span>
                          </div>
                        </div>
                      </Card>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}

          {/* New Backtest Configuration */}
          {view === "new" && !runId && (
            <div className="space-y-4">
              <Button
                variant="outline"
                onClick={() => setView("history")}
                className="mb-2"
              >
                ← Back to History
              </Button>
              <div>
                <label className="text-sm font-medium">Time Period</label>
                <select
                  value={timePeriod}
                  onChange={(e) => setTimePeriod(e.target.value)}
                  className="border rounded px-3 py-2 w-full mt-1"
                >
                  <option value="1y">Last 1 Year</option>
                  <option value="2y">Last 2 Years (Recommended)</option>
                  <option value="inception">All Available Data (Since Oct 2022 - ~3 years)</option>
                  <option value="custom">Custom Date Range</option>
                </select>
                <p className="text-xs text-muted-foreground mt-1">
                  {timePeriod === "1y" && "Most recent market conditions only"}
                  {timePeriod === "2y" && "Balanced view of recent performance"}
                  {timePeriod === "inception" && "Maximum available data (~3 years, 9.8M option contracts)"}
                  {timePeriod === "custom" && "Choose your own start and end dates"}
                </p>
              </div>

              {timePeriod === "custom" && (
                <div>
                  <label className="text-sm font-medium">Custom Date Range</label>
                  <div className="grid grid-cols-2 gap-2 mt-1">
                    <input
                      type="date"
                      value={customStart}
                      onChange={(e) => setCustomStart(e.target.value)}
                      className="border rounded px-3 py-2"
                      min="2022-10-18"
                      placeholder="Start Date"
                    />
                    <input
                      type="date"
                      value={customEnd}
                      onChange={(e) => setCustomEnd(e.target.value)}
                      className="border rounded px-3 py-2"
                      max={new Date().toISOString().split("T")[0]}
                      placeholder="End Date"
                    />
                  </div>
                </div>
              )}

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-sm font-medium">Symbols</label>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleOpenWatchlistDialog}
                    disabled={loadingSymbols || availableSymbols.length === 0}
                    className="text-xs"
                  >
                    {loadingSymbols ? "Loading..." : "Load Watchlist"}
                  </Button>
                </div>
                <input
                  type="text"
                  placeholder="TSLA, NVDA, AAPL (or leave blank for all)"
                  value={symbolInput}
                  className="border rounded px-3 py-2 w-full"
                  onChange={(e) => setSymbolInput(e.target.value)}
                />
                <p className="text-xs text-muted-foreground mt-1">
                  {availableSymbols.length > 0
                    ? `${availableSymbols.length} symbols available with historical data`
                    : "Loading available symbols..."}
                </p>
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={includeSentiment}
                  onChange={(e) => setIncludeSentiment(e.target.checked)}
                  id="sentiment-toggle"
                />
                <label htmlFor="sentiment-toggle" className="text-sm">
                  Include sentiment analysis (recommended, but slower)
                </label>
              </div>

              <Button
                onClick={startBacktest}
                disabled={isLoading}
                className="w-full"
              >
                {isLoading ? "Starting..." : "Start Backtest"}
              </Button>
            </div>
          )}

          {runId && !results && (
            <Card className="p-6">
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  {status?.status === "running" ? (
                    <Loader2 className="h-6 w-6 animate-spin text-blue-500" />
                  ) : status?.status === "failed" ? (
                    <XCircle className="h-6 w-6 text-red-500" />
                  ) : (
                    <div className="h-6 w-6" />
                  )}
                  <div>
                    <h3 className="font-semibold">
                      {status?.status === "running"
                        ? "Backtesting in progress..."
                        : status?.status === "failed"
                        ? "Backtest failed"
                        : "Initializing..."}
                    </h3>
                    <p className="text-sm text-muted-foreground">
                      {status?.status === "running"
                        ? `${status.progress.percent}% complete`
                        : status?.error || "Starting backtest engine"}
                    </p>
                  </div>
                </div>

                {status?.status === "running" && (
                  <>
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div
                        className="bg-blue-500 h-2 rounded-full transition-all duration-300"
                        style={{ width: `${status.progress.percent}%` }}
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <p className="text-muted-foreground">Trades Analyzed</p>
                        <p className="font-semibold">
                          {status.progress.tradesAnalyzed}
                        </p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">
                          Sentiment Data Points
                        </p>
                        <p className="font-semibold">
                          {status.progress.sentimentFetched}
                        </p>
                      </div>
                    </div>
                  </>
                )}
              </div>
            </Card>
          )}

          {results && (
            <div className="space-y-4">
              <Card className="p-6 border-green-200 bg-green-50">
                <div className="flex items-center gap-3 mb-2">
                  <CheckCircle className="h-6 w-6 text-green-500" />
                  <h3 className="font-semibold text-lg">Backtest Complete!</h3>
                </div>
                <div className="space-y-2 text-sm text-muted-foreground mb-4">
                  <p>
                    <strong>Time Period:</strong> {results.overview.startDate} to {results.overview.endDate} ({results.overview.totalDays} days)
                  </p>
                  <p>
                    <strong>Symbols Tested:</strong> {results.overview.symbolsTested?.join(", ") || "All available"}
                  </p>
                  <p>
                    <strong>IPS Factors:</strong> {results.overview.ipsFactors || "Testing Greeks-based criteria (Delta, IV, DTE)"}
                  </p>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div>
                    <p className="text-sm text-muted-foreground">Win Rate</p>
                    <p className="text-2xl font-bold text-green-600">
                      {results.performance.winRate.toFixed(1)}%
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Avg ROI</p>
                    <p className="text-2xl font-bold">
                      {results.roi.average.toFixed(1)}%
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Sharpe</p>
                    <p className="text-2xl font-bold">
                      {results.risk.sharpeRatio?.toFixed(2) || "N/A"}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Total Trades</p>
                    <p className="text-2xl font-bold">
                      {results.performance.totalTrades}
                    </p>
                  </div>
                </div>
              </Card>

              {results.sentiment && results.sentiment.correlation && (
                <Card className="p-4">
                  <h4 className="font-semibold mb-2">Sentiment Insights</h4>
                  <div className="space-y-2 text-sm">
                    <p>
                      <strong>Sentiment Correlation:</strong>{" "}
                      {results.sentiment.correlation > 0.3
                        ? "Strong positive correlation - trades during positive sentiment performed better"
                        : results.sentiment.correlation < -0.3
                        ? "Negative correlation - trades during negative sentiment performed worse"
                        : "Weak correlation - sentiment had minimal impact on outcomes"}
                    </p>
                    {results.sentiment.optimalRange && (
                      <p className="text-muted-foreground">
                        Best performing sentiment range: {results.sentiment.optimalRange.min.toFixed(2)} to{" "}
                        {results.sentiment.optimalRange.max.toFixed(2)}
                      </p>
                    )}
                  </div>
                </Card>
              )}

              {/* AI Analysis Section */}
              {isAnalyzing && (
                <Card className="p-4 border-blue-200 bg-blue-50">
                  <div className="flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin text-blue-500" />
                    <p className="text-sm font-medium">
                      AI is analyzing your results and generating optimization
                      suggestions...
                    </p>
                  </div>
                </Card>
              )}

              {aiAnalysis && !isAnalyzing && (
                <Card className="p-6 border-purple-200 bg-purple-50">
                  <h3 className="font-semibold text-lg mb-2 flex items-center gap-2">
                    <span>🤖</span> AI Insights & Optimization Suggestions
                  </h3>

                  <div className="space-y-4 mt-4">
                    {/* Executive Summary - Win Rate vs ROI Context */}
                    <Card className="p-4 bg-blue-50 border-blue-200">
                      <p className="text-sm font-semibold text-blue-900 mb-2">
                        📊 Understanding Your Results
                      </p>
                      <div className="text-sm space-y-2 text-blue-800">
                        <p>
                          <strong>Win Rate ({results.performance.winRate.toFixed(1)}%):</strong> Percentage of trades that closed profitable.
                          {results.performance.winRate > 60 ? " This is solid!" : results.performance.winRate > 50 ? " This is decent." : " This needs improvement."}
                        </p>
                        <p>
                          <strong>Average ROI ({results.roi.average.toFixed(1)}%):</strong> Average return across ALL trades.
                          {results.roi.average < 0 && results.performance.winRate > 50
                            ? " Despite winning more often, losses are larger than wins. This means your losing trades are dragging down overall profitability - likely due to not cutting losses quickly enough or taking profits too early."
                            : results.roi.average > 0
                            ? " Your wins are outpacing your losses - good job!"
                            : " Your strategy isn't profitable yet - focus on the AI suggestions below."}
                        </p>
                        {results.roi.average < 0 && results.performance.winRate > 50 && (
                          <p className="font-semibold text-blue-900 mt-2">
                            💡 Key Insight: You're winning more often but losing more money per loss. Review your exit strategies - especially your maximum loss threshold.
                          </p>
                        )}
                      </div>
                    </Card>

                    {/* Overall Assessment */}
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">
                        Overall Assessment
                      </p>
                      <p className="text-lg font-bold capitalize">
                        {aiAnalysis.overallAssessment}
                      </p>
                      <p className="text-sm mt-1">{aiAnalysis.summary}</p>
                    </div>

                    {/* Strengths */}
                    {aiAnalysis.strengths?.length > 0 && (
                      <div>
                        <p className="text-sm font-semibold text-green-700 mb-1">
                          ✅ Strengths
                        </p>
                        <ul className="text-sm space-y-1">
                          {aiAnalysis.strengths.map((s: string, i: number) => (
                            <li key={i} className="flex items-start gap-2">
                              <span>•</span>
                              <span>{s}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {/* Weaknesses */}
                    {aiAnalysis.weaknesses?.length > 0 && (
                      <div>
                        <p className="text-sm font-semibold text-orange-700 mb-1">
                          ⚠️ Weaknesses
                        </p>
                        <ul className="text-sm space-y-1">
                          {aiAnalysis.weaknesses.map((w: string, i: number) => (
                            <li key={i} className="flex items-start gap-2">
                              <span>•</span>
                              <span>{w}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {/* High Priority Optimizations */}
                    {aiAnalysis.optimizations?.filter((o: any) => o.priority === "high")
                      .length > 0 && (
                      <div className="border-t pt-4">
                        <p className="text-sm font-semibold text-purple-700 mb-2">
                          💡 High Priority Optimizations
                        </p>
                        <div className="space-y-3">
                          {aiAnalysis.optimizations
                            .filter((o: any) => o.priority === "high")
                            .map((opt: any, i: number) => (
                              <div
                                key={i}
                                className="bg-white p-3 rounded border border-purple-200"
                              >
                                <p className="font-semibold text-sm">
                                  {opt.title}
                                </p>
                                <p className="text-sm text-muted-foreground mt-1">
                                  <strong>Finding:</strong> {opt.finding}
                                </p>
                                <p className="text-sm text-muted-foreground">
                                  <strong>Suggestion:</strong> {opt.suggestion}
                                </p>
                                <p className="text-sm text-green-600 font-medium mt-1">
                                  Expected Impact: {opt.expectedImpact}
                                </p>
                                {opt.currentValue && opt.suggestedValue && (
                                  <p className="text-xs mt-1 font-mono bg-gray-100 p-2 rounded">
                                    {JSON.stringify(opt.currentValue)} →{" "}
                                    {JSON.stringify(opt.suggestedValue)}
                                  </p>
                                )}
                                {opt.supportingData && (
                                  <p className="text-xs text-muted-foreground mt-1">
                                    Based on {opt.supportingData.sampleSize}{" "}
                                    trades
                                    {opt.supportingData.projectedWinRate &&
                                      ` (${opt.supportingData.projectedWinRate.toFixed(1)}% win rate)`}
                                  </p>
                                )}
                              </div>
                            ))}
                        </div>
                      </div>
                    )}

                    {/* Medium Priority Optimizations (Collapsed) */}
                    {aiAnalysis.optimizations?.filter(
                      (o: any) => o.priority === "medium"
                    ).length > 0 && (
                      <details className="text-sm">
                        <summary className="font-semibold cursor-pointer">
                          Medium Priority Suggestions (
                          {
                            aiAnalysis.optimizations.filter(
                              (o: any) => o.priority === "medium"
                            ).length
                          }
                          )
                        </summary>
                        <ul className="mt-2 space-y-1 pl-4">
                          {aiAnalysis.optimizations
                            .filter((o: any) => o.priority === "medium")
                            .map((opt: any, i: number) => (
                              <li key={i}>
                                <strong>{opt.title}:</strong> {opt.suggestion}
                              </li>
                            ))}
                        </ul>
                      </details>
                    )}

                    {/* Risk Warnings */}
                    {aiAnalysis.riskWarnings?.length > 0 && (
                      <div className="border-t pt-4">
                        <p className="text-sm font-semibold text-red-700 mb-1">
                          🚨 Risk Warnings
                        </p>
                        <ul className="text-sm space-y-1">
                          {aiAnalysis.riskWarnings.map((w: string, i: number) => (
                            <li key={i} className="flex items-start gap-2">
                              <span>•</span>
                              <span>{w}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                </Card>
              )}

              <div className="flex gap-2">
                <Button onClick={acceptAndTrainRAG} className="flex-1">
                  Accept IPS & Train AI
                </Button>
                <Button
                  onClick={() => {
                    setResults(null);
                    setRunId(null);
                    setAiAnalysis(null);
                  }}
                  variant="outline"
                  className="flex-1"
                >
                  Refine IPS Based on Insights
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Watchlist Selector Dialog */}
      <Dialog open={watchlistDialogOpen} onOpenChange={setWatchlistDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Select Symbols from Watchlist</DialogTitle>
            <DialogDescription>
              Only symbols with historical options data are shown
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {loadingWatchlist ? (
              <div className="text-center py-8 text-muted-foreground">
                Loading watchlist...
              </div>
            ) : watchlistItems.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                {availableSymbols.length === 0
                  ? "No symbols with historical data available"
                  : "No watchlist symbols have historical data"}
              </div>
            ) : (
              <>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleSelectAllWatchlist}
                  >
                    Select All
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleDeselectAllWatchlist}
                  >
                    Deselect All
                  </Button>
                  <div className="ml-auto text-sm text-muted-foreground">
                    {selectedWatchlistSymbols.size} selected
                  </div>
                </div>
                <div className="space-y-2 max-h-[400px] overflow-y-auto border rounded-md p-4">
                  {watchlistItems.map((item) => (
                    <div
                      key={item.symbol}
                      className="flex items-center space-x-3 p-2 hover:bg-gray-50 dark:hover:bg-gray-800 rounded"
                    >
                      <Checkbox
                        id={`watchlist-${item.symbol}`}
                        checked={selectedWatchlistSymbols.has(item.symbol)}
                        onCheckedChange={() => handleToggleWatchlistSymbol(item.symbol)}
                      />
                      <Label
                        htmlFor={`watchlist-${item.symbol}`}
                        className="flex-1 cursor-pointer"
                      >
                        <div className="font-medium">{item.symbol}</div>
                        {item.company_name && (
                          <div className="text-xs text-muted-foreground">
                            {item.company_name}
                          </div>
                        )}
                      </Label>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setWatchlistDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleApplyWatchlistSelection}
              disabled={selectedWatchlistSymbols.size === 0}
            >
              Add {selectedWatchlistSymbols.size} Symbol{selectedWatchlistSymbols.size !== 1 ? 's' : ''}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
