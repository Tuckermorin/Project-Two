// src/app/trades/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
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

// Service imports (unchanged)
import { ipsDataService, type IPSConfiguration } from "@/lib/services/ips-data-service";

// -----------------------------
// Local types + normalizer (builder-driven IPS)
// -----------------------------

type ViewType = "selection" | "entry" | "prospective" | "active";

type ContractType =
  | "put-credit-spread"
  | "call-credit-spread"
  | "long-call"
  | "long-put"
  | "iron-condor"
  | "covered-call"
  | "buy-hold";

export type FactorOperator = "lt" | "lte" | "gt" | "gte" | "between" | "eq" | "neq";

export interface FactorRule {
  key: string; // e.g., 'delta' | 'market_cap' | 'price' | 'management_quality'
  label?: string;
  source: "api" | "manual";
  dataType: "number" | "qualitative";
  operator: FactorOperator;
  threshold?: number; // lt/lte/gt/gte/eq/neq
  min?: number; // between
  max?: number; // between
  weight?: number; // default 1
  unit?: "%" | "$" | "raw";
}

// Extend the service type locally without changing the service definition
export type IPSWithRules = IPSConfiguration & {
  factorRules?: FactorRule[]; // preferred (saved by the IPS builder)
  // legacy fallbacks to be resilient during migration
  configurations?: Record<
    string,
    {
      enabled?: boolean;
      operator?: FactorOperator;
      threshold?: number;
      min?: number;
      max?: number;
      source?: "api" | "manual";
      dataType?: "number" | "qualitative";
      label?: string;
      unit?: "%" | "$" | "raw";
      weight?: number;
    }
  >;
  factors?: string[]; // last resort: factor keys only
};

function normalizeIPSRules(ips: IPSWithRules): FactorRule[] {
  // 1) canonical array from builder
  if (Array.isArray(ips.factorRules) && ips.factorRules.length) {
    return ips.factorRules.map((r) => ({
      source: "manual",
      dataType: "number",
      operator: "eq",
      weight: 1,
      unit: "raw",
      ...r,
    }));
  }
  // 2) object map fallback
  if (ips.configurations && typeof ips.configurations === "object") {
    return Object.entries(ips.configurations)
      .filter(([, cfg]) => cfg?.enabled !== false)
      .map(([key, cfg]) => ({
        key,
        label: cfg?.label,
        source: cfg?.source ?? "manual",
        dataType: cfg?.dataType ?? "number",
        operator: cfg?.operator ?? "eq",
        threshold: cfg?.threshold,
        min: cfg?.min,
        max: cfg?.max,
        weight: cfg?.weight ?? 1,
        unit: cfg?.unit ?? "raw",
      }));
  }
  // 3) factor key list fallback → qualitative manual >= 3
  if (Array.isArray(ips.factors) && ips.factors.length) {
    return ips.factors.map((key: string) => ({
      key,
      label: key,
      source: "manual",
      dataType: "qualitative",
      operator: "gte",
      threshold: 3,
      weight: 1,
      unit: "raw",
    }));
  }
  return [];
}

function ruleText(r: FactorRule) {
  switch (r.operator) {
    case "lt":
      return `< ${r.threshold}`;
    case "lte":
      return `≤ ${r.threshold}`;
    case "gt":
      return `> ${r.threshold}`;
    case "gte":
      return `≥ ${r.threshold}`;
    case "eq":
      return `= ${r.threshold}`;
    case "neq":
      return `≠ ${r.threshold}`;
    case "between":
      return `${r.min} to ${r.max}`;
    default:
      return "";
  }
}

function evaluateRule(r: FactorRule, raw: unknown): boolean {
  if (raw === undefined || raw === "") return false;
  const v = r.dataType === "number" ? Math.abs(Number(raw)) : Number(raw);
  switch (r.operator) {
    case "lt":
      return v < (r.threshold ?? Infinity);
    case "lte":
      return v <= (r.threshold ?? Infinity);
    case "gt":
      return v > (r.threshold ?? -Infinity);
    case "gte":
      return v >= (r.threshold ?? -Infinity);
    case "eq":
      return v === (r.threshold ?? v);
    case "neq":
      return v !== (r.threshold ?? null);
    case "between":
      return v >= (r.min ?? -Infinity) && v <= (r.max ?? Infinity);
    default:
      return false;
  }
}

// -----------------------------
// Trade form data
// -----------------------------

interface TradeFormData {
  // universal
  name?: string;
  symbol: string;
  currentPrice?: number;
  expirationDate?: string;
  contractType: ContractType;
  numberOfContracts?: number;

  // PCS
  shortPutStrike?: number;
  longPutStrike?: number;
  creditReceived?: number; // per spread

  // CCS
  shortCallStrike?: number;
  longCallStrike?: number;

  // Long options
  optionStrike?: number;
  debitPaid?: number; // per contract

  // Covered call
  sharesOwned?: number;
  callStrike?: number;
  premiumReceived?: number; // per contract

  // Buy/Hold
  shares?: number;
  entryPrice?: number;

  // IPS factors (values only)
  ipsFactors: Record<string, number | "">;
  apiFactors: Record<string, number | "">;
}

interface ProspectiveTrade {
  id: string;
  ips: { id: string; name: string };
  data: TradeFormData;
  createdAt: string;
  score?: number;
}

// -----------------------------
// Page
// -----------------------------

export default function TradesPage() {
  const [currentView, setCurrentView] = useState<ViewType>("selection");
  const [selectedIPS, setSelectedIPS] = useState<IPSConfiguration | null>(null);
  const [activeIPSs, setActiveIPSs] = useState<IPSConfiguration[]>([]);
  const [calculatedScore, setCalculatedScore] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [prospectiveTrades, setProspectiveTrades] = useState<ProspectiveTrade[]>([]);

  const userId = "user-123"; // TODO: replace with auth

  useEffect(() => {
    const loadIPSData = async () => {
      try {
        setIsLoading(true);
        const userIPSs = await ipsDataService.getAllUserIPSs(userId);
        const activeOnly = userIPSs.filter((ips) => ips.is_active);
        setActiveIPSs(activeOnly);
      } catch (e) {
        console.error("Error loading IPS data:", e);
      } finally {
        setIsLoading(false);
      }
    };
    loadIPSData();
  }, [userId]);

  function handleIPSSelection(ips: IPSConfiguration) {
    setSelectedIPS(ips);
    setCurrentView("entry");
    setCalculatedScore(null);
  }

  function handleTradeSubmit(formData: TradeFormData, score: number | null) {
    if (!selectedIPS) return;
    const tradeId = `trade-${Date.now()}`;
    const record: ProspectiveTrade = {
      id: tradeId,
      ips: { id: selectedIPS.id, name: selectedIPS.name },
      data: formData,
      createdAt: new Date().toISOString(),
      score: score ?? undefined,
    };
    setProspectiveTrades((prev) => [record, ...prev]);
    setCurrentView("prospective");
  }

  function handleCalculateScore(formData: TradeFormData) {
    if (!selectedIPS) return;
    const rules = normalizeIPSRules(selectedIPS as IPSWithRules);
    const totalWeight = rules.reduce((s, r) => s + (r.weight ?? 1), 0) || 1;
    const achieved = rules.reduce((s, r) => {
      const bag = r.source === "api" ? formData.apiFactors : formData.ipsFactors;
      const pass = evaluateRule(r, bag[r.key]);
      return s + (pass ? (r.weight ?? 1) : 0);
    }, 0);
    const score = (achieved / totalWeight) * 100;
    setCalculatedScore(score);
  }

  if (isLoading && currentView === "selection") {
    return (
      <div className="max-w-6xl mx-auto p-6">
        <div className="flex items-center justify-center py-12">
          <RefreshCw className="h-8 w-8 animate-spin text-blue-600" />
          <span className="ml-2 text-gray-600">Loading IPS configurations…</span>
        </div>
      </div>
    );
  }

  // -----------------------------
  // Selection view: show active IPS tiles (driven by builder rules)
  // -----------------------------
  if (currentView === "selection") {
    return (
      <div className="max-w-6xl mx-auto p-6">
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2">Choose an IPS to Make a Trade</h1>
          <p className="text-gray-600">Only active IPS configurations are shown</p>
        </div>

        {activeIPSs.length === 0 ? (
          <Card>
            <CardContent className="text-center py-12">
              <Target className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">No Active IPS Configurations</h3>
              <p className="text-gray-600 mb-6">Create an IPS first to start trading</p>
              <Button onClick={() => (window.location.href = "/ips")}>
                <Plus className="h-4 w-4 mr-2" />
                Create IPS Configuration
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {activeIPSs.map((ipsRaw) => {
              const ips = ipsRaw as IPSWithRules;
              const rules = normalizeIPSRules(ips);
              const total = rules.length;
              const apiCount = rules.filter((r) => r.source === "api").length;
              const manualCount = total - apiCount;

              return (
                <Card key={ips.id} className="hover:shadow-lg transition-shadow">
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
                        <span className="font-medium">{ips.strategies?.length ?? 0}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-gray-600">IPS Factors:</span>
                        <span className="font-medium">{total}</span>
                      </div>
                      <Progress value={total ? (apiCount / total) * 100 : 0} className="h-2" />
                      <div className="flex items-center justify-between mt-1 text-xs">
                        <div className="flex items-center gap-1">
                          <Database className="h-3 w-3 text-blue-600" />
                          <span className="font-medium">{apiCount} API</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <Users className="h-3 w-3 text-orange-600" />
                          <span className="font-medium">{manualCount} Manual</span>
                        </div>
                      </div>
                    </div>

                    {ips.performance && (
                      <div className="pt-3 border-t">
                        <div className="grid grid-cols-3 gap-2 text-xs">
                          <div className="text-center">
                            <div className="font-medium text-green-600">{ips.performance.winRate}%</div>
                            <div className="text-gray-500">Win Rate</div>
                          </div>
                          <div className="text-center">
                            <div className="font-medium text-blue-600">{ips.performance.avgROI}%</div>
                            <div className="text-gray-500">Avg ROI</div>
                          </div>
                          <div className="text-center">
                            <div className="font-medium text-gray-700">{ips.performance.totalTrades}</div>
                            <div className="text-gray-500">Trades</div>
                          </div>
                        </div>
                      </div>
                    )}

                    <Button onClick={() => handleIPSSelection(ipsRaw)} className="w-full mt-4">
                      Make Trade
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

  // -----------------------------
  // Entry view: dynamic strategy inputs + IPS factor inputs
  // -----------------------------
  if (currentView === "entry" && selectedIPS) {
    return (
      <div className="max-w-6xl mx-auto p-6">
        <div className="mb-6 flex items-center gap-4">
          <Button variant="outline" onClick={() => setCurrentView("selection")} className="flex items-center gap-2">
            <ArrowLeft className="h-4 w-4" />
            Back to IPS Selection
          </Button>
          <div>
            <h1 className="text-3xl font-bold">New Trade</h1>
            <p className="text-gray-600">IPS: {selectedIPS.name}</p>
          </div>
        </div>

        <EnhancedTradeEntryForm
          selectedIPS={selectedIPS}
          onSubmit={(fd, score) => handleTradeSubmit(fd, score)}
          onCalculateScore={(fd) => handleCalculateScore(fd)}
          onCancel={() => setCurrentView("selection")}
          isLoading={isLoading}
          calculatedScore={calculatedScore}
        />
      </div>
    );
  }

  // -----------------------------
  // Prospective Trades view
  // -----------------------------
  if (currentView === "prospective") {
    const fmt = (n?: number | string) =>
      n === undefined || n === "" ? "—" : typeof n === "number" ? (Math.abs(n) >= 1 ? n.toFixed(2) : n.toString()) : n;

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
            <Button variant="outline" onClick={() => setCurrentView("active")}>View Active Trades</Button>
          </div>
        </div>

        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2">
                  <FileText className="h-5 w-5 text-blue-600" />
                  <div>
                    <div className="text-2xl font-bold">{prospectiveTrades.length}</div>
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
                    <div className="text-2xl font-bold">
                      $
                      {prospectiveTrades
                        .reduce((acc, t) => {
                          const d = t.data;
                          const credit =
                            d.creditReceived ??
                            d.premiumReceived ??
                            (d.debitPaid ? -Math.abs(d.debitPaid) : 0);
                          const qty = d.numberOfContracts ?? (d.shares ? d.shares / 100 : 0) ?? 0;
                          return acc + (credit || 0) * (qty || 0) * 100;
                        }, 0)
                        .toFixed(0)}
                    </div>
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
                    <div className="text-2xl font-bold">
                      {prospectiveTrades.length &&
                      prospectiveTrades.some((t) => t.score !== undefined)
                        ? (
                            prospectiveTrades.reduce((s, t) => s + (t.score ?? 0), 0) /
                            prospectiveTrades.filter((t) => t.score !== undefined).length
                          ).toFixed(1)
                        : "—"}
                    </div>
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
                    <div className="text-2xl font-bold">—</div>
                    <div className="text-sm text-gray-600">Win Rate</div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" /> Pending Trades
              </CardTitle>
            </CardHeader>
            <CardContent>
              {prospectiveTrades.length === 0 ? (
                <div className="text-center py-12">
                  <TrendingUp className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-gray-900 mb-2">No prospective trades</h3>
                  <p className="text-gray-600 mb-6">Create your first trade using an IPS</p>
                  <Button onClick={() => setCurrentView("selection")}>
                    <Plus className="h-4 w-4 mr-2" /> Create New Trade
                  </Button>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="text-left text-gray-600">
                      <tr>
                        <th className="py-2 pr-4">Created</th>
                        <th className="py-2 pr-4">IPS</th>
                        <th className="py-2 pr-4">Symbol</th>
                        <th className="py-2 pr-4">Strategy</th>
                        <th className="py-2 pr-4">Expiry</th>
                        <th className="py-2 pr-4">Key Terms</th>
                        <th className="py-2 pr-4">Credit/Debit</th>
                        <th className="py-2 pr-4">Score</th>
                      </tr>
                    </thead>
                    <tbody>
                      {prospectiveTrades.map((t) => {
                        const d = t.data;
                        const contract = d.contractType.replace(/-/g, " ").toUpperCase();
                        const credit =
                          d.creditReceived ?? d.premiumReceived ?? (d.debitPaid ? -Math.abs(d.debitPaid) : 0);
                        let terms = "—";
                        switch (d.contractType) {
                          case "put-credit-spread":
                            terms = `P ${fmt(d.shortPutStrike)} / ${fmt(d.longPutStrike)}`;
                            break;
                          case "call-credit-spread":
                            terms = `C ${fmt(d.shortCallStrike)} / ${fmt(d.longCallStrike)}`;
                            break;
                          case "long-call":
                          case "long-put":
                            terms = `${fmt(d.optionStrike)}`;
                            break;
                          case "covered-call":
                            terms = `${fmt(d.sharesOwned)} sh, K ${fmt(d.callStrike)}`;
                            break;
                          case "iron-condor":
                            terms = `P ${fmt(d.shortPutStrike)}/${fmt(d.longPutStrike)} + C ${fmt(
                              d.shortCallStrike
                            )}/${fmt(d.longCallStrike)}`;
                            break;
                          case "buy-hold":
                            terms = `${fmt(d.shares)} sh @ ${fmt(d.entryPrice)}`;
                            break;
                        }
                        return (
                          <tr key={t.id} className="border-t">
                            <td className="py-2 pr-4">{new Date(t.createdAt).toLocaleString()}</td>
                            <td className="py-2 pr-4">{t.ips.name}</td>
                            <td className="py-2 pr-4">{d.symbol}</td>
                            <td className="py-2 pr-4">{contract}</td>
                            <td className="py-2 pr-4">{d.expirationDate || "—"}</td>
                            <td className="py-2 pr-4">{terms}</td>
                            <td className="py-2 pr-4">{credit === undefined ? "—" : `$${fmt(credit)}`}</td>
                            <td className="py-2 pr-4">{t.score ? t.score.toFixed(1) : "—"}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  // -----------------------------
  // Active Trades view (stub)
  // -----------------------------
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
              <Plus className="h-4 w-4 mr-2" /> New Trade
            </Button>
            <Button variant="outline" onClick={() => setCurrentView("prospective")}>View Prospective</Button>
          </div>
        </div>

        <div className="space-y-6">
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

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <List className="h-5 w-5" /> Current Positions
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-center py-12">
                <BarChart3 className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">No active trades</h3>
                <p className="text-gray-600 mb-6">Executed trades will appear here with real-time P&L</p>
                <Button onClick={() => setCurrentView("selection")}>
                  <Plus className="h-4 w-4 mr-2" /> Create New Trade
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

// -----------------------------
// Enhanced Trade Entry Form
// -----------------------------

interface EnhancedTradeEntryFormProps {
  selectedIPS: IPSConfiguration;
  onSubmit: (formData: TradeFormData, score: number | null) => void;
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
    currentPrice: undefined,
    expirationDate: "",
    contractType: "put-credit-spread",
    numberOfContracts: 1,
    // spreads
    shortPutStrike: undefined,
    longPutStrike: undefined,
    creditReceived: undefined,
    shortCallStrike: undefined,
    longCallStrike: undefined,
    // long options
    optionStrike: undefined,
    debitPaid: undefined,
    // covered call
    sharesOwned: undefined,
    callStrike: undefined,
    premiumReceived: undefined,
    // buy/hold
    shares: undefined,
    entryPrice: undefined,
    // factors
    ipsFactors: {},
    apiFactors: {},
  });

  const [apiStatus, setApiStatus] = useState<"connected" | "disconnected" | "loading">("connected");
  const [completionScore, setCompletionScore] = useState<number>(0);

  const ips = selectedIPS as IPSWithRules;
  const factorRules = useMemo(() => normalizeIPSRules(ips), [ips]);
  const apiRules = useMemo(() => factorRules.filter((r) => r.source === "api"), [factorRules]);
  const manualRules = useMemo(() => factorRules.filter((r) => r.source === "manual"), [factorRules]);

  // Fetch only API factors needed by this IPS
  async function loadAPIFactors(symbol: string) {
    setApiStatus("loading");
    try {
      const keys = apiRules.map((r) => r.key).join(",");
      const res = await fetch(`/api/trades/factors?symbol=${symbol}&keys=${encodeURIComponent(keys)}`);
      const json = await res.json();

      const vals: Record<string, number> = {};
      Object.entries(json?.data?.factors ?? {}).forEach(([k, obj]: [string, any]) => {
        let v = typeof (obj as any)?.value === "number" ? (obj as any).value : parseFloat((obj as any)?.value);
        if (k === "delta") v = Math.abs(v);
        vals[k] = v;
      });

      setFormData((prev) => ({ ...prev, apiFactors: { ...prev.apiFactors, ...vals } }));
      setApiStatus("connected");
    } catch (e) {
      console.error("API Error:", e);
      setApiStatus("disconnected");
    }
  }

  // Auto-load API factors on symbol change
  useEffect(() => {
    if (formData.symbol) loadAPIFactors(formData.symbol);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formData.symbol]);

  // Required trade fields by contract type
  const requiredFieldsByType: Record<ContractType, (keyof TradeFormData)[]> = {
    "put-credit-spread": [
      "symbol",
      "expirationDate",
      "numberOfContracts",
      "shortPutStrike",
      "longPutStrike",
      "creditReceived",
    ],
    "call-credit-spread": [
      "symbol",
      "expirationDate",
      "numberOfContracts",
      "shortCallStrike",
      "longCallStrike",
      "creditReceived",
    ],
    "long-call": ["symbol", "expirationDate", "numberOfContracts", "optionStrike", "debitPaid"],
    "long-put": ["symbol", "expirationDate", "numberOfContracts", "optionStrike", "debitPaid"],
    "iron-condor": [
      "symbol",
      "expirationDate",
      "numberOfContracts",
      "shortPutStrike",
      "longPutStrike",
      "shortCallStrike",
      "longCallStrike",
      "creditReceived",
    ],
    "covered-call": ["symbol", "expirationDate", "sharesOwned", "callStrike", "premiumReceived"],
    "buy-hold": ["symbol", "shares", "entryPrice"],
  };

  const isFilled = (v: unknown) => v !== undefined && v !== "" && !(typeof v === "number" && Number.isNaN(v));

  const isFormValid = useMemo(() => {
    const req = requiredFieldsByType[formData.contractType];
    const basics = req.every((f) => isFilled(formData[f]));
    const allRuleValuesPresent = factorRules.every((r) => {
      const bag = r.source === "api" ? formData.apiFactors : formData.ipsFactors;
      return isFilled(bag[r.key]);
    });
    return basics && allRuleValuesPresent;
  }, [formData, factorRules]);

  // Completion meter
  useEffect(() => {
    const req = requiredFieldsByType[formData.contractType];
    const completedBasics = req.filter((f) => isFilled(formData[f])).length;
    const completedRules = factorRules.filter((r) => {
      const bag = r.source === "api" ? formData.apiFactors : formData.ipsFactors;
      return isFilled(bag[r.key]);
    }).length;
    const total = req.length + factorRules.length;
    setCompletionScore(total ? ((completedBasics + completedRules) / total) * 100 : 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formData, factorRules]);

  // Strategy-specific field renderer
  function StrategyFields() {
    const N = (props: { id: keyof TradeFormData; label: string; step?: string; placeholder?: string }) => (
      <div>
        <Label htmlFor={String(props.id)}>{props.label}</Label>
        <Input
          id={String(props.id)}
          type="number"
          step={props.step ?? "0.01"}
          value={(formData[props.id] as any) ?? ""}
          onChange={(e) =>
            setFormData((p) => ({
              ...p,
              [props.id]: e.target.value === "" ? undefined : parseFloat(e.target.value),
            }))
          }
          placeholder={props.placeholder}
        />
      </div>
    );

    const D = (props: { id: keyof TradeFormData; label: string }) => (
      <div>
        <Label htmlFor={String(props.id)}>{props.label}</Label>
        <Input
          id={String(props.id)}
          type="date"
          value={(formData[props.id] as any) ?? ""}
          onChange={(e) => setFormData((p) => ({ ...p, [props.id]: e.target.value || undefined }))}
          min={new Date().toISOString().split("T")[0]}
        />
      </div>
    );

    const C = (props: { id: keyof TradeFormData; label: string; min?: number; placeholder?: string }) => (
      <div>
        <Label htmlFor={String(props.id)}>{props.label}</Label>
        <Input
          id={String(props.id)}
          type="number"
          min={props.min ?? 1}
          value={(formData[props.id] as any) ?? ""}
          onChange={(e) =>
            setFormData((p) => ({
              ...p,
              [props.id]: e.target.value === "" ? undefined : parseInt(e.target.value),
            }))
          }
          placeholder={props.placeholder}
        />
      </div>
    );

    switch (formData.contractType) {
      case "put-credit-spread":
        return (
          <>
            <D id="expirationDate" label="Expiration Date" />
            <C id="numberOfContracts" label="Contracts" placeholder="1" />
            <N id="shortPutStrike" label="Short Put Strike" placeholder="145.00" />
            <N id="longPutStrike" label="Long Put Strike" placeholder="140.00" />
            <N id="creditReceived" label="Net Credit (per spread)" placeholder="1.25" />
          </>
        );
      case "call-credit-spread":
        return (
          <>
            <D id="expirationDate" label="Expiration Date" />
            <C id="numberOfContracts" label="Contracts" placeholder="1" />
            <N id="shortCallStrike" label="Short Call Strike" placeholder="155.00" />
            <N id="longCallStrike" label="Long Call Strike" placeholder="160.00" />
            <N id="creditReceived" label="Net Credit (per spread)" placeholder="1.10" />
          </>
        );
      case "long-call":
      case "long-put":
        return (
          <>
            <D id="expirationDate" label="Expiration Date" />
            <C id="numberOfContracts" label="Contracts" placeholder="1" />
            <N id="optionStrike" label="Option Strike" placeholder="150.00" />
            <N id="debitPaid" label="Debit Paid (per contract)" placeholder="2.35" />
          </>
        );
      case "covered-call":
        return (
          <>
            <D id="expirationDate" label="Expiration Date" />
            <N id="sharesOwned" label="Shares Owned" step="1" placeholder="100" />
            <N id="callStrike" label="Call Strike" placeholder="160.00" />
            <N id="premiumReceived" label="Premium Received (per contract)" placeholder="1.35" />
          </>
        );
      case "iron-condor":
        return (
          <>
            <D id="expirationDate" label="Expiration Date" />
            <C id="numberOfContracts" label="Contracts" placeholder="1" />
            <N id="shortPutStrike" label="Short Put Strike" placeholder="145.00" />
            <N id="longPutStrike" label="Long Put Strike" placeholder="140.00" />
            <N id="shortCallStrike" label="Short Call Strike" placeholder="160.00" />
            <N id="longCallStrike" label="Long Call Strike" placeholder="165.00" />
            <N id="creditReceived" label="Net Credit (per condor)" placeholder="2.10" />
          </>
        );
      case "buy-hold":
        return (
          <>
            <N id="shares" label="Shares" step="1" placeholder="100" />
            <N id="entryPrice" label="Entry Price" placeholder="153.10" />
          </>
        );
    }
  }

  // Calculate score locally so we can pass it to parent on submit
  function calculateScore(): number | null {
    if (!factorRules.length) return null;
    const totalWeight = factorRules.reduce((s, r) => s + (r.weight ?? 1), 0) || 1;
    const achieved = factorRules.reduce((s, r) => {
      const bag = r.source === "api" ? formData.apiFactors : formData.ipsFactors;
      const pass = evaluateRule(r, bag[r.key]);
      return s + (pass ? (r.weight ?? 1) : 0);
    }, 0);
    return (achieved / totalWeight) * 100;
  }

  const scoreNow = calculateScore();

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
            <span>{apiRules.length} API Factors</span>
            {apiStatus === "connected" && <Wifi className="h-3 w-3 text-green-600" />}
            {apiStatus === "disconnected" && <WifiOff className="h-3 w-3 text-red-600" />}
            {apiStatus === "loading" && <RefreshCw className="h-3 w-3 animate-spin text-blue-600" />}
          </div>
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-orange-600" />
            <span>{manualRules.length} Manual Factors</span>
          </div>
        </div>
      </div>

      {/* Universal Trade Details */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5" /> Trade Details
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div>
              <Label htmlFor="name">Trade Name (optional)</Label>
              <Input
                id="name"
                value={formData.name ?? ""}
                onChange={(e) => setFormData((p) => ({ ...p, name: e.target.value }))}
                placeholder="e.g., PCS on AAPL - post-earnings fade"
              />
            </div>

            <div>
              <Label htmlFor="symbol">Symbol</Label>
              <Input
                id="symbol"
                value={formData.symbol}
                onChange={(e) => setFormData((p) => ({ ...p, symbol: e.target.value.toUpperCase() }))}
                placeholder="AAPL"
              />
            </div>

            <div>
              <Label htmlFor="currentPrice">Current Price (optional)</Label>
              <Input
                id="currentPrice"
                type="number"
                step="0.01"
                value={formData.currentPrice ?? ""}
                onChange={(e) =>
                  setFormData((p) => ({
                    ...p,
                    currentPrice: e.target.value === "" ? undefined : parseFloat(e.target.value),
                  }))
                }
                placeholder="192.34"
              />
            </div>

            <div>
              <Label htmlFor="contractType">Strategy</Label>
              <select
                id="contractType"
                value={formData.contractType}
                onChange={(e) => setFormData((p) => ({ ...p, contractType: e.target.value as ContractType }))}
                className="w-full p-2 border border-gray-300 rounded-md"
              >
                <option value="buy-hold">Buy / Hold (Shares)</option>
                <option value="put-credit-spread">Put Credit Spread</option>
                <option value="call-credit-spread">Call Credit Spread</option>
                <option value="iron-condor">Iron Condor</option>
                <option value="covered-call">Covered Call</option>
                <option value="long-call">Long Call</option>
                <option value="long-put">Long Put</option>
              </select>
            </div>

            {/* Strategy-specific fields */}
            <StrategyFields />
          </div>
        </CardContent>
      </Card>

      {/* Factor Sections */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* API Factors */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Database className="h-5 w-5 text-blue-600" /> API Factors ({apiRules.length})
              <Badge
                variant="outline"
                className={
                  apiStatus === "connected"
                    ? "ml-2 bg-green-50 text-green-700"
                    : apiStatus === "disconnected"
                    ? "ml-2 bg-red-50 text-red-700"
                    : "ml-2 bg-blue-50 text-blue-700"
                }
              >
                {apiStatus === "connected" ? "Connected" : apiStatus === "disconnected" ? "Disconnected" : "Loading…"}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-2">
              <Input
                value={formData.symbol}
                onChange={(e) => setFormData((p) => ({ ...p, symbol: e.target.value.toUpperCase() }))}
                placeholder="Symbol (e.g., AAPL)"
              />
              <Button
                variant="outline"
                onClick={() => formData.symbol && loadAPIFactors(formData.symbol)}
                disabled={!formData.symbol || apiStatus === "loading"}
              >
                <RefreshCw className={`h-4 w-4 mr-2 ${apiStatus === "loading" ? "animate-spin" : ""}`} />
                Refresh
              </Button>
            </div>

            {apiRules.length === 0 ? (
              <div className="text-sm text-gray-600">No API-driven factors for this IPS.</div>
            ) : (
              <div className="space-y-3">
                {apiRules.map((r) => {
                  const val = formData.apiFactors[r.key];
                  const pass = evaluateRule(r, val);
                  return (
                    <div key={`api-${r.key}`} className="grid grid-cols-12 items-center gap-2">
                      <div className="col-span-5">
                        <div className="text-sm font-medium">{r.label ?? r.key}</div>
                        <div className="text-xs text-gray-500">Rule: {ruleText(r)}</div>
                      </div>
                      <div className="col-span-3">
                        <Input
                          value={val === undefined || val === "" ? "" : String(val)}
                          onChange={(e) =>
                            setFormData((p) => ({
                              ...p,
                              apiFactors: {
                                ...p.apiFactors,
                                [r.key]: e.target.value === "" ? "" : Number(e.target.value),
                              },
                            }))
                          }
                          type="number"
                          step="0.0001"
                          placeholder="auto"
                        />
                      </div>
                      <div className="col-span-2 text-xs text-gray-500">{r.unit ?? "raw"}</div>
                      <div className="col-span-2 flex items-center">
                        {pass ? (
                          <Badge className="bg-green-50 text-green-700">
                            <CheckCircle className="h-3 w-3 mr-1" /> Pass
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200">
                            <AlertCircle className="h-3 w-3 mr-1" /> Miss
                          </Badge>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Manual Factors */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5 text-orange-600" /> Manual Factors ({manualRules.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {manualRules.length === 0 ? (
              <div className="text-sm text-gray-600">No manual factors for this IPS.</div>
            ) : (
              manualRules.map((r) => {
                const val = formData.ipsFactors[r.key];
                const pass = evaluateRule(r, val);
                // For qualitative factors, suggest 1–5 scale
                const step = r.dataType === "qualitative" ? "1" : "0.0001";
                return (
                  <div key={`manual-${r.key}`} className="grid grid-cols-12 items-center gap-2">
                    <div className="col-span-5">
                      <div className="text-sm font-medium">{r.label ?? r.key}</div>
                      <div className="text-xs text-gray-500">
                        Rule: {ruleText(r)}{" "}
                        {r.dataType === "qualitative" ? "(enter 1–5 assessment)" : ""}
                      </div>
                    </div>
                    <div className="col-span-3">
                      <Input
                        value={val === undefined || val === "" ? "" : String(val)}
                        onChange={(e) =>
                          setFormData((p) => ({
                            ...p,
                            ipsFactors: {
                              ...p.ipsFactors,
                              [r.key]: e.target.value === "" ? "" : Number(e.target.value),
                            },
                          }))
                        }
                        type="number"
                        step={step}
                        min={r.dataType === "qualitative" ? 1 : undefined}
                        max={r.dataType === "qualitative" ? 5 : undefined}
                        placeholder={r.dataType === "qualitative" ? "1–5" : "value"}
                      />
                    </div>
                    <div className="col-span-2 text-xs text-gray-500">{r.unit ?? "raw"}</div>
                    <div className="col-span-2 flex items-center">
                      {pass ? (
                        <Badge className="bg-green-50 text-green-700">
                          <CheckCircle className="h-3 w-3 mr-1" /> Pass
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200">
                          <AlertCircle className="h-3 w-3 mr-1" /> Miss
                        </Badge>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </CardContent>
        </Card>
      </div>

      {/* Actions / Scoring */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calculator className="h-5 w-5" /> Score & Actions
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              onClick={() => onCalculateScore(formData)}
              disabled={isLoading || !factorRules.length}
            >
              <Calculator className="h-4 w-4 mr-2" />
              Calculate Score
            </Button>
            <div className="text-sm text-gray-600">
              {calculatedScore !== null ? (
                <span>
                  Score:&nbsp;
                  <Badge
                    className={
                      calculatedScore >= 80
                        ? "bg-green-50 text-green-700"
                        : calculatedScore >= 60
                        ? "bg-yellow-50 text-yellow-700"
                        : "bg-red-50 text-red-700"
                    }
                  >
                    {calculatedScore.toFixed(1)}%
                  </Badge>
                </span>
              ) : scoreNow !== null ? (
                <span className="text-gray-600">Estimated: {scoreNow.toFixed(1)}%</span>
              ) : (
                <span className="text-gray-500">No score yet</span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={onCancel}>Cancel</Button>
            <Button
              onClick={() => onSubmit(formData, calculatedScore ?? scoreNow)}
              disabled={!isFormValid}
              className="bg-blue-600 hover:bg-blue-700 text-white"
            >
              Submit Prospective Trade
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
