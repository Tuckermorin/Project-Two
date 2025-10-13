"use client";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckCircle2, AlertCircle, XCircle, ChevronDown, ChevronUp } from "lucide-react";
import { useState } from "react";

type FactorDetail = {
  factor_key: string;
  factor_name: string;
  value: number | null;
  target: string;
  passed: boolean;
  weight: number;
  distance: number;
  severity: 'pass' | 'minor_miss' | 'major_miss';
};

type IPSFactorDetails = {
  ips_score: number;
  tier: 'elite' | 'quality' | 'speculative' | null;
  factor_details: FactorDetail[];
  passed_factors: FactorDetail[];
  minor_misses: FactorDetail[];
  major_misses: FactorDetail[];
  total_weight_passed: number;
  total_weight_minor: number;
  total_weight_major: number;
};

interface FactorScorecardProps {
  ipsFactorDetails: IPSFactorDetails;
  compact?: boolean;
}

export function FactorScorecard({ ipsFactorDetails, compact = false }: FactorScorecardProps) {
  const [expanded, setExpanded] = useState(!compact);

  const { ips_score, tier, passed_factors, minor_misses, major_misses, total_weight_passed, total_weight_minor, total_weight_major } = ipsFactorDetails;

  // Tier badge styling
  const tierConfig = {
    elite: { label: 'Elite', color: 'bg-green-500 text-white', description: 'IPS ≥90%' },
    quality: { label: 'Quality', color: 'bg-blue-500 text-white', description: 'IPS 75-89%' },
    speculative: { label: 'Speculative', color: 'bg-orange-500 text-white', description: 'IPS 60-74%' },
  };

  const tierInfo = tier ? tierConfig[tier] : null;

  return (
    <Card className="border-l-4" style={{ borderLeftColor: tier === 'elite' ? '#10b981' : tier === 'quality' ? '#3b82f6' : '#f97316' }}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <CardTitle className="text-lg">IPS Factor Analysis</CardTitle>
            {tierInfo && (
              <Badge className={tierInfo.color}>
                {tierInfo.label}
              </Badge>
            )}
            <span className="text-sm text-gray-500">
              Score: {ips_score.toFixed(1)}/100
            </span>
          </div>
          <button
            onClick={() => setExpanded(!expanded)}
            className="text-gray-500 hover:text-gray-700"
          >
            {expanded ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
          </button>
        </div>
      </CardHeader>

      {expanded && (
        <CardContent className="space-y-4">
          {/* Summary Stats */}
          <div className="grid grid-cols-3 gap-4 pb-3 border-b">
            <div className="text-center">
              <div className="text-2xl font-bold text-green-600">{passed_factors.length}</div>
              <div className="text-xs text-gray-500">Passed ({(total_weight_passed * 100).toFixed(0)}% weight)</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-yellow-600">{minor_misses.length}</div>
              <div className="text-xs text-gray-500">Minor Miss ({(total_weight_minor * 100).toFixed(0)}% weight)</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-red-600">{major_misses.length}</div>
              <div className="text-xs text-gray-500">Major Miss ({(total_weight_major * 100).toFixed(0)}% weight)</div>
            </div>
          </div>

          {/* Passed Factors */}
          {passed_factors.length > 0 && (
            <div>
              <h4 className="flex items-center gap-2 font-semibold text-green-700 mb-2">
                <CheckCircle2 className="h-4 w-4" />
                Passed Factors
              </h4>
              <div className="space-y-1">
                {passed_factors.map((factor) => (
                  <FactorRow key={factor.factor_key} factor={factor} type="pass" />
                ))}
              </div>
            </div>
          )}

          {/* Minor Misses */}
          {minor_misses.length > 0 && (
            <div>
              <h4 className="flex items-center gap-2 font-semibold text-yellow-700 mb-2">
                <AlertCircle className="h-4 w-4" />
                Minor Misses (Close to Target)
              </h4>
              <div className="space-y-1">
                {minor_misses.map((factor) => (
                  <FactorRow key={factor.factor_key} factor={factor} type="minor" />
                ))}
              </div>
            </div>
          )}

          {/* Major Misses */}
          {major_misses.length > 0 && (
            <div>
              <h4 className="flex items-center gap-2 font-semibold text-red-700 mb-2">
                <XCircle className="h-4 w-4" />
                Major Misses
              </h4>
              <div className="space-y-1">
                {major_misses.map((factor) => (
                  <FactorRow key={factor.factor_key} factor={factor} type="major" />
                ))}
              </div>
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
}

function FactorRow({ factor, type }: { factor: FactorDetail; type: 'pass' | 'minor' | 'major' }) {
  const iconColor = type === 'pass' ? 'text-green-600 dark:text-green-400' : type === 'minor' ? 'text-yellow-600 dark:text-yellow-400' : 'text-red-600 dark:text-red-400';
  const Icon = type === 'pass' ? CheckCircle2 : type === 'minor' ? AlertCircle : XCircle;

  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2">
        <Icon className={`h-4 w-4 ${iconColor}`} />
        <span className="text-sm">{factor.factor_name}</span>
        <span className="text-xs text-muted-foreground">
          (Weight: {(factor.weight * 100).toFixed(0)}%)
        </span>
      </div>
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span>
          {factor.value !== null ? factor.value.toFixed(2) : 'N/A'}
        </span>
        <span>→</span>
        <span>target: {factor.target}</span>
      </div>
    </div>
  );
}

// Compact version for table rows
export function FactorScorecardCompact({ ipsFactorDetails }: { ipsFactorDetails: IPSFactorDetails }) {
  const { ips_score, tier, passed_factors, minor_misses, major_misses } = ipsFactorDetails;

  const tierConfig = {
    elite: { label: 'Elite', color: 'bg-green-500 text-white' },
    quality: { label: 'Quality', color: 'bg-blue-500 text-white' },
    speculative: { label: 'Spec', color: 'bg-orange-500 text-white' },
  };

  const tierInfo = tier ? tierConfig[tier] : null;

  return (
    <div className="flex items-center gap-2">
      {tierInfo && (
        <Badge className={`${tierInfo.color} text-xs`}>
          {tierInfo.label}
        </Badge>
      )}
      <span className="text-sm font-medium">{ips_score.toFixed(0)}</span>
      <div className="flex gap-1 text-xs">
        <span className="text-green-600">✓{passed_factors.length}</span>
        {minor_misses.length > 0 && <span className="text-yellow-600">⚠{minor_misses.length}</span>}
        {major_misses.length > 0 && <span className="text-red-600">✗{major_misses.length}</span>}
      </div>
    </div>
  );
}
