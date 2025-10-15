"use client";

import React from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Flame,
  Star,
  Award,
  TrendingUp,
  Shield,
  AlertTriangle,
  Eye,
  ChevronRight
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface TradeBarCompactProps {
  score: number; // IPS compliance %
  symbol: string;
  strategy: string;
  shortStrike: number;
  longStrike: number;
  dte: number; // Days to expiration
  entryPrice?: number;
  contractType: 'PUT' | 'CALL';
  onViewDetails: () => void;
  className?: string;
  intelligenceAdjustments?: string;
}

/**
 * Get gamification tier styling based on score
 */
function getScoreTier(score: number) {
  if (score >= 95) {
    return {
      name: 'PERFECT',
      gradient: 'from-orange-500 via-red-500 to-orange-600',
      icon: Flame,
      glow: 'shadow-[0_0_15px_rgba(251,146,60,0.3)]',
      animation: 'animate-pulse',
      textColor: 'text-orange-100',
      borderGlow: 'ring-2 ring-orange-400'
    };
  }

  if (score >= 90) {
    return {
      name: 'ELITE',
      gradient: 'from-purple-500 via-pink-500 to-purple-600',
      icon: Star,
      glow: 'shadow-[0_0_12px_rgba(168,85,247,0.3)]',
      animation: '',
      textColor: 'text-purple-100',
      borderGlow: 'ring-2 ring-purple-400'
    };
  }

  if (score >= 80) {
    return {
      name: 'HIGH',
      gradient: 'from-blue-500 via-cyan-500 to-blue-600',
      icon: Award,
      glow: 'shadow-[0_0_10px_rgba(59,130,246,0.2)]',
      animation: '',
      textColor: 'text-blue-100',
      borderGlow: 'ring-1 ring-blue-400'
    };
  }

  if (score >= 70) {
    return {
      name: 'GOOD',
      gradient: 'from-green-500 via-emerald-500 to-green-600',
      icon: TrendingUp,
      glow: 'shadow-md',
      animation: '',
      textColor: 'text-green-100',
      borderGlow: 'ring-1 ring-green-400'
    };
  }

  if (score >= 60) {
    return {
      name: 'OK',
      gradient: 'from-yellow-500 via-orange-400 to-yellow-600',
      icon: Shield,
      glow: 'shadow-sm',
      animation: '',
      textColor: 'text-yellow-100',
      borderGlow: 'ring-1 ring-yellow-400'
    };
  }

  return {
    name: 'REVIEW',
    gradient: 'from-orange-600 via-red-600 to-orange-700',
    icon: AlertTriangle,
    glow: '',
    animation: '',
    textColor: 'text-orange-100',
    borderGlow: 'ring-1 ring-orange-500 ring-dashed'
  };
}

/**
 * Compact horizontal bar for trade recommendations
 * Takes up minimal vertical space while maintaining visual appeal
 */
export function TradeBarCompact({
  score,
  symbol,
  strategy,
  shortStrike,
  longStrike,
  dte,
  entryPrice,
  contractType,
  onViewDetails,
  className,
  intelligenceAdjustments
}: TradeBarCompactProps) {
  const tier = getScoreTier(score);
  const Icon = tier.icon;

  // Format strategy name
  const strategyName = strategy.replace(/_/g, ' ').replace('CREDIT SPREAD', 'CS');

  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-lg transition-all duration-200 hover:scale-[1.01] cursor-pointer group',
        tier.glow,
        tier.borderGlow,
        tier.animation,
        className
      )}
      onClick={onViewDetails}
    >
      {/* Gradient background */}
      <div className={cn(
        'absolute inset-0 bg-gradient-to-r opacity-90',
        tier.gradient
      )} />

      {/* Content - Single row flex layout */}
      <div className="relative z-10 px-4 py-3 flex items-center justify-between gap-4">
        {/* Left: Icon, Symbol, Strategy */}
        <div className="flex items-center gap-3 min-w-[140px]">
          <Icon className={cn('w-5 h-5 flex-shrink-0', tier.textColor)} />
          <div>
            <h3 className={cn('text-lg font-bold leading-tight', tier.textColor)}>
              {symbol}
            </h3>
            <p className={cn('text-[10px] font-medium opacity-90 leading-tight', tier.textColor)}>
              {strategyName}
            </p>
          </div>
        </div>

        {/* Middle: Trade Details */}
        <div className="flex items-center gap-6 flex-1">
          {/* Strikes */}
          <div className={cn('text-xs', tier.textColor)}>
            <div className="font-semibold whitespace-nowrap">
              ${shortStrike} / ${longStrike}
            </div>
            <div className="text-[10px] opacity-75">
              Short / Long
            </div>
          </div>

          {/* DTE */}
          <div className={cn('text-xs', tier.textColor)}>
            <div className="font-semibold">
              {dte}d
            </div>
            <div className="text-[10px] opacity-75">
              DTE
            </div>
          </div>

          {/* Entry Price */}
          {entryPrice !== undefined && (
            <div className={cn('text-xs', tier.textColor)}>
              <div className="font-semibold">
                ${entryPrice.toFixed(2)}
              </div>
              <div className="text-[10px] opacity-75">
                Credit
              </div>
            </div>
          )}

          {/* Intelligence Badge */}
          {intelligenceAdjustments && intelligenceAdjustments !== 'none' && (
            <div className={cn(
              'text-[9px] font-medium px-2 py-0.5 rounded whitespace-nowrap',
              'bg-white/15 backdrop-blur-sm border border-white/20',
              tier.textColor
            )}>
              🤖 {intelligenceAdjustments}
            </div>
          )}
        </div>

        {/* Right: Score & Tier Badge */}
        <div className="flex items-center gap-3">
          <div className="text-right">
            <div className={cn(
              'text-2xl font-black tracking-tight leading-none',
              tier.textColor
            )}>
              {score.toFixed(0)}%
            </div>
            <Badge
              variant="secondary"
              className={cn(
                'text-[9px] font-bold px-1.5 py-0 mt-1',
                'bg-white/20 backdrop-blur-sm border-white/30',
                tier.textColor
              )}
            >
              {tier.name}
            </Badge>
          </div>

          {/* View button */}
          <Button
            variant="ghost"
            size="icon"
            className={cn(
              'h-9 w-9 flex-shrink-0',
              'bg-white/10 hover:bg-white/25 backdrop-blur-sm',
              'border border-white/20 transition-all',
              tier.textColor,
              'group-hover:bg-white/30'
            )}
            onClick={(e) => {
              e.stopPropagation();
              onViewDetails();
            }}
          >
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Shimmer effect on hover */}
      <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none">
        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent translate-x-[-200%] group-hover:translate-x-[200%] transition-transform duration-1000" />
      </div>
    </div>
  );
}
