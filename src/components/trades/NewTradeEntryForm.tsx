"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { LoadedIPSFactors, FactorValueMap } from "@/lib/types";
import type { OptionsRequestContext } from "@/lib/types/market-data";
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
  const [snapBusy, setSnapBusy] = useState(false);
  const [marketSnap, setMarketSnap] = useState<{
    price: number | null;
    changePct: number | null;
    high52: number | null;
    low52: number | null;
  } | null>(null);
  // Symbol search state (Alpha Vantage SYMBOL_SEARCH)
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchBusy, setSearchBusy] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<Array<{symbol:string; name:string; region?:string; type?:string; currency?:string}>>([]);
  const [searchTimer, setSearchTimer] = useState<any>(null);

  const hasOptionApiFactors = useMemo(() =>
    factors.api.some((factor) => factor.key?.startsWith('opt-'))
  , [factors.api]);
  const lastApiRequestRef = useRef<{ symbol: string; contextSignature: string | null } | null>(null);

  useEffect(() => {
    loadIPSFactors((selectedIPS as any).ips_id || selectedIPS.id)
      .then((loaded) => {
        setFactors(loaded);
        lastApiRequestRef.current = null;
      })
      .catch((err) => console.error("Failed loading IPS factors", err));
  }, [selectedIPS]);

  async function refreshApiValues(sym: string, optionsContext?: OptionsRequestContext) {
    const normalizedSym = sym.trim().toUpperCase();
    if (!normalizedSym || factors.api.length === 0) return;

    if (hasOptionApiFactors) {
      const hasLegs = optionsContext && Array.isArray(optionsContext.legs) && optionsContext.legs.length > 0;
      if (!hasLegs) {
        return;
      }
    }

    try {
      setApiBusy(true);
      const ipsId = (selectedIPS as any).ips_id || (selectedIPS as any).id;
      const values = await fetchApiFactorValues(normalizedSym, factors.api, ipsId, optionsContext);
      setApiValues(values);
    } catch (e) {
      console.error("API factor fetch error", e);
    } finally {
      setApiBusy(false);
    }
  }
  }

  const buildOptionsContext = (): OptionsRequestContext | undefined => {
    const expiration = (formData.expirationDate || '').trim();
    if (!expiration) return undefined;

    const legs: OptionsRequestContext['legs'] = [];
    const pushLeg = (leg: OptionsRequestContext['legs'][number]) => {
      legs.push(leg);
    };

    const addShortLeg = (id: string, type: 'call' | 'put', strike: number | undefined) => {
      if (typeof strike === 'number' && !Number.isNaN(strike)) {
        pushLeg({ id, type, strike, role: 'short', primary: true });
      }
    };

    const addLongLeg = (id: string, type: 'call' | 'put', strike: number | undefined) => {
      if (typeof strike === 'number' && !Number.isNaN(strike)) {
        pushLeg({ id, type, strike, role: 'long' });
      }
    };

    switch (formData.contractType) {
      case 'put-credit-spread':
        addShortLeg('short_put', 'put', formData.shortPutStrike);
        addLongLeg('long_put', 'put', formData.longPutStrike);
        break;
      case 'call-credit-spread':
        addShortLeg('short_call', 'call', formData.shortCallStrike);
        addLongLeg('long_call', 'call', formData.longCallStrike);
        break;
      case 'iron-condor':
        addShortLeg('short_put', 'put', formData.shortPutStrike);
        addLongLeg('long_put', 'put', formData.longPutStrike);
        addShortLeg('short_call', 'call', formData.shortCallStrike);
        addLongLeg('long_call', 'call', formData.longCallStrike);
        break;
      case 'long-call':
        addLongLeg('long_call', 'call', formData.optionStrike);
        break;
      case 'long-put':
        addLongLeg('long_put', 'put', formData.optionStrike);
        break;
      case 'covered-call':
        addShortLeg('covered_call', 'call', formData.callStrike);
        break;
      default:
        break;
    }

    return legs.length > 0 ? { expiration, legs } : undefined;
  };

  useEffect(() => {
    const sym = (formData.symbol || '').trim().toUpperCase();
    if (!sym || factors.api.length === 0) {
      return;
    }

    const optionsContext = buildOptionsContext();
    if (hasOptionApiFactors && (!optionsContext || optionsContext.legs.length === 0)) {
      return;
    }

    const contextSignature = optionsContext ? JSON.stringify(optionsContext) : null;
    const lastRequest = lastApiRequestRef.current;
    if (lastRequest && lastRequest.symbol === sym && lastRequest.contextSignature === contextSignature) {
      return;
    }

    lastApiRequestRef.current = { symbol: sym, contextSignature };
    refreshApiValues(sym, optionsContext);
  }, [
    formData.symbol,
    formData.expirationDate,
    formData.shortPutStrike,
    formData.longPutStrike,
    formData.shortCallStrike,
    formData.longCallStrike,
    formData.optionStrike,
    formData.callStrike,
    formData.contractType,
    factors.api.length,
    hasOptionApiFactors,
  ]);

  // Load market snapshot (price, 52w range)
  useEffect(() => {
    const sym = (formData.symbol || '').trim();
    if (!sym) { setMarketSnap(null); return; }
    let ignore = false;
    (async () => {
      try {
        setSnapBusy(true);
        const r = await fetch(`/api/market-data/fundamental?symbol=${encodeURIComponent(sym)}`, { cache: 'no-store' });
        const j = await r.json();
        const d = j?.data || {};
        if (!ignore) {
          setMarketSnap({
            price: Number(d?.currentPrice ?? d?.price ?? 0) || null,
            changePct: Number(d?.priceChangePercent ?? 0) || null,
            high52: Number(d?.week52High ?? d?.fundamentals?.week52High ?? 0) || null,
            low52: Number(d?.week52Low ?? d?.fundamentals?.week52Low ?? 0) || null,
          });
        }
      } catch {
        if (!ignore) setMarketSnap(null);
      } finally {
        if (!ignore) setSnapBusy(false);
      }
    })();
    return () => { ignore = true; };
  }, [formData.symbol]);

  // Debounced ticker search
  useEffect(() => {
    if (!searchOpen) return;
    if (searchTimer) clearTimeout(searchTimer);
    const t = setTimeout(async () => {
      const q = searchQuery.trim();
      if (!q || q.length < 1) {
        setSearchResults([]);
        return;
      }
      try {
        setSearchBusy(true);
        const res = await fetch(`/api/market-data/symbol-search?q=${encodeURIComponent(q)}&limit=8`, { cache: 'no-store' });
        const data = await res.json();
        if (data?.success) setSearchResults(data.data || []);
        else setSearchResults([]);
      } catch {
        setSearchResults([]);
      } finally {
        setSearchBusy(false);
      }
    }, 250);
    setSearchTimer(t);
    return () => clearTimeout(t);
  }, [searchQuery, searchOpen]);

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
            <div className="relative">
              <Label htmlFor="symbol">Symbol</Label>
              <Input
                id="symbol"
                value={formData.symbol}
                onFocus={() => setSearchOpen(true)}
                onBlur={() => setTimeout(() => setSearchOpen(false), 150)}
                onChange={(e) => {
                  const v = e.target.value.toUpperCase();
                  setFormData((p) => ({ ...p, symbol: v.replace(/\s+/g, '') }));
                  setSearchQuery(e.target.value);
                }}
                placeholder="Search by symbol or company"
              />
              {searchOpen && (searchQuery || '').length >= 1 && (
                <div className="absolute z-20 mt-1 w-full rounded border bg-background shadow">
                  {searchBusy && (
                    <div className="px-3 py-2 text-xs text-muted-foreground">Searching…</div>
                  )}
                  {!searchBusy && searchResults.length === 0 && (
                    <div className="px-3 py-2 text-xs text-muted-foreground">No matches</div>
                  )}
                  {!searchBusy && searchResults.map((r) => (
                    <button
                      key={`${r.symbol}-${r.name}`}
                      type="button"
                      className="w-full text-left px-3 py-2 hover:bg-muted/40"
                      onMouseDown={(ev) => ev.preventDefault()}
                      onClick={() => {
                        setFormData((p) => ({ ...p, symbol: r.symbol.toUpperCase() }));
                        setSearchOpen(false);
                        setSearchQuery("");
                        setSearchResults([]);
                        // trigger factor refresh explicitly
                        const context = buildOptionsContext();
                        const upperSymbol = r.symbol.toUpperCase();
                        lastApiRequestRef.current = { symbol: upperSymbol, contextSignature: context ? JSON.stringify(context) : null };
                        refreshApiValues(upperSymbol, context);
                      }}
                    >
                      <div className="text-sm font-medium">{r.symbol} <span className="text-muted-foreground">• {r.name}</span></div>
                      {r.region && <div className="text-[11px] text-muted-foreground">{r.region}{r.currency ? ` • ${r.currency}` : ''}</div>}
                    </button>
                  ))}
                </div>
              )}
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

      {formData.symbol && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Market Snapshot</CardTitle>
          </CardHeader>
          <CardContent>
            {snapBusy && <div className="text-sm text-muted-foreground">Loading market data…</div>}
            {!snapBusy && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                <div>
                  <div className="text-muted-foreground">Current Price</div>
                  <div className="font-medium">{marketSnap?.price != null ? `$${marketSnap.price.toFixed(2)}` : '-'}</div>
                </div>
                <div>
                  <div className="text-muted-foreground">Change %</div>
                  <div className={`font-medium ${Number(marketSnap?.changePct) >= 0 ? 'text-green-600' : 'text-red-600'}`}>{marketSnap?.changePct != null ? `${marketSnap.changePct.toFixed(2)}%` : '-'}</div>
                </div>
                <div>
                  <div className="text-muted-foreground">52-Week High</div>
                  <div className="font-medium">{marketSnap?.high52 != null ? `$${marketSnap.high52.toFixed(2)}` : '-'}</div>
                </div>
                <div>
                  <div className="text-muted-foreground">52-Week Low</div>
                  <div className="font-medium">{marketSnap?.low52 != null ? `$${marketSnap.low52.toFixed(2)}` : '-'}</div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <ApiFactorsPanel
          factors={factors.api}
          values={apiValues}
          isConnected={!apiBusy}
          onRefresh={() => refreshApiValues((formData.symbol || '').trim().toUpperCase(), buildOptionsContext())}
          editable
          onChange={(key, value) => setApiValues((prev)=> ({ ...prev, [key]: value }))}
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













