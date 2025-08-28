"use client";

import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Plus } from "lucide-react";

type TradeRow = {
  id: string;
  name?: string | null;
  symbol: string;
  status: string;
  contract_type: string;
  expiration_date?: string | null;
  number_of_contracts?: number | null;
  short_strike?: number | null;
  long_strike?: number | null;
  credit_received?: number | null;
  max_gain?: number | null;
  max_loss?: number | null;
  ips_score?: number | null;
  created_at: string;
  ips_configurations?: { name?: string | null } | null;
};

function dte(exp?: string | null): number | null {
  if (!exp) return null;
  const now = new Date();
  const e = new Date(exp);
  const ms = e.getTime() - now.getTime();
  return Math.ceil(ms / (1000 * 60 * 60 * 24));
}

export default function ProspectiveTradesPage() {
  const [rows, setRows] = useState<TradeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("");

  const userId = "user-123"; // TODO wire auth

  async function fetchProspective() {
    try {
      setLoading(true);
      const res = await fetch(`/api/trades?userId=${encodeURIComponent(userId)}&status=prospective`, { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Failed to load trades");
      setRows(json?.data || []);
    } catch (e) {
      console.error(e);
      setRows([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { fetchProspective(); }, []);

  const filtered = useMemo(() => {
    if (!filter.trim()) return rows;
    const f = filter.trim().toLowerCase();
    return rows.filter((r) =>
      (r.symbol || "").toLowerCase().includes(f) ||
      (r.name || "").toLowerCase().includes(f) ||
      (r.contract_type || "").toLowerCase().includes(f)
    );
  }, [rows, filter]);

  const totals = useMemo(() => {
    const positions = filtered.length;
    const maxGain = filtered.reduce((s, r) => s + (r.max_gain || 0), 0);
    const avgScore = filtered.length ? (filtered.reduce((s, r) => s + (r.ips_score || 0), 0) / filtered.length) : 0;
    const expiring = filtered.filter((r) => (dte(r.expiration_date) ?? 999) <= 7).length;
    return { positions, maxGain, avgScore, expiring };
  }, [filtered]);

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Prospective Trades</h1>
          <p className="text-gray-600">Track your paper trading performance</p>
        </div>
        <Button onClick={() => (window.location.href = "/trades")}> 
          <Plus className="h-4 w-4 mr-2" /> Add New Trade
        </Button>
      </div>

      <Card>
        <CardContent className="p-4 flex items-center gap-3">
          <Input placeholder="Filter by symbol, name, or contract type…" value={filter} onChange={(e) => setFilter(e.target.value)} />
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        <Card><CardContent className="p-4 text-center"><div className="text-2xl font-bold">{totals.positions}</div><div className="text-sm text-gray-600">Total Positions</div></CardContent></Card>
        <Card><CardContent className="p-4 text-center"><div className="text-2xl font-bold text-green-600">${totals.maxGain.toFixed(2)}</div><div className="text-sm text-gray-600">Total Max Gain</div></CardContent></Card>
        <Card><CardContent className="p-4 text-center"><div className="text-2xl font-bold">{Math.round(totals.avgScore)}/100</div><div className="text-sm text-gray-600">Avg IPS Score</div></CardContent></Card>
        <Card><CardContent className="p-4 text-center"><div className="text-2xl font-bold text-orange-600">{totals.expiring}</div><div className="text-sm text-gray-600">Expiring ≤ 7d</div></CardContent></Card>
        <Card><CardContent className="p-4 text-center"><div className="text-2xl font-bold">Prospective</div><div className="text-sm text-gray-600">Status</div></CardContent></Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Current Trades</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="py-6 text-gray-600">Loading…</div>
          ) : filtered.length === 0 ? (
            <div className="py-6 text-gray-600">No prospective trades.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-gray-600">
                  <tr>
                    <th className="py-2 pr-4">Name</th>
                    <th className="py-2 pr-4">Exp. Date</th>
                    <th className="py-2 pr-4">DTE</th>
                    <th className="py-2 pr-4">Contract Type</th>
                    <th className="py-2 pr-4">Max Gain</th>
                    <th className="py-2 pr-4">Max Loss</th>
                    <th className="py-2 pr-4">IPS Score</th>
                    <th className="py-2 pr-4">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((r) => {
                    const d = dte(r.expiration_date);
                    return (
                      <tr key={r.id} className="border-t">
                        <td className="py-2 pr-4">
                          <div className="font-medium">{r.name || r.symbol}</div>
                          <div className="text-xs text-gray-500">{r.symbol} — {r.ips_configurations?.name || ""}</div>
                        </td>
                        <td className="py-2 pr-4">{r.expiration_date ? new Date(r.expiration_date).toLocaleDateString() : "—"}</td>
                        <td className={`py-2 pr-4 ${d != null && d <= 0 ? "text-red-600" : ""}`}>{d != null ? d : "—"}</td>
                        <td className="py-2 pr-4">{r.contract_type?.replace(/-/g, " ")}</td>
                        <td className="py-2 pr-4">{r.max_gain != null ? `$${r.max_gain.toFixed(2)}` : "—"}</td>
                        <td className="py-2 pr-4">{r.max_loss != null ? `$${r.max_loss.toFixed(2)}` : "—"}</td>
                        <td className="py-2 pr-4">{r.ips_score != null ? `${Math.round(r.ips_score)}/100` : "—"}</td>
                        <td className="py-2 pr-4">
                          <Badge className="bg-blue-50 text-blue-700">{r.status?.toUpperCase()}</Badge>
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

