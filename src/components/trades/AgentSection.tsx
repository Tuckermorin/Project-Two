"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Bot, TrendingUp, AlertCircle, X, Eye, ChevronRight, List } from "lucide-react";
import { useAuth } from "@/components/auth/auth-provider";
import { FactorScorecard } from "@/components/trades/factor-scorecard";
import { AITradeScoreCard } from "@/components/trades/AITradeScoreCard";
import { TradeTileCompact } from "@/components/trades/TradeTileCompact";
import { TradeBarCompact } from "@/components/trades/TradeBarCompact";
import { TradeDetailsModal } from "@/components/trades/TradeDetailsModal";
import { AgentProgressBar } from "@/components/trades/AgentProgressBar";

type Candidate = {
  id: string;
  symbol: string;
  strategy: string;
  contract_legs: Array<{
    type: "BUY" | "SELL";
    right: "P" | "C";
    strike: number;
    expiry: string;
  }>;
  entry_mid?: number;
  est_pop?: number;
  breakeven?: number;
  max_loss?: number;
  max_profit?: number;
  rationale?: string;
  guardrail_flags?: Record<string, boolean>;
  score?: number;
  tier?: 'elite' | 'quality' | 'speculative' | null;
  ips_factor_details?: any;
  ips_score?: number;
  composite_score?: number;
  diversity_score?: number;
  metadata?: {
    reddit?: {
      sentiment_score: number;
      mention_count: number;
      trending_rank: number | null;
      mention_velocity: number;
      confidence: 'low' | 'medium' | 'high';
    } | null;
  };
  detailed_analysis?: {
    ips_name?: string;
    ips_factors?: Array<{
      name: string;
      factor_key?: string;
      target?: string;
      actual?: string | number;
      weight?: string;
      status: "pass" | "fail" | "warning";
    }>;
    ips_factor_details?: any;
    api_data?: {
      company_name?: string;
      sector?: string;
      industry?: string;
      market_cap?: string;
      pe_ratio?: string;
      beta?: string;
      eps?: string;
      dividend_yield?: string;
      profit_margin?: string;
      roe?: string;
      week52_high?: string;
      week52_low?: string;
      analyst_target?: string;
    } | null;
    news_results?: Array<{
      title: string;
      snippet: string;
      url: string;
      published_at?: string | null;
    }>;
    tavily_error?: string | null;
    news_summary?: string;
    macro_context?: string;
    out_of_ips_justification?: string;
  };
};

interface AgentSectionProps {
  onAddToProspective?: (candidate: Candidate, ipsId: string) => void;
  availableIPSs?: Array<{ id: string; name: string }>;
}

export function AgentSection({ onAddToProspective, availableIPSs = [] }: AgentSectionProps) {
  const router = useRouter();
  const { user } = useAuth();
  const userId = user?.id;

  const [loading, setLoading] = useState(false);
  const [runId, setRunId] = useState<string | null>(null);
  const [cands, setCands] = useState<Candidate[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [symbolInput, setSymbolInput] = useState("");
  const [symbols, setSymbols] = useState<string[]>([]);
  const [selectedIpsId, setSelectedIpsId] = useState<string | null>(null);
  const [detailsDialogOpen, setDetailsDialogOpen] = useState(false);
  const [selectedCandidate, setSelectedCandidate] = useState<Candidate | null>(null);
  const [addingToProspective, setAddingToProspective] = useState(false);
  const [numberOfContracts, setNumberOfContracts] = useState<string>("1");
  const [watchlistDialogOpen, setWatchlistDialogOpen] = useState(false);
  const [watchlistItems, setWatchlistItems] = useState<Array<{ symbol: string; company_name?: string }>>([]);
  const [selectedWatchlistSymbols, setSelectedWatchlistSymbols] = useState<Set<string>>(new Set());
  const [loadingWatchlist, setLoadingWatchlist] = useState(false);
  const [showAllTrades, setShowAllTrades] = useState(false);
  const [initialDisplayCount, setInitialDisplayCount] = useState(10);
  const [loadingCache, setLoadingCache] = useState(true);
  const [cacheLoaded, setCacheLoaded] = useState(false);
  const [agentProgress, setAgentProgress] = useState({ step: 0, label: '' });
  const [agentStartTime, setAgentStartTime] = useState<number | null>(null);

  // Load cached results on mount
  useEffect(() => {
    loadCachedResults();
  }, []);

  // Progress simulation while agent is running
  useEffect(() => {
    if (!loading || !agentStartTime) return;

    const STEPS = [
      { time: 0, step: 1, label: '📋 Loading IPS Configuration...' },
      { time: 3, step: 2, label: '📊 Fetching Market Data...' },
      { time: 8, step: 3, label: '🔍 Pre-filtering Stocks...' },
      { time: 20, step: 4, label: '⛓️ Fetching Options Chains...' },
      { time: 60, step: 5, label: '📈 Scoring Candidates...' },
      { time: 90, step: 6, label: '✨ Applying IPS Filters...' },
      { time: 110, step: 7, label: '🤖 Generating AI Analysis...' },
      { time: 130, step: 8, label: '✅ Finalizing Results...' },
    ];

    const interval = setInterval(() => {
      const elapsed = Math.floor((Date.now() - agentStartTime) / 1000);

      // Find the current step based on elapsed time
      let currentStep = STEPS[0];
      for (const step of STEPS) {
        if (elapsed >= step.time) {
          currentStep = step;
        } else {
          break;
        }
      }

      setAgentProgress({ step: currentStep.step, label: currentStep.label });
    }, 1000);

    return () => clearInterval(interval);
  }, [loading, agentStartTime]);

  async function loadCachedResults() {
    setLoadingCache(true);
    try {
      const res = await fetch("/api/agent/latest");
      const json = await res.json();

      if (res.ok && json.hasCache && json.candidates?.length > 0) {
        console.log(`[AgentSection] Loaded ${json.candidates.length} cached trade candidates`);
        setRunId(json.run.runId);
        setCands(json.candidates);
        setCacheLoaded(true);

        // Restore watchlist symbols if available
        if (json.run.watchlist && Array.isArray(json.run.watchlist)) {
          setSymbols(json.run.watchlist);
        }
      } else {
        console.log("[AgentSection] No cached results found");
      }
    } catch (e: any) {
      console.error("[AgentSection] Failed to load cached results:", e);
      // Don't show error to user - just no cache available
    } finally {
      setLoadingCache(false);
    }
  }

  const handleAddSymbol = () => {
    const trimmed = symbolInput.trim().toUpperCase();
    if (trimmed && !symbols.includes(trimmed)) {
      setSymbols([...symbols, trimmed]);
      setSymbolInput("");
    }
  };

  const handleRemoveSymbol = (symbol: string) => {
    setSymbols(symbols.filter((s) => s !== symbol));
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleAddSymbol();
    }
  };

  const loadWatchlist = async () => {
    setLoadingWatchlist(true);
    try {
      const res = await fetch("/api/watchlist");
      const json = await res.json();
      if (res.ok && json.data) {
        setWatchlistItems(json.data);
      }
    } catch (e) {
      console.error("Failed to load watchlist:", e);
    } finally {
      setLoadingWatchlist(false);
    }
  };

  const handleOpenWatchlistDialog = () => {
    loadWatchlist();
    setWatchlistDialogOpen(true);
  };

  const handleSelectAllWatchlist = () => {
    setSelectedWatchlistSymbols(new Set(watchlistItems.map(item => item.symbol)));
  };

  const handleDeselectAllWatchlist = () => {
    setSelectedWatchlistSymbols(new Set());
  };

  const handleToggleWatchlistSymbol = (symbol: string) => {
    const newSet = new Set(selectedWatchlistSymbols);
    if (newSet.has(symbol)) {
      newSet.delete(symbol);
    } else {
      newSet.add(symbol);
    }
    setSelectedWatchlistSymbols(newSet);
  };

  const handleApplyWatchlistSelection = () => {
    const selectedSymbolsArray = Array.from(selectedWatchlistSymbols);
    // Add only unique symbols that aren't already in the list
    const newSymbols = [...symbols];
    selectedSymbolsArray.forEach(sym => {
      if (!newSymbols.includes(sym)) {
        newSymbols.push(sym);
      }
    });
    setSymbols(newSymbols);
    setWatchlistDialogOpen(false);
    setSelectedWatchlistSymbols(new Set());
  };

  async function runAgent() {
    if (!selectedIpsId) {
      setError("Please select an IPS");
      return;
    }
    if (symbols.length === 0) {
      setError("Please add at least one symbol");
      return;
    }

    setLoading(true);
    setError(null);
    setAgentStartTime(Date.now());
    setAgentProgress({ step: 1, label: '📋 Loading IPS Configuration...' });
    try {
      const res = await fetch("/api/agent/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          symbols,
          mode: "paper",
          ipsId: selectedIpsId,
          useV3: true  // Use Agent v3 with RAG and reasoning checkpoints
        }),
      });

      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Run failed");

      console.log(`[AgentSection] Agent ${json.version || 'v1'} returned ${json.selected?.length || 0} candidates`);

      // Log reasoning decisions from Agent v3
      if (json.reasoning_decisions && json.reasoning_decisions.length > 0) {
        console.log(`[AgentSection] Reasoning decisions:`, json.reasoning_decisions);
      }

      if (json.selected && json.selected.length > 0) {
        const firstCand = json.selected[0];
        console.log(`[AgentSection] First candidate check:`, {
          symbol: firstCand.symbol,
          composite_score: firstCand.composite_score,
          ips_score: firstCand.ips_score,
          tier: firstCand.tier,
          has_ips_factor_details: !!firstCand.ips_factor_details,
          ips_factor_details_keys: firstCand.ips_factor_details ? Object.keys(firstCand.ips_factor_details) : [],
          has_historical_analysis: !!firstCand.historical_analysis,
          has_detailed_analysis: !!firstCand.detailed_analysis,
          has_ips_factors: !!firstCand.detailed_analysis?.ips_factors,
          ips_factors_count: firstCand.detailed_analysis?.ips_factors?.length || 0,
          ips_name: firstCand.detailed_analysis?.ips_name || 'N/A',
        });
      }

      setRunId(json.runId || null);
      setCands(json.selected || []);
      setShowAllTrades(false); // Reset to showing top recommendations
      setCacheLoaded(false); // Mark as fresh results, not from cache
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
      setAgentStartTime(null);
      setAgentProgress({ step: 0, label: '' });
    }
  }

  const handleAddToProspective = async (candidate: Candidate, numContracts?: number) => {
    if (!runId) return;

    const contracts = numContracts || parseInt(numberOfContracts) || 1;

    // Auto-extract values from candidate data
    const shortLeg = candidate.contract_legs?.find(l => l.type === "SELL");
    const deltaValue = shortLeg?.delta ? Math.abs(shortLeg.delta) : null;
    const thetaValue = (shortLeg as any)?.theta ? parseFloat((shortLeg as any).theta) : null;
    const vegaValue = (shortLeg as any)?.vega ? parseFloat((shortLeg as any).vega) : null;
    const ivValue = (shortLeg as any)?.iv ? parseFloat((shortLeg as any).iv) * 100 : null;
    const sectorValue = candidate.detailed_analysis?.api_data?.sector || null;

    setAddingToProspective(true);
    try {
      const res = await fetch("/api/prospectives", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: candidate.id,
          run_id: runId,
          user_id: userId,
          symbol: candidate.symbol,
          strategy: candidate.strategy,
          contract_legs: candidate.contract_legs,
          entry_mid: candidate.entry_mid,
          est_pop: candidate.est_pop,
          breakeven: candidate.breakeven,
          max_loss: candidate.max_loss,
          max_profit: candidate.max_profit,
          rationale: candidate.rationale,
          guardrail_flags: candidate.guardrail_flags,
          ips_id: selectedIpsId,
          ips_score: candidate.score,
          expiration_date: candidate.contract_legs?.[0]?.expiry,
          number_of_contracts: contracts,
          delta_short_leg: deltaValue,
          theta: thetaValue,
          vega: vegaValue,
          iv_at_entry: ivValue,
          sector: sectorValue,
        }),
      });

      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to add prospective trade");

      // Remove the candidate from the list
      setCands(prevCands => prevCands.filter(c => c.id !== candidate.id));

      // Navigate to trades page with highlight
      router.push(`/trades?highlight=${encodeURIComponent(json.id)}`);
      setDetailsDialogOpen(false);

      // Reset number of contracts
      setNumberOfContracts("1");
    } catch (error: any) {
      setError(error.message);
    } finally {
      setAddingToProspective(false);
    }
  };

  return (
    <Card className="mb-6">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Bot className="h-5 w-5" />
          AI Trade Agent
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {/* IPS Selector */}
          <div className="space-y-2">
            <Label htmlFor="ips-select">Select IPS Configuration</Label>
            <select
              id="ips-select"
              className="w-full border border-[var(--glass-border)] rounded-md h-10 px-3 text-sm bg-[var(--glass-bg)] text-[var(--text-primary)] focus:border-[var(--gradient-primary-start)] focus:outline-none"
              value={selectedIpsId || ""}
              onChange={(e) => setSelectedIpsId(e.target.value || null)}
            >
              <option value="">Choose an IPS...</option>
              {availableIPSs.map((ips) => (
                <option key={ips.id} value={ips.id}>
                  {ips.name}
                </option>
              ))}
            </select>
          </div>

          {/* Symbol Input */}
          <div className="space-y-2">
            <Label htmlFor="symbol-input">Enter Ticker Symbols</Label>
            <div className="flex gap-2">
              <Input
                id="symbol-input"
                placeholder="Enter symbol (e.g., AAPL)"
                value={symbolInput}
                onChange={(e) => setSymbolInput(e.target.value.toUpperCase())}
                onKeyPress={handleKeyPress}
                className="flex-1"
              />
              <Button
                onClick={handleAddSymbol}
                variant="outline"
                disabled={!symbolInput.trim()}
              >
                Add
              </Button>
              <Button
                onClick={handleOpenWatchlistDialog}
                variant="outline"
                className="whitespace-nowrap"
              >
                <List className="h-4 w-4 mr-2" />
                Select from Watchlist
              </Button>
            </div>

            {/* Symbol Tags */}
            {symbols.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-2">
                {symbols.map((symbol) => (
                  <Badge
                    key={symbol}
                    variant="secondary"
                    className="flex items-center gap-1 px-3 py-1"
                  >
                    {symbol}
                    <X
                      className="h-3 w-3 cursor-pointer hover:text-red-600"
                      onClick={() => handleRemoveSymbol(symbol)}
                    />
                  </Badge>
                ))}
              </div>
            )}
          </div>

          {/* Run Agent Button */}
          <div className="flex items-center gap-3">
            <Button
              onClick={runAgent}
              disabled={loading || symbols.length === 0 || !selectedIpsId}
              className="bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white"
            >
              {loading ? (
                <>
                  <span className="animate-spin mr-2">⚙️</span>
                  Running Agent...
                </>
              ) : (
                <>
                  <Bot className="h-4 w-4 mr-2" />
                  Run Agent
                  {symbols.length > 0 && ` (${symbols.length})`}
                </>
              )}
            </Button>
            {runId && !loading && (
              <span className="text-sm text-muted-foreground">
                Run ID: {runId.slice(0, 8)}...
              </span>
            )}
          </div>

          {/* Progress Bar */}
          {loading && agentProgress.step > 0 && (
            <Card className="border-2 border-primary/20 bg-primary/5">
              <CardContent className="pt-6">
                <AgentProgressBar
                  currentStep={agentProgress.step}
                  totalSteps={8}
                  currentStepLabel={agentProgress.label}
                />
              </CardContent>
            </Card>
          )}

          {error && (
            <div className="flex items-center gap-2 text-red-600 text-sm bg-red-50 dark:bg-red-900/20 p-3 rounded">
              <AlertCircle className="h-4 w-4" />
              {error}
            </div>
          )}

          {/* Loading Cache Indicator */}
          {loadingCache && (
            <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground py-8">
              <span className="animate-spin">⚙️</span>
              Loading previous results...
            </div>
          )}

          {/* No Results - First Time or No Cache */}
          {!loadingCache && !loading && cands?.length === 0 && (
            <div className="text-center py-8 text-muted-foreground text-sm">
              <Bot className="h-12 w-12 mx-auto mb-3 opacity-50" />
              <p>No agent results yet</p>
              <p className="text-xs mt-1">Select an IPS, add symbols, and run the agent</p>
            </div>
          )}

          {cands?.length > 0 && !loadingCache && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <div className="text-sm font-medium">
                      Found {cands.length} potential trades
                      {!showAllTrades && cands.length > initialDisplayCount && (
                        <span className="text-muted-foreground ml-2">
                          (showing top {initialDisplayCount})
                        </span>
                      )}
                    </div>
                    {cacheLoaded && (
                      <Badge variant="outline" className="text-xs">
                        📂 Cached
                      </Badge>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    {(() => {
                      const uniqueSymbols = new Set(cands.map(c => c.symbol));
                      const symbolCount = uniqueSymbols.size;
                      const watchlistCount = symbols.length;
                      const passRate = Math.round((symbolCount / watchlistCount) * 100);

                      return (
                        <>
                          {symbolCount} unique {symbolCount === 1 ? 'stock' : 'stocks'} • {watchlistCount} in watchlist
                          {symbolCount < watchlistCount && (
                            <span className="ml-2 text-yellow-600 dark:text-yellow-500">
                              ({passRate}% pass rate - {watchlistCount - symbolCount} filtered by IPS)
                            </span>
                          )}
                        </>
                      );
                    })()}
                  </div>
                </div>
                <div className="text-xs text-muted-foreground">
                  Sorted by IPS fit score
                </div>
              </div>

              {/* Compact Horizontal Bars */}
              <div className="space-y-2">
                {(showAllTrades ? cands : cands.slice(0, initialDisplayCount)).map((c) => {
                  // Calculate DTE
                  const getDTE = () => {
                    if (!c.contract_legs || c.contract_legs.length === 0) return 0;
                    const expiry = c.contract_legs[0].expiry;
                    const expiryDate = new Date(expiry);
                    const today = new Date();
                    const diffTime = expiryDate.getTime() - today.getTime();
                    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                  };

                  // Get short and long strikes
                  const shortLeg = c.contract_legs?.find(l => l.type === 'SELL');
                  const longLeg = c.contract_legs?.find(l => l.type === 'BUY');
                  const shortStrike = shortLeg?.strike || 0;
                  const longStrike = longLeg?.strike || 0;
                  const contractType = shortLeg?.right || 'P';

                  return (
                    <TradeBarCompact
                      key={c.id}
                      score={c.ips_score || c.composite_score || c.score || 0}
                      symbol={c.symbol}
                      strategy={c.strategy}
                      shortStrike={shortStrike}
                      longStrike={longStrike}
                      dte={getDTE()}
                      entryPrice={c.entry_mid}
                      contractType={contractType === 'P' ? 'PUT' : 'CALL'}
                      intelligenceAdjustments={c.intelligence_adjustments}
                      onViewDetails={() => {
                        setSelectedCandidate(c);
                        setNumberOfContracts("1");
                        setDetailsDialogOpen(true);
                      }}
                    />
                  );
                })}
              </div>

              {/* Show More / Show Less Button */}
              {cands.length > initialDisplayCount && (
                <div className="flex justify-center pt-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowAllTrades(!showAllTrades)}
                    className="min-w-[200px]"
                  >
                    {showAllTrades ? (
                      <>Show Top {initialDisplayCount} Only</>
                    ) : (
                      <>Show All {cands.length} Trades</>
                    )}
                  </Button>
                </div>
              )}

              {/* Few Results Info Card */}
              {(() => {
                const uniqueSymbols = new Set(cands.map(c => c.symbol));
                const symbolCount = uniqueSymbols.size;
                const watchlistCount = symbols.length;
                const filteredCount = watchlistCount - symbolCount;

                if (symbolCount < watchlistCount * 0.3 && filteredCount > 5) {
                  return (
                    <Card className="border-yellow-200 dark:border-yellow-800 bg-yellow-50 dark:bg-yellow-900/10 mt-4">
                      <CardContent className="pt-6">
                        <div className="flex items-start gap-3">
                          <AlertCircle className="h-5 w-5 text-yellow-600 dark:text-yellow-500 flex-shrink-0 mt-0.5" />
                          <div className="space-y-2 text-sm">
                            <p className="font-medium text-yellow-900 dark:text-yellow-200">
                              Limited Results: Only {symbolCount}/{watchlistCount} stocks passed IPS criteria
                            </p>
                            <p className="text-yellow-800 dark:text-yellow-300">
                              The agent filtered out {filteredCount} stocks that didn't meet your IPS requirements.
                              This is working as intended - the agent won't recommend trades that don't fit your strategy.
                            </p>
                            <div className="pt-2 space-y-1 text-xs text-yellow-700 dark:text-yellow-400">
                              <p><strong>Common reasons for filtering:</strong></p>
                              <ul className="list-disc list-inside space-y-0.5 ml-2">
                                <li>IV Rank too low (stock not volatile enough)</li>
                                <li>Poor liquidity (low open interest or volume)</li>
                                <li>Unfavorable options chain structure</li>
                                <li>Stock doesn't meet fundamental criteria</li>
                                <li>No suitable contract strikes at target delta</li>
                              </ul>
                              <p className="pt-2">
                                <strong>To get more recommendations:</strong> Consider adjusting your IPS thresholds or
                                adding more stocks to your watchlist.
                              </p>
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                }
                return null;
              })()}
            </div>
          )}
        </div>
      </CardContent>

      {/* Trade Details Modal with Alpha Intelligence */}
      {selectedCandidate && (
        <TradeDetailsModal
          open={detailsDialogOpen}
          onOpenChange={setDetailsDialogOpen}
          candidate={selectedCandidate}
          onAddToProspective={handleAddToProspective}
        />
      )}

      {/* Old Dialog for Adding to Prospective Trades (kept for compatibility) */}
      <Dialog open={false} onOpenChange={() => {}}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Bot className="h-5 w-5 text-purple-600" />
              Trade Analysis: {selectedCandidate?.symbol} {selectedCandidate?.strategy.replace(/_/g, " ")}
            </DialogTitle>
          </DialogHeader>

          {selectedCandidate && (
            <div className="space-y-6">
              {/* Trade Overview */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Trade Overview</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div>
                      <div className="text-xs text-muted-foreground">Entry Credit</div>
                      <div className="text-lg font-bold">${selectedCandidate.entry_mid?.toFixed(2) ?? "—"}</div>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground">Max Profit</div>
                      <div className="text-lg font-bold text-green-600">${selectedCandidate.max_profit?.toFixed(2) ?? "—"}</div>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground">Max Loss</div>
                      <div className="text-lg font-bold text-red-600">${selectedCandidate.max_loss?.toFixed(2) ?? "—"}</div>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground">Probability of Profit</div>
                      <div className="text-lg font-bold">{selectedCandidate.est_pop ? `${(selectedCandidate.est_pop * 100).toFixed(0)}%` : "—"}</div>
                    </div>
                  </div>
                  <div className="mt-4">
                    <div className="text-xs text-muted-foreground mb-2">Contract Legs</div>
                    <div className="space-y-1">
                      {selectedCandidate.contract_legs.map((leg, i) => (
                        <div key={i} className="text-sm flex items-center gap-2">
                          <Badge variant={leg.type === "SELL" ? "default" : "outline"}>
                            {leg.type}
                          </Badge>
                          <span>{leg.right === "P" ? "Put" : "Call"}</span>
                          <span className="font-medium">${leg.strike}</span>
                          <span className="text-muted-foreground">exp: {new Date(leg.expiry).toLocaleDateString()}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Enhanced IPS Factor Scorecard */}
              {(selectedCandidate.ips_factor_details || selectedCandidate.detailed_analysis?.ips_factor_details) && (
                <>
                  {console.log('[AgentSection] Rendering FactorScorecard with data:', selectedCandidate.ips_factor_details || selectedCandidate.detailed_analysis?.ips_factor_details)}
                  <FactorScorecard
                    ipsFactorDetails={selectedCandidate.ips_factor_details || selectedCandidate.detailed_analysis?.ips_factor_details}
                    compact={false}
                  />
                </>
              )}

              {/* Fallback: Old IPS Criteria Comparison */}
              {!selectedCandidate.ips_factor_details && !selectedCandidate.detailed_analysis?.ips_factor_details &&
               selectedCandidate.detailed_analysis?.ips_factors && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">
                      IPS Criteria Analysis
                      {selectedCandidate.detailed_analysis.ips_name && (
                        <span className="text-sm font-normal text-muted-foreground ml-2">
                          ({selectedCandidate.detailed_analysis.ips_name})
                        </span>
                      )}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b">
                            <th className="text-left py-2 px-3 font-medium">Factor</th>
                            <th className="text-left py-2 px-3 font-medium">Target</th>
                            <th className="text-left py-2 px-3 font-medium">Actual</th>
                            <th className="text-left py-2 px-3 font-medium">Weight</th>
                            <th className="text-left py-2 px-3 font-medium">Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {selectedCandidate.detailed_analysis.ips_factors.map((factor, i) => (
                            <tr key={i} className="border-b hover:bg-gray-50 dark:hover:bg-gray-800">
                              <td className="py-2 px-3 font-medium">{factor.name}</td>
                              <td className="py-2 px-3 text-muted-foreground">{factor.target || "N/A"}</td>
                              <td className="py-2 px-3">{factor.actual ?? "N/A"}</td>
                              <td className="py-2 px-3 text-muted-foreground">{factor.weight || "N/A"}</td>
                              <td className="py-2 px-3">
                                <Badge
                                  className={
                                    factor.status === "pass"
                                      ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"
                                      : factor.status === "warning"
                                      ? "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200"
                                      : "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200"
                                  }
                                >
                                  {factor.status === "pass" ? "✓ Pass" :
                                   factor.status === "warning" ? "⚠ Warning" : "✗ Fail"}
                                </Badge>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Stock Fundamentals */}
              {selectedCandidate.detailed_analysis?.api_data && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Stock Fundamentals</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
                      <div>
                        <div className="text-xs text-muted-foreground">Company</div>
                        <div className="font-medium">{selectedCandidate.detailed_analysis.api_data.company_name || "N/A"}</div>
                      </div>
                      <div>
                        <div className="text-xs text-muted-foreground">Sector</div>
                        <div className="font-medium">{selectedCandidate.detailed_analysis.api_data.sector || "N/A"}</div>
                      </div>
                      <div>
                        <div className="text-xs text-muted-foreground">Industry</div>
                        <div className="font-medium">{selectedCandidate.detailed_analysis.api_data.industry || "N/A"}</div>
                      </div>
                      <div>
                        <div className="text-xs text-muted-foreground">Market Cap</div>
                        <div className="font-medium">{selectedCandidate.detailed_analysis.api_data.market_cap || "N/A"}</div>
                      </div>
                      <div>
                        <div className="text-xs text-muted-foreground">P/E Ratio</div>
                        <div className="font-medium">{selectedCandidate.detailed_analysis.api_data.pe_ratio || "N/A"}</div>
                      </div>
                      <div>
                        <div className="text-xs text-muted-foreground">Beta</div>
                        <div className="font-medium">{selectedCandidate.detailed_analysis.api_data.beta || "N/A"}</div>
                      </div>
                      <div>
                        <div className="text-xs text-muted-foreground">EPS</div>
                        <div className="font-medium">{selectedCandidate.detailed_analysis.api_data.eps || "N/A"}</div>
                      </div>
                      <div>
                        <div className="text-xs text-muted-foreground">Dividend Yield</div>
                        <div className="font-medium">{selectedCandidate.detailed_analysis.api_data.dividend_yield || "N/A"}</div>
                      </div>
                      <div>
                        <div className="text-xs text-muted-foreground">Profit Margin</div>
                        <div className="font-medium">{selectedCandidate.detailed_analysis.api_data.profit_margin || "N/A"}</div>
                      </div>
                      <div>
                        <div className="text-xs text-muted-foreground">ROE</div>
                        <div className="font-medium">{selectedCandidate.detailed_analysis.api_data.roe || "N/A"}</div>
                      </div>
                      <div>
                        <div className="text-xs text-muted-foreground">52-Week High</div>
                        <div className="font-medium">{selectedCandidate.detailed_analysis.api_data.week52_high || "N/A"}</div>
                      </div>
                      <div>
                        <div className="text-xs text-muted-foreground">52-Week Low</div>
                        <div className="font-medium">{selectedCandidate.detailed_analysis.api_data.week52_low || "N/A"}</div>
                      </div>
                      <div>
                        <div className="text-xs text-muted-foreground">Analyst Target</div>
                        <div className="font-medium">{selectedCandidate.detailed_analysis.api_data.analyst_target || "N/A"}</div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Recent News */}
              {(selectedCandidate.detailed_analysis?.news_results || selectedCandidate.detailed_analysis?.tavily_error) && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Recent News & Research</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {selectedCandidate.detailed_analysis.tavily_error ? (
                      <div className="flex items-center gap-2 text-amber-600 text-sm bg-amber-50 dark:bg-amber-900/20 p-3 rounded">
                        <AlertCircle className="h-4 w-4" />
                        News search failed: {selectedCandidate.detailed_analysis.tavily_error}
                      </div>
                    ) : selectedCandidate.detailed_analysis.news_results && selectedCandidate.detailed_analysis.news_results.length > 0 ? (
                      <div className="space-y-3">
                        {selectedCandidate.detailed_analysis.news_results.map((article, i) => (
                          <div key={i} className="border-l-2 border-blue-500 pl-3 py-2">
                            <a
                              href={article.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="font-medium text-sm hover:text-blue-600 hover:underline"
                            >
                              {article.title}
                            </a>
                            <p className="text-xs text-muted-foreground mt-1">{article.snippet}</p>
                            {article.published_at && (
                              <p className="text-xs text-muted-foreground mt-1">
                                {new Date(article.published_at).toLocaleDateString()}
                              </p>
                            )}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-sm text-muted-foreground">No recent news found</div>
                    )}
                  </CardContent>
                </Card>
              )}

              {/* Social Media Sentiment */}
              {selectedCandidate.metadata?.reddit && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2">
                      <Users className="h-4 w-4" />
                      Social Media Sentiment
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {(() => {
                      const reddit = selectedCandidate.metadata.reddit;
                      const sentimentLabel =
                        reddit.sentiment_score > 0.3 ? "Bullish" :
                        reddit.sentiment_score < -0.3 ? "Bearish" : "Neutral";
                      const sentimentColor =
                        reddit.sentiment_score > 0.3 ? "text-green-600" :
                        reddit.sentiment_score < -0.3 ? "text-red-600" : "text-gray-600";
                      const velocityLabel =
                        reddit.mention_velocity > 50 ? "🔥 High" :
                        reddit.mention_velocity > 0 ? "📈 Rising" :
                        reddit.mention_velocity < -50 ? "❄️ Declining" : "➡️ Stable";

                      return (
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                          <div>
                            <div className="text-xs text-muted-foreground mb-1">Sentiment</div>
                            <div className={`font-bold ${sentimentColor}`}>
                              {sentimentLabel}
                            </div>
                            <div className="text-xs text-muted-foreground mt-1">
                              Score: {reddit.sentiment_score.toFixed(2)}
                            </div>
                          </div>
                          <div>
                            <div className="text-xs text-muted-foreground mb-1">Mentions (24h)</div>
                            <div className="font-bold">{reddit.mention_count.toLocaleString()}</div>
                            <Badge variant={reddit.confidence === 'high' ? 'default' : reddit.confidence === 'medium' ? 'secondary' : 'outline'} className="mt-1 text-xs">
                              {reddit.confidence} confidence
                            </Badge>
                          </div>
                          <div>
                            <div className="text-xs text-muted-foreground mb-1">Trending Rank</div>
                            <div className="font-bold">
                              {reddit.trending_rank !== null ? (
                                <>
                                  #{reddit.trending_rank}
                                  {reddit.trending_rank <= 10 && <span className="ml-1 text-red-600">⚠️</span>}
                                </>
                              ) : (
                                <span className="text-muted-foreground">Not trending</span>
                              )}
                            </div>
                            {reddit.trending_rank !== null && reddit.trending_rank <= 10 && (
                              <div className="text-xs text-red-600 mt-1">
                                Meme stock risk
                              </div>
                            )}
                          </div>
                          <div>
                            <div className="text-xs text-muted-foreground mb-1">Mention Velocity</div>
                            <div className="font-bold">{velocityLabel}</div>
                            <div className="text-xs text-muted-foreground mt-1">
                              {reddit.mention_velocity > 0 ? '+' : ''}{reddit.mention_velocity}%
                            </div>
                            {reddit.mention_velocity > 50 && (
                              <div className="text-xs text-amber-600 mt-1">
                                Wait for IV expansion
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })()}
                  </CardContent>
                </Card>
              )}

              {/* AI Analysis */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Bot className="h-4 w-4" />
                    AI Trade Rationale
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {selectedCandidate.rationale && (
                    <div className="prose prose-sm max-w-none">
                      <p className="text-sm leading-relaxed">{selectedCandidate.rationale}</p>
                    </div>
                  )}

                  {selectedCandidate.detailed_analysis?.news_summary && (
                    <div>
                      <h4 className="text-sm font-medium mb-2">Recent News & Market Context</h4>
                      <p className="text-sm text-muted-foreground">{selectedCandidate.detailed_analysis.news_summary}</p>
                    </div>
                  )}

                  {selectedCandidate.detailed_analysis?.macro_context && (
                    <div>
                      <h4 className="text-sm font-medium mb-2">Macro Economic Context</h4>
                      <p className="text-sm text-muted-foreground">{selectedCandidate.detailed_analysis.macro_context}</p>
                    </div>
                  )}

                  {selectedCandidate.detailed_analysis?.out_of_ips_justification && (
                    <div className="border-l-4 border-blue-400 bg-blue-50 dark:bg-blue-900/10 p-5 rounded-r-lg">
                      <h4 className="text-sm font-semibold mb-3 text-blue-900 dark:text-blue-300 flex items-center gap-2">
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        Professional Assessment
                      </h4>
                      <p className="text-sm leading-relaxed text-gray-700 dark:text-gray-300">
                        {selectedCandidate.detailed_analysis.out_of_ips_justification}
                      </p>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Trade Entry Details */}
              <Card className="bg-gray-50 dark:bg-gray-800">
                <CardHeader>
                  <CardTitle className="text-base">Trade Entry Details</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Only manual input: Number of Contracts */}
                  <div className="space-y-2">
                    <Label htmlFor="contracts-input" className="text-sm font-medium">
                      Number of Contracts
                    </Label>
                    <Input
                      id="contracts-input"
                      type="number"
                      min="1"
                      value={numberOfContracts}
                      onChange={(e) => setNumberOfContracts(e.target.value)}
                      placeholder="1"
                      className="max-w-xs"
                    />
                  </div>

                  {/* Auto-populated data (read-only display) */}
                  <div>
                    <h4 className="text-sm font-medium mb-3">Auto-Populated Metrics from Options Chain</h4>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
                      <div>
                        <div className="text-xs text-muted-foreground">Delta (Short Leg)</div>
                        <div className="font-medium">
                          {selectedCandidate.contract_legs.find(l => l.type === "SELL")?.delta
                            ? Math.abs(selectedCandidate.contract_legs.find(l => l.type === "SELL")!.delta!).toFixed(3)
                            : "N/A"}
                        </div>
                      </div>
                      <div>
                        <div className="text-xs text-muted-foreground">Theta</div>
                        <div className="font-medium">
                          {(selectedCandidate.contract_legs.find(l => l.type === "SELL") as any)?.theta?.toFixed(3) || "N/A"}
                        </div>
                      </div>
                      <div>
                        <div className="text-xs text-muted-foreground">Vega</div>
                        <div className="font-medium">
                          {(selectedCandidate.contract_legs.find(l => l.type === "SELL") as any)?.vega?.toFixed(3) || "N/A"}
                        </div>
                      </div>
                      <div>
                        <div className="text-xs text-muted-foreground">IV at Entry</div>
                        <div className="font-medium">
                          {(selectedCandidate.contract_legs.find(l => l.type === "SELL") as any)?.iv
                            ? ((selectedCandidate.contract_legs.find(l => l.type === "SELL") as any).iv * 100).toFixed(1) + "%"
                            : "N/A"}
                        </div>
                      </div>
                      <div>
                        <div className="text-xs text-muted-foreground">Sector</div>
                        <div className="font-medium">
                          {selectedCandidate.detailed_analysis?.api_data?.sector || "N/A"}
                        </div>
                      </div>
                      <div>
                        <div className="text-xs text-muted-foreground">Open Interest</div>
                        <div className="font-medium">
                          {(selectedCandidate.contract_legs.find(l => l.type === "SELL") as any)?.oi?.toLocaleString() || "N/A"}
                        </div>
                      </div>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Metrics are automatically extracted from options chain and fundamental data
                  </p>
                </CardContent>
              </Card>

              {/* Actions */}
              <div className="flex gap-3">
                <Button
                  className="flex-1"
                  onClick={() => handleAddToProspective(selectedCandidate)}
                  disabled={addingToProspective || !numberOfContracts || parseInt(numberOfContracts) < 1}
                >
                  {addingToProspective ? (
                    <>
                      <span className="animate-spin mr-2">⚙️</span>
                      Adding...
                    </>
                  ) : (
                    <>
                      <TrendingUp className="h-4 w-4 mr-2" />
                      Add to Prospective Trades
                    </>
                  )}
                </Button>
                <Button variant="outline" onClick={() => setDetailsDialogOpen(false)} disabled={addingToProspective}>
                  Close
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
          </DialogHeader>
          <div className="space-y-4">
            {loadingWatchlist ? (
              <div className="text-center py-8 text-muted-foreground">
                Loading watchlist...
              </div>
            ) : watchlistItems.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                Your watchlist is empty. Add symbols to your watchlist first.
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
    </Card>
  );
}
