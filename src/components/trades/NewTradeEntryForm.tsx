"use client";
import { useEffect, useState } from "react";
import type { IPSConfiguration, LoadedIPSFactors, FactorValueMap } from "@/lib/types";
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
      const values = await fetchApiFactorValues(sym, factors.api);
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

