"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardHeader, CardContent, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { AlertCircle, ArrowLeft, BarChart3, CheckCircle, XCircle } from "lucide-react";
import { loadIPSFactors } from "@/lib/factor-loader";
import type { IPSFactor } from "@/lib/types";

type DraftPayload = {
  ipsId: string;
  ipsName?: string;
  strategyId?: string;
  strategyLabel?: string;
  trade: any;
};

type ScoreAPIResponse = {
  success: boolean;
  data?: {
    score: number;
    scoreId?: string;
    breakdown: {
      totalWeight: number;
      weightedSum: number;
      factorScores: Array<{
        factorName: string;
        value: number;
        weight: number;
        individualScore: number;
        weightedScore: number;
        targetMet: boolean;
      }>;
      targetsMetCount: number;
      targetPercentage: number;
    };
    timestamp: string;
  };
  error?: string;
};

export default function ScoreTradePage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState<DraftPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [score, setScore] = useState<ScoreAPIResponse["data"] | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const [ipsDisplayName, setIpsDisplayName] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiResult, setAiResult] = useState<
    | {
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
      }
    | null
  >(null);
  const [aiShowDetails, setAiShowDetails] = useState(false);

  const fmtCurrency = (v: any) => {
    const n = Number(v);
    if (!isFinite(n)) return String(v ?? "—");
    return `$${n.toFixed(2)}`;
  };
  const fmtPercent = (v: any) => {
    const n = Number(v);
    if (!isFinite(n)) return String(v ?? "—");
    const pct = n <= 1 ? n * 100 : n;
    return `${Math.round(pct)}%`;
  };
  const rrFrom = (math: any): string => {
    if (!math) return "—";
    if (typeof math.rr_display === 'string' && math.rr_display.trim()) return math.rr_display;
    const mp = Number(math.max_profit);
    const ml = Number(math.max_loss);
    if (isFinite(mp) && isFinite(ml) && ml !== 0) {
      const ratio = mp / ml;
      if (isFinite(ratio) && ratio > 0) return `1:${(ml / mp).toFixed(2)}`;
    }
    const rr = Number(math.rr_ratio);
    if (isFinite(rr) && rr > 0) return rr.toFixed(2);
    return "—";
  };

  useEffect(() => {
    async function run() {
      try {
        setLoading(true);
        const raw = sessionStorage.getItem("tenxiv:trade-to-score");
        if (!raw) {
          setError("No trade draft found to score.");
          setLoading(false);
          return;
        }
        const payload: DraftPayload = JSON.parse(raw);
        setDraft(payload);
        // Derive IPS display name
        if (payload.ipsName && payload.ipsName.trim()) {
          setIpsDisplayName(payload.ipsName);
        } else if (payload.ipsId) {
          try {
            const r = await fetch('/api/ips', { cache: 'no-store' });
            const rows = await r.json();
            if (Array.isArray(rows)) {
              const row = rows.find((x: any) => x?.id === payload.ipsId);
              if (row?.name) setIpsDisplayName(String(row.name));
            }
          } catch {}
        }

        // Load IPS factors to map keys -> names expected by scoring API
        const factors = await loadIPSFactors(payload.ipsId);

        const valueByName: Record<string, number | string | boolean | null | undefined> = {};
        const recordFrom = (list: IPSFactor[], bag: Record<string, any>) => {
          list.forEach((f) => {
            const v = bag?.[f.key];
            if (v !== undefined && v !== null && v !== "") {
              valueByName[f.name] = v as any;
            }
          });
        };
        recordFrom(factors.api, payload.trade?.apiFactors || {});
        recordFrom(factors.manual, payload.trade?.ipsFactors || {});

        // Score via API (uses IPS factors, weights, targets)
        const res = await fetch("/api/trades/score", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ipsId: payload.ipsId,
            factorValues: valueByName,
          }),
        });
        const json: ScoreAPIResponse = await res.json();
        if (!res.ok || !json.success || !json.data) {
          throw new Error(json.error || "Failed to calculate score");
        }
        setScore(json.data);
      } catch (e: any) {
        console.error(e);
        setError(e?.message || "Scoring failed");
      } finally {
        setLoading(false);
      }
    }
    run();
  }, []);

  const grade = useMemo(() => {
    const s = score?.score ?? 0;
    if (s >= 90) return { label: "A", className: "bg-green-100 text-green-800 border-green-200" };
    if (s >= 80) return { label: "B", className: "bg-blue-100 text-blue-800 border-blue-200" };
    if (s >= 70) return { label: "C", className: "bg-yellow-100 text-yellow-800 border-yellow-200" };
    if (s >= 60) return { label: "D", className: "bg-orange-100 text-orange-800 border-orange-200" };
    return { label: "F", className: "bg-red-100 text-red-800 border-red-200" };
  }, [score?.score]);

  const handleAddProspective = async () => {
    if (!draft || !score) return;
    try {
      setSaving(true);
      setSaveMsg(null);
      const t = draft.trade || {};
      // Map strategy-specific fields to generic API fields
      const shortStrike = t.shortPutStrike ?? t.shortCallStrike ?? undefined;
      const longStrike = t.longPutStrike ?? t.longCallStrike ?? undefined;
      const creditReceived =
        t.creditReceived ?? t.premiumReceived ?? (t.debitPaid ? -Math.abs(t.debitPaid) : undefined);

      // Determine strategy_type to satisfy DB NOT NULL
      const strategyType = draft.strategyId || ((): string | undefined => {
        switch (t.contractType) {
          case "put-credit-spread":
            return "put-credit-spreads";
          case "call-credit-spread":
            return "call-credit-spreads";
          case "iron-condor":
            return "iron-condors";
          case "covered-call":
            return "covered-calls";
          case "long-call":
            return "long-calls";
          case "long-put":
            return "long-puts";
          default:
            return undefined;
        }
      })();

      // Rebuild factor values by human factor name for persistence
      const factorsByName: Record<string, any> = {};
      Object.assign(factorsByName, t.apiFactors || {}); // keys are internal; API will save factor names we pass below
      Object.assign(factorsByName, t.ipsFactors || {});

      // We saved factor names when scoring; reuse score.breakdown.factorScores to persist by name
      const factorPersist: Record<string, any> = {};
      score.breakdown.factorScores.forEach((f) => {
        factorPersist[f.factorName] = { value: f.value, source: "scored" };
      });

      const res = await fetch("/api/trades", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: "user-123",
          ipsId: draft.ipsId,
          strategyType,
          tradeData: {
            name: t.name,
            symbol: t.symbol,
            contractType: t.contractType,
            currentPrice: t.currentPrice,
            expirationDate: t.expirationDate,
            numberOfContracts: t.numberOfContracts,
            shortStrike,
            longStrike,
            creditReceived,
          },
          factorValues: factorPersist,
          ipsScore: score.score,
          scoreId: score.scoreId,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json?.success) throw new Error(json?.error || "Failed to save trade");
      setSaveMsg("Trade added to Prospective Trades.");
    } catch (e: any) {
      setSaveMsg(e?.message || "Failed to save trade");
    } finally {
      setSaving(false);
    }
  };

  const handleRunAIAnalysis = async () => {
    if (!draft) return;
    try {
      setAiLoading(true);
      setAiError(null);
      setAiResult(null);

      const t = draft.trade || {};
      const strategyType = draft.strategyLabel || draft.strategyId || t.contractType;

      const res = await fetch("/api/ai/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          trade: t,
          ipsName: ipsDisplayName ?? draft.ipsName ?? draft.ipsId,
          strategyType,
          model: process.env.NEXT_PUBLIC_OLLAMA_MODEL,
        }),
      });

      const json = await res.json();
      if (!res.ok || !json?.success || !json?.data) {
        throw new Error(json?.error || "A.I. analysis failed");
      }

      setAiResult(json.data);
      setAiShowDetails(false);
    } catch (e: any) {
      setAiError(e?.message || "A.I. analysis failed");
    } finally {
      setAiLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="max-w-5xl mx-auto p-6">
        <div className="text-gray-600">Scoring trade…</div>
      </div>
    );
  }

  if (error || !draft) {
    return (
      <div className="max-w-5xl mx-auto p-6">
        <Card>
          <CardContent className="py-10 text-center">
            <AlertCircle className="h-8 w-8 text-red-500 mx-auto mb-3" />
            <div className="text-gray-800 font-medium mb-2">{error || "Unable to score this trade."}</div>
            <Button variant="outline" onClick={() => router.push("/trades")}>Back to Trades</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-6">
      <div className="flex items-center gap-2">
        <Button variant="outline" onClick={() => router.push("/trades")}> 
          <ArrowLeft className="h-4 w-4 mr-2" /> Back to Trades
        </Button>
        <Button variant="outline" onClick={() => router.push('/trades?resume=scoring')}>Edit Inputs</Button>
      </div>

      <Card className="bg-gradient-to-r from-blue-50 to-purple-50 border-blue-200">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-2xl font-bold text-gray-900">
                {draft.trade?.symbol || "Symbol"} — Trade Score
              </CardTitle>
              <p className="text-gray-600 mt-1">IPS: {ipsDisplayName ?? draft.ipsName ?? draft.ipsId}</p>
            </div>
            <div className="text-right">
              <div className="text-4xl font-bold text-blue-600 mb-1">{score?.score?.toFixed(1) ?? "0.0"}</div>
              <Badge className={`${grade.className} border text-sm`}>Grade {grade.label}</Badge>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="text-center">
              <div className="text-xl font-bold text-green-600">
                {score?.breakdown.targetsMetCount ?? 0}/{score?.breakdown.factorScores.length ?? 0}
              </div>
              <div className="text-xs text-gray-600">Targets Met</div>
            </div>
            <div className="text-center">
              <div className="text-xl font-bold text-purple-600">{score?.breakdown.totalWeight ?? 0}</div>
              <div className="text-xs text-gray-600">Total Weight</div>
            </div>
            <div className="text-center">
              <div className="text-xl font-bold text-orange-600">
                {Math.round((score?.breakdown.targetPercentage ?? 0))}%
              </div>
              <div className="text-xs text-gray-600">Target Coverage</div>
            </div>
            <div className="text-center">
              <div className="text-xl font-bold text-blue-600">{new Date(score!.timestamp).toLocaleString()}</div>
              <div className="text-xs text-gray-600">Timestamp</div>
            </div>
          </div>

          <div className="mt-4">
            <div className="flex justify-between text-sm mb-2">
              <span>Overall IPS Compliance</span>
              <span>{score?.score?.toFixed(1) ?? "0.0"}/100</span>
            </div>
            <Progress value={score?.score ?? 0} className="h-3" />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5" /> Factor Breakdown
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {score?.breakdown.factorScores.map((f) => (
              <div
                key={f.factorName}
                className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
              >
                <div className="flex items-center gap-3">
                  {f.targetMet ? (
                    <CheckCircle className="h-4 w-4 text-green-600" />
                  ) : (
                    <XCircle className="h-4 w-4 text-red-600" />
                  )}
                  <div>
                    <div className="font-medium text-sm">{f.factorName}</div>
                    <div className="text-xs text-gray-500">Weight: {f.weight}</div>
                  </div>
                </div>
                <div className="text-right">
                  <div className={`font-bold ${f.individualScore >= 70 ? "text-green-600" : f.individualScore >= 50 ? "text-yellow-600" : "text-red-600"}`}>
                    {Math.round(f.individualScore)} / 100
                  </div>
                  <div className="text-xs text-gray-500">Value: {String(f.value)}</div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <span>AI Analysis</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {aiLoading ? (
            <div className="text-gray-600">Running analysis…</div>
          ) : aiError ? (
            <div className="text-sm text-red-600">{aiError}</div>
          ) : aiResult ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="text-sm text-gray-600">
                  Model: {aiResult.model || "Ollama"}
                </div>
                <div className="flex items-center gap-3">
                  {aiResult.full && (
                    <Button
                      variant="outline"
                      onClick={() => setAiShowDetails((v) => !v)}
                    >
                      {aiShowDetails ? "Hide details" : "Show details"}
                    </Button>
                  )}
                  <div className="text-right">
                    {aiResult.score != null && (
                      <div className="text-xl font-bold text-blue-600">
                        AI Score: {Math.round(aiResult.score)}/100
                      </div>
                    )}
                    <div className="text-xs text-gray-500">Category: {aiResult.category} • Confidence: {Math.round((aiResult.confidence ?? 0) * 100)}%</div>
                  </div>
                </div>
              </div>
              {aiResult.status && (
                <div className={`text-xs font-medium ${aiResult.status === 'INCOMPLETE' ? 'text-red-600' : 'text-green-600'}`}>
                  Status: {aiResult.status}
                </div>
              )}
              <div className="text-gray-800 text-sm leading-relaxed whitespace-pre-line">
                {aiResult.summary}
              </div>
              {aiResult.full?.rationale_bullets?.length ? (
                <div>
                  <div className="font-medium text-sm mb-1">Why this score</div>
                  <ul className="list-disc list-inside text-sm text-gray-700">
                    {(aiShowDetails ? aiResult.full.rationale_bullets : aiResult.full.rationale_bullets.slice(0, 3)).map((s: any, i: number) => (
                      <li key={i}>{String(s)}</li>
                    ))}
                  </ul>
                </div>
              ) : aiResult.rationale ? (
                <div className="text-gray-800 text-sm leading-relaxed whitespace-pre-line">
                  {aiResult.rationale}
                </div>
              ) : null}
              {aiResult.suggestions?.length ? (
                <div>
                  <div className="font-medium text-sm mb-1">Suggestions</div>
                  <ul className="list-disc list-inside text-sm text-gray-700">
                    {(aiShowDetails ? aiResult.suggestions : aiResult.suggestions.slice(0, 3)).map((s, i) => (
                      <li key={i}>{s}</li>
                    ))}
                  </ul>
                  {!aiShowDetails && aiResult.suggestions.length > 3 && (
                    <div className="mt-2">
                      <Button variant="outline" onClick={() => setAiShowDetails(true)}>Show all suggestions</Button>
                    </div>
                  )}
                </div>
              ) : null}

              {/* Extended structured analysis (collapsed by default) */}
              {aiResult.full && aiShowDetails ? (
                <div className="space-y-4 pt-2 border-t">
                  {/* Inputs snapshot used by AI */}
                  {aiResult.inputs ? (
                    <div>
                      <div className="font-medium text-sm mb-1">Data Snapshot</div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm text-gray-700">
                        {/* Underlying */}
                        <div className="space-y-1">
                          <div className="text-xs font-semibold text-gray-600">Underlying</div>
                          <div>Ticker: {aiResult.inputs.underlying?.ticker ?? draft.trade?.symbol ?? '—'}</div>
                          <div>Price: {fmtCurrency(aiResult.inputs.underlying?.price)}</div>
                          <div>Change %: {aiResult.inputs.underlying?.change_pct ?? '—'}%</div>
                          <div>52w High: {fmtCurrency(aiResult.inputs.underlying?.week52_high)} • 52w Low: {fmtCurrency(aiResult.inputs.underlying?.week52_low)}</div>
                          <div>Beta: {aiResult.inputs.underlying?.beta ?? '—'} • Market Cap: {aiResult.inputs.underlying?.market_cap ? `$${Number(aiResult.inputs.underlying.market_cap).toLocaleString()}` : '—'}</div>
                          {aiResult.inputs.underlying?.fundamentals && (
                            <div className="text-xs text-gray-600">
                              PE: {aiResult.inputs.underlying.fundamentals.pe_ratio ?? '—'} • Growth YoY: {aiResult.inputs.underlying.fundamentals.revenue_growth_yoy ?? '—'}% • ROE: {aiResult.inputs.underlying.fundamentals.roe ?? '—'}% • ROA: {aiResult.inputs.underlying.fundamentals.roa ?? '—'}%
                              <br />EV/EBITDA: {aiResult.inputs.underlying.fundamentals.ev_to_ebitda ?? '—'} • P/S: {aiResult.inputs.underlying.fundamentals.ps_ratio_ttm ?? '—'} • P/B: {aiResult.inputs.underlying.fundamentals.pb_ratio ?? '—'}
                            </div>
                          )}
                        </div>
                        {/* Technicals & Macro */}
                        <div className="space-y-1">
                          <div className="text-xs font-semibold text-gray-600">Technicals</div>
                          <div>SMA50: {aiResult.inputs.technicals?.sma50 ?? '—'} • SMA200: {aiResult.inputs.technicals?.sma200 ?? '—'}</div>
                          <div>RSI(14): {aiResult.inputs.technicals?.rsi14 ?? '—'} • MACD: {aiResult.inputs.technicals?.macd ?? '—'} ({aiResult.inputs.technicals?.macd_signal ?? '—'})</div>
                          <div className="text-xs text-gray-600">Above 50: {String(aiResult.inputs.technicals?.price_above_50 ?? '—')} • Above 200: {String(aiResult.inputs.technicals?.price_above_200 ?? '—')} • Golden Cross: {String(aiResult.inputs.technicals?.golden_cross ?? '—')}</div>
                          <div className="text-xs font-semibold text-gray-600 mt-2">Macro</div>
                          <div>CPI: {aiResult.inputs.macro?.cpi ?? '—'} • Unemployment: {aiResult.inputs.macro?.unemployment_rate ?? '—'} • Fed Funds: {aiResult.inputs.macro?.fed_funds_rate ?? '—'} • 10Y: {aiResult.inputs.macro?.treasury_10y ?? '—'}</div>
                          <div className="text-xs font-semibold text-gray-600 mt-2">News Sentiment</div>
                          <div>Avg: {aiResult.inputs.news_sentiment?.average_score ?? '—'} • Count: {aiResult.inputs.news_sentiment?.count ?? 0} • +{aiResult.inputs.news_sentiment?.positive ?? 0} / -{aiResult.inputs.news_sentiment?.negative ?? 0} / ={aiResult.inputs.news_sentiment?.neutral ?? 0}</div>
                        </div>
                      </div>
                    </div>
                  ) : null}
                  {/* Math */}
                  {aiResult.full.math ? (
                    <div>
                      <div className="font-medium text-sm mb-1">Math</div>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-sm text-gray-700">
                        <div>Max Profit: {fmtCurrency(aiResult.full.math.max_profit)}</div>
                        <div>Max Loss: {fmtCurrency(aiResult.full.math.max_loss)}</div>
                        <div>RR: {rrFrom(aiResult.full.math)}</div>
                        <div>
                          Breakevens: {
                            Array.isArray(aiResult.full.math.breakevens)
                              ? aiResult.full.math.breakevens
                                  .map((b: any) => (isFinite(Number(b)) ? fmtCurrency(b) : String(b)))
                                  .join(', ')
                              : '—'
                          }
                        </div>
                        <div>Collateral: {fmtCurrency(aiResult.full.math.collateral_required)}</div>
                        <div>PoP: {fmtPercent(aiResult.full.math.pop_proxy)} • PoL: {fmtPercent(aiResult.full.math.pol_proxy)}</div>
                      </div>
                    </div>
                  ) : null}

                  {/* Market Context */}
                  {aiResult.full.market_context ? (
                    <div>
                      <div className="font-medium text-sm mb-1">Market Context</div>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-sm text-gray-700">
                        <div>DTE: {aiResult.full.market_context.dte ?? '—'}</div>
                        <div>IV: {aiResult.full.market_context.iv ?? '—'}</div>
                        <div>IV Rank: {aiResult.full.market_context.iv_rank ?? '—'}</div>
                        <div>Earnings in days: {aiResult.full.market_context.earnings_in_days ?? '—'}</div>
                        <div>Ex-div in days: {aiResult.full.market_context.ex_div_in_days ?? '—'}</div>
                        <div>Volatility: {aiResult.full.market_context.volatility_flag ?? '—'}</div>
                      </div>
                    </div>
                  ) : null}

                  {/* Liquidity */}
                  {aiResult.full.liquidity ? (
                    <div>
                      <div className="font-medium text-sm mb-1">Liquidity</div>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-sm text-gray-700">
                        <div>Bid-Ask ($): {aiResult.full.liquidity.bid_ask_abs ?? '—'}</div>
                        <div>Bid-Ask (%): {aiResult.full.liquidity.bid_ask_pct ?? '—'}</div>
                        <div>Open Interest (total): {aiResult.full.liquidity.open_interest_total ?? '—'}</div>
                        <div>Execution Risk: {aiResult.full.liquidity.execution_risk ?? '—'}</div>
                      </div>
                    </div>
                  ) : null}

                  {/* Fit */}
                  {aiResult.full.fit ? (
                    <div>
                      <div className="font-medium text-sm mb-1">Fit</div>
                      <div className="text-sm text-gray-700 space-y-1">
                        <div>Strategy: {aiResult.full.fit.strategy ?? '—'}</div>
                        {aiResult.full.fit.strategy_fit_notes && (
                          <div>Notes: {aiResult.full.fit.strategy_fit_notes}</div>
                        )}
                        {aiResult.full.fit.ips_alignment && (
                          <div>
                            <div>IPS Alignment: {aiResult.full.fit.ips_alignment.overall_alignment ?? '—'}</div>
                            <div className="text-xs text-gray-600">Matched: {(aiResult.full.fit.ips_alignment.matched_factors || []).join(', ')}</div>
                            <div className="text-xs text-gray-600">Missed: {(aiResult.full.fit.ips_alignment.missed_factors || []).join(', ')}</div>
                          </div>
                        )}
                        {aiResult.full.fit.sizing_check && (
                          <div>
                            <div>Account Risk %: {aiResult.full.fit.sizing_check.account_risk_pct ?? '—'}</div>
                            <div>Within Budget: {String(aiResult.full.fit.sizing_check.within_budget ?? '—')}</div>
                          </div>
                        )}
                      </div>
                    </div>
                  ) : null}

                  {/* Plan */}
                  {aiResult.full.plan ? (
                    <div>
                      <div className="font-medium text-sm mb-1">Plan</div>
                      <div className="text-sm text-gray-700 space-y-1">
                        {aiResult.full.plan.entry_notes && <div>Entry: {aiResult.full.plan.entry_notes}</div>}
                        {Array.isArray(aiResult.full.plan.monitoring_triggers) && aiResult.full.plan.monitoring_triggers.length > 0 && (
                          <div>
                            <div className="text-xs font-medium">Monitoring Triggers</div>
                            <ul className="list-disc list-inside text-xs">
                              {aiResult.full.plan.monitoring_triggers.map((m: any, idx: number) => (
                                <li key={idx}>{String(m)}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                        {aiResult.full.plan.exit_plan && (
                          <div className="text-xs">
                            <div>Exit Plan: profit {aiResult.full.plan.exit_plan.profit_target_pct ?? '—'}%, max-loss cut {aiResult.full.plan.exit_plan.max_loss_cut_pct_of_max ?? '—'}%, time-exit {aiResult.full.plan.exit_plan.time_exit_if_no_signal_days ?? '—'} days</div>
                            <div>Roll: {aiResult.full.plan.exit_plan.roll_rules ?? '—'}</div>
                          </div>
                        )}
                        {Array.isArray(aiResult.full.plan.adjustments) && aiResult.full.plan.adjustments.length > 0 && (
                          <div>
                            <div className="text-xs font-medium">Adjustments</div>
                            <ul className="list-disc list-inside text-xs">
                              {aiResult.full.plan.adjustments.map((m: any, idx: number) => (
                                <li key={idx}>{String(m)}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    </div>
                  ) : null}

                  {/* Required Inputs (if INCOMPLETE) */}
                  {aiResult.status === 'INCOMPLETE' && Array.isArray(aiResult.full.required_inputs) && aiResult.full.required_inputs.length > 0 ? (
                    <div>
                      <div className="font-medium text-sm mb-1 text-red-600">Missing Inputs</div>
                      <ul className="list-disc list-inside text-sm text-red-700">
                        {aiResult.full.required_inputs.map((r: any, idx: number) => (
                          <li key={idx}>{String(r)}</li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
          ) : (
            <div className="text-sm text-gray-600">No analysis yet. Click "Run A.I. Analysis" to generate.</div>
          )}
        </CardContent>
      </Card>

      <div className="flex items-center justify-between pt-2">
        <div className="text-sm text-gray-600">{saveMsg}</div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => router.push("/trades")}>Cancel</Button>
          <Button variant="outline" onClick={() => router.push("/trades")}>Enter New Trade</Button>
          <Button variant="outline" onClick={handleRunAIAnalysis} disabled={aiLoading}>
            {aiLoading ? "Analyzing…" : "Run A.I. Analysis"}
          </Button>
          <Button onClick={handleAddProspective} disabled={saving} className="bg-blue-600 hover:bg-blue-700 text-white">
            {saving ? "Placing…" : "Place on Prospective List"}
          </Button>
        </div>
      </div>
    </div>
  );
}
