"use client"

import React, { useState, useEffect } from "react";
import { createClient } from "@supabase/supabase-js";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import {
  FileText,
  Settings,
  CheckCircle,
  Target,
  BarChart3,
  PlusCircle,
  Eye,
  Edit,
  Copy,
  Archive,
  MoreVertical,
  Trash2,
  Layers,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

// Import components
import { IPSStrategySelector } from "@/components/ips/ips-strategy-selector";
import { IPSFactorSelector } from "@/components/ips/ips-factor-selector";
import { IPSFactorConfiguration } from "@/components/ips/ips-factor-configuration";
import { IPSSummary } from "@/components/ips/ips-summary";
import { TradeScoreDisplay } from "@/components/ips/trade-score-display";

// Services & types
import {
  ipsDataService,
  type IPSConfiguration,
  type TradingStrategy,
} from "@/lib/services/ips-data-service";

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
  step: "list" | "strategies" | "selection" | "configuration" | "summary" | "scoring";
  selectedStrategies: string[];
  selectedFactors: Set<string>;
  factorConfigurations: Record<string, any>;
  currentIPSId: string | null;
  isLoading: boolean;
}

// --------------------------------------------
// Supabase singleton (no multiple GoTrueClient)
// --------------------------------------------
const globalForSupabase = globalThis as unknown as {
  __supabase?: ReturnType<typeof createClient>;
};

const supabase =
  globalForSupabase.__supabase ??
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: {
        storageKey: "tenxiv-auth", // unique key to avoid collisions
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: true,
      },
    }
  );

if (!globalForSupabase.__supabase) {
  globalForSupabase.__supabase = supabase;
}

export default function IPSPage() {
  // State for the IPS flow
  const [state, setState] = useState<IPSFlowState>({
    step: "list",
    selectedStrategies: [],
    selectedFactors: new Set(),
    factorConfigurations: {},
    currentIPSId: null,
    isLoading: true,
  });

  // State for IPS management
  const [allIPSs, setAllIPSs] = useState<IPSConfiguration[]>([]);
  const [showInactive, setShowInactive] = useState(false);
  const [availableStrategies, setAvailableStrategies] = useState<TradingStrategy[]>([]);
  const [factorDefinitions, setFactorDefinitions] = useState<any>(null);
  const [creating, setCreating] = useState(false);

  // Quick creator state
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [ipsList, setIpsList] = useState<any[]>([]);

  const userId = "user-123"; // TODO: replace with real auth user id

  // Fetch IPSs from database
  async function fetchIPS() {
    try {
      const { data, error } = await supabase
        .from("ips_configurations")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) {
        console.error("Error fetching IPS list:", error);
      } else {
        setIpsList(data || []); // raw for easy rendering if needed
        setAllIPSs(normalizeIpsRows(data || [])); // typed, safe
      }
    } catch (err) {
      console.error("Unexpected error fetching IPSs:", err);
    }
  }

  // Save new IPS (quick create)
  async function saveIPS() {
    if (!name.trim()) {
      toast.error("Please enter an IPS name");
      return;
    }

    try {
      const { data, error } = await supabase
        .from("ips_configurations")
        .insert([
          {
            user_id: userId,
            name: name.trim(),
            description: description.trim(),
            is_active: true,
            total_factors: 0,
            active_factors: 0,
            total_weight: 0,
            avg_weight: 0,
            win_rate: 0,
            avg_roi: 0,
            total_trades: 0,
          },
        ])
        .select("*");

      if (error) {
        console.error("Error inserting IPS:", error);
        toast.error("Failed to save IPS: " + error.message);
      } else {
        setName("");
        setDescription("");
        await fetchIPS();
        const inserted = Array.isArray(data) && data[0];
        if (inserted?.name) {
          toast.success(`IPS "${inserted.name}" created`);
        } else {
          toast.success("IPS created");
        }
      }
    } catch (err) {
      console.error("Unexpected error saving IPS:", err);
      toast.error("Unexpected error saving IPS");
    }
  }

  // Delete IPS
  async function deleteIPS(ipsId: string) {
    if (!confirm("Are you sure you want to delete this IPS? This action cannot be undone.")) {
      return;
    }

    try {
      const { error } = await supabase.from("ips_configurations").delete().eq("id", ipsId);

      if (error) {
        console.error("Error deleting IPS:", error);
        toast.error("Failed to delete IPS: " + error.message);
      } else {
        await fetchIPS();
        toast.success("IPS deleted");
      }
    } catch (err) {
      console.error("Unexpected error deleting IPS:", err);
      toast.error("Unexpected error deleting IPS");
    }
  }

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
    if (state.selectedStrategies.length > 0) {
      try {
        const factors = ipsDataService.getFactorsForStrategies(state.selectedStrategies);
        setFactorDefinitions(factors);
      } catch (e) {
        console.warn("Could not load factors for strategies:", e);
        setFactorDefinitions({});
      }
    } else {
      setFactorDefinitions(null);
    }
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

  const handleEditIPS = (ipsId: string) => {
    const ips = allIPSs.find((i) => i.id === ipsId);
    if (ips) {
      setState((prev) => ({
        ...prev,
        step: "strategies",
        selectedStrategies: (ips as any).strategies || [],
        selectedFactors: new Set(),
        factorConfigurations: {},
        currentIPSId: ipsId,
      }));
    }
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
    setState((prev) => ({ ...prev, selectedFactors }));
  };

  const handleFactorConfiguration = (configurations: Record<string, any>) => {
    setState((prev) => ({ ...prev, factorConfigurations: configurations }));
  };

  const handleSaveIPS = async (ipsData: any) => {
    try {
      setCreating(true);

      const completeIPSData = {
        name: ipsData.name,
        description: ipsData.description,
        strategies: state.selectedStrategies,
        is_active: true,
        total_factors: state.selectedFactors.size,
        active_factors: Object.values(state.factorConfigurations).filter((c: any) => c?.enabled).length,
        created_at: new Date().toISOString(),
      };

      let ipsConfig: IPSConfiguration;

      if (state.currentIPSId) {
        // Update existing IPS
        ipsConfig = await ipsDataService.updateIPS(state.currentIPSId, completeIPSData);
        setAllIPSs((prev) => prev.map((ips) => (ips.id === state.currentIPSId ? ipsConfig : ips)));
      } else {
        // Create new IPS — make sure your service accepts (userId, payload)
        ipsConfig = await ipsDataService.createIPS(userId, completeIPSData);
        setAllIPSs((prev) => [...prev, ipsConfig]);
      }

      // Save factor configurations if any
      if (state.selectedFactors.size > 0) {
        const factorConfigs = Array.from(state.selectedFactors).map((factorName) => {
          const config = state.factorConfigurations[factorName] || {};
          return {
            factorId: config.factorId || factorName,
            weight: config.weight || 1,
            enabled: config.enabled !== false,
            targetConfig: config.targetConfig || {},
          };
        });

        await ipsDataService.saveFactorConfigurations(ipsConfig.id, factorConfigs);
      }

      await fetchIPS();

      setState({
        step: "list",
        selectedStrategies: [],
        selectedFactors: new Set(),
        factorConfigurations: {},
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
        case "edit":
          handleEditIPS(ipsId);
          break;
        case "copy":
          console.log("Copy IPS:", ipsId);
          break;
        case "archive":
          await supabase.from("ips_configurations").update({ is_active: false }).eq("id", ipsId);
          await fetchIPS();
          break;
        case "delete":
          await deleteIPS(ipsId);
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
            <p className="text-gray-600">Loading IPS configurations...</p>
          </div>
        </div>
      </div>
    );
  }

  if (state.step !== "list") {
    const steps = [
      { id: "strategies", name: "Strategies", icon: (Layers as any) },
      { id: "selection", name: "Factor Selection", icon: (Target as any) },
      { id: "configuration", name: "Configuration", icon: (Settings as any) },
      { id: "summary", name: "Summary", icon: (CheckCircle as any) },
      { id: "scoring", name: "Scoring", icon: (BarChart3 as any) },
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
          <h1 className="text-3xl font-bold text-gray-900">{state.currentIPSId ? "Edit IPS" : "Create New IPS"}</h1>
          <p className="text-gray-600 mt-2">Configure your trading rules and risk parameters</p>
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
            onNext={() => handleStepNavigation("configuration")}
            onBack={() => handleStepNavigation("strategies")}
            factorDefinitions={factorDefinitions}
          />
        )}

        {state.step === "configuration" && factorDefinitions && (
          <IPSFactorConfiguration
            selectedFactors={state.selectedFactors}
            factorConfigurations={state.factorConfigurations}
            onConfigurationChange={handleFactorConfiguration}
            onBack={() => handleStepNavigation("selection")}
            onNext={() => handleStepNavigation("summary")}
            factorDefinitions={factorDefinitions}
          />
        )}

        {state.step === "summary" && factorDefinitions && (
          <IPSSummary
            selectedFactors={state.selectedFactors}
            factorConfigurations={state.factorConfigurations}
            onSave={handleSaveIPS}
            onBack={() => handleStepNavigation("configuration")}
            factorDefinitions={factorDefinitions}
          />
        )}

        {state.step === "scoring" && <TradeScoreDisplay onBack={() => handleStepNavigation("summary")} />}
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
            <h1 className="text-3xl font-bold text-gray-900">IPS Builder</h1>
            <p className="text-gray-600 mt-2">Manage your Investment Policy Statements and trading rules</p>
          </div>
          <Button onClick={handleCreateNew} className="bg-blue-600 hover:bg-blue-700">
            <PlusCircle className="h-4 w-4 mr-2" />
            Create New IPS
          </Button>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          <Card>
            <CardContent className="p-6 text-center">
              <div className="text-2xl font-bold text-blue-600">{activeIPSs.length}</div>
              <div className="text-sm text-gray-600">Active IPSs</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-6 text-center">
              <div className="text-2xl font-bold text-green-600">0</div>
              <div className="text-sm text-gray-600">Total Trades</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-6 text-center">
              <div className="text-2xl font-bold text-purple-600">0%</div>
              <div className="text-sm text-gray-600">Avg Win Rate</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-6 text-center">
              <div className="text-2xl font-bold text-orange-600">{availableStrategies.length}</div>
              <div className="text-sm text-gray-600">Available Strategies</div>
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
      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
        {displayedIPSs.map((ips: any) => (
          <Card key={ips.id} className={`relative ${!ips.is_active ? "opacity-60" : ""} hover:shadow-lg transition-shadow`}>
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <CardTitle className="text-lg font-semibold text-gray-900 mb-1">{ips.name}</CardTitle>
                  {ips.description && <p className="text-sm text-gray-600 line-clamp-2">{ips.description}</p>}
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="sm">
                      <MoreVertical className="w-4 h-4" />
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

              <div className="flex items-center gap-2 mt-2">
                <Badge variant={ips.is_active ? "default" : "secondary"}>{ips.is_active ? "Active" : "Inactive"}</Badge>
                {ips.total_factors > 0 && <Badge variant="outline">{ips.active_factors}/{ips.total_factors} factors</Badge>}
              </div>
            </CardHeader>

            <CardContent className="pt-0">
              {/* Progress Indicator */}
              {ips.total_factors > 0 && (
                <div className="mb-4">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-xs text-gray-600">Configuration</span>
                    <span className="text-xs text-gray-600">{Math.round((Number(ips.active_factors) / Math.max(1, Number(ips.total_factors))) * 100)}%</span>
                  </div>
                  <Progress value={(Number(ips.active_factors) / Math.max(1, Number(ips.total_factors))) * 100} className="h-2" />
                </div>
              )}

              {/* Stats Grid */}
              <div className="grid grid-cols-2 gap-4 text-center py-3 border-t">
                <div>
                  <div className="text-lg font-semibold text-gray-900">{ips.total_trades || 0}</div>
                  <div className="text-xs text-gray-600">Trades</div>
                </div>
                <div>
                  <div className="text-lg font-semibold text-green-600">{ips.win_rate ? `${Math.round(Number(ips.win_rate))}%` : "0%"}</div>
                  <div className="text-xs text-gray-600">Win Rate</div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex gap-2 mt-4">
                <Button variant="outline" size="sm" className="flex-1" onClick={() => handleIPSAction(ips.id, "edit")}>
                  <Eye className="w-4 h-4 mr-1" />
                  View Details
                </Button>
                {ips.active_factors > 0 && (
                  <Button size="sm" className="flex-1 bg-blue-600 hover:bg-blue-700">
                    <Target className="w-4 h-4 mr-1" />
                    Score Trade
                  </Button>
                )}
              </div>
            </CardContent>

            {ips.is_active && (
              <div className="absolute top-3 right-3">
                <div className="w-2 h-2 bg-green-500 rounded-full"></div>
              </div>
            )}
          </Card>
        ))}

        {/* Empty state */}
        {displayedIPSs.length === 0 && (
          <div className="col-span-full text-center py-12">
            <FileText className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No IPSs found</h3>
            <p className="text-gray-600 mb-4">
              {showInactive ? "You haven't created any IPSs yet." : "No active IPSs. Try showing inactive ones or create a new IPS."}
            </p>
            <Button onClick={handleCreateNew} className="bg-blue-600 hover:bg-blue-700">
              <PlusCircle className="w-4 h-4 mr-2" />
              Create Your First IPS
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
