"use client";

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Flame,
  Star,
  Award,
  TrendingUp,
  Shield,
  AlertTriangle,
  ChevronRight,
  Info,
  Eye
} from 'lucide-react';
import { getIconColor, getScoreBackgroundColor } from '@/lib/utils/trade-scoring';

interface ScoreTier {
  name: string;
  className: string;
  animationClass: string;
  IconComponent: React.ComponentType<{ className?: string }>;
  message: string;
  borderClass: string;
  textClass: string;
}

interface AITradeScoreCardProps {
  score: number;
  symbol: string;
  strategy: string;
  contractType: string;
  entryPrice?: number;
  maxProfit?: number;
  maxLoss?: number;
  probabilityOfProfit?: number;
  ipsFactors?: {
    passed: string[];
    failed: string[];
    scores?: Record<string, number>;
  };
  rationale?: string;
  contractLegs?: Array<{
    type: 'BUY' | 'SELL';
    right: 'P' | 'C';
    strike: number;
    expiry: string;
  }>;
  onViewDetails: () => void;
  className?: string;
}

/**
 * Get the visual tier for a given score
 */
function getScoreTier(score: number): ScoreTier {
  if (score >= 95) {
    return {
      name: 'Perfect Match',
      className: 'bg-gradient-to-r from-orange-500 to-red-500',
      animationClass: 'fire-effect',
      IconComponent: Flame,
      message: '🔥 Exceptional IPS alignment! This trade perfectly matches your strategy.',
      borderClass: 'border-2 border-orange-400',
      textClass: 'text-white'
    };
  }

  if (score >= 90) {
    return {
      name: 'Elite Quality',
      className: 'bg-gradient-to-r from-purple-500 to-pink-500',
      animationClass: 'shimmer-effect',
      IconComponent: Star,
      message: '⭐ Elite opportunity with outstanding IPS fit.',
      borderClass: 'border-2 border-purple-400',
      textClass: 'text-white'
    };
  }

  if (score >= 80) {
    return {
      name: 'High Quality',
      className: 'bg-gradient-to-r from-blue-500 to-cyan-500',
      animationClass: 'glow-pulse',
      IconComponent: Award,
      message: '💎 High-quality trade with strong fundamentals.',
      borderClass: 'border-2 border-blue-400',
      textClass: 'text-white'
    };
  }

  if (score >= 70) {
    return {
      name: 'Good Quality',
      className: 'bg-gradient-to-r from-green-500 to-emerald-500',
      animationClass: 'subtle-glow',
      IconComponent: TrendingUp,
      message: '✓ Solid trade meeting your criteria.',
      borderClass: 'border border-green-400',
      textClass: 'text-white'
    };
  }

  if (score >= 60) {
    return {
      name: 'Acceptable',
      className: 'bg-gradient-to-r from-yellow-500 to-orange-500',
      animationClass: 'standard',
      IconComponent: Shield,
      message: '⚠️ Meets baseline criteria. Review IPS factors carefully.',
      borderClass: 'border border-yellow-400',
      textClass: 'text-white'
    };
  }

  return {
    name: 'Review Needed',
    className: 'bg-gradient-to-r from-orange-600 to-red-600',
    animationClass: 'warning-state',
    IconComponent: AlertTriangle,
    message: '⚠️ Marginal fit - manual review recommended. See why below.',
    borderClass: 'border border-orange-500 border-dashed',
    textClass: 'text-white'
  };
}

/**
 * Card component for displaying scored AI trade recommendations
 * Comprehensive view with metrics, IPS factors, and educational info
 */
export function AITradeScoreCard({
  score,
  symbol,
  strategy,
  contractType,
  entryPrice,
  maxProfit,
  maxLoss,
  probabilityOfProfit,
  ipsFactors,
  rationale,
  contractLegs,
  onViewDetails,
  className = ''
}: AITradeScoreCardProps) {
  const tier = getScoreTier(score);
  const { IconComponent } = tier;
  const iconColor = getIconColor(score);
  const scoreBackgroundColor = getScoreBackgroundColor(score);

  return (
    <Card className={`${tier.borderClass} hover:shadow-lg transition-shadow ${className}`}>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <CardTitle className="flex items-center gap-2 text-xl">
              <IconComponent className={`w-5 h-5 ${iconColor}`} />
              {symbol} - {strategy.replace(/_/g, ' ')}
            </CardTitle>
            <p className="text-sm text-muted-foreground">{contractType}</p>
          </div>
          <Badge
            className={`${tier.className} ${tier.textClass} text-lg font-bold px-3 py-1`}
          >
            {score.toFixed(0)}%
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Score Message */}
        <div className={`p-3 rounded-lg ${scoreBackgroundColor}`}>
          <p className="text-sm font-medium">{tier.message}</p>
        </div>

        {/* Trade Metrics */}
        <div className="grid grid-cols-2 gap-3 text-sm">
          {entryPrice !== undefined && (
            <div>
              <p className="text-muted-foreground">Entry Price</p>
              <p className="font-semibold">${entryPrice.toFixed(2)}</p>
            </div>
          )}
          {maxProfit !== undefined && (
            <div>
              <p className="text-muted-foreground">Max Profit</p>
              <p className="font-semibold text-green-600">${maxProfit.toFixed(2)}</p>
            </div>
          )}
          {maxLoss !== undefined && (
            <div>
              <p className="text-muted-foreground">Max Loss</p>
              <p className="font-semibold text-red-600">${Math.abs(maxLoss).toFixed(2)}</p>
            </div>
          )}
          {probabilityOfProfit !== undefined && (
            <div>
              <p className="text-muted-foreground">Probability</p>
              <p className="font-semibold">{probabilityOfProfit.toFixed(0)}%</p>
            </div>
          )}
        </div>

        {/* Contract Legs */}
        {contractLegs && contractLegs.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-semibold text-muted-foreground">Contract Structure</p>
            <div className="text-xs text-muted-foreground">
              {contractLegs.map((leg, i) => (
                <span key={i}>
                  {i > 0 && ' / '}
                  {leg.type} {leg.right === 'P' ? 'Put' : 'Call'} ${leg.strike}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* IPS Factors */}
        {ipsFactors && (ipsFactors.passed.length > 0 || ipsFactors.failed.length > 0) && (
          <div className="space-y-2">
            <p className="text-xs font-semibold text-muted-foreground flex items-center gap-1">
              <Info className="w-3 h-3" />
              IPS Factor Analysis
            </p>
            <div className="space-y-1 text-xs">
              {ipsFactors.passed.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {ipsFactors.passed.map((factor, idx) => (
                    <Badge key={idx} variant="outline" className="text-green-600 border-green-600">
                      ✓ {factor}
                    </Badge>
                  ))}
                </div>
              )}
              {ipsFactors.failed.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {ipsFactors.failed.map((factor, idx) => (
                    <Badge key={idx} variant="outline" className="text-red-600 border-red-600">
                      ✗ {factor}
                    </Badge>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* AI Rationale */}
        {rationale && (
          <div className="text-sm border-l-2 border-blue-500 pl-3 py-1 bg-blue-50 dark:bg-blue-950">
            <p className="text-muted-foreground">{rationale}</p>
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-2 pt-2">
          <Button
            onClick={onViewDetails}
            variant="outline"
            className="flex-1"
          >
            <Eye className="w-4 h-4 mr-1" />
            View Details
            <ChevronRight className="w-4 h-4 ml-1" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
