"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, TrendingDown, BarChart3, AlertTriangle } from "lucide-react";

type TierPerformance = {
  tier: string;
  ips_range: string;
  total_trades: number;
  closed_trades: number;
  wins: number;
  losses: number;
  win_rate: number | null;
  avg_pnl: number | null;
};

type FactorEffectiveness = {
  factor_key: string;
  pass_win_rate: number | null;
  fail_win_rate: number | null;
  predictive_power: number | null;
  sample_size: number;
};

type RecentTrade = {
  id: string;
  symbol: string;
  tier: string;
  ips_score: number;
  status: string;
  realized_pnl: number | null;
  created_at: string;
};

type AnalysisData = {
  tier_performance: TierPerformance[];
  factor_effectiveness: FactorEffectiveness[];
  recent_trades: RecentTrade[];
  summary: {
    total_analyzed: number;
    total_closed: number;
    overall_win_rate: number | null;
  };
};

export default function IPSPerformancePage() {
  const [data, setData] = useState<AnalysisData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchAnalysis() {
      try {
        setLoading(true);
        const res = await fetch('/api/trades/ips-analysis');
        const json = await res.json();

        if (!res.ok) {
          throw new Error(json.error || 'Failed to load IPS analysis');
        }

        setData(json.data);
      } catch (e: any) {
        console.error('Error fetching IPS analysis:', e);
        setError(e.message);
      } finally {
        setLoading(false);
      }
    }

    fetchAnalysis();
  }, []);

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto p-6">
        <div className="text-center py-12">
          <div className="text-gray-600">Loading IPS performance analysis...</div>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="max-w-7xl mx-auto p-6">
        <Card className="border-red-200 bg-red-50">
          <CardContent className="p-6">
            <div className="flex items-center gap-2 text-red-700">
              <AlertTriangle className="h-5 w-5" />
              <span>Error: {error || 'Failed to load data'}</span>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold">IPS Performance Analysis</h1>
        <p className="text-gray-600 mt-1">
          Track how well IPS scores predict actual trade outcomes
        </p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="text-sm text-gray-600">Total Trades Analyzed</div>
            <div className="text-3xl font-bold mt-1">{data.summary.total_analyzed}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-sm text-gray-600">Closed Trades</div>
            <div className="text-3xl font-bold mt-1">{data.summary.total_closed}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-sm text-gray-600">Overall Win Rate</div>
            <div className="text-3xl font-bold mt-1">
              {data.summary.overall_win_rate !== null
                ? `${data.summary.overall_win_rate.toFixed(1)}%`
                : 'N/A'}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tier Performance */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5" />
            Win Rate by IPS Tier
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {data.tier_performance.map((tier) => {
              const tierConfig = {
                elite: { label: 'Elite', color: 'bg-green-500', textColor: 'text-green-700' },
                quality: { label: 'Quality', color: 'bg-blue-500', textColor: 'text-blue-700' },
                speculative: { label: 'Speculative', color: 'bg-orange-500', textColor: 'text-orange-700' },
                below_threshold: { label: 'Below Threshold', color: 'bg-gray-500', textColor: 'text-gray-700' },
              };

              const config = tierConfig[tier.tier as keyof typeof tierConfig] || tierConfig.below_threshold;

              return (
                <div key={tier.tier} className="border rounded-lg p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <Badge className={`${config.color} text-white`}>
                        {config.label}
                      </Badge>
                      <span className="text-sm text-gray-600">IPS {tier.ips_range}</span>
                    </div>
                    <div className="text-sm text-gray-600">
                      {tier.total_trades} total ({tier.closed_trades} closed)
                    </div>
                  </div>

                  <div className="grid grid-cols-4 gap-4 text-sm">
                    <div>
                      <div className="text-gray-600">Win Rate</div>
                      <div className={`text-2xl font-bold ${config.textColor}`}>
                        {tier.win_rate !== null ? `${tier.win_rate.toFixed(1)}%` : 'N/A'}
                      </div>
                    </div>
                    <div>
                      <div className="text-gray-600">Wins</div>
                      <div className="text-2xl font-bold text-green-600">{tier.wins}</div>
                    </div>
                    <div>
                      <div className="text-gray-600">Losses</div>
                      <div className="text-2xl font-bold text-red-600">{tier.losses}</div>
                    </div>
                    <div>
                      <div className="text-gray-600">Avg P/L</div>
                      <div className={`text-2xl font-bold ${tier.avg_pnl !== null && tier.avg_pnl > 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {tier.avg_pnl !== null ? `$${tier.avg_pnl.toFixed(2)}` : 'N/A'}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Factor Effectiveness */}
      <Card>
        <CardHeader>
          <CardTitle>Factor Predictive Power</CardTitle>
          <p className="text-sm text-gray-600 mt-1">
            Which IPS factors best predict successful trades?
          </p>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {data.factor_effectiveness.slice(0, 10).map((factor) => {
              const power = factor.predictive_power || 0;
              const isPositive = power > 0;

              return (
                <div key={factor.factor_key} className="flex items-center justify-between p-3 bg-gray-50 rounded">
                  <div className="flex-1">
                    <div className="font-medium">{factor.factor_key}</div>
                    <div className="text-xs text-gray-500">
                      Sample size: {factor.sample_size} trades
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <div className="text-sm text-gray-600">Pass Win Rate</div>
                      <div className="font-bold">
                        {factor.pass_win_rate !== null ? `${factor.pass_win_rate.toFixed(1)}%` : 'N/A'}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm text-gray-600">Fail Win Rate</div>
                      <div className="font-bold">
                        {factor.fail_win_rate !== null ? `${factor.fail_win_rate.toFixed(1)}%` : 'N/A'}
                      </div>
                    </div>
                    <div className="text-right min-w-[120px]">
                      <div className="text-sm text-gray-600">Predictive Power</div>
                      <div className={`font-bold flex items-center gap-1 justify-end ${isPositive ? 'text-green-600' : 'text-red-600'}`}>
                        {isPositive ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
                        {Math.abs(power).toFixed(1)}%
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          {data.factor_effectiveness.length === 0 && (
            <div className="text-center py-6 text-gray-500">
              Not enough closed trades to analyze factor effectiveness yet.
            </div>
          )}
        </CardContent>
      </Card>

      {/* Recent Trades */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Trade Performance</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-gray-600 border-b">
                <tr>
                  <th className="py-2 pr-4">Symbol</th>
                  <th className="py-2 pr-4">Tier</th>
                  <th className="py-2 pr-4">IPS Score</th>
                  <th className="py-2 pr-4">Status</th>
                  <th className="py-2 pr-4">P/L</th>
                  <th className="py-2 pr-4">Date</th>
                </tr>
              </thead>
              <tbody>
                {data.recent_trades.map((trade) => {
                  const tierConfig = {
                    elite: { label: 'Elite', color: 'bg-green-500 text-white' },
                    quality: { label: 'Quality', color: 'bg-blue-500 text-white' },
                    speculative: { label: 'Spec', color: 'bg-orange-500 text-white' },
                  };
                  const tierInfo = trade.tier ? tierConfig[trade.tier as keyof typeof tierConfig] : null;

                  return (
                    <tr key={trade.id} className="border-b hover:bg-gray-50">
                      <td className="py-2 pr-4 font-medium">{trade.symbol}</td>
                      <td className="py-2 pr-4">
                        {tierInfo ? (
                          <Badge className={`${tierInfo.color} text-xs`}>
                            {tierInfo.label}
                          </Badge>
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                      </td>
                      <td className="py-2 pr-4">{Math.round(trade.ips_score)}</td>
                      <td className="py-2 pr-4">
                        <Badge className={
                          trade.status === 'closed' ? 'bg-gray-200 text-gray-700' :
                          trade.status === 'active' ? 'bg-blue-100 text-blue-700' :
                          'bg-yellow-100 text-yellow-700'
                        }>
                          {trade.status}
                        </Badge>
                      </td>
                      <td className="py-2 pr-4">
                        {trade.realized_pnl !== null ? (
                          <span className={trade.realized_pnl > 0 ? 'text-green-600 font-medium' : 'text-red-600 font-medium'}>
                            ${trade.realized_pnl.toFixed(2)}
                          </span>
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                      </td>
                      <td className="py-2 pr-4 text-gray-600">
                        {new Date(trade.created_at).toLocaleDateString()}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {data.recent_trades.length === 0 && (
            <div className="text-center py-6 text-gray-500">
              No recent trades to display.
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
