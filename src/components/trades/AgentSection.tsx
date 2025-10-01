"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Bot, TrendingUp, AlertCircle, X, Eye, ChevronRight } from "lucide-react";

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
  detailed_analysis?: {
    ips_factors?: Array<{
      name: string;
      target?: string;
      actual?: string | number;
      status: "pass" | "fail" | "warning";
    }>;
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
    try {
      const res = await fetch("/api/agent/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ symbols, mode: "paper", ipsId: selectedIpsId }),
      });

      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Run failed");

      setRunId(json.runId || null);
      setCands(json.selected || []);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  const handleAddToProspective = async (candidate: Candidate) => {
    if (!runId) return;

    setAddingToProspective(true);
    try {
      const res = await fetch("/api/prospectives", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: candidate.id,
          run_id: runId,
          user_id: userId, // Add userId to ensure consistency
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
        }),
      });

      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to add prospective trade");

      // Navigate to trades page with highlight
      router.push(`/trades?highlight=${encodeURIComponent(json.id)}`);
      setDetailsDialogOpen(false);
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
              className="w-full border rounded-md h-10 px-3 text-sm"
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
                  Analyzing {symbols.length} symbol{symbols.length !== 1 ? "s" : ""}...
                </>
              ) : (
                <>
                  <Bot className="h-4 w-4 mr-2" />
                  Run Agent
                  {symbols.length > 0 && ` (${symbols.length})`}
                </>
              )}
            </Button>
            {runId && (
              <span className="text-sm text-muted-foreground">
                Run ID: {runId.slice(0, 8)}...
              </span>
            )}
          </div>

          {error && (
            <div className="flex items-center gap-2 text-red-600 text-sm bg-red-50 dark:bg-red-900/20 p-3 rounded">
              <AlertCircle className="h-4 w-4" />
              {error}
            </div>
          )}

          {cands?.length > 0 && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="text-sm font-medium">
                  Found {cands.length} potential trades
                </div>
                <div className="text-xs text-muted-foreground">
                  Sorted by IPS fit score
                </div>
              </div>
              <div className="space-y-2 max-h-[500px] overflow-y-auto">
                {cands.slice(0, 10).map((c) => (
                  <div key={c.id} className="border rounded-lg p-4 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                    <div className="flex items-center justify-between gap-4">
                      {/* Left: Symbol and Strategy */}
                      <div className="flex items-center gap-3 flex-1">
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-lg font-bold">{c.symbol}</span>
                            <Badge variant="outline" className="text-xs">
                              {c.strategy.replace(/_/g, " ")}
                            </Badge>
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {c.contract_legs.map((l, i) => (
                              <span key={i}>
                                {i > 0 && " / "}
                                {l.type} {l.right} ${l.strike}
                              </span>
                            ))}
                          </div>
                        </div>
                      </div>

                      {/* Middle: Quick Stats */}
                      <div className="flex items-center gap-6 text-sm">
                        <div className="text-center">
                          <div className="text-xs text-muted-foreground">Entry</div>
                          <div className="font-medium">${c.entry_mid?.toFixed(2) ?? "—"}</div>
                        </div>
                        <div className="text-center">
                          <div className="text-xs text-muted-foreground">Max P</div>
                          <div className="font-medium text-green-600">${c.max_profit?.toFixed(2) ?? "—"}</div>
                        </div>
                        <div className="text-center">
                          <div className="text-xs text-muted-foreground">POP</div>
                          <div className="font-medium">{c.est_pop ? `${(c.est_pop * 100).toFixed(0)}%` : "—"}</div>
                        </div>
                      </div>

                      {/* Right: IPS Fit and Actions */}
                      <div className="flex items-center gap-3">
                        {c.score !== undefined && (
                          <div className="text-center">
                            <div className="text-xs text-muted-foreground mb-1">IPS Fit</div>
                            <Badge
                              className={
                                c.score >= 70
                                  ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"
                                  : c.score >= 50
                                  ? "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200"
                                  : "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200"
                              }
                            >
                              {c.score.toFixed(0)}%
                            </Badge>
                          </div>
                        )}
                        {c.guardrail_flags && Object.values(c.guardrail_flags).some((v) => v) && (
                          <AlertCircle className="h-5 w-5 text-amber-600" />
                        )}
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setSelectedCandidate(c);
                            setDetailsDialogOpen(true);
                          }}
                        >
                          <Eye className="h-4 w-4 mr-1" />
                          View Details
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </CardContent>

      {/* Trade Details Dialog */}
      <Dialog open={detailsDialogOpen} onOpenChange={setDetailsDialogOpen}>
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

              {/* IPS Criteria Comparison */}
              {selectedCandidate.detailed_analysis?.ips_factors && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">IPS Criteria Analysis</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {selectedCandidate.detailed_analysis.ips_factors.map((factor, i) => (
                        <div key={i} className="flex items-center justify-between p-3 border rounded">
                          <div className="flex-1">
                            <div className="font-medium text-sm">{factor.name}</div>
                            <div className="text-xs text-muted-foreground">
                              Target: {factor.target || "N/A"} | Actual: {factor.actual ?? "N/A"}
                            </div>
                          </div>
                          <Badge
                            variant={
                              factor.status === "pass" ? "default" :
                              factor.status === "warning" ? "secondary" : "destructive"
                            }
                          >
                            {factor.status === "pass" ? "✓ Pass" :
                             factor.status === "warning" ? "⚠ Warning" : "✗ Fail"}
                          </Badge>
                        </div>
                      ))}
                    </div>
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
                    <div className="border-l-4 border-amber-500 bg-amber-50 dark:bg-amber-900/20 p-4">
                      <h4 className="text-sm font-medium mb-2 text-amber-900 dark:text-amber-200">
                        ⚠️ Out-of-IPS Justification
                      </h4>
                      <p className="text-sm text-amber-800 dark:text-amber-300">
                        {selectedCandidate.detailed_analysis.out_of_ips_justification}
                      </p>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Actions */}
              <div className="flex gap-3">
                <Button
                  className="flex-1"
                  onClick={() => handleAddToProspective(selectedCandidate)}
                  disabled={addingToProspective}
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
    </Card>
  );
}
