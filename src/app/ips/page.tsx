"use client"

import React, { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Progress } from "@/components/ui/progress";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import {
  FileText,
  Settings,
  CheckCircle,
  Target,
  BarChart3,
  Shield,
  PlusCircle,
  Eye,
  Edit,
  Copy,
  Archive,
  MoreVertical,
  Trash2,
  Layers,
  AlertTriangle,
  Save,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

// Import components
import { IPSStrategySelector } from "@/components/ips/ips-strategy-selector";
import { IPSFactorSelector } from "@/components/ips/ips-factor-selector";
import { IPSExitWatchConfig } from "@/components/ips/ips-exit-watch-config";
import { IPSDTEConfig } from "@/components/ips/ips-dte-config";
import { IPSSummary } from "@/components/ips/ips-summary";
import { TradeScoreDisplay } from "@/components/ips/trade-score-display";
import { BacktestButton } from "@/components/ips/BacktestButton";

// Services & types
import {
  ipsDataService,
  type IPSConfiguration,
  type TradingStrategy,
} from "@/lib/services/ips-data-service";

// -------------------------------
// Delete Confirmation Dialog Component
// -------------------------------
interface DeleteConfirmationDialogProps {
  isOpen: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  title?: string;
  description?: string;
  isLoading?: boolean;
}

function DeleteConfirmationDialog({
  isOpen,
  onConfirm,
  onCancel,
  title = "Delete IPS Configuration",
  description = "Are you sure you want to delete this IPS? This action cannot be undone and will permanently remove all associated data.",
  isLoading = false
}: DeleteConfirmationDialogProps) {
  return (
    <Dialog open={isOpen} onOpenChange={onCancel}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/20">
              <AlertTriangle className="h-5 w-5 text-red-600 dark:text-red-400" />
            </div>
            <div className="flex-1">
              <DialogTitle className="text-left">{title}</DialogTitle>
            </div>
          </div>
        </DialogHeader>
        
        <DialogDescription className="text-left py-2">
          {description}
        </DialogDescription>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            variant="outline"
            onClick={onCancel}
            disabled={isLoading}
          >
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={onConfirm}
            disabled={isLoading}
            className="gap-2"
          >
            {isLoading ? (
              <>
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                Deleting...
              </>
            ) : (
              <>
                <Trash2 className="h-4 w-4" />
                Delete IPS
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// -------------------------------
// Runtime row normalizer (no deps)
// -------------------------------
// Accepts unknown rows from Supabase and returns typed IPSConfiguration[]
function normalizeIpsRows(rows: unknown): IPSConfiguration[] {
  const arr = Array.isArray(rows) ? rows : [];
  return arr.map((r: any) => {
    const id = String(
      r?.id ?? r?.ips_id ?? (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : Math.random().toString(36).slice(2))
    );
    const user_id = String(r?.user_id ?? r?.owner_id ?? "");
    const name = String(r?.name ?? r?.ips_name ?? "Untitled IPS");
    const description = String(r?.description ?? "");
    const is_active = typeof r?.is_active === "boolean" ? r.is_active : r?.is_active != null ? Boolean(r.is_active) : true;

    // strategies may be array, object, or JSON string; normalize to array
    let strategies: any[] = [];
    const rawStrategies = r?.strategies ?? r?.strategies_json;
    if (Array.isArray(rawStrategies)) {
      strategies = rawStrategies as any[];
    } else if (typeof rawStrategies === "string") {
      try {
        const parsed = JSON.parse(rawStrategies);
        strategies = Array.isArray(parsed) ? parsed : [];
      } catch {
        strategies = [];
      }
    }

    // Optional numeric fields with sane defaults
    const total_factors = Number(r?.total_factors ?? 0);
    const active_factors = Number(r?.active_factors ?? 0);
    const total_weight = Number(r?.total_weight ?? 0);
    const avg_weight = Number(r?.avg_weight ?? 0);
    const win_rate = r?.win_rate != null ? Number(r.win_rate) : 0;
    const avg_roi = r?.avg_roi != null ? Number(r.avg_roi) : 0;
    const total_trades = Number(r?.total_trades ?? 0);

    // Build object compatible with IPSConfiguration
    const normalized: IPSConfiguration = {
      id,
      user_id,
      name,
      description,
      is_active,
      strategies: strategies as any,
      total_factors,
      active_factors,
      total_weight,
      avg_weight,
      win_rate,
      avg_roi,
      total_trades,
      // Include exit strategies and watch criteria
      exit_strategies: r?.exit_strategies ?? undefined,
      watch_criteria: r?.watch_criteria ?? undefined,
      // Include DTE configuration
      min_dte: r?.min_dte ?? undefined,
      max_dte: r?.max_dte ?? undefined,
      // Include any passthrough timestamps if present
      created_at: r?.created_at ?? undefined,
      updated_at: r?.updated_at ?? undefined,
    } as IPSConfiguration; // final narrowing to the service type

    return normalized;
  });
}

// -------------------------------
// Page State
// -------------------------------
interface IPSFlowState {
  step: "list" | "strategies" | "selection" | "exit_watch" | "summary";
  selectedStrategies: string[];
  selectedFactors: Set<string>;
  factorConfigurations: Record<string, any>;
  exitStrategies?: any;
  watchCriteria?: any;
  minDTE?: number;
  maxDTE?: number;
  aiWeight?: number;
  currentIPSId: string | null;
  isLoading: boolean;
}

// --------------------------------------------
// Supabase client (shared with auth provider)
// --------------------------------------------
const supabase = createClient();

export default function IPSPage() {
  // State for the IPS flow
  const [state, setState] = useState<IPSFlowState>({
    step: "list",
    selectedStrategies: [],
    selectedFactors: new Set(),
    factorConfigurations: {},
    aiWeight: 20, // Default AI weight of 20%
    currentIPSId: null,
    isLoading: true,
  });

  // State for IPS management
  const [allIPSs, setAllIPSs] = useState<IPSConfiguration[]>([]);
  const [showInactive, setShowInactive] = useState(false);
  const [availableStrategies, setAvailableStrategies] = useState<TradingStrategy[]>([]);
  const [factorDefinitions, setFactorDefinitions] = useState<any>(null);
  const [creating, setCreating] = useState(false);
  const [tradeStats, setTradeStats] = useState({ totalTrades: 0, avgWinRate: 0 });

  // Delete confirmation dialog state
  const [deleteDialog, setDeleteDialog] = useState({
    isOpen: false,
    ipsId: "",
    ipsName: "",
    isDeleting: false,
  });

  // Quick creator state
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [ipsList, setIpsList] = useState<any[]>([]);

  // Fetch IPSs from database using API
  async function fetchIPS() {
    try {
      const response = await fetch('/api/ips', { cache: 'no-store' });
      if (!response.ok) {
        const error = await response.json();
        console.error("Error fetching IPS list:", error);
        toast.error("Failed to fetch IPS list");
        return;
      }
      const data = await response.json();
      setIpsList(data || []);
      setAllIPSs(normalizeIpsRows(data || []));

      // Fetch trade statistics
      await fetchTradeStats();
    } catch (err) {
      console.error("Unexpected error fetching IPSs:", err);
      toast.error("Failed to fetch IPS list");
    }
  }

  // Fetch trade statistics from API
  async function fetchTradeStats() {
    try {
      // Fetch all trades (don't filter by status to get totals)
      // Need to fetch prospective, active, and closed trades separately
      const [prospectiveRes, activeRes, closedRes] = await Promise.all([
        fetch('/api/trades?status=prospective', { cache: 'no-store' }),
        fetch('/api/trades?status=active', { cache: 'no-store' }),
        fetch('/api/trades?status=closed', { cache: 'no-store' })
      ]);

      const prospective = prospectiveRes.ok ? (await prospectiveRes.json())?.data || [] : [];
      const active = activeRes.ok ? (await activeRes.json())?.data || [] : [];
      const closed = closedRes.ok ? (await closedRes.json())?.data || [] : [];

      const allTrades = [...prospective, ...active, ...closed];
      const totalTrades = allTrades.length;

      console.log('[IPS Stats] Total trades:', totalTrades, '(prospective:', prospective.length, 'active:', active.length, 'closed:', closed.length, ')');

      // Calculate win rate from closed trades
      const closedTrades = closed;
      const profitableTrades = closedTrades.filter((t: any) => {
        // Check trade_closures for realized P/L
        const closureData = Array.isArray(t.trade_closures) ? t.trade_closures[0] : t.trade_closures;
        const plDollar = Number(closureData?.realized_pl || t.realized_pl || t.pl_dollar || 0);
        const plPercent = Number(closureData?.realized_pl_percent || t.realized_pl_percent || t.pl_percent || 0);

        console.log('[IPS Stats] Trade', t.symbol, '- PL:', plDollar, 'PL%:', plPercent);
        return plDollar > 0 || plPercent > 0;
      });

      const avgWinRate = closedTrades.length > 0
        ? Math.round((profitableTrades.length / closedTrades.length) * 100)
        : 0;

      console.log('[IPS Stats] Win rate:', avgWinRate, '% (', profitableTrades.length, 'profitable /', closedTrades.length, 'closed)');

      setTradeStats({ totalTrades, avgWinRate });
    } catch (err) {
      console.error("Unexpected error fetching trade stats:", err);
    }
  }

  // Save new IPS (quick create) using API
  async function saveIPS() {
    if (!name.trim()) {
      toast.error("Please enter an IPS name");
      return;
    }

    try {
      const response = await fetch('/api/ips', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim(),
          is_active: true,
          strategies: [],
          factors: [], // No factors in quick create
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        console.error("Error creating IPS:", error);
        toast.error("Failed to create IPS: " + (error.error || "Unknown error"));
        return;
      }

      const result = await response.json();
      setName("");
      setDescription("");
      await fetchIPS();

      if (result?.data?.name) {
        toast.success(`IPS "${result.data.name}" created`);
      } else {
        toast.success("IPS created");
      }
    } catch (err) {
      console.error("Unexpected error saving IPS:", err);
      toast.error("Unexpected error saving IPS");
    }
  }

  // Show delete confirmation dialog
  const showDeleteConfirmation = (ipsId: string) => {
    const ips = ipsList.find((ips: any) => ips.id === ipsId);
    setDeleteDialog({
      isOpen: true,
      ipsId,
      ipsName: ips?.name || "this IPS",
      isDeleting: false,
    });
  };

  // Cancel delete
  const cancelDelete = () => {
    setDeleteDialog({
      isOpen: false,
      ipsId: "",
      ipsName: "",
      isDeleting: false,
    });
  };

  // Confirm delete
  const confirmDelete = async () => {
    setDeleteDialog(prev => ({ ...prev, isDeleting: true }));

    try {
      const response = await fetch(`/api/ips/${deleteDialog.ipsId}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const error = await response.json();
        console.error("Error deleting IPS:", error);
        toast.error("Failed to delete IPS: " + (error.error || "Unknown error"));
        setDeleteDialog(prev => ({ ...prev, isDeleting: false }));
      } else {
        // Update both ipsList and allIPSs
        await fetchIPS();
        setAllIPSs((prev) => prev.filter((ips) => ips.id !== deleteDialog.ipsId));
        toast.success(`IPS "${deleteDialog.ipsName}" deleted successfully`);
        setDeleteDialog({
          isOpen: false,
          ipsId: "",
          ipsName: "",
          isDeleting: false,
        });
      }
    } catch (err) {
      console.error("Unexpected error deleting IPS:", err);
      toast.error("Unexpected error deleting IPS");
      setDeleteDialog(prev => ({ ...prev, isDeleting: false }));
    }
  };

  // Load data on mount
  useEffect(() => {
    const load = async () => {
      setState((p) => ({ ...p, isLoading: true }));
      try {
        await fetchIPS();
        try {
          const strategiesRaw = ipsDataService.getAvailableStrategies();
          setAvailableStrategies(strategiesRaw as TradingStrategy[]);
        } catch (e) {
          console.warn("Could not load strategies:", e);
          setAvailableStrategies([]);
        }
      } finally {
        setState((p) => ({ ...p, isLoading: false }));
      }
    };
    load();
  }, []);

  // Load factor definitions when strategies are selected
  useEffect(() => {
    const loadFactors = async () => {
      if (state.selectedStrategies.length > 0) {
        try {
          const factors = await ipsDataService.getFactorsForStrategies(state.selectedStrategies);
          setFactorDefinitions(factors);
        } catch (e) {
          console.warn("Could not load factors for strategies:", e);
          setFactorDefinitions({});
        }
      } else {
        setFactorDefinitions(null);
      }
    };
    loadFactors();
  }, [state.selectedStrategies]);

  // Navigation handlers
  const handleCreateNew = () => {
    setState((prev) => ({
      ...prev,
      step: "strategies",
      selectedStrategies: [],
      selectedFactors: new Set(),
      factorConfigurations: {},
      currentIPSId: null,
    }));
  };

  const [detailsDialog, setDetailsDialog] = useState<{ isOpen: boolean; ips: any; factors: any[] }>({
    isOpen: false,
    ips: null,
    factors: [],
  });

  const handleViewIPS = async (ipsId: string) => {
    const ips = allIPSs.find((i) => i.id === ipsId);
    if (!ips) return;

    console.log('🔍 Loading factors for IPS:', ipsId);

    // Check authenticated user
    const { data: { user } } = await supabase.auth.getUser();
    console.log('👤 Authenticated user:', user?.id);
    console.log('📋 IPS user_id:', ips.user_id);

    const { data: factors, error } = await supabase
      .from("ips_factors")
      .select("*")
      .eq("ips_id", ipsId);

    if (error) {
      console.error("Error loading IPS factors:", error);
      return;
    }

    console.log('📊 Fetched factors from database:', factors);

    const allFactorDefs = await ipsDataService.getAllFactors();
    console.log('📚 Available factor definitions:', allFactorDefs?.length || 0);

    const enriched = (factors || []).map((f: any) => {
      const info = allFactorDefs.find(
        (df: any) => df.id === f.factor_id || df.name === f.factor_name
      );

      const enrichedFactor = {
        ...f,
        factor_name: f.factor_name || info?.name || f.factor_id,
        type: info?.type || "quantitative",
        category: info?.category || "Unknown",
        weight: f.weight || 0,
        enabled: f.enabled !== false,
      };

      console.log(`  ✓ Factor ${f.factor_id}:`, {
        name: enrichedFactor.factor_name,
        type: enrichedFactor.type,
        weight: enrichedFactor.weight,
        matched: !!info
      });

      return enrichedFactor;
    });

    console.log('✅ Enriched factors:', enriched.length, 'factors ready to display');
    setDetailsDialog({ isOpen: true, ips, factors: enriched });
  };

  const handleEditIPS = async (ipsId: string) => {
    const ips = allIPSs.find((i) => i.id === ipsId);
    console.log('[handleEditIPS] Found IPS:', ips);
    console.log('[handleEditIPS] exit_strategies:', ips?.exit_strategies);
    console.log('[handleEditIPS] watch_criteria:', ips?.watch_criteria);
    if (!ips) return;

    const { data: factors, error } = await supabase
      .from("ips_factors")
      .select("*")
      .eq("ips_id", ipsId);

    if (error) {
      console.error("Error loading IPS factors:", error);
      return;
    }

    const selected = new Set<string>();
    const configurations: Record<string, any> = {};
    const allFactorDefs = await ipsDataService.getAllFactors();

    (factors || []).forEach((f: any) => {
      const factorName = f.factor_name || f.name;
      if (!factorName) return;
      selected.add(factorName);
      const factorInfo =
        allFactorDefs.find(
          (df: any) => df.id === f.factor_id || df.name === factorName
        ) || {
          type: "quantitative",
          category: "Unknown",
        };
      configurations[factorName] = {
        weight: f.weight || 1,
        enabled: f.enabled !== false,
        targetType: factorInfo.type === "qualitative" ? "rating" : "numeric",
        targetValue: f.target_value ?? "",
        targetOperator: f.target_operator || "gte",
        targetValueMax: "",
        preferenceDirection: f.preference_direction || "higher",
        factorId: f.factor_id,
        type: factorInfo.type,
        category: factorInfo.category,
      };
    });

    // Ensure factors for the existing strategies are loaded so the selector isn't blank
    try {
      const defs = await ipsDataService.getFactorsForStrategies(
        ((ips as any).strategies || []) as string[]
      );
      setFactorDefinitions(defs);
    } catch (e) {
      console.warn("Could not load factors for strategies:", e);
      setFactorDefinitions({});
    }

    setState((prev) => ({
      ...prev,
      step: "selection",
      selectedStrategies: (ips as any).strategies || [],
      selectedFactors: selected,
      factorConfigurations: configurations,
      exitStrategies: (ips as any).exit_strategies || undefined,
      watchCriteria: (ips as any).watch_criteria || undefined,
      minDTE: (ips as any).min_dte || undefined,
      maxDTE: (ips as any).max_dte || undefined,
      currentIPSId: ipsId,
    }));
  };

  const handleStepNavigation = (step: IPSFlowState["step"]) => {
    setState((prev) => ({ ...prev, step }));
  };

  const handleStrategySelection = (selectedStrategies: string[]) => {
    setState((prev) => ({
      ...prev,
      selectedStrategies,
      selectedFactors: new Set(),
      factorConfigurations: {},
    }));
  };

  const handleFactorSelection = (selectedFactors: Set<string>) => {
    setState((prev) => {
      // Use the already-loaded factorDefinitions from state
      const allFactorDefs = factorDefinitions?.availableFactors || [];
      const newConfigs: Record<string, any> = { ...prev.factorConfigurations };

      // Add defaults for newly selected factors
      selectedFactors.forEach((name) => {
        if (!newConfigs[name]) {
          const info =
            allFactorDefs.find((df: any) => df.name === name) || {
              type: "quantitative",
              category: "Unknown",
              id: name,
            };
          newConfigs[name] = {
            weight: 5,
            enabled: true,
            targetType: info.type === "qualitative" ? "rating" : "numeric",
            targetValue: info.type === "qualitative" ? 4 : "",
            targetOperator: "gte",
            targetValueMax: "",
            preferenceDirection: "higher",
            factorId: info.id,
            type: info.type,
            category: info.category,
          };
        }
      });

      // Remove configurations for deselected factors
      Object.keys(newConfigs).forEach((name) => {
        if (!selectedFactors.has(name)) {
          delete newConfigs[name];
        }
      });

      return {
        ...prev,
        selectedFactors,
        factorConfigurations: newConfigs,
      };
    });
  };

  const handleFactorConfiguration = (configurations: Record<string, any>) => {
    setState((prev) => ({ ...prev, factorConfigurations: configurations }));
  };

const handleSaveIPS = async (ipsData: any) => {
  console.log('Current IPS data:', ipsData);
  console.log('Strategies:', ipsData.strategies);

  // The factors come as an array of strings (factor names)
  const factorNames = ipsData.factors || [];
  console.log('Factor names received:', factorNames);

  // We need to convert factor names to full factor objects
  // Get all factor definitions from the service
  const allFactors = await ipsDataService.getAllFactors();
  
  // Map factor names to full factor objects with configurations
  const factors = factorNames.map((factorName: string) => {
    // Find the factor definition by matching the name
    const factorDef = allFactors.find(f => f.name === factorName);
    const config = ipsData.configurations?.[factorName] || {};
    
    if (!factorDef) {
      console.warn(`Factor definition not found for: ${factorName}`);
      // Create a minimal factor object if definition not found
      return {
        factor_id: factorName.toLowerCase().replace(/\s+/g, '-'),
        factor_name: factorName,
        weight: config.weight || 1,
        enabled: config.enabled !== false,
        target_value: config.targetValue !== '' && config.targetValue !== undefined && config.targetValue !== null ? config.targetValue : null,
        target_operator: config.targetOperator || null,
        preference_direction: config.preferenceDirection || null,
      };
    }

    // Return a properly structured factor object
    return {
      factor_id: factorDef.id,
      factor_name: factorDef.name,
      weight: config.weight || 1,
      enabled: config.enabled !== false,
      target_value: config.targetValue !== '' && config.targetValue !== undefined && config.targetValue !== null ? config.targetValue : null,
      target_operator: config.targetOperator || null,
      preference_direction: config.preferenceDirection || null,
    };
  });

  console.log('Transformed factors:', factors);

  // Validate that all factors have names
  const validFactors = factors.filter((f: any) => f.factor_name);
  if (validFactors.length !== factors.length) {
    console.error('Some factors are missing names!', factors);
    alert('Error: Some factors are missing names. Please check all factors have names.');
    return;
  }

  try {
    setCreating(true);

    // Validate DTE configuration
    if (!state.minDTE || !state.maxDTE) {
      toast.error('Please configure the DTE (Days to Expiration) window');
      return;
    }

    // Build the complete IPS data INCLUDING the transformed factors
    const completeIPSData = {
      name: ipsData.name,
      description: ipsData.description,
      strategies: ipsData.strategies || state.selectedStrategies,
      is_active: true,
      factors: factors, // Now these are proper factor objects, not just strings
      total_factors: factors.length,
      active_factors: factors.filter((f: any) => f.enabled !== false).length,
      exit_strategies: state.exitStrategies,
      watch_criteria: state.watchCriteria,
      min_dte: state.minDTE,
      max_dte: state.maxDTE,
      ai_weight: state.aiWeight || 20,
      created_at: new Date().toISOString(),
    };

    console.log('Complete IPS data being sent:', JSON.stringify(completeIPSData, null, 2));

    let ipsConfig: IPSConfiguration;

    if (state.currentIPSId) {
      // Update existing IPS
      ipsConfig = await ipsDataService.updateIPS(state.currentIPSId, completeIPSData);
      setAllIPSs((prev) => prev.map((ips) => (ips.id === state.currentIPSId ? ipsConfig : ips)));
    } else {
      // Create new IPS (userId will be determined from auth on server)
      ipsConfig = await ipsDataService.createIPS('', completeIPSData);
      setAllIPSs((prev) => [...prev, ipsConfig]);
    }
    
      console.log('✅ Factors already saved by API, skipping duplicate save');

    await fetchIPS();

    setState({
      step: "list",
      selectedStrategies: [],
      selectedFactors: new Set(),
      factorConfigurations: {},
      aiWeight: 20,
      currentIPSId: null,
      isLoading: false,
    });
    toast.success(`IPS "${ipsData.name}" saved`);
  } catch (error: any) {
    console.error("Error saving IPS:", error);
    toast.error("Error saving IPS: " + error.message);
  } finally {
    setCreating(false);
  }
};

  const handleIPSAction = async (ipsId: string, action: string) => {
    try {
      switch (action) {
        case "view":
          await handleViewIPS(ipsId);
          break;
        case "edit":
          await handleEditIPS(ipsId);
          break;
        case "copy":
          console.log("Copy IPS:", ipsId);
          break;
        case "archive":
          await supabase.from("ips_configurations").update({ is_active: false }).eq("id", ipsId);
          await fetchIPS();
          break;
        case "delete":
          showDeleteConfirmation(ipsId);
          break;
      }
    } catch (error) {
      console.error(`Error performing ${action} on IPS:`, error);
    }
  };

  const activeIPSs = (ipsList || []).filter((ips: any) => ips.is_active);
  const inactiveIPSs = (ipsList || []).filter((ips: any) => !ips.is_active);
  const displayedIPSs = (showInactive ? [...activeIPSs, ...inactiveIPSs] : activeIPSs) as any[];

  if (state.isLoading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <p style={{ color: 'var(--text-secondary)' }}>Loading IPS configurations...</p>
          </div>
        </div>
      </div>
    );
  }

  if (state.step !== "list") {
    const steps = [
      { id: "strategies", name: "Strategies", icon: (Layers as any) },
      { id: "selection", name: "Factor Selection", icon: (Target as any) },
      { id: "exit_watch", name: "Configuration & Risk Management", icon: (Shield as any) },
      { id: "summary", name: "Review & Save", icon: (Save as any) },
    ];

    const currentStepIndex = steps.findIndex((s) => s.id === state.step);

    const renderStepIndicator = () => (
      <div className="mb-8">
        <div className="flex items-center justify-between max-w-4xl mx-auto mb-4">
          {steps.map((step, index) => {
            const Icon = step.icon;
            const isActive = state.step === step.id;
            const isCompleted = index < currentStepIndex;

            return (
              <div key={step.id} className="flex items-center">
                <div
                  className={`
                    flex items-center justify-center w-10 h-10 rounded-full border-2 
                    ${isActive ? "border-blue-600 bg-blue-600 text-white" : isCompleted ? "border-green-600 bg-green-600 text-white" : "border-gray-300 bg-white text-gray-400"}
                  `}
                >
                  <Icon className="h-5 w-5" />
                </div>
                <span className={`ml-2 text-sm font-medium ${isActive ? "text-blue-600" : isCompleted ? "text-green-600" : "text-gray-500"}`}>
                  {step.name}
                </span>
                {index < steps.length - 1 && <div className={`w-8 h-0.5 mx-4 ${isCompleted ? "bg-green-600" : "bg-gray-300"}`} />}
              </div>
            );
          })}
        </div>
      </div>
    );

    return (
      <div className="container mx-auto px-4 py-8">
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-bold" style={{ color: 'var(--text-primary)' }}>{state.currentIPSId ? "Edit IPS" : "Create New IPS"}</h1>
          <p className="mt-2" style={{ color: 'var(--text-secondary)' }}>Configure your trading rules and risk parameters</p>
        </div>

        {renderStepIndicator()}

        {state.step === "strategies" && (
          <IPSStrategySelector
            availableStrategies={availableStrategies}
            selectedStrategies={state.selectedStrategies}
            onStrategySelection={handleStrategySelection}
            onNext={() => handleStepNavigation("selection")}
            onBack={() => handleStepNavigation("list")}
          />
        )}

        {state.step === "selection" && factorDefinitions && (
          <IPSFactorSelector
            selectedFactors={state.selectedFactors}
            onFactorSelection={handleFactorSelection}
            factorConfigurations={state.factorConfigurations}
            onFactorConfiguration={handleFactorConfiguration}
            onNext={() => handleStepNavigation("exit_watch")}
            onBack={() => handleStepNavigation("strategies")}
            factorDefinitions={factorDefinitions}
          />
        )}

        {state.step === "exit_watch" && (
          <div className="max-w-4xl mx-auto space-y-6">
            <div className="mb-6">
              <h2 className="text-2xl font-bold">Configuration & Risk Management</h2>
              <p className="text-gray-600 mt-1">
                Configure DTE window, exit strategies, and watch criteria
              </p>
            </div>

            {/* DTE Configuration */}
            <IPSDTEConfig
              minDTE={state.minDTE}
              maxDTE={state.maxDTE}
              onChange={({ min_dte, max_dte }) => {
                setState(prev => ({
                  ...prev,
                  minDTE: min_dte,
                  maxDTE: max_dte
                }));
              }}
            />

            {/* AI Weight Configuration */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <BarChart3 className="h-5 w-5" />
                  AI Analysis Weight
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label htmlFor="ai-weight" className="text-base">
                    AI Weight in Composite Score ({state.aiWeight || 20}%)
                  </Label>
                  <p className="text-sm text-gray-600 mt-1 mb-3">
                    Adjust how much weight AI analysis has in the overall IPS composite score.
                    The remaining weight is distributed among your selected factors.
                  </p>
                  <div className="flex items-center gap-4">
                    <Input
                      id="ai-weight"
                      type="range"
                      min="0"
                      max="100"
                      step="5"
                      value={state.aiWeight || 20}
                      onChange={(e) => setState(prev => ({ ...prev, aiWeight: parseInt(e.target.value) }))}
                      className="flex-1"
                    />
                    <Input
                      type="number"
                      min="0"
                      max="100"
                      value={state.aiWeight || 20}
                      onChange={(e) => {
                        const val = parseInt(e.target.value)
                        if (!isNaN(val) && val >= 0 && val <= 100) {
                          setState(prev => ({ ...prev, aiWeight: val }))
                        }
                      }}
                      className="w-20"
                    />
                  </div>
                  <div className="mt-2 text-sm text-gray-500">
                    {state.aiWeight === 0 && "AI analysis disabled - Using factor-based scoring only"}
                    {state.aiWeight > 0 && state.aiWeight < 50 && "Low AI influence - Primarily factor-based"}
                    {state.aiWeight >= 50 && state.aiWeight < 80 && "Balanced AI and factor scoring"}
                    {state.aiWeight >= 80 && "High AI influence - AI-driven scoring"}
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Exit & Watch Configuration */}
            <IPSExitWatchConfig
              exitStrategies={state.exitStrategies}
              watchCriteria={state.watchCriteria}
              availableFactors={Array.from(state.selectedFactors).map(factorId => {
                const factor = factorDefinitions?.factors?.find((f: any) => f.id === factorId);
                return {
                  id: factorId,
                  name: factor?.name || factorId
                };
              })}
              onChange={(exitStrategies, watchCriteria) => {
                setState(prev => ({
                  ...prev,
                  exitStrategies,
                  watchCriteria
                }));
              }}
            />

            <div className="flex justify-between mt-6">
              <Button
                variant="outline"
                onClick={() => handleStepNavigation("selection")}
              >
                Back
              </Button>
              <Button
                onClick={() => handleStepNavigation("summary")}
                disabled={!state.minDTE || !state.maxDTE}
              >
                Continue to Summary
              </Button>
            </div>
          </div>
        )}

        {state.step === "summary" && factorDefinitions && (() => {
          const current = allIPSs.find(i => i.id === state.currentIPSId) || null;
          return (
            <IPSSummary
              selectedFactors={state.selectedFactors}
              factorConfigurations={state.factorConfigurations}
              onSave={handleSaveIPS}
              onBack={() => handleStepNavigation("exit_watch")}
              factorDefinitions={factorDefinitions}
              isEditing={!!state.currentIPSId}
              initialName={current?.name}
              initialDescription={current?.description}
              selectedStrategies={state.selectedStrategies}
            />
          );
        })()}
      </div>
    );
  }

  // Main IPS List View
  return (
    <div className="container mx-auto px-4 py-8">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-3xl font-bold" style={{ color: 'var(--text-primary)' }}>IPS Builder</h1>
            <p className="mt-2" style={{ color: 'var(--text-secondary)' }}>Manage your Investment Policy Statements and trading rules</p>
          </div>
          <Button onClick={handleCreateNew} className="bg-blue-600 hover:bg-blue-700">
            <PlusCircle className="h-4 w-4 mr-2" />
            Create New IPS
          </Button>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <Card className="border-none shadow-lg">
            <CardContent className="p-8 text-center">
              <div className="text-4xl font-bold text-blue-600 mb-2">{activeIPSs.length}</div>
              <div className="text-sm font-medium tracking-wide" style={{ color: 'var(--text-secondary)' }}>Active IPSs</div>
            </CardContent>
          </Card>
          <Card className="border-none shadow-lg">
            <CardContent className="p-8 text-center">
              <div className="text-4xl font-bold text-green-600 mb-2">{tradeStats.totalTrades}</div>
              <div className="text-sm font-medium tracking-wide" style={{ color: 'var(--text-secondary)' }}>Total Trades</div>
            </CardContent>
          </Card>
          <Card className="border-none shadow-lg">
            <CardContent className="p-8 text-center">
              <div className="text-4xl font-bold text-purple-600 mb-2">{tradeStats.avgWinRate}%</div>
              <div className="text-sm font-medium tracking-wide" style={{ color: 'var(--text-secondary)' }}>Avg Win Rate</div>
            </CardContent>
          </Card>
          <Card className="border-none shadow-lg">
            <CardContent className="p-8 text-center">
              <div className="text-4xl font-bold text-orange-600 mb-2">{availableStrategies.length}</div>
              <div className="text-sm font-medium tracking-wide" style={{ color: 'var(--text-secondary)' }}>Available Strategies</div>
            </CardContent>
          </Card>
        </div>

        {/* View Toggle */}
        <div className="flex items-center gap-4">
          <div className="flex items-center space-x-2">
            <Switch id="show-inactive" checked={showInactive} onCheckedChange={setShowInactive} />
            <label htmlFor="show-inactive" className="text-sm font-medium">
              Show Archived IPSs ({inactiveIPSs.length})
            </label>
          </div>
        </div>
      </div>

      {/* IPS Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {displayedIPSs.map((ips: any) => (
          <Card key={ips.id} className={`relative ${!ips.is_active ? "opacity-60" : ""} hover:shadow-xl transition-all duration-200 border-none shadow-lg`}>
            <CardHeader className="pb-4">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <CardTitle className="text-xl font-bold mb-2" style={{ color: 'var(--text-primary)' }}>{ips.name}</CardTitle>
                  {ips.description && <p className="text-sm line-clamp-2 leading-relaxed" style={{ color: 'var(--text-secondary)' }}>{ips.description}</p>}
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="sm" className="hover:bg-gray-100">
                      <MoreVertical className="w-5 h-5" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => handleIPSAction(ips.id, "edit")}>
                      <Edit className="w-4 h-4 mr-2" />
                      Edit
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => handleIPSAction(ips.id, "copy")}>
                      <Copy className="w-4 h-4 mr-2" />
                      Duplicate
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    {ips.is_active ? (
                      <DropdownMenuItem onClick={() => handleIPSAction(ips.id, "archive")}>
                        <Archive className="w-4 h-4 mr-2" />
                        Archive
                      </DropdownMenuItem>
                    ) : null}
                    <DropdownMenuItem onClick={() => handleIPSAction(ips.id, "delete")} className="text-red-600 focus:text-red-600">
                      <Trash2 className="w-4 h-4 mr-2" />
                      Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>

              <div className="flex items-center gap-2 mt-3">
                <Badge variant={ips.is_active ? "default" : "secondary"} className="text-xs px-3 py-1">{ips.is_active ? "Active" : "Inactive"}</Badge>
              </div>
            </CardHeader>

            <CardContent className="pt-0 pb-6">
              {/* Progress Indicator */}
              {ips.total_factors > 0 && (
                <div className="mb-6">
                  <div className="flex justify-between items-center mb-3">
                    <span className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>Configuration</span>
                    <span className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>{Math.round((Number(ips.active_factors) / Math.max(1, Number(ips.total_factors))) * 100)}%</span>
                  </div>
                  <Progress value={(Number(ips.active_factors) / Math.max(1, Number(ips.total_factors))) * 100} className="h-2.5" />
                </div>
              )}

              {/* Stats Grid */}
              <div className="grid grid-cols-2 gap-6 text-center py-4 border-t border-gray-100">
                <div className="space-y-1">
                  <div className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>{ips.total_factors ||  (ips.ips_factors?.length || 0)}</div>
                  <div className="text-xs font-medium tracking-wide" style={{ color: 'var(--text-secondary)' }}>Total Factors</div>
                </div>
                <div className="space-y-1">
                  <div className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>{ips.total_trades || 0}</div>
                  <div className="text-xs font-medium tracking-wide" style={{ color: 'var(--text-secondary)' }}>Trades</div>
                </div>
              </div>

              <div className="text-center py-3 border-t border-gray-100">
                <div className="text-2xl font-bold text-green-600">{ips.win_rate ? `${Math.round(Number(ips.win_rate))}%` : "0%"}</div>
                <div className="text-xs font-medium tracking-wide" style={{ color: 'var(--text-secondary)' }}>Win Rate</div>
              </div>

              {/* Action Buttons */}
              <div className="flex gap-2 mt-5">
                <Button variant="outline" size="sm" className="flex-1 font-medium" onClick={() => handleIPSAction(ips.id, "view")}>
                  <Eye className="w-4 h-4 mr-1" />
                  View
                </Button>
                <BacktestButton
                  ipsId={ips.id}
                  ipsName={ips.name}
                />
              </div>
            </CardContent>

            {ips.is_active && (
              <div className="absolute top-4 right-4">
                <div className="w-3 h-3 bg-green-500 rounded-full animate-pulse"></div>
              </div>
            )}
          </Card>
        ))}

        {/* Empty state */}
        {displayedIPSs.length === 0 && (
          <div className="col-span-full text-center py-12">
            <FileText className="w-12 h-12 mx-auto mb-4" style={{ color: 'var(--text-tertiary)' }} />
            <h3 className="text-lg font-medium mb-2" style={{ color: 'var(--text-primary)' }}>No IPSs found</h3>
            <p className="mb-4" style={{ color: 'var(--text-secondary)' }}>
              {showInactive ? "You haven't created any IPSs yet." : "No active IPSs. Try showing inactive ones or create a new IPS."}
            </p>
            <Button onClick={handleCreateNew} className="bg-blue-600 hover:bg-blue-700">
              <PlusCircle className="w-4 h-4 mr-2" />
              Create Your First IPS
            </Button>
          </div>
        )}
      </div>

      {/* Delete Confirmation Dialog */}
      <DeleteConfirmationDialog
        isOpen={deleteDialog.isOpen}
        onConfirm={confirmDelete}
        onCancel={cancelDelete}
        isLoading={deleteDialog.isDeleting}
        title="Delete IPS Configuration"
        description={`Are you sure you want to delete "${deleteDialog.ipsName}"? This action cannot be undone and will permanently remove all associated data including factor configurations, weights, and historical performance data.`}
      />

      {/* View Details Dialog */}
      {(() => {
        const enabledFactors = detailsDialog.factors.filter((f: any) => f.enabled !== false);
        const totalWeight = enabledFactors.reduce((s: number, f: any) => s + (f.weight || 0), 0);
        const avgWeight = enabledFactors.length ? totalWeight / enabledFactors.length : 0;
        const getByType = (type: string) => enabledFactors.filter((f: any) => f.type === type);
        const weights = enabledFactors.map((f: any) => f.weight || 0);
        const highestWeight = weights.length ? Math.max(...weights) : 0;
        const lowestWeight = weights.length ? Math.min(...weights) : 0;
        const balanced = totalWeight > 0 && totalWeight <= enabledFactors.length * 10 ? 'Yes' : 'Review';

        return (
          <Dialog open={detailsDialog.isOpen} onOpenChange={(open) => !open && setDetailsDialog({ isOpen: false, ips: null, factors: [] })}>
            <DialogContent className="sm:max-w-[600px]">
              <DialogHeader>
                <DialogTitle>{detailsDialog.ips?.name || 'IPS Details'}</DialogTitle>
                {detailsDialog.ips?.description && (
                  <DialogDescription>{detailsDialog.ips.description}</DialogDescription>
                )}
              </DialogHeader>

              <div className="space-y-6 py-2">
                {/* DTE Configuration Summary */}
                {detailsDialog.ips?.min_dte && detailsDialog.ips?.max_dte && (
                  <div className="p-4 bg-orange-50 rounded-lg border border-orange-200">
                    <div className="flex items-center gap-2 mb-2">
                      <Settings className="h-5 w-5 text-orange-600" />
                      <h4 className="font-semibold text-orange-900">DTE Configuration</h4>
                    </div>
                    <div className="text-sm text-orange-800">
                      Options window: <strong>{detailsDialog.ips.min_dte}-{detailsDialog.ips.max_dte} days</strong> to expiration
                      <p className="text-xs mt-1 text-orange-700">
                        The agent will only consider options expiring within this range
                      </p>
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="p-3 bg-blue-50 rounded-lg">
                    <div className="flex items-center gap-2 mb-2">
                      <Target className="h-4 w-4 text-blue-600" />
                      <h4 className="font-medium text-blue-900">Factor Overview</h4>
                    </div>
                    <div className="space-y-1 text-sm">
                      <div className="flex justify-between"><span className="text-blue-700">Total Selected:</span><span className="font-medium">{detailsDialog.factors.length}</span></div>
                      <div className="flex justify-between"><span className="text-blue-700">Enabled:</span><span className="font-medium">{enabledFactors.length}</span></div>
                      <div className="flex justify-between"><span className="text-blue-700">Total Weight:</span><span className="font-medium">{totalWeight}</span></div>
                      <div className="flex justify-between"><span className="text-blue-700">Avg Weight:</span><span className="font-medium">{avgWeight.toFixed(1)}</span></div>
                    </div>
                  </div>
                  <div className="p-3 bg-green-50 rounded-lg">
                    <div className="flex items-center gap-2 mb-2">
                      <BarChart3 className="h-4 w-4 text-green-600" />
                      <h4 className="font-medium text-green-900">Factor Breakdown</h4>
                    </div>
                    <div className="space-y-1 text-sm">
                      <div className="flex justify-between"><span className="text-green-700">Quantitative:</span><span className="font-medium">{getByType('quantitative').length}</span></div>
                      <div className="flex justify-between"><span className="text-green-700">Qualitative:</span><span className="font-medium">{getByType('qualitative').length}</span></div>
                      <div className="flex justify-between"><span className="text-green-700">Options:</span><span className="font-medium">{getByType('options').length}</span></div>
                    </div>
                  </div>
                  <div className="p-3 bg-purple-50 rounded-lg">
                    <div className="flex items-center gap-2 mb-2">
                      <Shield className="h-4 w-4 text-purple-600" />
                      <h4 className="font-medium text-purple-900">Weight Distribution</h4>
                    </div>
                    <div className="space-y-1 text-sm">
                      <div className="flex justify-between"><span className="text-purple-700">Highest Weight:</span><span className="font-medium">{highestWeight}</span></div>
                      <div className="flex justify-between"><span className="text-purple-700">Lowest Weight:</span><span className="font-medium">{lowestWeight}</span></div>
                      <div className="flex justify-between"><span className="text-purple-700">Balanced:</span><span className="font-medium">{balanced}</span></div>
                    </div>
                  </div>
                </div>

                <div>
                  <h4 className="font-medium text-gray-900 mb-2">Enabled Factors ({enabledFactors.length})</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-60 overflow-y-auto">
                    {enabledFactors.map((f: any) => (
                      <div key={f.factor_id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                        <div>
                          <span className="text-sm font-medium">{f.factor_name}</span>
                          <div className="flex items-center gap-2 mt-1">
                            <Badge
                              variant="outline"
                              className={`text-xs ${
                                f.type === 'quantitative'
                                  ? 'border-blue-200 text-blue-700'
                                  : f.type === 'qualitative'
                                  ? 'border-green-200 text-green-700'
                                  : 'border-purple-200 text-purple-700'
                              }`}
                            >
                              {f.type}
                            </Badge>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-sm font-medium">Weight: {f.weight}</div>
                          <div className="text-xs text-gray-500">{f.target_operator} {f.target_value}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <DialogFooter className="gap-2 sm:gap-0">
                <Button variant="outline" onClick={() => setDetailsDialog({ isOpen: false, ips: null, factors: [] })}>Close</Button>
                {detailsDialog.ips && (
                  <>
                    <Button variant="destructive" onClick={() => { setDetailsDialog({ isOpen: false, ips: null, factors: [] }); showDeleteConfirmation(detailsDialog.ips.id); }}>Delete</Button>
                    <Button onClick={async () => { setDetailsDialog({ isOpen: false, ips: null, factors: [] }); await handleEditIPS(detailsDialog.ips.id); }}>Edit</Button>
                  </>
                )}
              </DialogFooter>
            </DialogContent>
          </Dialog>
        );
      })()}
    </div>
  );
}
