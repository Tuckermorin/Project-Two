"use client";
import { useEffect, useState } from "react";
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
}

export function NewTradeEntryForm({
  selectedIPS,
  lockedContractType,
  strategyLabel,
  onSubmit,
  onCancel,
  isLoading,
}: TradeEntryFormProps) {
  const [formData, setFormData] = useState<TradeFormData>({
    symbol: "",
    expirationDate: "",
    contractType: lockedContractType,
    numberOfContracts: 1,
    ipsFactors: {},
    apiFactors: {},
  });

  useEffect(() => {
    setFormData((p) => ({ ...p, contractType: lockedContractType }));
  }, [lockedContractType]);

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

  const handleSubmit = () => {
    onSubmit(
      {
        ...formData,
        ipsFactors: manualValues,
        apiFactors: apiValues,
      },
      null
    );
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
                      <C id="numberOfContracts" label="Contracts" placeholder="1" />
                      <N id="shortPutStrike" label="Short Put Strike" placeholder="145.00" />
                      <N id="longPutStrike" label="Long Put Strike" placeholder="140.00" />
                      <N id="creditReceived" label="Net Credit (per spread)" placeholder="1.25" />
                    </>
                  );
                case "call-credit-spread":
                  return (
                    <>
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
                      <C id="numberOfContracts" label="Contracts" placeholder="1" />
                      <N id="optionStrike" label="Option Strike" placeholder="150.00" />
                      <N id="debitPaid" label="Debit Paid (per contract)" placeholder="2.35" />
                    </>
                  );
                case "covered-call":
                  return (
                    <>
                      <N id="sharesOwned" label="Shares Owned" step="1" placeholder="100" />
                      <N id="callStrike" label="Call Strike" placeholder="160.00" />
                      <N id="premiumReceived" label="Premium Received (per contract)" placeholder="1.35" />
                    </>
                  );
                case "iron-condor":
                  return (
                    <>
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
          onClick={handleSubmit}
          disabled={isLoading}
          className="bg-blue-600 hover:bg-blue-700 text-white"
        >
          Submit Prospective Trade
        </Button>
      </div>
    </div>
  );
}

