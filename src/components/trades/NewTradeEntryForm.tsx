"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { LoadedIPSFactors, FactorValueMap, IPSFactor } from "@/lib/types";
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

  // Options chain state
  const [expirationDates, setExpirationDates] = useState<string[]>([]);
  const [expandedExpiration, setExpandedExpiration] = useState<string | null>(null);
  const [optionsChain, setOptionsChain] = useState<any[]>([]);
  const [loadingOptions, setLoadingOptions] = useState(false);
  const [loadingExpirations, setLoadingExpirations] = useState(false);

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

  // Fetch expiration dates when symbol is selected
  useEffect(() => {
    const sym = (formData.symbol || '').trim().toUpperCase();
    if (!sym) {
      setExpirationDates([]);
      setExpandedExpiration(null);
      setOptionsChain([]);
      return;
    }

    let ignore = false;
    (async () => {
      try {
        setLoadingExpirations(true);
        const res = await fetch(`/api/market-data/options/expirations?symbol=${encodeURIComponent(sym)}`, { cache: 'no-store' });
        const data = await res.json();
        if (!ignore && data?.success) {
          setExpirationDates(data.data || []);
        }
      } catch (err) {
        console.error("Failed to fetch expiration dates", err);
        if (!ignore) setExpirationDates([]);
      } finally {
        if (!ignore) setLoadingExpirations(false);
      }
    })();
    return () => { ignore = true; };
  }, [formData.symbol]);

  // Fetch options chain when expiration is expanded
  const fetchOptionsChain = async (expiration: string) => {
    const sym = (formData.symbol || '').trim().toUpperCase();
    if (!sym || !expiration) return;

    try {
      setLoadingOptions(true);
      const res = await fetch(`/api/market-data/options/chain?symbol=${encodeURIComponent(sym)}&expiration=${encodeURIComponent(expiration)}`, { cache: 'no-store' });
      const data = await res.json();
      if (data?.success) {
        setOptionsChain(data.data || []);
      }
    } catch (err) {
      console.error("Failed to fetch options chain", err);
      setOptionsChain([]);
    } finally {
      setLoadingOptions(false);
    }
  };

  const handleExpirationClick = (expiration: string) => {
    if (expandedExpiration === expiration) {
      setExpandedExpiration(null);
      setOptionsChain([]);
    } else {
      setExpandedExpiration(expiration);
      fetchOptionsChain(expiration);
    }
  };

  const handlePutCreditSpreadSelect = (shortPut: any, longPut: any) => {
    // Calculate credit as the difference between short and long mid prices
    const shortMid = (shortPut.bid + shortPut.ask) / 2;
    const longMid = (longPut.bid + longPut.ask) / 2;
    const credit = (shortMid - longMid).toFixed(2);
    setFormData((p) => ({
      ...p,
      expirationDate: shortPut.expiration_date,
      shortPutStrike: shortPut.strike,
      longPutStrike: longPut.strike,
      creditReceived: parseFloat(credit),
    }));
    setTextValues((prev) => ({
      ...prev,
      shortPutStrike: String(shortPut.strike),
      longPutStrike: String(longPut.strike),
      creditReceived: credit,
    }));

    // Trigger API factor refresh
    const context = buildOptionsContext();
    const upperSymbol = formData.symbol.toUpperCase();
    lastApiRequestRef.current = { symbol: upperSymbol, contextSignature: context ? JSON.stringify(context) : null };
    refreshApiValues(upperSymbol, context);
  };

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

      {formData.symbol && formData.contractType === 'put-credit-spread' && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Options Chain</CardTitle>
          </CardHeader>
          <CardContent>
            {loadingExpirations && <div className="text-sm text-muted-foreground">Loading expiration dates…</div>}
            {!loadingExpirations && expirationDates.length === 0 && (
              <div className="text-sm text-muted-foreground">No options available for this symbol</div>
            )}
            {!loadingExpirations && expirationDates.length > 0 && (
              <div className="space-y-2">
                <div className="text-sm text-muted-foreground mb-2">Select an expiration date to view options</div>
                <div className="flex flex-wrap gap-2">
                  {expirationDates.slice(0, 12).map((expiration) => {
                    // Add timezone offset to display the correct date (options expire on Fridays)
                    const date = new Date(expiration + 'T12:00:00');
                    return (
                      <Button
                        key={expiration}
                        variant={expandedExpiration === expiration ? "default" : "outline"}
                        size="sm"
                        onClick={() => handleExpirationClick(expiration)}
                        className="text-xs"
                      >
                        {date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                      </Button>
                    );
                  })}
                </div>

                {expandedExpiration && (
                  <div className="mt-4 border-t pt-4">
                    {loadingOptions && <div className="text-sm text-muted-foreground">Loading options chain…</div>}
                    {!loadingOptions && optionsChain.length === 0 && (
                      <div className="text-sm text-muted-foreground">No options available for this expiration</div>
                    )}
                    {!loadingOptions && optionsChain.length > 0 && (() => {
                      const puts = optionsChain.filter((opt: any) => opt.option_type === 'put').sort((a: any, b: any) => b.strike - a.strike);
                      const currentPrice = marketSnap?.price || 0;

                      // Get API factors that can be displayed in the options chain
                      const displayableApiFactors = factors.api.filter((f) => {
                        const key = f.key.toLowerCase();
                        return key.includes('delta') || key.includes('gamma') || key.includes('theta') ||
                               key.includes('vega') || key.includes('rho') || key.includes('iv') ||
                               key.includes('implied') || key.includes('open_interest') || key.includes('openinterest');
                      });

                      return (
                        <div className="space-y-3">
                          <div className="text-sm font-medium">Put Options (click two puts to create a credit spread)</div>
                          <div className="max-h-96 overflow-y-auto">
                            <table className="w-full text-xs">
                              <thead className="sticky top-0 bg-background border-b">
                                <tr>
                                  <th className="text-left p-2">Strike</th>
                                  <th className="text-right p-2">Bid</th>
                                  <th className="text-right p-2">Ask</th>
                                  <th className="text-right p-2">Mid</th>
                                  {displayableApiFactors.map((factor) => (
                                    <th key={factor.key} className="text-right p-2">{factor.name}</th>
                                  ))}
                                  {displayableApiFactors.length === 0 && (
                                    <>
                                      <th className="text-right p-2">IV</th>
                                      <th className="text-right p-2">OI</th>
                                      <th className="text-right p-2">Delta</th>
                                    </>
                                  )}
                                </tr>
                              </thead>
                              <tbody>
                                {puts.map((put: any) => {
                                  const isITM = put.strike > currentPrice;
                                  const isSelected = formData.shortPutStrike === put.strike || formData.longPutStrike === put.strike;

                                  const getFactorValue = (factor: IPSFactor) => {
                                    const key = factor.key.toLowerCase();
                                    if (key.includes('delta')) return put.greeks?.delta?.toFixed(3) || '-';
                                    if (key.includes('gamma')) return put.greeks?.gamma?.toFixed(4) || '-';
                                    if (key.includes('theta')) return put.greeks?.theta?.toFixed(3) || '-';
                                    if (key.includes('vega')) return put.greeks?.vega?.toFixed(3) || '-';
                                    if (key.includes('rho')) return put.greeks?.rho?.toFixed(3) || '-';
                                    if (key.includes('iv') || key.includes('implied')) {
                                      return put.greeks?.mid_iv ? `${(put.greeks.mid_iv * 100).toFixed(1)}%` : '-';
                                    }
                                    if (key.includes('open_interest') || key.includes('openinterest')) {
                                      return put.open_interest || 0;
                                    }
                                    return '-';
                                  };

                                  return (
                                    <tr
                                      key={put.symbol}
                                      className={`cursor-pointer hover:bg-muted/40 border-b ${isSelected ? 'bg-blue-100 dark:bg-blue-900/20' : ''} ${isITM ? 'bg-yellow-50 dark:bg-yellow-900/10' : ''}`}
                                      onClick={() => {
                                        // If clicking the same option that's already selected, deselect it
                                        if (formData.shortPutStrike === put.strike && !formData.longPutStrike) {
                                          // Deselect short put
                                          setFormData((p) => ({ ...p, shortPutStrike: undefined }));
                                          setTextValues((prev) => ({ ...prev, shortPutStrike: '' }));
                                        } else if (formData.longPutStrike === put.strike) {
                                          // Deselect long put
                                          setFormData((p) => ({ ...p, longPutStrike: undefined, creditReceived: undefined }));
                                          setTextValues((prev) => ({ ...prev, longPutStrike: '', creditReceived: '' }));
                                        } else if (!formData.shortPutStrike) {
                                          // First selection - set as short put
                                          setFormData((p) => ({ ...p, shortPutStrike: put.strike }));
                                          setTextValues((prev) => ({ ...prev, shortPutStrike: String(put.strike) }));
                                        } else if (!formData.longPutStrike && put.strike < formData.shortPutStrike) {
                                          // Second selection - set as long put (must be lower strike)
                                          handlePutCreditSpreadSelect(
                                            puts.find((p: any) => p.strike === formData.shortPutStrike),
                                            put
                                          );
                                        } else {
                                          // Reset and start over
                                          setFormData((p) => ({ ...p, shortPutStrike: put.strike, longPutStrike: undefined, creditReceived: undefined }));
                                          setTextValues((prev) => ({ ...prev, shortPutStrike: String(put.strike), longPutStrike: '', creditReceived: '' }));
                                        }
                                      }}
                                    >
                                      <td className="p-2 font-medium">${put.strike.toFixed(2)}</td>
                                      <td className="p-2 text-right">${put.bid?.toFixed(2) || '-'}</td>
                                      <td className="p-2 text-right">${put.ask?.toFixed(2) || '-'}</td>
                                      <td className="p-2 text-right">${((put.bid + put.ask) / 2).toFixed(2)}</td>
                                      {displayableApiFactors.map((factor) => (
                                        <td key={factor.key} className="p-2 text-right">{getFactorValue(factor)}</td>
                                      ))}
                                      {displayableApiFactors.length === 0 && (
                                        <>
                                          <td className="p-2 text-right">{put.greeks?.mid_iv ? `${(put.greeks.mid_iv * 100).toFixed(1)}%` : '-'}</td>
                                          <td className="p-2 text-right">{put.open_interest || 0}</td>
                                          <td className="p-2 text-right">{put.greeks?.delta?.toFixed(3) || '-'}</td>
                                        </>
                                      )}
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                          {formData.shortPutStrike && !formData.longPutStrike && (
                            <div className="text-xs text-muted-foreground bg-blue-50 dark:bg-blue-900/20 p-2 rounded">
                              Short put selected at ${formData.shortPutStrike}. Now select a lower strike for the long put.
                            </div>
                          )}
                          {formData.shortPutStrike && formData.longPutStrike && (() => {
                            const shortPut = puts.find((p: any) => p.strike === formData.shortPutStrike);
                            const longPut = puts.find((p: any) => p.strike === formData.longPutStrike);

                            return (
                              <div className="text-xs bg-green-50 dark:bg-green-900/20 p-3 rounded space-y-3">
                                <div className="font-medium text-sm">Put Credit Spread Selected</div>

                                <div className="grid grid-cols-2 gap-4">
                                  {/* Short Put Details */}
                                  <div className="space-y-1">
                                    <div className="font-medium text-green-700 dark:text-green-300">Short Put: ${formData.shortPutStrike}</div>
                                    <div className="space-y-0.5 text-[10px]">
                                      <div>Bid: ${shortPut?.bid?.toFixed(2) || '-'} / Ask: ${shortPut?.ask?.toFixed(2) || '-'}</div>
                                      <div>Mid: ${shortPut ? ((shortPut.bid + shortPut.ask) / 2).toFixed(2) : '-'}</div>
                                      {shortPut?.greeks?.mid_iv && <div>IV: {(shortPut.greeks.mid_iv * 100).toFixed(1)}%</div>}
                                      {shortPut?.greeks?.delta && <div>Delta: {shortPut.greeks.delta.toFixed(3)}</div>}
                                      {shortPut?.greeks?.gamma && <div>Gamma: {shortPut.greeks.gamma.toFixed(4)}</div>}
                                      {shortPut?.greeks?.theta && <div>Theta: {shortPut.greeks.theta.toFixed(3)}</div>}
                                      {shortPut?.greeks?.vega && <div>Vega: {shortPut.greeks.vega.toFixed(3)}</div>}
                                      {shortPut?.greeks?.rho && <div>Rho: {shortPut.greeks.rho.toFixed(3)}</div>}
                                      {shortPut?.open_interest !== undefined && <div>OI: {shortPut.open_interest}</div>}
                                    </div>
                                  </div>

                                  {/* Long Put Details */}
                                  <div className="space-y-1">
                                    <div className="font-medium text-red-700 dark:text-red-300">Long Put: ${formData.longPutStrike}</div>
                                    <div className="space-y-0.5 text-[10px]">
                                      <div>Bid: ${longPut?.bid?.toFixed(2) || '-'} / Ask: ${longPut?.ask?.toFixed(2) || '-'}</div>
                                      <div>Mid: ${longPut ? ((longPut.bid + longPut.ask) / 2).toFixed(2) : '-'}</div>
                                      {longPut?.greeks?.mid_iv && <div>IV: {(longPut.greeks.mid_iv * 100).toFixed(1)}%</div>}
                                      {longPut?.greeks?.delta && <div>Delta: {longPut.greeks.delta.toFixed(3)}</div>}
                                      {longPut?.greeks?.gamma && <div>Gamma: {longPut.greeks.gamma.toFixed(4)}</div>}
                                      {longPut?.greeks?.theta && <div>Theta: {longPut.greeks.theta.toFixed(3)}</div>}
                                      {longPut?.greeks?.vega && <div>Vega: {longPut.greeks.vega.toFixed(3)}</div>}
                                      {longPut?.greeks?.rho && <div>Rho: {longPut.greeks.rho.toFixed(3)}</div>}
                                      {longPut?.open_interest !== undefined && <div>OI: {longPut.open_interest}</div>}
                                    </div>
                                  </div>
                                </div>

                                {/* Spread Summary */}
                                <div className="pt-2 border-t border-green-200 dark:border-green-800 space-y-0.5">
                                  <div className="font-medium">Spread Summary:</div>
                                  <div>Width: ${(formData.shortPutStrike - formData.longPutStrike).toFixed(2)}</div>
                                  <div>Net Credit: ${formData.creditReceived?.toFixed(2)}</div>
                                  <div>Max Profit: ${formData.creditReceived?.toFixed(2)} (per spread)</div>
                                  <div>Max Loss: ${((formData.shortPutStrike - formData.longPutStrike) - (formData.creditReceived || 0)).toFixed(2)} (per spread)</div>
                                </div>
                              </div>
                            );
                          })()}
                        </div>
                      );
                    })()}
                  </div>
                )}
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
