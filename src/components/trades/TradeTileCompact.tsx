"use client";

import React from 'react';
import { Card } from '@/components/ui/card';
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
  Calendar,
  Target
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface TradeTileCompactProps {
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
      glow: 'shadow-[0_0_20px_rgba(251,146,60,0.5)]',
      animation: 'animate-pulse',
      textColor: 'text-orange-100',
      borderGlow: 'ring-2 ring-orange-400 ring-offset-2'
    };
  }

  if (score >= 90) {
    return {
      name: 'ELITE',
      gradient: 'from-purple-500 via-pink-500 to-purple-600',
      icon: Star,
      glow: 'shadow-[0_0_15px_rgba(168,85,247,0.4)]',
      animation: 'animate-pulse',
      textColor: 'text-purple-100',
      borderGlow: 'ring-2 ring-purple-400 ring-offset-2'
    };
  }

  if (score >= 80) {
    return {
      name: 'HIGH',
      gradient: 'from-blue-500 via-cyan-500 to-blue-600',
      icon: Award,
      glow: 'shadow-[0_0_12px_rgba(59,130,246,0.3)]',
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
 * Compact gamified trade tile - small, dense, and visually engaging
 */
export function TradeTileCompact({
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
}: TradeTileCompactProps) {
  const tier = getScoreTier(score);
  const Icon = tier.icon;

  // Format strategy name
  const strategyName = strategy.replace(/_/g, ' ').replace('CREDIT SPREAD', 'CS');

  return (
    <Card
      className={cn(
        'relative overflow-hidden transition-all duration-300 hover:scale-[1.02] cursor-pointer group',
        tier.glow,
        tier.borderGlow,
        tier.animation,
        className
      )}
      onClick={onViewDetails}
    >
      {/* Gradient background */}
      <div className={cn(
        'absolute inset-0 bg-gradient-to-br opacity-90',
        tier.gradient
      )} />

      {/* Content */}
      <div className="relative z-10 p-4 space-y-3">
        {/* Header: Symbol & Score */}
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2">
            <Icon className={cn('w-5 h-5', tier.textColor)} />
            <div>
              <h3 className={cn('text-xl font-bold', tier.textColor)}>
                {symbol}
              </h3>
              <p className={cn('text-xs font-medium opacity-90', tier.textColor)}>
                {strategyName}
              </p>
            </div>
          </div>

          {/* Score badge */}
          <div className="flex flex-col items-end gap-1">
            <div className={cn(
              'text-3xl font-black tracking-tight',
              tier.textColor
            )}>
              {score.toFixed(0)}%
            </div>
            <Badge
              variant="secondary"
              className={cn(
                'text-[10px] font-bold px-2 py-0.5',
                'bg-white/20 backdrop-blur-sm border-white/30',
                tier.textColor
              )}
            >
              {tier.name}
            </Badge>
          </div>
        </div>

        {/* Trade Details Grid */}
        <div className="grid grid-cols-2 gap-2 text-xs">
          {/* Short/Long Strikes */}
          <div className="flex items-center gap-1.5">
            <Target className={cn('w-3.5 h-3.5', tier.textColor)} />
            <div className={tier.textColor}>
              <div className="font-semibold">
                ${shortStrike} / ${longStrike}
              </div>
              <div className="text-[10px] opacity-75">
                Short / Long
              </div>
            </div>
          </div>

          {/* DTE */}
          <div className="flex items-center gap-1.5">
            <Calendar className={cn('w-3.5 h-3.5', tier.textColor)} />
            <div className={tier.textColor}>
              <div className="font-semibold">
                {dte} days
              </div>
              <div className="text-[10px] opacity-75">
                DTE
              </div>
            </div>
          </div>
        </div>

        {/* Intelligence Adjustments */}
        {intelligenceAdjustments && intelligenceAdjustments !== 'none' && (
          <div className={cn(
            'text-[10px] font-medium px-2 py-1 rounded',
            'bg-white/15 backdrop-blur-sm border border-white/20',
            tier.textColor
          )}>
            {intelligenceAdjustments}
          </div>
        )}

        {/* Entry Price (if available) */}
        {entryPrice !== undefined && (
          <div className={cn(
            'text-xs font-semibold pt-1 border-t border-white/20',
            tier.textColor
          )}>
            Entry: ${entryPrice.toFixed(2)}
          </div>
        )}

        {/* View Details Button */}
        <Button
          variant="secondary"
          size="sm"
          className={cn(
            'w-full text-xs font-semibold',
            'bg-white/20 hover:bg-white/30 backdrop-blur-sm',
            'border border-white/30 transition-all',
            tier.textColor,
            'group-hover:bg-white/40'
          )}
          onClick={(e) => {
            e.stopPropagation();
            onViewDetails();
          }}
        >
          <Eye className="w-3 h-3 mr-1.5" />
          View Details
        </Button>
      </div>

      {/* Corner accent */}
      <div className={cn(
        'absolute top-0 right-0 w-20 h-20',
        'bg-gradient-to-br from-white/10 to-transparent',
        'rounded-bl-full'
      )} />
    </Card>
  );
}
