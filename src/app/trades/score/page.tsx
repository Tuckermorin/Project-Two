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
  // AI analysis UI removed from this page

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

  // handleRunAIAnalysis removed

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

      {/* AI Analysis card removed per requirements */}

      <div className="flex items-center justify-between pt-2">
        <div className="text-sm text-gray-600">{saveMsg}</div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => router.push("/trades")}>Cancel</Button>
          <Button variant="outline" onClick={() => router.push("/trades")}>Enter New Trade</Button>
          {/* Run AI removed from this page */}
          <Button onClick={handleAddProspective} disabled={saving} className="bg-blue-600 hover:bg-blue-700 text-white">
            {saving ? "Placing…" : "Place on Prospective List"}
          </Button>
        </div>
      </div>
    </div>
  );
}
