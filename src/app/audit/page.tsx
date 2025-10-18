"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, AlertCircle, TrendingUp, Target, Zap, Play, Loader2 } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { createClient } from "@/lib/supabase/client";
import {
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ZAxis,
  Cell,
  BarChart,
  Bar,
  Legend,
  ReferenceLine
} from "recharts";
import { CheckCircle, XCircle, MinusCircle } from "lucide-react";

interface AuditResult {
  symbol: string;
  currentPrice: number;
  totalCombinations: number;
  expirationsTested: number;
  spreadWidthsTested: number[];
  topByComposite: any[];
  topByIPS: any[];
  topByYield: any[];
  topByEV: any[];
  agentTrade: any;
  agentRank?: number;
  isOptimal: boolean;
  stats: {
    composite: { min: number; max: number; avg: number; median: number };
    ips: { min: number; max: number; avg: number; median: number };
    yield: { min: number; max: number; avg: number; median: number };
  };
}

interface IPSConfig {
  id: string;
  name: string;
  description?: string;
}

export default function OptimalityAuditPage() {
  const [selectedSymbol, setSelectedSymbol] = useState<string>("");
  const [selectedIPS, setSelectedIPS] = useState<string>("");
  const [ipsConfigs, setIpsConfigs] = useState<IPSConfig[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [result, setResult] = useState<AuditResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedTrade, setSelectedTrade] = useState<any | null>(null);
  const [showFactorModal, setShowFactorModal] = useState(false);

  // Common watchlist symbols - you could fetch this from your database
  const watchlistSymbols = ["AMD", "NVDA", "TSLA", "AAPL", "MSFT", "GOOGL", "AMZN", "META"];

  const handleTradeClick = (trade: any) => {
    setSelectedTrade(trade);
    setShowFactorModal(true);
  };

  // Fetch IPS configurations on mount
  useEffect(() => {
    const fetchIPSConfigs = async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("ips_configurations")
        .select("id, name, description")
        .order("created_at", { ascending: false });

      if (data && !error) {
        setIpsConfigs(data);
        // Auto-select first IPS
        if (data.length > 0) {
          setSelectedIPS(data[0].id);
        }
      }
    };

    fetchIPSConfigs();
  }, []);

  const runAudit = async () => {
    if (!selectedSymbol || !selectedIPS) return;

    setIsRunning(true);
    setError(null);
    setResult(null);

    try {
      const response = await fetch("/api/audit/optimality", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          symbol: selectedSymbol,
          ipsId: selectedIPS
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Audit failed");
      }

      const data = await response.json();
      setResult(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold gradient-text-primary mb-2">
          Agent Optimality Audit
        </h1>
        <p className="text-[var(--text-secondary)]">
          Verify that the AI agent is recommending the BEST trades, not just acceptable ones.
        </p>
      </div>

      {/* Configuration Selectors */}
      <Card className="glass-card p-6 mb-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          <div>
            <label className="block text-sm font-medium mb-2" style={{ color: "var(--text-primary)" }}>
              Select Stock to Audit
            </label>
            <Select value={selectedSymbol} onValueChange={setSelectedSymbol}>
              <SelectTrigger className="w-full glass-card">
                <SelectValue placeholder="Choose a symbol..." />
              </SelectTrigger>
              <SelectContent className="glass-card">
                {watchlistSymbols.map((sym) => (
                  <SelectItem key={sym} value={sym}>
                    {sym}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-2" style={{ color: "var(--text-primary)" }}>
              Select IPS Configuration
            </label>
            <Select value={selectedIPS} onValueChange={setSelectedIPS}>
              <SelectTrigger className="w-full glass-card">
                <SelectValue placeholder="Choose an IPS..." />
              </SelectTrigger>
              <SelectContent className="glass-card">
                {ipsConfigs.map((ips) => (
                  <SelectItem key={ips.id} value={ips.id}>
                    {ips.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <Button
          onClick={runAudit}
          disabled={!selectedSymbol || !selectedIPS || isRunning}
          className="gradient-bg-primary text-white px-8 w-full md:w-auto"
        >
          {isRunning ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Running Audit...
            </>
          ) : (
            <>
              <Play className="mr-2 h-4 w-4" />
              Run Audit
            </>
          )}
        </Button>
      </Card>

      {/* Error Display */}
      {error && (
        <Card className="glass-card p-6 mb-6 border-2 border-red-500">
          <div className="flex items-center gap-3">
            <AlertCircle className="h-6 w-6 text-red-500" />
            <div>
              <h3 className="font-semibold text-red-500">Audit Failed</h3>
              <p className="text-sm text-[var(--text-secondary)]">{error}</p>
            </div>
          </div>
        </Card>
      )}

      {/* Results */}
      {result && (
        <div className="space-y-6">
          {/* Summary Card */}
          <Card className="glass-card p-6">
            <div className="flex items-start justify-between mb-6">
              <div>
                <h2 className="text-2xl font-bold mb-1" style={{ color: "var(--text-primary)" }}>
                  {result.symbol} - ${result.currentPrice.toFixed(2)}
                </h2>
                <p className="text-sm text-[var(--text-secondary)]">
                  Tested {result.totalCombinations.toLocaleString()} combinations across {result.expirationsTested} expirations
                </p>
              </div>
              {result.agentTrade && (
                <Badge
                  className={result.isOptimal ? "bg-green-500 text-white" : "bg-yellow-500 text-white"}
                >
                  {result.isOptimal ? (
                    <>
                      <CheckCircle2 className="mr-1 h-4 w-4" />
                      OPTIMAL
                    </>
                  ) : (
                    <>
                      <AlertCircle className="mr-1 h-4 w-4" />
                      SUB-OPTIMAL
                    </>
                  )}
                </Badge>
              )}
            </div>

            {/* Agent's Selection */}
            {result.agentTrade && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                <div className="glass-card p-4">
                  <div className="text-sm text-[var(--text-secondary)] mb-1">Agent's Selection</div>
                  <div className="text-lg font-bold" style={{ color: "var(--text-primary)" }}>
                    ${result.agentTrade.short_strike}/{result.agentTrade.long_strike} Put Spread
                  </div>
                  <div className="text-sm text-[var(--text-secondary)]">
                    {result.agentTrade.dte} DTE
                  </div>
                </div>
                <div className="glass-card p-4">
                  <div className="text-sm text-[var(--text-secondary)] mb-1">Rank (Composite)</div>
                  <div className="text-3xl font-bold gradient-text-primary">
                    #{result.agentRank}
                  </div>
                  <div className="text-sm text-[var(--text-secondary)]">
                    of {result.totalCombinations.toLocaleString()}
                  </div>
                </div>
                <div className="glass-card p-4">
                  <div className="text-sm text-[var(--text-secondary)] mb-1">Percentile</div>
                  <div className="text-3xl font-bold gradient-text-primary">
                    {result.agentRank ? ((1 - result.agentRank / result.totalCombinations) * 100).toFixed(1) : "N/A"}%
                  </div>
                  <div className="text-sm text-[var(--text-secondary)]">
                    {result.agentRank && result.agentRank <= 5 ? "Top 5!" : result.agentRank && result.agentRank <= 20 ? "Top 20" : "Could be better"}
                  </div>
                </div>
              </div>
            )}

            {/* Score Distribution */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="glass-card p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Target className="h-4 w-4 text-blue-500" />
                  <span className="text-sm font-medium">Composite Score</span>
                </div>
                <div className="text-xs text-[var(--text-secondary)] space-y-1">
                  <div>Range: {result.stats.composite.min.toFixed(1)} - {result.stats.composite.max.toFixed(1)}</div>
                  <div>Avg: {result.stats.composite.avg.toFixed(1)} | Median: {result.stats.composite.median.toFixed(1)}</div>
                </div>
              </div>
              <div className="glass-card p-4">
                <div className="flex items-center gap-2 mb-2">
                  <CheckCircle2 className="h-4 w-4 text-green-500" />
                  <span className="text-sm font-medium">IPS Score</span>
                </div>
                <div className="text-xs text-[var(--text-secondary)] space-y-1">
                  <div>Range: {result.stats.ips.min.toFixed(1)}% - {result.stats.ips.max.toFixed(1)}%</div>
                  <div>Avg: {result.stats.ips.avg.toFixed(1)}% | Median: {result.stats.ips.median.toFixed(1)}%</div>
                </div>
              </div>
              <div className="glass-card p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Zap className="h-4 w-4 text-yellow-500" />
                  <span className="text-sm font-medium">Yield Score</span>
                </div>
                <div className="text-xs text-[var(--text-secondary)] space-y-1">
                  <div>Range: {result.stats.yield.min.toFixed(1)} - {result.stats.yield.max.toFixed(1)}</div>
                  <div>Avg: {result.stats.yield.avg.toFixed(1)} | Median: {result.stats.yield.median.toFixed(1)}</div>
                </div>
              </div>
            </div>
          </Card>

          {/* Visualization Section */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Scatter Plot: IPS vs ROI */}
            <Card className="glass-card p-6">
              <h3 className="text-lg font-bold mb-4" style={{ color: "var(--text-primary)" }}>
                IPS Fit vs ROI Potential
              </h3>
              <p className="text-xs text-[var(--text-secondary)] mb-4">
                Shows highest IPS scores compared to potential return on investment. <strong>Click any dot to see factor breakdown.</strong>
              </p>
              <ResponsiveContainer width="100%" height={300}>
                <ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--glass-border)" />
                  <XAxis
                    type="number"
                    dataKey="ips_score"
                    name="IPS Score"
                    domain={[50, 100]}
                    label={{ value: "IPS Score (%)", position: "insideBottom", offset: -10, fill: "var(--text-secondary)" }}
                    tick={{ fill: "var(--text-secondary)", fontSize: 12 }}
                  />
                  <YAxis
                    type="number"
                    dataKey={(entry: any) => {
                      // Calculate ROI as (credit / max_loss) * 100
                      const credit = entry.entry_mid || 0;
                      const maxLoss = (entry.long_strike - entry.short_strike) - credit;
                      return maxLoss > 0 ? (credit / maxLoss) * 100 : 0;
                    }}
                    name="ROI %"
                    domain={[0, 'auto']}
                    label={{ value: "ROI %", angle: -90, position: "insideLeft", fill: "var(--text-secondary)" }}
                    tick={{ fill: "var(--text-secondary)", fontSize: 12 }}
                  />
                  <ZAxis type="number" dataKey="composite_score" range={[20, 400]} />
                  <Tooltip
                    content={({ active, payload }) => {
                      if (active && payload && payload.length) {
                        const data = payload[0].payload;
                        const credit = data.entry_mid || 0;
                        const maxLoss = (data.long_strike - data.short_strike) - credit;
                        const roi = maxLoss > 0 ? (credit / maxLoss) * 100 : 0;
                        return (
                          <div className="glass-card p-3 text-xs">
                            <p className="font-semibold">${data.short_strike}/{data.long_strike} - {data.dte}d</p>
                            <p className="text-green-500">IPS: {data.ips_score?.toFixed(1)}%</p>
                            <p className="text-blue-500">ROI: {roi.toFixed(1)}%</p>
                            <p className="text-yellow-500">Credit: ${credit.toFixed(2)}</p>
                          </div>
                        );
                      }
                      return null;
                    }}
                  />
                  <Scatter name="All Trades" data={result.topByComposite.slice(0, 50)} fill="#8884d8" onClick={(data: any) => handleTradeClick(data)}>
                    {result.topByComposite.slice(0, 50).map((entry: any, index: number) => {
                      const isAgent = result.agentTrade &&
                        Math.abs(entry.short_strike - result.agentTrade.short_strike) < 0.01 &&
                        Math.abs(entry.long_strike - result.agentTrade.long_strike) < 0.01;

                      // Color by composite score tier
                      let color = "#666"; // Low tier
                      if (entry.composite_score >= 65) color = "#10b981"; // Elite (green)
                      else if (entry.composite_score >= 60) color = "#3b82f6"; // Quality (blue)
                      else if (entry.composite_score >= 55) color = "#eab308"; // Speculative (yellow)

                      return (
                        <Cell
                          key={`cell-roi-${index}`}
                          fill={isAgent ? "#f59e0b" : color}
                          stroke={isAgent ? "#fff" : "none"}
                          strokeWidth={isAgent ? 2 : 0}
                        />
                      );
                    })}
                  </Scatter>
                </ScatterChart>
              </ResponsiveContainer>
              <div className="flex items-center justify-center gap-4 mt-2 text-xs">
                <div className="flex items-center gap-1">
                  <div className="w-3 h-3 rounded-full bg-[#10b981]"></div>
                  <span className="text-[var(--text-secondary)]">Elite (≥65)</span>
                </div>
                <div className="flex items-center gap-1">
                  <div className="w-3 h-3 rounded-full bg-[#3b82f6]"></div>
                  <span className="text-[var(--text-secondary)]">Quality (60-65)</span>
                </div>
                <div className="flex items-center gap-1">
                  <div className="w-3 h-3 rounded-full bg-[#eab308]"></div>
                  <span className="text-[var(--text-secondary)]">Speculative (55-60)</span>
                </div>
                {result.agentTrade && (
                  <div className="flex items-center gap-1">
                    <div className="w-3 h-3 rounded-full bg-[#f59e0b] border-2 border-white"></div>
                    <span className="text-[var(--text-secondary)]">Agent Pick</span>
                  </div>
                )}
              </div>
            </Card>

            {/* Scatter Plot: IPS vs Yield */}
            <Card className="glass-card p-6">
              <h3 className="text-lg font-bold mb-4" style={{ color: "var(--text-primary)" }}>
                IPS Fit vs Yield Tradeoff
              </h3>
              <p className="text-xs text-[var(--text-secondary)] mb-4">
                Each dot is a trade. Top-right corner = best of both worlds. <strong>Click any dot to see factor breakdown.</strong>
              </p>
              <ResponsiveContainer width="100%" height={300}>
                <ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--glass-border)" />
                  <XAxis
                    type="number"
                    dataKey="ips_score"
                    name="IPS Score"
                    domain={[50, 100]}
                    label={{ value: "IPS Score (%)", position: "insideBottom", offset: -10, fill: "var(--text-secondary)" }}
                    tick={{ fill: "var(--text-secondary)", fontSize: 12 }}
                  />
                  <YAxis
                    type="number"
                    dataKey="yield_score"
                    name="Yield Score"
                    domain={[0, 100]}
                    label={{ value: "Yield Score", angle: -90, position: "insideLeft", fill: "var(--text-secondary)" }}
                    tick={{ fill: "var(--text-secondary)", fontSize: 12 }}
                  />
                  <ZAxis type="number" dataKey="composite_score" range={[20, 400]} />
                  <Tooltip
                    content={({ active, payload }) => {
                      if (active && payload && payload.length) {
                        const data = payload[0].payload;
                        return (
                          <div className="glass-card p-3 text-xs">
                            <p className="font-semibold">${data.short_strike}/{data.long_strike} - {data.dte}d</p>
                            <p className="text-green-500">IPS: {data.ips_score?.toFixed(1)}%</p>
                            <p className="text-yellow-500">Yield: {data.yield_score?.toFixed(1)}</p>
                            <p className="text-blue-500">Composite: {data.composite_score?.toFixed(1)}</p>
                          </div>
                        );
                      }
                      return null;
                    }}
                  />
                  <Scatter name="All Trades" data={result.topByComposite.slice(0, 50)} fill="#8884d8" onClick={(data: any) => handleTradeClick(data)}>
                    {result.topByComposite.slice(0, 50).map((entry: any, index: number) => {
                      const isAgent = result.agentTrade &&
                        Math.abs(entry.short_strike - result.agentTrade.short_strike) < 0.01 &&
                        Math.abs(entry.long_strike - result.agentTrade.long_strike) < 0.01;

                      // Color by composite score tier
                      let color = "#666"; // Low tier
                      if (entry.composite_score >= 65) color = "#10b981"; // Elite (green)
                      else if (entry.composite_score >= 60) color = "#3b82f6"; // Quality (blue)
                      else if (entry.composite_score >= 55) color = "#eab308"; // Speculative (yellow)

                      return (
                        <Cell
                          key={`cell-${index}`}
                          fill={isAgent ? "#f59e0b" : color}
                          stroke={isAgent ? "#fff" : "none"}
                          strokeWidth={isAgent ? 2 : 0}
                        />
                      );
                    })}
                  </Scatter>
                </ScatterChart>
              </ResponsiveContainer>
              <div className="flex items-center justify-center gap-4 mt-2 text-xs">
                <div className="flex items-center gap-1">
                  <div className="w-3 h-3 rounded-full bg-[#10b981]"></div>
                  <span className="text-[var(--text-secondary)]">Elite (≥65)</span>
                </div>
                <div className="flex items-center gap-1">
                  <div className="w-3 h-3 rounded-full bg-[#3b82f6]"></div>
                  <span className="text-[var(--text-secondary)]">Quality (60-65)</span>
                </div>
                <div className="flex items-center gap-1">
                  <div className="w-3 h-3 rounded-full bg-[#eab308]"></div>
                  <span className="text-[var(--text-secondary)]">Speculative (55-60)</span>
                </div>
                {result.agentTrade && (
                  <div className="flex items-center gap-1">
                    <div className="w-3 h-3 rounded-full bg-[#f59e0b] border-2 border-white"></div>
                    <span className="text-[var(--text-secondary)]">Agent Pick</span>
                  </div>
                )}
              </div>
            </Card>

            {/* Score Distribution Histogram */}
            <Card className="glass-card p-6">
              <h3 className="text-lg font-bold mb-4" style={{ color: "var(--text-primary)" }}>
                Score Distribution
              </h3>
              <p className="text-xs text-[var(--text-secondary)] mb-4">
                How many trades fall into each composite score range.
              </p>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart
                  data={(() => {
                    // Create histogram buckets
                    const buckets = [
                      { range: "30-40", min: 30, max: 40, count: 0 },
                      { range: "40-50", min: 40, max: 50, count: 0 },
                      { range: "50-55", min: 50, max: 55, count: 0 },
                      { range: "55-60", min: 55, max: 60, count: 0 },
                      { range: "60-65", min: 60, max: 65, count: 0 },
                      { range: "65-70", min: 65, max: 70, count: 0 },
                      { range: "70+", min: 70, max: 100, count: 0 },
                    ];

                    result.topByComposite.forEach((trade: any) => {
                      const score = trade.composite_score || 0;
                      const bucket = buckets.find(b => score >= b.min && score < b.max);
                      if (bucket) bucket.count++;
                    });

                    return buckets;
                  })()}
                  margin={{ top: 20, right: 20, bottom: 20, left: 20 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--glass-border)" />
                  <XAxis
                    dataKey="range"
                    label={{ value: "Composite Score Range", position: "insideBottom", offset: -10, fill: "var(--text-secondary)" }}
                    tick={{ fill: "var(--text-secondary)", fontSize: 12 }}
                  />
                  <YAxis
                    label={{ value: "# of Trades", angle: -90, position: "insideLeft", fill: "var(--text-secondary)" }}
                    tick={{ fill: "var(--text-secondary)", fontSize: 12 }}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "var(--glass-bg)",
                      border: "1px solid var(--glass-border)",
                      borderRadius: "8px",
                    }}
                    labelStyle={{ color: "var(--text-primary)" }}
                  />
                  <Bar dataKey="count" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                  {result.agentTrade && (
                    <ReferenceLine
                      x={(() => {
                        const score = result.agentTrade.composite_score || 0;
                        if (score >= 70) return "70+";
                        if (score >= 65) return "65-70";
                        if (score >= 60) return "60-65";
                        if (score >= 55) return "55-60";
                        if (score >= 50) return "50-55";
                        if (score >= 40) return "40-50";
                        return "30-40";
                      })()}
                      stroke="#f59e0b"
                      strokeWidth={2}
                      label={{ value: "Agent", position: "top", fill: "#f59e0b", fontSize: 12 }}
                    />
                  )}
                </BarChart>
              </ResponsiveContainer>
            </Card>
          </div>

          {/* Top Trades Table */}
          <Card className="glass-card p-6">
            <div className="flex items-start justify-between mb-4">
              <div>
                <h3 className="text-xl font-bold flex items-center gap-2">
                  <Target className="h-5 w-5 text-green-500" />
                  Top 10 Trades by IPS Score
                </h3>
                <p className="text-xs text-[var(--text-secondary)] mt-1">
                  Ranked by IPS fit first, then composite score. ⚠️ = Risk warning (high delta, low credit, etc.)
                </p>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-[var(--glass-border)]">
                    <th className="text-left p-3 text-sm font-medium text-[var(--text-secondary)]">Rank</th>
                    <th className="text-left p-3 text-sm font-medium text-[var(--text-secondary)]">Spread</th>
                    <th className="text-left p-3 text-sm font-medium text-[var(--text-secondary)]">DTE</th>
                    <th className="text-right p-3 text-sm font-medium text-[var(--text-secondary)]">Composite</th>
                    <th className="text-right p-3 text-sm font-medium text-[var(--text-secondary)]">IPS</th>
                    <th className="text-right p-3 text-sm font-medium text-[var(--text-secondary)]">Yield</th>
                    <th className="text-right p-3 text-sm font-medium text-[var(--text-secondary)]">Credit</th>
                    <th className="text-right p-3 text-sm font-medium text-[var(--text-secondary)]">PoP</th>
                  </tr>
                </thead>
                <tbody>
                  {result.topByIPS.slice(0, 10).map((trade, idx) => {
                    const isAgentSelection = result.agentTrade &&
                      Math.abs(trade.short_strike - result.agentTrade.short_strike) < 0.01 &&
                      Math.abs(trade.long_strike - result.agentTrade.long_strike) < 0.01 &&
                      trade.dte === result.agentTrade.dte;

                    // Risk warnings
                    const hasHighDelta = Math.abs(trade.short_delta || 0) > 0.30;
                    const hasLowCredit = (trade.entry_mid || 0) < 0.25;
                    const hasWideSpreads = (trade.long_strike - trade.short_strike) > 10;
                    const hasRiskWarning = hasHighDelta || hasLowCredit || hasWideSpreads;

                    const riskWarnings: string[] = [];
                    if (hasHighDelta) riskWarnings.push(`High Δ: ${Math.abs(trade.short_delta || 0).toFixed(2)}`);
                    if (hasLowCredit) riskWarnings.push(`Low credit: $${(trade.entry_mid || 0).toFixed(2)}`);
                    if (hasWideSpreads) riskWarnings.push(`Wide spread: $${(trade.long_strike - trade.short_strike).toFixed(0)}`);

                    return (
                      <tr
                        key={idx}
                        onClick={() => handleTradeClick(trade)}
                        className={`border-b border-[var(--glass-border)] hover:bg-[var(--glass-bg-hover)] transition-colors cursor-pointer ${
                          isAgentSelection ? "bg-blue-500/10" : ""
                        } ${hasRiskWarning ? "bg-yellow-500/5" : ""}`}
                        title={riskWarnings.length > 0 ? riskWarnings.join(", ") : ""}
                      >
                        <td className="p-3">
                          <div className="flex items-center gap-2">
                            <Badge variant={idx === 0 ? "default" : "outline"}>
                              {idx + 1}
                            </Badge>
                            {isAgentSelection && (
                              <Badge className="bg-blue-500 text-white text-xs">AGENT</Badge>
                            )}
                            {hasRiskWarning && (
                              <span className="text-yellow-500 text-lg" title={riskWarnings.join(", ")}>⚠️</span>
                            )}
                          </div>
                        </td>
                        <td className="p-3 font-mono text-sm">
                          ${trade.short_strike.toFixed(0)}/${trade.long_strike.toFixed(0)}
                        </td>
                        <td className="p-3 text-sm">{trade.dte}d</td>
                        <td className="p-3 text-right font-semibold text-sm">
                          {trade.composite_score?.toFixed(1)}
                        </td>
                        <td className="p-3 text-right text-sm">
                          {trade.ips_score?.toFixed(1)}%
                        </td>
                        <td className="p-3 text-right text-sm">
                          {trade.yield_score?.toFixed(1)}
                        </td>
                        <td className="p-3 text-right text-sm font-mono">
                          ${trade.entry_mid.toFixed(2)}
                        </td>
                        <td className="p-3 text-right text-sm">
                          {(trade.est_pop * 100).toFixed(0)}%
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>

          {/* Additional Rankings */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Top by IPS */}
            <Card className="glass-card p-6">
              <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-green-500" />
                Top 5 by IPS Fit
              </h3>
              <div className="space-y-2">
                {result.topByIPS.slice(0, 5).map((trade, idx) => (
                  <div key={idx} className="glass-card p-3 flex justify-between items-center">
                    <div>
                      <span className="font-mono text-sm">${trade.short_strike.toFixed(0)}/${trade.long_strike.toFixed(0)}</span>
                      <span className="text-xs text-[var(--text-secondary)] ml-2">{trade.dte}d</span>
                    </div>
                    <Badge variant="outline">{trade.ips_score?.toFixed(1)}%</Badge>
                  </div>
                ))}
              </div>
            </Card>

            {/* Top by Expected Value */}
            <Card className="glass-card p-6">
              <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
                <Zap className="h-5 w-5 text-yellow-500" />
                Top 5 by Expected Value
              </h3>
              <div className="space-y-2">
                {result.topByEV.slice(0, 5).map((trade, idx) => (
                  <div key={idx} className="glass-card p-3 flex justify-between items-center">
                    <div>
                      <span className="font-mono text-sm">${trade.short_strike.toFixed(0)}/${trade.long_strike.toFixed(0)}</span>
                      <span className="text-xs text-[var(--text-secondary)] ml-2">{trade.dte}d</span>
                    </div>
                    <Badge variant="outline">
                      ${trade.risk_adjusted_metrics?.expected_value_per_dollar.toFixed(3)}/$
                    </Badge>
                  </div>
                ))}
              </div>
            </Card>
          </div>
        </div>
      )}

      {/* IPS Factor Breakdown Modal */}
      <Dialog open={showFactorModal} onOpenChange={setShowFactorModal}>
        <DialogContent className="glass-card max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold">
              {selectedTrade && `$${selectedTrade.short_strike.toFixed(0)}/$${selectedTrade.long_strike.toFixed(0)} - ${selectedTrade.dte}d`}
            </DialogTitle>
            <DialogDescription>
              IPS Factor Analysis - See which factors passed or failed
            </DialogDescription>
          </DialogHeader>

          {selectedTrade && selectedTrade.ips_factor_details && (
            <div className="space-y-4">
              {/* Score Summary */}
              <div className="grid grid-cols-3 gap-3">
                <div className="glass-card p-3">
                  <div className="text-xs text-[var(--text-secondary)]">Composite Score</div>
                  <div className="text-2xl font-bold gradient-text-primary">
                    {selectedTrade.composite_score?.toFixed(1)}
                  </div>
                </div>
                <div className="glass-card p-3">
                  <div className="text-xs text-[var(--text-secondary)]">IPS Score</div>
                  <div className="text-2xl font-bold text-green-500">
                    {selectedTrade.ips_score?.toFixed(1)}%
                  </div>
                </div>
                <div className="glass-card p-3">
                  <div className="text-xs text-[var(--text-secondary)]">Yield Score</div>
                  <div className="text-2xl font-bold text-yellow-500">
                    {selectedTrade.yield_score?.toFixed(1)}
                  </div>
                </div>
              </div>

              {/* Factor Summary */}
              <div className="grid grid-cols-3 gap-3 text-sm">
                <div className="glass-card p-3 text-center">
                  <div className="flex items-center justify-center gap-2 text-green-500 mb-1">
                    <CheckCircle className="h-4 w-4" />
                    <span className="font-semibold">Passed</span>
                  </div>
                  <div className="text-2xl font-bold">
                    {selectedTrade.ips_factor_details.passed_factors?.length || 0}
                  </div>
                  <div className="text-xs text-[var(--text-secondary)] mt-1">
                    {((selectedTrade.ips_factor_details.total_weight_passed || 0) * 100).toFixed(0)}% weight
                  </div>
                </div>
                <div className="glass-card p-3 text-center">
                  <div className="flex items-center justify-center gap-2 text-yellow-500 mb-1">
                    <MinusCircle className="h-4 w-4" />
                    <span className="font-semibold">Minor Miss</span>
                  </div>
                  <div className="text-2xl font-bold">
                    {selectedTrade.ips_factor_details.minor_misses?.length || 0}
                  </div>
                  <div className="text-xs text-[var(--text-secondary)] mt-1">
                    {((selectedTrade.ips_factor_details.total_weight_minor || 0) * 100).toFixed(0)}% weight
                  </div>
                </div>
                <div className="glass-card p-3 text-center">
                  <div className="flex items-center justify-center gap-2 text-red-500 mb-1">
                    <XCircle className="h-4 w-4" />
                    <span className="font-semibold">Failed</span>
                  </div>
                  <div className="text-2xl font-bold">
                    {selectedTrade.ips_factor_details.major_misses?.length || 0}
                  </div>
                  <div className="text-xs text-[var(--text-secondary)] mt-1">
                    {((selectedTrade.ips_factor_details.total_weight_major || 0) * 100).toFixed(0)}% weight
                  </div>
                </div>
              </div>

              {/* Passed Factors */}
              {selectedTrade.ips_factor_details.passed_factors && selectedTrade.ips_factor_details.passed_factors.length > 0 && (
                <div>
                  <h4 className="font-semibold text-green-500 mb-2 flex items-center gap-2">
                    <CheckCircle className="h-4 w-4" />
                    Passed Factors ({selectedTrade.ips_factor_details.passed_factors.length})
                  </h4>
                  <div className="space-y-2">
                    {selectedTrade.ips_factor_details.passed_factors.map((factor: any, idx: number) => (
                      <div key={idx} className="glass-card p-3">
                        <div className="flex justify-between items-start">
                          <div>
                            <div className="font-medium text-sm">{factor.factor_name}</div>
                            <div className="text-xs text-[var(--text-secondary)]">
                              Value: {typeof factor.value === 'number' ? factor.value.toFixed(2) : factor.value || 'N/A'}
                              {factor.target && ` → Target: ${factor.target}`}
                            </div>
                          </div>
                          <Badge variant="outline" className="text-xs">
                            {(factor.weight * 100).toFixed(0)}% weight
                          </Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Failed Factors */}
              {selectedTrade.ips_factor_details.major_misses && selectedTrade.ips_factor_details.major_misses.length > 0 && (
                <div>
                  <h4 className="font-semibold text-red-500 mb-2 flex items-center gap-2">
                    <XCircle className="h-4 w-4" />
                    Failed Factors ({selectedTrade.ips_factor_details.major_misses.length})
                  </h4>
                  <div className="space-y-2">
                    {selectedTrade.ips_factor_details.major_misses.map((factor: any, idx: number) => (
                      <div key={idx} className="glass-card p-3 border-l-2 border-red-500">
                        <div className="flex justify-between items-start">
                          <div>
                            <div className="font-medium text-sm">{factor.factor_name}</div>
                            <div className="text-xs text-[var(--text-secondary)]">
                              Value: {typeof factor.value === 'number' ? factor.value.toFixed(2) : factor.value || 'N/A'}
                              {factor.target && ` → Target: ${factor.target}`}
                            </div>
                          </div>
                          <Badge variant="outline" className="text-xs">
                            {(factor.weight * 100).toFixed(0)}% weight
                          </Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {selectedTrade && !selectedTrade.ips_factor_details && (
            <div className="text-center py-8 text-[var(--text-secondary)]">
              <AlertCircle className="h-12 w-12 mx-auto mb-3 opacity-50" />
              <p>No factor details available for this trade</p>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
