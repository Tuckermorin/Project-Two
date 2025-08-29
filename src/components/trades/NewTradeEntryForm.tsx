"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { LoadedIPSFactors, FactorValueMap } from "@/lib/types";
import type { IPSConfiguration } from "@/lib/services/ips-data-service";
import { loadIPSFactors, fetchApiFactorValues } from "@/lib/factor-loader";
import { ApiFactorsPanel, ManualFactorsPanel } from "@/components/trades/FactorPanels";
import { Card, CardHeader, CardContent, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { TrendingUp } from "lucide-react";

type ContractType =
  | "put-credit-spread"
  | "call-credit-spread"
  | "long-call"
  | "long-put"
  | "iron-condor"
  | "covered-call"
  | "buy-hold";

interface TradeFormData {
  name?: string;
  symbol: string;
  expirationDate: string;
  contractType: ContractType;
  numberOfContracts?: number;
  shortPutStrike?: number;
  longPutStrike?: number;
  creditReceived?: number;
  shortCallStrike?: number;
  longCallStrike?: number;
  optionStrike?: number;
  debitPaid?: number;
  sharesOwned?: number;
  callStrike?: number;
  premiumReceived?: number;
  shares?: number;
  entryPrice?: number;
  ipsFactors: FactorValueMap;
  apiFactors: FactorValueMap;
}

interface TradeEntryFormProps {
  selectedIPS: IPSConfiguration;
  lockedContractType: ContractType;
  strategyLabel: string;
  onSubmit: (formData: TradeFormData, score: number | null) => void;
  onCancel: () => void;
  isLoading: boolean;
  initialData?: Partial<TradeFormData>;
}

export function NewTradeEntryForm({
  selectedIPS,
  lockedContractType,
  strategyLabel,
  onSubmit,
  onCancel,
  isLoading,
  initialData,
}: TradeEntryFormProps) {
  const router = useRouter();
  const [formData, setFormData] = useState<TradeFormData>({
    symbol: initialData?.symbol || "",
    expirationDate: (initialData?.expirationDate as any) || "",
    contractType: (initialData?.contractType as any) || lockedContractType,
    numberOfContracts: initialData?.numberOfContracts ?? 1,
    shortPutStrike: initialData?.shortPutStrike,
    longPutStrike: initialData?.longPutStrike,
    creditReceived: initialData?.creditReceived,
    shortCallStrike: initialData?.shortCallStrike,
    longCallStrike: initialData?.longCallStrike,
    optionStrike: initialData?.optionStrike,
    debitPaid: initialData?.debitPaid,
    sharesOwned: initialData?.sharesOwned,
    callStrike: initialData?.callStrike,
    premiumReceived: initialData?.premiumReceived,
    shares: initialData?.shares,
    entryPrice: initialData?.entryPrice,
    ipsFactors: {},
    apiFactors: {},
  });

  // Keep raw text for numeric inputs so users can type freely (e.g. 145.5)
  const [textValues, setTextValues] = useState<Record<string, string>>({});

  useEffect(() => {
    setFormData((p) => ({ ...p, contractType: lockedContractType }));
  }, [lockedContractType]);

  useEffect(() => {
    if (!initialData) return;
    setFormData((p) => ({ ...p, ...initialData } as any));
  }, [initialData]);

  const [factors, setFactors] = useState<LoadedIPSFactors>({ api: [], manual: [] });
  const [manualValues, setManualValues] = useState<FactorValueMap>({});
  const [apiValues, setApiValues] = useState<FactorValueMap>({});
  const [apiBusy, setApiBusy] = useState(false);

  useEffect(() => {
    loadIPSFactors((selectedIPS as any).ips_id || selectedIPS.id)
      .then(setFactors)
      .catch((err) => console.error("Failed loading IPS factors", err));
  }, [selectedIPS]);

  async function refreshApiValues(sym: string) {
    if (!sym || factors.api.length === 0) return;
    try {
      setApiBusy(true);
      const ipsId = (selectedIPS as any).ips_id || (selectedIPS as any).id;
      const values = await fetchApiFactorValues(sym, factors.api, ipsId);
      setApiValues(values);
    } catch (e) {
      console.error("API factor fetch error", e);
    } finally {
      setApiBusy(false);
    }
  }

  useEffect(() => {
    refreshApiValues(formData.symbol);
  }, [formData.symbol, factors.api.length]);

  const handleScore = () => {
    try {
      const payload = {
        ipsId: (selectedIPS as any).ips_id || (selectedIPS as any).id,
        ipsName: (selectedIPS as any).name || (selectedIPS as any).ips_name,
        strategyId: Array.isArray((selectedIPS as any).strategies)
          ? (selectedIPS as any).strategies[0]
          : undefined,
        strategyLabel,
        trade: {
          ...formData,
          ipsFactors: manualValues,
          apiFactors: apiValues,
        },
      };
      // Persist draft to sessionStorage for the scoring page
      sessionStorage.setItem("tenxiv:trade-to-score", JSON.stringify(payload));
      router.push("/trades/score");
    } catch (e) {
      console.error("Failed to queue trade for scoring", e);
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5" /> Trade Details
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div>
              <Label htmlFor="symbol">Symbol</Label>
              <Input
                id="symbol"
                value={formData.symbol}
                onChange={(e) =>
                  setFormData((p) => ({ ...p, symbol: e.target.value.trim().toUpperCase() }))
                }
                placeholder="AAPL"
              />
            </div>
            <div>
              <Label>Strategy</Label>
              <Input value={strategyLabel} readOnly className="bg-muted/40" />
            </div>
            <div>
              <Label htmlFor="expirationDate">Expiration Date</Label>
              <Input
                id="expirationDate"
                type="date"
                value={formData.expirationDate}
                onChange={(e) => setFormData((p) => ({ ...p, expirationDate: e.target.value }))}
              />
            </div>
            {/* Strategy-specific fields */}
            {(() => {
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
                      {renderC({ id: "numberOfContracts", label: "Contracts", placeholder: "1" })}
                      {renderN({ id: "shortPutStrike", label: "Short Put Strike", placeholder: "145.00" })}
                      {renderN({ id: "longPutStrike", label: "Long Put Strike", placeholder: "140.00" })}
                      {renderN({ id: "creditReceived", label: "Net Credit (per spread)", placeholder: "1.25" })}
                    </>
                  );
                case "call-credit-spread":
                  return (
                    <>
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
                      {renderC({ id: "numberOfContracts", label: "Contracts", placeholder: "1" })}
                      {renderN({ id: "optionStrike", label: "Option Strike", placeholder: "150.00" })}
                      {renderN({ id: "debitPaid", label: "Debit Paid (per contract)", placeholder: "2.35" })}
                    </>
                  );
                case "covered-call":
                  return (
                    <>
                      {renderN({ id: "sharesOwned", label: "Shares Owned", step: "1", placeholder: "100" })}
                      {renderN({ id: "callStrike", label: "Call Strike", placeholder: "160.00" })}
                      {renderN({ id: "premiumReceived", label: "Premium Received (per contract)", placeholder: "1.35" })}
                    </>
                  );
                case "iron-condor":
                  return (
                    <>
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
            })()}
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <ApiFactorsPanel
          factors={factors.api}
          values={apiValues}
          isConnected={!apiBusy}
          onRefresh={() => refreshApiValues(formData.symbol)}
        />
        <ManualFactorsPanel
          factors={factors.manual}
          values={manualValues}
          onChange={(key, value) => setManualValues((prev) => ({ ...prev, [key]: value }))}
        />
      </div>

      <div className="flex items-center gap-2">
        <Button variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          onClick={handleScore}
          disabled={isLoading}
          className="bg-blue-600 hover:bg-blue-700 text-white"
        >
          Score trade
        </Button>
      </div>
    </div>
  );
}
