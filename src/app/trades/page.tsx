// src/app/trades/page.tsx
"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
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
import type { FactorValueMap } from "@/lib/types";
import { NewTradeEntryForm } from "@/components/trades/NewTradeEntryForm";
import { AgentSection } from "@/components/trades/AgentSection";
import { dispatchTradesUpdated } from "@/lib/events";
import { useAuth } from "@/components/auth/auth-provider";

// -----------------------------
// Local types + normalizer (builder-driven IPS)
// -----------------------------

type ViewType = "selection" | "entry" | "prospective" | "active" | "action_needed" | "analyze";

type ContractType =
  | "put-credit-spread"
  | "call-credit-spread"
  | "long-call"
  | "long-put"
  | "iron-condor"
  | "covered-call"
  | "buy-hold";

export type FactorOperator = "lt" | "lte" | "gt" | "gte" | "between" | "eq" | "neq";

// Map an IPS strategy label to our internal ContractType and a human label
function mapIPSToContractType(ips: IPSConfiguration): { type: ContractType; label: string } {
  const raw = String((ips as any)?.strategies?.[0] ?? "").toLowerCase();
  const norm = raw.replace(/\s+/g, " ").trim();

  // Flexible matching to be resilient to minor label variations
  if (/(put).*credit.*spread/.test(norm)) return { type: "put-credit-spread", label: "Put Credit Spread" };
  if (/(call).*credit.*spread/.test(norm)) return { type: "call-credit-spread", label: "Call Credit Spread" };
  if (/iron.*condor/.test(norm)) return { type: "iron-condor", label: "Iron Condor" };
  if (/covered.*call/.test(norm)) return { type: "covered-call", label: "Covered Call" };
  if (/long.*call/.test(norm)) return { type: "long-call", label: "Long Call" };
  if (/long.*put/.test(norm)) return { type: "long-put", label: "Long Put" };
  if (/buy|hold|shares/.test(norm)) return { type: "buy-hold", label: "Buy / Hold (Shares)" };

  // Fallback
  return { type: "put-credit-spread", label: "Put Credit Spread" };
}

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
      // Spread the object first, then apply defaults for missing properties
      ...r,
      source: r.source ?? "manual",
      dataType: r.dataType ?? "number", 
      operator: r.operator ?? "eq",
      weight: r.weight ?? 1,
      unit: r.unit ?? "raw",
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

const formatScoreValue = (value: number | null | undefined): string => {
  if (value === null || value === undefined) return "—";
  const num = Number(value);
  if (!Number.isFinite(num)) return "—";
  const digits = Math.abs(num) >= 100 ? 0 : 1;
  return `${num.toFixed(digits)}%`;
};

const formatSigned = (value: number | null | undefined): string => {
  if (value === null || value === undefined) return "0.0";
  const num = Number(value);
  if (!Number.isFinite(num)) return "0.0";
  const digits = Math.abs(num) >= 10 ? 0 : 1;
  const prefix = num > 0 ? "+" : "";
  return `${prefix}${num.toFixed(digits)}`;
};

const formatPercentValue = (value: number | null | undefined): string => {
  if (value === null || value === undefined) return "—";
  const num = Number(value);
  if (!Number.isFinite(num)) return "—";
  const normalized = Math.abs(num) <= 1 ? num * 100 : num;
  const digits = Math.abs(normalized) >= 100 ? 0 : Math.abs(normalized) >= 10 ? 1 : 2;
  return `${normalized.toFixed(digits)}%`;
};

const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 2,
});

const formatCurrencyValue = (value: number | null | undefined): string => {
  if (value === null || value === undefined) return "—";
  const num = Number(value);
  if (!Number.isFinite(num)) return "—";
  return currencyFormatter.format(num);
};

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
  ipsFactors: FactorValueMap;
  apiFactors: FactorValueMap;
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
  const { user } = useAuth();
  const userId = user?.id;

  const [currentView, setCurrentView] = useState<ViewType>("selection");
  const [selectedIPS, setSelectedIPS] = useState<IPSConfiguration | null>(null);
  const [activeIPSs, setActiveIPSs] = useState<IPSConfiguration[]>([]);
  const [calculatedScore, setCalculatedScore] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [prospectiveTrades, setProspectiveTrades] = useState<ProspectiveTrade[]>([]);
  const [activeTrades, setActiveTrades] = useState<any[]>([]);
  const [actionNeededTrades, setActionNeededTrades] = useState<any[]>([]);
  const [selectedProspective, setSelectedProspective] = useState<Set<string>>(new Set());
  const [selectedActive, setSelectedActive] = useState<Set<string>>(new Set());
  const [selectedActionNeeded, setSelectedActionNeeded] = useState<Set<string>>(new Set());
  const [quotes, setQuotes] = useState<Record<string, number>>({});
  const [editInitialData, setEditInitialData] = useState<any | null>(null);
  const [loadingProspective, setLoadingProspective] = useState<boolean>(false);
  const [closingDialog, setClosingDialog] = useState<{
    open: boolean;
    trade: any | null;
    closeDate: string;
    closeMethod: string;
    underlyingPriceAtClose: string;
    costToClosePerSpread: string;
    exitPremiumPerContract: string;
    contractsClosed: string;
    commissionsTotal: string;
    feesTotal: string;
    notes: string;
  }>({
    open: false,
    trade: null,
    closeDate: new Date().toISOString().slice(0,10),
    closeMethod: 'manual_close',
    underlyingPriceAtClose: '',
    costToClosePerSpread: '',
    exitPremiumPerContract: '',
    contractsClosed: '',
    commissionsTotal: '',
    feesTotal: '',
    notes: ''
  });

  // AI screenshot analyze dialog state
  const [aiDialog, setAiDialog] = useState<{
    open: boolean;
    ipsId: string | null;
    file: File | null;
    loading: boolean;
    results: any | null;
    error?: string;
  }>({ open: false, ipsId: null, file: null, loading: false, results: null });

  // AI analyze results for full-screen review
  const [aiResults, setAiResults] = useState<any | null>(null);

  // Batch AI for Prospective Trades
  type AIAnalysis = {
    score: number | null;
    summary: string;
    rationale?: string;
    suggestions: string[];
    confidence: number;
    category: "Strong" | "Moderate" | "Weak";
    model?: string;
    status?: string;
    full?: any;
    inputs?: any;
    scoreSources?: { baseline: number | null; ai: number | null };
    scoring?: any;
  };
  const [aiByTrade, setAiByTrade] = useState<Record<string, AIAnalysis | undefined>>({});
  const [aiOpenRows, setAiOpenRows] = useState<Set<string>>(new Set());
  const [aiBatchRunning, setAiBatchRunning] = useState(false);
  const [aiBatchMsg, setAiBatchMsg] = useState<string | null>(null);

  // Map of strategy id to human-readable name for display
  const strategyMap = useMemo(() => {
    const map = new Map<string, string>();
    try {
      ipsDataService
        .getAvailableStrategies()
        .forEach((s: any) => map.set(s.id, s.name));
    } catch (e) {
      // If service call fails, fallback map remains empty
      console.warn("Could not load strategy names", e);
    }
    return map;
  }, []);

  useEffect(() => {
    const loadIPSData = async () => {
      try {
        setIsLoading(true);
        // Fetch IPS configurations from API (auth handled server-side)
        const response = await fetch('/api/ips', { cache: 'no-store' });
        if (!response.ok) {
          throw new Error('Failed to fetch IPS data');
        }
        const userIPSs = await response.json();
        const activeOnly = userIPSs.filter((ips: any) => ips.is_active === true);
        setActiveIPSs(activeOnly);
      } catch (e) {
        console.error("Error loading IPS data:", e);
      } finally {
        setIsLoading(false);
      }
    };
    loadIPSData();
  }, []);

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

  // Fetch prospective trades from API (DB-backed)
  async function fetchProspectiveTrades() {
    try {
      setLoadingProspective(true);
      const res = await fetch(`/api/trades?status=prospective`);
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Failed to load prospective trades");
      const rows = (json?.data || []) as any[];
      const mapped: ProspectiveTrade[] = rows.map((row) => {
        const ct = String(row.contract_type || "");
        const base: TradeFormData = {
          symbol: row.symbol,
          contractType: ct as any,
          expirationDate: row.expiration_date || undefined,
          numberOfContracts: row.number_of_contracts || undefined,
          currentPrice: row.current_price || undefined,
          // strikes/credit
          shortPutStrike: row.short_strike || undefined,
          longPutStrike: row.long_strike || undefined,
          shortCallStrike: row.short_strike || undefined,
          longCallStrike: row.long_strike || undefined,
          creditReceived: row.credit_received || undefined,
          // alt fields
          premiumReceived: row.credit_received || undefined,
          // not provided by API for now
          optionStrike: undefined,
          debitPaid: undefined,
          sharesOwned: undefined,
          callStrike: undefined,
          shares: undefined,
          entryPrice: undefined,
          ipsFactors: {},
          apiFactors: {},
        };
        const factorValues: Record<string, number | string | boolean | null> = {};
        if (Array.isArray(row.trade_factors)) {
          for (const factor of row.trade_factors) {
            if (!factor?.factor_name) continue;
            const rawValue = factor?.factor_value ?? factor?.value ?? null;
            factorValues[factor.factor_name] = rawValue;
          }
        }
        return {
          id: row.id,
          ips: {
            id: row.ips_id,
            name: row.ips_configurations?.name || row.investment_performance_systems?.name || "IPS"
          },
          data: base,
          createdAt: row.created_at,
          score: row.ips_score || undefined,
          factorValues: Object.keys(factorValues).length ? factorValues : undefined,
        } as ProspectiveTrade;
      });
      setProspectiveTrades(mapped);
      setSelectedProspective(new Set());
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingProspective(false);
    }
  }

  // Load prospective trades when entering that view
  useEffect(() => {
    if (currentView === "prospective") {
      fetchProspectiveTrades();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentView]);

  // Fetch active trades
  async function fetchActiveTrades() {
    try {
      const res = await fetch(`/api/trades?status=active`, { cache: 'no-store' });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || 'Failed to load active trades');
      setActiveTrades(json?.data || []);
      setSelectedActive(new Set());
    } catch (e) {
      console.error(e);
      setActiveTrades([]);
    }
  }

  useEffect(() => {
    if (currentView === 'active') fetchActiveTrades();
  }, [currentView]);

  // Fetch action needed trades
  async function fetchActionNeededTrades() {
    try {
      const res = await fetch(`/api/trades?status=pending`, { cache: 'no-store' });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || 'Failed to load trades needing action');
      setActionNeededTrades(json?.data || []);
      setSelectedActionNeeded(new Set());
    } catch (e) {
      console.error(e);
      setActionNeededTrades([]);
    }
  }

  useEffect(() => {
    if (currentView === 'action_needed') fetchActionNeededTrades();
  }, [currentView]);

  // Resume from scoring page with prior draft
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    if (params.get('resume') !== 'scoring') return;
    (async () => {
      try {
        const raw = sessionStorage.getItem('tenxiv:trade-to-score');
        if (!raw) return;
        const payload = JSON.parse(raw);
        // Ensure IPS is selected
        let ips = activeIPSs.find((i)=> (i as any).id === payload.ipsId) as any;
        if (!ips) {
          try {
            const r = await fetch('/api/ips', { cache: 'no-store' });
            const rows = await r.json();
            ips = Array.isArray(rows) ? rows.find((x:any)=> x?.id === payload.ipsId) : null;
          } catch {}
        }
        if (ips) setSelectedIPS(ips as any);
        if (ips) setCurrentView('entry');
        const t = payload.trade || {};
        setEditInitialData({
          name: t.name,
          symbol: t.symbol,
          expirationDate: t.expirationDate || '',
          contractType: t.contractType,
          numberOfContracts: t.numberOfContracts,
          shortPutStrike: t.shortPutStrike,
          longPutStrike: t.longPutStrike,
          shortCallStrike: t.shortCallStrike,
          longCallStrike: t.longCallStrike,
          creditReceived: t.creditReceived,
          optionStrike: t.optionStrike,
          debitPaid: t.debitPaid,
          sharesOwned: t.sharesOwned,
          callStrike: t.callStrike,
          premiumReceived: t.premiumReceived,
          shares: t.shares,
          entryPrice: t.entryPrice,
        });
        params.delete('resume');
        const url = `${window.location.pathname}?${params.toString()}`.replace(/[?]$/, '');
        window.history.replaceState({}, '', url);
      } catch (e) {
        console.warn('Failed to resume draft', e);
      }
    })();
  }, [activeIPSs]);

  // When active trades change, fetch quotes for percent-to-short calc
  useEffect(() => {
    if (currentView !== 'active' || activeTrades.length === 0) return;
    const symbols = Array.from(new Set(activeTrades.map((r:any)=>r.symbol))).join(',');
    fetch(`/api/market-data/quotes?symbols=${encodeURIComponent(symbols)}`)
      .then(r=>r.json())
      .then(json=>{
        const map: Record<string, number> = {};
        (json?.data || []).forEach((q:any)=>{ map[q.symbol] = q.currentPrice || q.last || 0; });
        setQuotes(map);
      }).catch(()=>setQuotes({}));
  }, [activeTrades, currentView]);

  // Detect ?edit=<tradeId> and prefill entry form
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const editId = params.get('edit');
    if (!editId) return;
    (async () => {
      try {
        const res = await fetch(`/api/trades?id=${encodeURIComponent(editId)}`);
        const json = await res.json();
        const row = (json?.data || [])[0];
        if (!row) return;
        const ips = activeIPSs.find((i)=> (i as any).id === row.ips_id);
        if (ips) setSelectedIPS(ips as any);
        setCurrentView('entry');
        setEditInitialData({
          symbol: row.symbol,
          expirationDate: row.expiration_date || '',
          contractType: row.contract_type,
          numberOfContracts: row.number_of_contracts || undefined,
          shortPutStrike: row.contract_type === 'put-credit-spread' ? row.short_strike : undefined,
          longPutStrike: row.contract_type === 'put-credit-spread' ? row.long_strike : undefined,
          shortCallStrike: row.contract_type === 'call-credit-spread' ? row.short_strike : undefined,
          longCallStrike: row.contract_type === 'call-credit-spread' ? row.long_strike : undefined,
          creditReceived: row.credit_received || undefined,
        });
        params.delete('edit');
        const url = `${window.location.pathname}?${params.toString()}`.replace(/[?]$/, '');
        window.history.replaceState({}, '', url);
      } catch (e) { console.error('Prefill edit failed', e); }
    })();
  }, [activeIPSs]);

  async function bulkProspectiveToActive() {
    if (selectedProspective.size === 0) return;
    await fetch('/api/trades', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: Array.from(selectedProspective), status: 'active' })
    });
    await fetchProspectiveTrades();
  }

  async function bulkDeleteProspective() {
    if (selectedProspective.size === 0) return;
    await fetch('/api/trades', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: Array.from(selectedProspective) })
    });
    await fetchProspectiveTrades();
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
    async function handleAnalyze() {
      if (!aiDialog.file || !aiDialog.ipsId) return;
      try {
        setAiDialog((p)=> ({ ...p, loading: true, error: undefined }));
        const ips = activeIPSs.find((i)=> (i as any).id === aiDialog.ipsId) as any;
        const fd = new FormData();
        fd.append('file', aiDialog.file);
        if (ips) fd.append('ips', JSON.stringify(ips));
        // Encourage the model to output suggestions matching IPS strategy
        try {
          const mapped = mapIPSToContractType(ips);
          if (mapped?.type) fd.append('preferred_type', mapped.type);
        } catch {}
        const res = await fetch('/api/ai/options-scan', { method: 'POST', body: fd });
        const json = await res.json();
        if (!res.ok || !json?.success) throw new Error(json?.error || 'Analyze failed');
        setAiDialog((p)=> ({ ...p, results: json.data, loading: false }));
        setAiResults(json.data || null);
        setAiDialog((p)=> ({ ...p, open: false }));
        setCurrentView('analyze' as any);
      } catch (e:any) {
        setAiDialog((p)=> ({ ...p, loading: false, error: e?.message || 'Analyze failed' }));
      }
    }
    return (
      <div className="max-w-6xl mx-auto p-6">
        <div className="mb-8 flex items-start justify-between">
          <div>
            <h1 className="text-3xl font-bold mb-2">Choose an IPS to Make a Trade</h1>
            <p className="text-gray-600">Only active IPS configurations are shown</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setCurrentView('prospective')}>View Prospective Trades</Button>
            <Button variant="outline" onClick={() => setCurrentView('active')}>View Active Trades</Button>
            <Button onClick={() => setAiDialog(p=> ({ ...p, open: true, ipsId: (activeIPSs[0] as any)?.id || null }))}>
              <FileText className="h-4 w-4 mr-2" /> Analyze Screenshot (AI)
            </Button>
          </div>
        </div>

        {/* AI Agent Section */}
        {activeIPSs.length > 0 && (
          <AgentSection
            onAddToProspective={(candidate, ipsId) => {
              // Convert agent candidate to prospective trade format
              const ips = activeIPSs.find((i: any) => i.id === ipsId);
              if (!ips) {
                console.error("IPS not found for candidate");
                return;
              }

              // Convert candidate to TradeFormData
              const tradeData: TradeFormData = {
                name: `AI: ${candidate.symbol} ${candidate.strategy.replace(/_/g, " ")}`,
                symbol: candidate.symbol,
                contractType: "put-credit-spread",
                expirationDate: candidate.contract_legs[0]?.expiry,
                numberOfContracts: 1,
                shortPutStrike: candidate.contract_legs.find((l) => l.type === "SELL")?.strike,
                longPutStrike: candidate.contract_legs.find((l) => l.type === "BUY")?.strike,
                creditReceived: candidate.entry_mid,
                ipsFactors: {},
                apiFactors: {},
              };

              // Create prospective trade
              const prospectiveTrade: ProspectiveTrade = {
                id: candidate.id,
                ips: { id: ips.id, name: ips.name },
                data: tradeData,
                createdAt: new Date().toISOString(),
                score: candidate.score,
              };

              setProspectiveTrades((prev) => [prospectiveTrade, ...prev]);
              setCurrentView("prospective");
            }}
            availableIPSs={activeIPSs.map((ips: any) => ({ id: ips.id, name: ips.name }))}
            userId={userId}
          />
        )}

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

              // Get factor counts from the IPS configuration (server-populated)
              const totalFactors = ips.total_factors ?? 0;
              const activeFactors = ips.active_factors ?? 0;

              // API/Manual counts (prefer server counts; otherwise derive from rules)
              let apiCount = 0;
              let manualCount = 0;

              if (typeof (ips as any).api_factors === "number" || typeof (ips as any).manual_factors === "number") {
                apiCount = (ips as any).api_factors ?? 0;
                manualCount = (ips as any).manual_factors ?? 0;
              } else {
                const rules = normalizeIPSRules(ips);
                if (rules.length > 0) {
                  const isActive = (r: any) => (r.enabled ?? r.isActive ?? true) === true;
                  const method = (r: any) => (r.collection_method ?? r.source);
                  apiCount = rules.filter((r) => method(r) === "api" && isActive(r)).length;
                  manualCount = rules.filter((r) => method(r) === "manual" && isActive(r)).length;
                }
              }

              // Convert strategy ids into human-readable names
              const strategyLabel = (Array.isArray(ips.strategies)
                ? ips.strategies
                : [])
                .map((id: string) => strategyMap.get(id) || id)
                .join(", ");

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
                        <span className="font-medium">{strategyLabel || "None"}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-gray-600">IPS Factors:</span>
                        <span className="font-medium">{totalFactors}</span>
                      </div>
                    </div>

                    {/* Show API/Manual breakdown if we have counts */}
                    {totalFactors > 0 && (
                      <div className="flex justify-between text-xs text-gray-500 pt-2 border-t">
                        <span>📡 {apiCount} API</span>
                        <span>✍️ {manualCount} Manual</span>
                      </div>
                    )}

                    <Button
                      onClick={() => handleIPSSelection(ips)}
                      className="w-full bg-blue-600 hover:bg-blue-700"
                    >
                      Make Trade
                    </Button>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
        {/* Analyze Screenshot Dialog */}
        <Dialog open={aiDialog.open} onOpenChange={(o)=> setAiDialog((p)=> ({ ...p, open: o }))}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Analyze Options Screenshot</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div>
                <Label className="text-sm">Choose IPS</Label>
                <select className="w-full border rounded h-9 px-2 text-sm" value={aiDialog.ipsId ?? ''} onChange={(e)=> setAiDialog(p=> ({ ...p, ipsId: e.target.value || null }))}>
                  <option value="">Select an IPS…</option>
                  {activeIPSs.map((ips:any)=> (
                    <option key={ips.id} value={ips.id}>{ips.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <Label className="text-sm">Upload Screenshot</Label>
                <input type="file" accept="image/*" onChange={(e)=> setAiDialog(p=> ({ ...p, file: e.target.files?.[0] || null }))} />
              </div>
              {aiDialog.error && (<div className="text-sm text-red-600">{aiDialog.error}</div>)}
              <div className="flex gap-2">
                <Button variant="outline" onClick={()=> setAiDialog(p=> ({ ...p, open: false, results: null, file: null }))}>Close</Button>
                <Button disabled={!aiDialog.file || !aiDialog.ipsId || aiDialog.loading} onClick={handleAnalyze}>
                  {aiDialog.loading ? (<><RefreshCw className="h-4 w-4 mr-2 animate-spin"/> Analyzing…</>) : 'Analyze'}
                </Button>
              </div>
              {/* Suggestions now shown on a dedicated page for clarity */}
            </div>
          </DialogContent>
        </Dialog>
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

        {(() => {
          const { type: lockedType, label: strategyLabel } = mapIPSToContractType(selectedIPS);
          return (
            <NewTradeEntryForm
              selectedIPS={selectedIPS}
              lockedContractType={lockedType}
              strategyLabel={strategyLabel}
              onSubmit={(fd, score) => handleTradeSubmit(fd, score)}
              onCancel={() => setCurrentView("selection")}
              isLoading={isLoading}
              initialData={editInitialData || undefined}
            />
          );
        })()}
      </div>
    );
  }

  // -----------------------------
  // Prospective Trades view
  // -----------------------------
  if (currentView === "prospective") {
    const fmt = (n?: number | string) =>
      n === undefined || n === "" ? "—" : typeof n === "number" ? (Math.abs(n) >= 1 ? n.toFixed(2) : n.toString()) : n;

    async function runAIForSelected() {
      if (selectedProspective.size === 0 || aiBatchRunning) return;
      const ids = Array.from(selectedProspective);
      setAiBatchRunning(true);
      try {
        for (let i = 0; i < ids.length; i++) {
          const id = ids[i];
          setAiBatchMsg(`Analyzing ${i + 1} of ${ids.length}…`);
          const t = prospectiveTrades.find((x) => x.id === id);
          if (!t) continue;
          const res = await fetch("/api/ai/analyze", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              tradeId: t.id,
              ipsId: t.ips?.id,
              trade: t.data,
              ipsName: t.ips?.name || t.ips?.id,
              strategyType: t.data.contractType,
              factorValues: t.factorValues ?? null,
              score: t.score ?? null,
            }),
          });
          const json = await res.json().catch(() => null);
          if (res.ok && json?.success && json?.data) {
            setAiByTrade((prev) => ({ ...prev, [id]: json.data }));
          } else {
            setAiByTrade((prev) => ({ ...prev, [id]: undefined }));
          }
        }
        setAiBatchMsg(null);
      } catch (e) {
        setAiBatchMsg("Analysis failed. Try again later.");
      } finally {
        setAiBatchRunning(false);
        setTimeout(() => setAiBatchMsg(null), 2000);
      }
    }

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
                          const qty = d.numberOfContracts ?? (d.shares ? d.shares / 100 : 0);
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
              {loadingProspective ? (
                <div className="text-center py-12 text-gray-600">Loading prospective trades…</div>
              ) : prospectiveTrades.length === 0 ? (
                <div className="text-center py-12">
                  <TrendingUp className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-gray-900 mb-2">No prospective trades</h3>
                  <p className="text-gray-600 mb-6">Create your first trade using an IPS</p>
                  <Button onClick={() => setCurrentView("selection")}>
                    <Plus className="h-4 w-4 mr-2" /> Create New Trade
                  </Button>
                </div>
              ) : (
                <>
                <div className="flex items-center justify-between mb-3">
                  <div className="text-sm text-gray-600 flex items-center gap-3">
                    <span>Selected: {selectedProspective.size}</span>
                    {aiBatchRunning || aiBatchMsg ? (
                      <span className="text-xs text-blue-600">{aiBatchMsg || "Analyzing…"}</span>
                    ) : null}
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" onClick={bulkDeleteProspective} disabled={selectedProspective.size === 0 || aiBatchRunning}>Remove</Button>
                    <Button onClick={bulkProspectiveToActive} disabled={selectedProspective.size === 0 || aiBatchRunning} className="bg-blue-600 text-white">Add to Active</Button>
                    <Button variant="outline" onClick={runAIForSelected} disabled={selectedProspective.size === 0 || aiBatchRunning}>A.I. Analysis</Button>
                    <Button variant="outline" onClick={() => setCurrentView('selection')} disabled={aiBatchRunning}>Place New Trade</Button>
                    <Button variant="outline" onClick={() => setCurrentView('selection')} disabled={aiBatchRunning}>Trade Dashboard</Button>
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="text-left text-gray-600">
                      <tr>
                        <th className="py-2 pr-2">
                          <Checkbox
                            checked={selectedProspective.size > 0 && selectedProspective.size === prospectiveTrades.length}
                            onCheckedChange={(checked) => {
                              if (checked) setSelectedProspective(new Set(prospectiveTrades.map((x)=>x.id)));
                              else setSelectedProspective(new Set());
                            }}
                          />
                        </th>
                        <th className="py-2 pr-4">Created</th>
                        <th className="py-2 pr-4">IPS</th>
                        <th className="py-2 pr-4">Symbol</th>
                        <th className="py-2 pr-4">Strategy</th>
                        <th className="py-2 pr-4">Expiry</th>
                        <th className="py-2 pr-4">Key Terms</th>
                        <th className="py-2 pr-4">Credit/Debit</th>
                        <th className="py-2 pr-4">Score</th>
                        <th className="py-2 pr-4">A.I. Score</th>
                        <th className="py-2 pr-4">Details</th>
                        <th className="py-2 pr-4">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {prospectiveTrades
                        .slice()
                        .sort((a, b) => {
                          const as = (aiByTrade[a.id]?.score ?? a.score ?? -Infinity) as number;
                          const bs = (aiByTrade[b.id]?.score ?? b.score ?? -Infinity) as number;
                          return (isFinite(bs) ? bs : -1) - (isFinite(as) ? as : -1);
                        })
                        .map((t) => {
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
                        const isSel = selectedProspective.has(t.id);
                        return (
                          <Fragment key={t.id}>
                          <tr className="border-t">
                            <td className="py-2 pr-2">
                              <Checkbox
                                checked={isSel}
                                onCheckedChange={(checked)=>{
                                  setSelectedProspective(prev=>{
                                    const next = new Set(prev);
                                    if (checked) next.add(t.id); else next.delete(t.id);
                                    return next;
                                  })
                                }}
                              />
                            </td>
                            <td className="py-2 pr-4">{new Date(t.createdAt).toLocaleString()}</td>
                            <td className="py-2 pr-4">{t.ips.name}</td>
                            <td className="py-2 pr-4">{d.symbol}</td>
                            <td className="py-2 pr-4">{contract}</td>
                            <td className="py-2 pr-4">{d.expirationDate || "—"}</td>
                            <td className="py-2 pr-4">{terms}</td>
                            <td className="py-2 pr-4">{credit === undefined ? "—" : `$${fmt(credit)}`}</td>
                            <td className="py-2 pr-4">{t.score ? t.score.toFixed(1) : "—"}</td>
                            <td className="py-2 pr-4">
                              {aiByTrade[t.id]?.score != null ? (
                                <span className={`font-semibold ${Number(aiByTrade[t.id]?.score) >= 80 ? 'text-green-600' : Number(aiByTrade[t.id]?.score) >= 60 ? 'text-yellow-600' : 'text-red-600'}`}>
                                  {Math.round(Number(aiByTrade[t.id]?.score))}
                                </span>
                              ) : (
                                <span className="text-gray-400">—</span>
                              )}
                            </td>
                            <td className="py-2 pr-4">
                              <Button size="sm" variant="outline" onClick={() => setAiOpenRows(prev => {
                                const next = new Set(prev);
                                if (next.has(t.id)) next.delete(t.id); else next.add(t.id);
                                return next;
                              })} disabled={!aiByTrade[t.id]}>
                                View Details
                              </Button>
                            </td>
                            <td className="py-2 pr-4">
                              <div className="flex gap-2">
                                <Button
                                  size="sm"
                                  onClick={async ()=>{
                                    await fetch('/api/trades', { method:'PATCH', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ ids: [t.id], status: 'active' }) });
                                    await fetchProspectiveTrades();
                                  }}
                                >Activate</Button>
                                <Button
                                  size="sm"
                                  variant="destructive"
                                  onClick={async ()=>{
                                    await fetch('/api/trades', { method:'DELETE', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ ids: [t.id] }) });
                                    await fetchProspectiveTrades();
                                  }}
                                >Remove</Button>
                              </div>
                            </td>
                          </tr>
                          {aiOpenRows.has(t.id) && aiByTrade[t.id] ? (
                            <tr className="bg-gray-50">
                              <td></td>
                              <td colSpan={11} className="p-4">
                                {(() => {
                                  const R = aiByTrade[t.id]!;
                                  const categoryClass = R.score != null && Number(R.score) >= 80
                                    ? 'bg-green-100 text-green-800'
                                    : R.score != null && Number(R.score) >= 60
                                    ? 'bg-yellow-100 text-yellow-800'
                                    : 'bg-red-100 text-red-800';
                                  return (
                                    <div className="space-y-2">
                                      <div className="flex items-start justify-between">
                                        <div className="text-sm text-gray-700 whitespace-pre-line pr-4">
                                          {R.summary}
                                        </div>
                                        <div className="text-right min-w-[140px]">
                                          <div className="text-2xl font-bold text-blue-600">{R.score != null ? Math.round(Number(R.score)) : '—'}</div>
                                          <span className={`inline-block text-xs px-2 py-1 rounded ${categoryClass}`}>{R.category}</span>
                                        </div>
                                      </div>
                                      {R.scoreSources && (
                                        <div className="text-xs text-gray-500">
                                          Baseline {formatScoreValue(R.scoreSources.baseline)} · AI raw {formatScoreValue(R.scoreSources.ai)}
                                        </div>
                                      )}
                                      {R.adjustments && (
                                        <div className="text-xs text-gray-500">
                                          Adjustment {formatSigned(R.adjustments.ai_adjustment)}{R.adjustments.reasons?.length ? ` (${R.adjustments.reasons.join(", ")})` : ""}
                                        </div>
                                      )}
                                      {Array.isArray(R.drivers) && R.drivers.length > 0 && (
                                        <div className="text-xs text-gray-700">
                                          <div className="text-xs font-semibold text-gray-600 mb-1">Top Drivers</div>
                                          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                                            {R.drivers.slice(0, 6).map((driver, idx) => (
                                              <div key={idx} className="rounded border border-gray-200 bg-white px-2 py-1 flex justify-between gap-2">
                                                <div>
                                                  <div className="font-medium">{driver.code}</div>
                                                  {driver.short_text && <div className="text-[11px] text-gray-500">{driver.short_text}</div>}
                                                </div>
                                                <div className="text-right text-[11px] text-gray-600">
                                                  <div>{driver.direction === "neg" ? "-" : "+"}</div>
                                                  <div>{driver.evidence_number != null ? Number(driver.evidence_number).toFixed(2) : "—"}</div>
                                                </div>
                                              </div>
                                            ))}
                                          </div>
                                        </div>
                                      )}
                                      {R.benchmarks && (
                                        <div className="text-xs text-gray-700">
                                          <div className="text-xs font-semibold text-gray-600 mb-1">Benchmarks</div>
                                          <div className="flex flex-wrap gap-3">
                                            <span>Win rate: {formatPercentValue(R.benchmarks.win_rate)}</span>
                                            <span>Median P/L: {formatCurrencyValue(R.benchmarks.median_pl)}</span>
                                            <span>Sample: {R.benchmarks.sample_size}</span>
                                          </div>
                                        </div>
                                      )}
                                      {R.playbook?.entries?.length ? (
                                        <div className="text-xs text-gray-700">
                                          <div className="text-xs font-semibold text-gray-600 mb-1">Playbook</div>
                                          <div className="space-y-1">
                                            {R.playbook.entries.slice(0, 4).map((entry, idx) => (
                                              <div key={idx} className="border border-blue-200 bg-blue-50 rounded px-2 py-1">
                                                <div className="font-medium">{entry.trigger}</div>
                                                {entry.condition && <div>Condition: {entry.condition}</div>}
                                                {entry.action && <div>Action: {entry.action}</div>}
                                                {entry.exit_if && <div>Exit: {entry.exit_if}</div>}
                                                <div>Confidence: {formatPercentValue(entry.confidence)}</div>
                                              </div>
                                            ))}
                                          </div>
                                        </div>
                                      ) : null}

                                      {Array.isArray(R.suggestions) && R.suggestions.length > 0 && (
                                        <div className="text-sm text-gray-700">
                                          <div className="font-medium text-sm mb-1">Suggestions</div>
                                          <ul className="list-disc list-inside">
                                            {R.suggestions.slice(0, 3).map((s, i) => (<li key={i}>{s}</li>))}
                                          </ul>
                                        </div>
                                      )}
                                      {R.full ? (
                                        <details>
                                          <summary className="text-sm text-blue-600 cursor-pointer select-none">Show additional details</summary>
                                          <div className="mt-2 grid grid-cols-1 md:grid-cols-2 gap-3 text-sm text-gray-700">
                                            {R.inputs ? (
                                              <div className="space-y-1">
                                                <div className="text-xs font-semibold text-gray-600">Data Snapshot</div>
                                                <div>Price: {R.inputs?.underlying?.price ?? '—'} • 52w: {R.inputs?.underlying?.week52_low ?? '—'} / {R.inputs?.underlying?.week52_high ?? '—'}</div>
                                                <div>Trend: {R.inputs?.technicals?.trend_bias ?? (R.inputs?.technicals?.golden_cross ? 'uptrend' : '—')}</div>
                                                <div>RSI(14): {R.inputs?.technicals?.rsi14 ?? '—'} • SMA50/200: {R.inputs?.technicals?.sma50 ?? '—'} / {R.inputs?.technicals?.sma200 ?? '—'}</div>
                                                <div>MACD: {R.inputs?.technicals?.macd ?? '—'} ({R.inputs?.technicals?.macd_signal ?? '—'})</div>
                                                <div>Macro: CPI {R.inputs?.macro?.cpi ?? '—'} • Unemp {R.inputs?.macro?.unemployment_rate ?? '—'} • FFR {R.inputs?.macro?.fed_funds_rate ?? '—'} • 10Y {R.inputs?.macro?.treasury_10y ?? '—'}</div>
                                                <div>News Sentiment: avg {R.inputs?.news_sentiment?.average_score ?? '—'} ({R.inputs?.news_sentiment?.positive ?? 0}+/{R.inputs?.news_sentiment?.negative ?? 0}-/{R.inputs?.news_sentiment?.neutral ?? 0}=)</div>
                                              </div>
                                            ) : null}
                                            {R.inputs?.underlying?.fundamentals ? (
                                              <div className="space-y-1">
                                                <div className="text-xs font-semibold text-gray-600">Fundamentals</div>
                                                <div>PE: {R.inputs.underlying.fundamentals.pe_ratio ?? '—'} • PEG: {R.inputs.underlying.fundamentals.peg_ratio ?? '—'}</div>
                                                <div>PS/PB: {R.inputs.underlying.fundamentals.ps_ratio_ttm ?? '—'} / {R.inputs.underlying.fundamentals.pb_ratio ?? '—'} • EV/EBITDA: {R.inputs.underlying.fundamentals.ev_to_ebitda ?? '—'}</div>
                                                <div>Margins (G/O/N): {R.inputs.underlying.fundamentals.gross_margin_pct ?? '—'}% / {R.inputs.underlying.fundamentals.operating_margin_pct ?? '—'}% / {R.inputs.underlying.fundamentals.net_margin_pct ?? '—'}%</div>
                                                <div>ROE/ROA: {R.inputs.underlying.fundamentals.roe_pct ?? '—'}% / {R.inputs.underlying.fundamentals.roa_pct ?? '—'}%</div>
                                                <div>Growth (Rev/EPS YoY): {R.inputs.underlying.fundamentals.revenue_growth_yoy_pct ?? '—'}% / {R.inputs.underlying.fundamentals.earnings_growth_yoy_pct ?? '—'}%</div>
                                                <div>Dividend Yield: {R.inputs.underlying.fundamentals.dividend_yield_pct ?? '—'}%</div>
                                              </div>
                                            ) : null}
                                            {R.full?.math ? (
                                              <div className="space-y-1">
                                                <div className="text-xs font-semibold text-gray-600">Math</div>
                                                <div>Max Profit: {R.full.math.max_profit ?? '—'} • Max Loss: {R.full.math.max_loss ?? '—'}</div>
                                                <div>PoP: {R.full.math.pop_proxy ?? '—'} • RR: {R.full.math.rr_ratio ?? '—'}</div>
                                              </div>
                                            ) : null}
                                          </div>
                                        </details>
                                      ) : null}
                                    </div>
                                  );
                                })()}
                              </td>
                            </tr>
                          ) : null}
                          </Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                </>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  // -----------------------------
  // Active Trades view
  // -----------------------------
  if (currentView === "active") {
    const fmtMoney = (v?: number | null) => (v == null ? '—' : `$${v.toFixed(2)}`);
    return (
      <div className="max-w-6xl mx-auto p-6">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Active Trades</h1>
            <p className="text-gray-600">Monitor your current positions</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setCurrentView('selection')}><Plus className="h-4 w-4 mr-2"/> New Trade</Button>
            <Button variant="outline" onClick={() => setCurrentView('prospective')}>View Prospective</Button>
            <Button variant="outline" onClick={() => setCurrentView('action_needed')}>View Action Needed</Button>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Current Positions</CardTitle>
          </CardHeader>
          <CardContent>
            {activeTrades.length === 0 ? (
              <div className="text-center py-12 text-gray-600">No active trades.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-left text-gray-600">
                    <tr>
                      <th className="py-2 pr-2">
                        <Checkbox
                          checked={selectedActive.size>0 && selectedActive.size===activeTrades.length}
                          onCheckedChange={(checked)=>{
                            if (checked) setSelectedActive(new Set(activeTrades.map((r:any)=>r.id)));
                            else setSelectedActive(new Set());
                          }}
                        />
                      </th>
                      <th className="py-2 pr-4">Name</th>
                      <th className="py-2 pr-4">Exp. Date</th>
                      <th className="py-2 pr-4">Contract</th>
                      <th className="py-2 pr-4">Max Gain</th>
                      <th className="py-2 pr-4">Max Loss</th>
                      <th className="py-2 pr-4">IPS Score</th>
                      <th className="py-2 pr-4">% Current to Short</th>
                      <th className="py-2 pr-4">Status</th>
                      <th className="py-2 pr-4">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {activeTrades.map((r:any)=>{
                      const isSel = selectedActive.has(r.id);
                      const price = quotes[r.symbol] ?? r.current_price ?? 0;
                      let cushion: number | null = null;
                      if (r.contract_type === 'put-credit-spread' && r.short_strike) {
                        cushion = ((price - r.short_strike) / r.short_strike) * 100;
                      } else if (r.contract_type === 'call-credit-spread' && r.short_strike) {
                        cushion = ((r.short_strike - price) / r.short_strike) * 100;
                      }
                      let statusTxt = 'GOOD'; let statusClass = 'bg-green-50 text-green-700';
                      const ipsScoreVal = r.ips_score != null ? Number(r.ips_score) : null;
                      const watchFlag = (ipsScoreVal != null && ipsScoreVal < 75) || (cushion != null && cushion < 5);
                      if (cushion != null && cushion < 0) {
                        statusTxt = 'EXIT (LOSS)'; statusClass = 'bg-red-50 text-red-700';
                      } else if (watchFlag) {
                        statusTxt = 'WATCH'; statusClass = 'bg-yellow-50 text-yellow-700';
                      }
                      return (
                        <tr key={r.id} className="border-t">
                          <td className="py-2 pr-2"><Checkbox checked={isSel} onCheckedChange={(ch)=>{
                            setSelectedActive(prev=>{ const next=new Set(prev); if (ch) next.add(r.id); else next.delete(r.id); return next;});
                          }}/></td>
                          <td className="py-2 pr-4">
                            <div className="font-medium">{r.name || r.symbol}</div>
                            <div className="text-xs text-gray-500">{r.symbol}</div>
                          </td>
                          <td className="py-2 pr-4">{r.expiration_date ? new Date(r.expiration_date).toLocaleDateString() : '—'}</td>
                          <td className="py-2 pr-4">{r.contract_type?.replace(/-/g,' ')}</td>
                          <td className="py-2 pr-4">{fmtMoney(r.max_gain)}</td>
                          <td className="py-2 pr-4">{fmtMoney(r.max_loss)}</td>
                          <td className="py-2 pr-4">{r.ips_score != null ? `${Math.round(r.ips_score)}/100` : '—'}</td>
                          <td className={`py-2 pr-4 ${cushion!=null && cushion<0 ? 'text-red-600' : 'text-green-600'}`}>{cushion!=null ? `${cushion.toFixed(2)}%` : '—'}</td>
                          <td className="py-2 pr-4"><Badge className={statusClass}>{statusTxt}</Badge></td>
                          <td className="py-2 pr-4">
                            <div className="flex gap-2">
                              <Button size="sm" variant="outline" onClick={() => (window.location.href = '/journal')}>AI</Button>
                              <Button size="sm" variant="outline" onClick={() => setCurrentView('active')}>View</Button>
                              <Button size="sm" variant="outline" onClick={() => (window.location.href = `/trades?edit=${r.id}`)}>Edit</Button>
                              <Button size="sm" variant="destructive" onClick={async ()=>{
                                try {
                                  const key = 'tenxiv:trade-closures';
                                  const raw = localStorage.getItem(key);
                                  const obj = raw ? JSON.parse(raw) : {};
                                  obj[r.id] = {
                                    ...(obj[r.id] || {}),
                                    needsAction: true,
                                    ipsName: r.ips_name ?? r.ips_configurations?.name ?? null,
                                    updatedAt: new Date().toISOString(),
                                  };
                                  localStorage.setItem(key, JSON.stringify(obj));
                                } catch {}
                                dispatchTradesUpdated({ type: 'moved-to-action-needed', id: r.id });
                              }}>Close</Button>
                            </div>
                          </td>
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
    );
  }

  // -----------------------------
  // Analyze Results view
  // -----------------------------
  if (currentView === 'analyze') {
    const suggestions: any[] = Array.isArray(aiResults?.suggestions) ? aiResults.suggestions : [];
    const sorted = [...suggestions].sort((a,b)=> {
      const sa = Number(a.score ?? 0);
      const sb = Number(b.score ?? 0);
      if (isFinite(sb - sa) && sb !== sa) return sb - sa;
      // fallback: prefer higher credit, lower debit
      const ca = Number(a.creditReceived ?? 0);
      const cb = Number(b.creditReceived ?? 0);
      if (cb !== ca) return cb - ca;
      const da = Number(a.debitPaid ?? Infinity);
      const db = Number(b.debitPaid ?? Infinity);
      return da - db;
    });
    const fmt = (n:any)=> (n==null || n==='') ? '—' : typeof n==='number' ? (Math.abs(n)>=1? n.toFixed(2): n.toString()) : String(n);
    const ipsForScan = activeIPSs.find((i:any)=> i.id === aiDialog.ipsId) as any;
    const mapped = ipsForScan ? mapIPSToContractType(ipsForScan) : null;
    return (
      <div className="max-w-6xl mx-auto p-6">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">AI Suggestions</h1>
            <p className="text-gray-600">Most optimal first based on the screenshot{mapped ? ` • Strategy: ${mapped.label}` : ''}</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={()=> setCurrentView('selection')}>Back to IPS Selection</Button>
          </div>
        </div>

        {sorted.length === 0 ? (
          <Card>
            <CardContent className="py-6 text-gray-800">
              <div className="font-medium mb-1">No suggestions returned by AI</div>
              <div className="text-sm text-gray-600 mb-3">
                {aiResults?.explanation || (aiResults?.meta?.originalCount > 0 && aiResults?.meta?.filteredCount === 0
                  ? `The analyzer found ${aiResults?.meta?.originalCount} candidate(s), but they did not match your IPS strategy${mapped ? ` (${mapped.label})` : ''}.`
                  : 'The analyzer could not read enough information from the screenshot to form valid trades. Ensure the option chain rows (strikes, bid/ask, delta) are clearly visible and not cropped.')}
              </div>
              <div className="text-xs text-gray-500">
                Tips:
                <ul className="list-disc ml-5 mt-1 space-y-1">
                  <li>Zoom in on the chain so one expiry fits the screen.</li>
                  <li>Include headers and columns (Strike, Bid/Ask, Delta).</li>
                  <li>Capture the correct side for your strategy{mapped ? ` (${mapped.label})` : ''}.</li>
                </ul>
              </div>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {sorted.map((s:any, idx:number)=> (
              <Card key={idx}>
                <CardContent className="p-4 flex items-center justify-between">
                  <div className="text-sm">
                    <div className="font-medium">{(s.contractType || '').replace(/-/g,' ')} {s.symbol || aiResults?.symbol || ''}</div>
                    <div className="text-gray-600">
                      Exp: {fmt(s.expirationDate)}
                      {s.shortPutStrike!=null ? <> • P {fmt(s.shortPutStrike)}/{fmt(s.longPutStrike)}</> : null}
                      {s.shortCallStrike!=null ? <> • C {fmt(s.shortCallStrike)}/{fmt(s.longCallStrike)}</> : null}
                      {s.optionStrike!=null ? <> • K {fmt(s.optionStrike)}</> : null}
                      {s.creditReceived!=null ? <> • Credit ${fmt(s.creditReceived)}</> : null}
                      {s.debitPaid!=null ? <> • Debit ${fmt(s.debitPaid)}</> : null}
                      {s.score!=null ? <> • Score {fmt(s.score)}/100</> : null}
                    </div>
                    {s.rationale && <div className="text-xs text-gray-500 mt-1">{s.rationale}</div>}
                  </div>
                  <div className="flex gap-2">
                    <Button onClick={()=>{
                      if (!activeIPSs.length) return;
                      const ip = activeIPSs.find((i:any)=> i.id === aiDialog.ipsId) || activeIPSs[0];
                      const ips = ip as any;
                      setSelectedIPS(ips);
                      setEditInitialData({
                        symbol: s.symbol || aiResults?.symbol || '',
                        expirationDate: s.expirationDate || '',
                        contractType: s.contractType,
                        shortPutStrike: s.shortPutStrike,
                        longPutStrike: s.longPutStrike,
                        shortCallStrike: s.shortCallStrike,
                        longCallStrike: s.longCallStrike,
                        optionStrike: s.optionStrike,
                        creditReceived: s.creditReceived,
                        debitPaid: s.debitPaid,
                        numberOfContracts: 1,
                      });
                      setCurrentView('entry');
                    }}>Place This Trade</Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    );
  }
  // -----------------------------
  // Action Needed view
  // -----------------------------
  if (currentView === 'action_needed') {
    const fmt = (n?: number | null) => (n == null ? '—' : `${n}`);
    const closeMethods = [
      { key: 'manual_close', label: 'Manual Close' },
      { key: 'expired_worthless', label: 'Expired — Worthless' },
      { key: 'expired_itm_assigned', label: 'Expired — ITM Assigned' },
      { key: 'rolled', label: 'Rolled' },
      { key: 'stop_hit', label: 'Stop Hit' },
      { key: 'target_hit', label: 'Target Hit' },
      { key: 'risk_rules_exit', label: 'Risk Rules Exit' },
      { key: 'other', label: 'Other' },
    ];

    return (
      <div className="max-w-6xl mx-auto p-6">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Action Needed</h1>
            <p className="text-gray-600">Enter final details to close trades</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setCurrentView('active')}>View Active</Button>
            <Button variant="outline" onClick={() => setCurrentView('prospective')}>View Prospective</Button>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Trades Requiring Close Details</CardTitle>
          </CardHeader>
          <CardContent>
            {actionNeededTrades.length === 0 ? (
              <div className="text-center py-12 text-gray-600">No trades need action.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-left text-gray-600">
                    <tr>
                      <th className="py-2 pr-2"></th>
                      <th className="py-2 pr-4">Name</th>
                      <th className="py-2 pr-4">Symbol</th>
                      <th className="py-2 pr-4">Contract</th>
                      <th className="py-2 pr-4">Expiry</th>
                      <th className="py-2 pr-4">Contracts</th>
                      <th className="py-2 pr-4">Credit</th>
                      <th className="py-2 pr-4">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {actionNeededTrades.map((r:any)=>{
                      return (
                        <tr key={r.id} className="border-t">
                          <td className="py-2 pr-2">•</td>
                          <td className="py-2 pr-4">{r.name || r.symbol}</td>
                          <td className="py-2 pr-4">{r.symbol}</td>
                          <td className="py-2 pr-4">{String(r.contract_type || '').replace(/-/g,' ')}</td>
                          <td className="py-2 pr-4">{r.expiration_date ? new Date(r.expiration_date).toLocaleDateString() : '—'}</td>
                          <td className="py-2 pr-4">{fmt(r.number_of_contracts)}</td>
                          <td className="py-2 pr-4">{r.credit_received!=null ? `$${Number(r.credit_received).toFixed(2)}` : '—'}</td>
                          <td className="py-2 pr-4">
                            <div className="flex gap-2">
                              <Button size="sm" onClick={() => setClosingDialog({
                                open: true,
                                trade: r,
                                closeDate: new Date().toISOString().slice(0,10),
                                closeMethod: 'manual_close',
                                underlyingPriceAtClose: '',
                                costToClosePerSpread: '',
                                exitPremiumPerContract: '',
                                contractsClosed: String(r.number_of_contracts ?? ''),
                                commissionsTotal: '',
                                feesTotal: '',
                                notes: '',
                              })}>Enter Close Details</Button>
                              <Button size="sm" variant="outline" onClick={async ()=>{
                                await fetch('/api/trades', { method:'PATCH', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ ids: [r.id], status: 'active' }) });
                                await fetchActionNeededTrades();
                              }}>Back to Active</Button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Close Details Dialog */}
        <Dialog open={closingDialog.open} onOpenChange={(o)=> setClosingDialog(prev => ({ ...prev, open: o }))}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Enter Close Details</DialogTitle>
            </DialogHeader>
            {closingDialog.trade && (
              <div className="space-y-3">
                <div className="text-sm text-gray-600">{closingDialog.trade.name || closingDialog.trade.symbol}</div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <Label className="text-sm">Close Date</Label>
                    <Input type="date" value={closingDialog.closeDate} onChange={(e)=> setClosingDialog(prev => ({ ...prev, closeDate: e.target.value }))} />
                  </div>
                  <div>
                    <Label className="text-sm">Method</Label>
                    <select className="w-full border rounded h-9 px-2 text-sm" value={closingDialog.closeMethod} onChange={(e)=> setClosingDialog(prev => ({ ...prev, closeMethod: e.target.value }))}>
                      {closeMethods.map(m=> <option key={m.key} value={m.key}>{m.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <Label className="text-sm">Underlying @ Close</Label>
                    <Input inputMode="decimal" value={closingDialog.underlyingPriceAtClose} onChange={(e)=> setClosingDialog(prev => ({ ...prev, underlyingPriceAtClose: e.target.value }))} placeholder="e.g., 153.25" />
                  </div>
                  {/* Strategy-specific fields */}
                  {(['put-credit-spread','call-credit-spread','iron-condor'].includes(String(closingDialog.trade.contract_type))) ? (
                    <>
                      <div>
                        <Label className="text-sm">Cost to Close (per spread)</Label>
                        <Input inputMode="decimal" value={closingDialog.costToClosePerSpread} onChange={(e)=> setClosingDialog(prev => ({ ...prev, costToClosePerSpread: e.target.value }))} placeholder="e.g., 0.35" />
                      </div>
                      <div>
                        <Label className="text-sm">Contracts Closed</Label>
                        <Input inputMode="numeric" value={closingDialog.contractsClosed} onChange={(e)=> setClosingDialog(prev => ({ ...prev, contractsClosed: e.target.value }))} placeholder="e.g., 1" />
                      </div>
                    </>
                  ) : null}
                  {(['long-call','long-put','covered-call'].includes(String(closingDialog.trade.contract_type))) ? (
                    <>
                      <div>
                        <Label className="text-sm">Exit Premium (per contract)</Label>
                        <Input inputMode="decimal" value={closingDialog.exitPremiumPerContract} onChange={(e)=> setClosingDialog(prev => ({ ...prev, exitPremiumPerContract: e.target.value }))} placeholder="e.g., 2.10" />
                      </div>
                      <div>
                        <Label className="text-sm">Contracts Closed</Label>
                        <Input inputMode="numeric" value={closingDialog.contractsClosed} onChange={(e)=> setClosingDialog(prev => ({ ...prev, contractsClosed: e.target.value }))} placeholder="e.g., 1" />
                      </div>
                    </>
                  ) : null}
                  <div>
                    <Label className="text-sm">Commissions</Label>
                    <Input inputMode="decimal" value={closingDialog.commissionsTotal} onChange={(e)=> setClosingDialog(prev => ({ ...prev, commissionsTotal: e.target.value }))} placeholder="e.g., 1.30" />
                  </div>
                  <div>
                    <Label className="text-sm">Fees</Label>
                    <Input inputMode="decimal" value={closingDialog.feesTotal} onChange={(e)=> setClosingDialog(prev => ({ ...prev, feesTotal: e.target.value }))} placeholder="e.g., 0.65" />
                  </div>
                  <div className="md:col-span-2">
                    <Label className="text-sm">Notes</Label>
                    <Input value={closingDialog.notes} onChange={(e)=> setClosingDialog(prev => ({ ...prev, notes: e.target.value }))} placeholder="Optional notes" />
                  </div>
                </div>
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={()=> setClosingDialog(prev => ({ ...prev, open: false }))}>Cancel</Button>
              <Button onClick={async ()=>{
                if (!closingDialog.trade) return;
                const payload: any = {
                  tradeId: closingDialog.trade.id,
                  closeMethod: closingDialog.closeMethod,
                  closeDate: closingDialog.closeDate,
                  underlyingPriceAtClose: closingDialog.underlyingPriceAtClose ? parseFloat(closingDialog.underlyingPriceAtClose) : null,
                  costToClosePerSpread: closingDialog.costToClosePerSpread ? parseFloat(closingDialog.costToClosePerSpread) : null,
                  exitPremiumPerContract: closingDialog.exitPremiumPerContract ? parseFloat(closingDialog.exitPremiumPerContract) : null,
                  contractsClosed: closingDialog.contractsClosed ? parseInt(closingDialog.contractsClosed, 10) : null,
                  commissionsTotal: closingDialog.commissionsTotal ? parseFloat(closingDialog.commissionsTotal) : null,
                  feesTotal: closingDialog.feesTotal ? parseFloat(closingDialog.feesTotal) : null,
                  notes: closingDialog.notes || null,
                };
                const res = await fetch('/api/trades/close', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
                if (!res.ok) {
                  console.error('Close failed');
                }
                await fetchActionNeededTrades();
                setClosingDialog(prev => ({ ...prev, open: false }));
              }}>Save & Close Trade</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
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
  lockedContractType: ContractType;
  strategyLabel: string;
  onSubmit: (formData: TradeFormData, score: number | null) => void;
  onCalculateScore: (formData: TradeFormData) => void;
  onCancel: () => void;
  isLoading: boolean;
  calculatedScore: number | null;
}

function EnhancedTradeEntryForm({
  selectedIPS,
  lockedContractType,
  strategyLabel,
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
    contractType: lockedContractType,
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

  // Enforce locked strategy if IPS changes
  useEffect(() => {
    setFormData((p) => ({ ...p, contractType: lockedContractType }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lockedContractType]);

  const [apiStatus, setApiStatus] = useState<"connected" | "disconnected" | "loading">("connected");
  const [completionScore, setCompletionScore] = useState<number>(0);
  const [textValues, setTextValues] = useState<Record<string, string>>({});

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
    const renderN = (props: { id: keyof TradeFormData; label: string; step?: string; placeholder?: string }) => {
      const textValue =
        textValues[String(props.id)] ??
        (formData[props.id] !== undefined && formData[props.id] !== null
          ? String(formData[props.id] as any)
          : "");

      return (
        <div>
          <Label htmlFor={String(props.id)}>{props.label}</Label>
          <Input
            id={String(props.id)}
            type="text"
            inputMode="decimal"
            value={textValue}
            onChange={(e) => {
              const raw = e.target.value;
              setTextValues((prev) => ({ ...prev, [String(props.id)]: raw }));
              if (raw === "" || raw === "." || raw === "-") {
                setFormData((p) => ({ ...p, [props.id]: undefined }));
              } else {
                const parsed = parseFloat(raw);
                if (!isNaN(parsed)) {
                  setFormData((p) => ({ ...p, [props.id]: parsed }));
                }
              }
            }}
            placeholder={props.placeholder}
          />
        </div>
      );
    };

    const renderD = (props: { id: keyof TradeFormData; label: string }) => (
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

    const renderC = (props: { id: keyof TradeFormData; label: string; min?: number; placeholder?: string }) => {
      const textValue =
        textValues[String(props.id)] ??
        (formData[props.id] !== undefined && formData[props.id] !== null
          ? String(formData[props.id] as any)
          : "");

      return (
        <div>
          <Label htmlFor={String(props.id)}>{props.label}</Label>
          <Input
            id={String(props.id)}
            type="text"
            inputMode="numeric"
            value={textValue}
            onChange={(e) => {
              const raw = e.target.value;
              setTextValues((prev) => ({ ...prev, [String(props.id)]: raw }));
              if (raw === "" || raw === "-") {
                setFormData((p) => ({ ...p, [props.id]: undefined }));
              } else {
                const parsed = parseInt(raw, 10);
                if (!isNaN(parsed)) {
                  setFormData((p) => ({ ...p, [props.id]: parsed }));
                }
              }
            }}
            placeholder={props.placeholder}
          />
        </div>
      );
    };

    switch (formData.contractType) {
      case "put-credit-spread":
        return (
          <>
            {renderD({ id: "expirationDate", label: "Expiration Date" })}
            {renderC({ id: "numberOfContracts", label: "Contracts", placeholder: "1" })}
            {renderN({ id: "shortPutStrike", label: "Short Put Strike", placeholder: "145.00" })}
            {renderN({ id: "longPutStrike", label: "Long Put Strike", placeholder: "140.00" })}
            {renderN({ id: "creditReceived", label: "Net Credit (per spread)", placeholder: "1.25" })}
          </>
        );
      case "call-credit-spread":
        return (
          <>
            {renderD({ id: "expirationDate", label: "Expiration Date" })}
            {renderC({ id: "numberOfContracts", label: "Contracts", placeholder: "1" })}
            {renderN({ id: "shortCallStrike", label: "Short Call Strike", placeholder: "155.00" })}
            {renderN({ id: "longCallStrike", label: "Long Call Strike", placeholder: "160.00" })}
            {renderN({ id: "creditReceived", label: "Net Credit (per spread)", placeholder: "1.10" })}
          </>
        );
      case "long-call":
      case "long-put":
        return (
          <>
            {renderD({ id: "expirationDate", label: "Expiration Date" })}
            {renderC({ id: "numberOfContracts", label: "Contracts", placeholder: "1" })}
            {renderN({ id: "optionStrike", label: "Option Strike", placeholder: "150.00" })}
            {renderN({ id: "debitPaid", label: "Debit Paid (per contract)", placeholder: "2.35" })}
          </>
        );
      case "covered-call":
        return (
          <>
            {renderD({ id: "expirationDate", label: "Expiration Date" })}
            {renderN({ id: "sharesOwned", label: "Shares Owned", step: "1", placeholder: "100" })}
            {renderN({ id: "callStrike", label: "Call Strike", placeholder: "160.00" })}
            {renderN({ id: "premiumReceived", label: "Premium Received (per contract)", placeholder: "1.35" })}
          </>
        );
      case "iron-condor":
        return (
          <>
            {renderD({ id: "expirationDate", label: "Expiration Date" })}
            {renderC({ id: "numberOfContracts", label: "Contracts", placeholder: "1" })}
            {renderN({ id: "shortPutStrike", label: "Short Put Strike", placeholder: "145.00" })}
            {renderN({ id: "longPutStrike", label: "Long Put Strike", placeholder: "140.00" })}
            {renderN({ id: "shortCallStrike", label: "Short Call Strike", placeholder: "160.00" })}
            {renderN({ id: "longCallStrike", label: "Long Call Strike", placeholder: "165.00" })}
            {renderN({ id: "creditReceived", label: "Net Credit (per condor)", placeholder: "2.10" })}
          </>
        );
      case "buy-hold":
        return (
          <>
            {renderN({ id: "shares", label: "Shares", step: "1", placeholder: "100" })}
            {renderN({ id: "entryPrice", label: "Entry Price", placeholder: "153.10" })}
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
                type="text"
                inputMode="decimal"
                value={
                  textValues.currentPrice ??
                  (formData.currentPrice !== undefined && formData.currentPrice !== null
                    ? String(formData.currentPrice)
                    : "")
                }
                onChange={(e) => {
                  const raw = e.target.value;
                  setTextValues((prev) => ({ ...prev, currentPrice: raw }));
                  setFormData((p) => ({
                    ...p,
                    currentPrice: raw === "" || raw === "." || raw === "-" ? undefined : parseFloat(raw),
                  }));
                }}
                placeholder="192.34"
              />
            </div>

            <div>
              <Label>Strategy</Label>
              <div className="w-full p-2 border border-gray-200 rounded-md bg-gray-50">
                <span className="text-sm font-medium">{strategyLabel}</span>
              </div>
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
              <Button
                size="sm"
                variant="outline"
                className="ml-2"
                onClick={() => formData.symbol && loadAPIFactors(formData.symbol)}
                disabled={!formData.symbol || apiStatus === "loading"}
                title="Refresh API factors"
              >
                <RefreshCw className={`h-4 w-4 ${apiStatus === "loading" ? "animate-spin" : ""}`} />
              </Button>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* API factors auto-load from the Symbol entered in Trade Details. No duplicate ticker input here. */}

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
