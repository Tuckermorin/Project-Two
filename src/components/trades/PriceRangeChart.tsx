"use client";

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { TrendingUp, TrendingDown } from 'lucide-react';
import { cn } from '@/lib/utils';

interface PriceRangeChartProps {
  symbol: string;
  currentPrice: number;
  high52Week: number;
  low52Week: number;
  high52WeekDate: string;
  low52WeekDate: string;
}

export function PriceRangeChart({
  symbol,
  currentPrice,
  high52Week,
  low52Week,
  high52WeekDate,
  low52WeekDate
}: PriceRangeChartProps) {
  // Calculate position percentage (0-100)
  const range = high52Week - low52Week;
  const positionFromLow = currentPrice - low52Week;
  const positionPercentage = (positionFromLow / range) * 100;

  // Calculate distance from high and low
  const distanceFromHigh = ((high52Week - currentPrice) / high52Week) * 100;
  const distanceFromLow = ((currentPrice - low52Week) / low52Week) * 100;

  // Format dates
  const formatDate = (dateStr: string) => {
    try {
      const date = new Date(dateStr);
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    } catch {
      return dateStr;
    }
  };

  // Determine color based on position
  const getPositionColor = () => {
    if (positionPercentage > 80) return 'text-green-600 dark:text-green-400';
    if (positionPercentage > 60) return 'text-blue-600 dark:text-blue-400';
    if (positionPercentage > 40) return 'text-yellow-600 dark:text-yellow-400';
    if (positionPercentage > 20) return 'text-orange-600 dark:text-orange-400';
    return 'text-red-600 dark:text-red-400';
  };

  const getPositionLabel = () => {
    if (positionPercentage > 90) return 'Near 52W High';
    if (positionPercentage > 70) return 'Above Average';
    if (positionPercentage > 30) return 'Mid-Range';
    if (positionPercentage > 10) return 'Below Average';
    return 'Near 52W Low';
  };

  return (
    <Card className="border-purple-200 dark:border-purple-800">
      <CardHeader>
        <CardTitle className="flex items-center justify-between text-lg">
          <span className="flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-purple-600" />
            52-Week Price Range
          </span>
          <Badge variant="outline" className={cn("font-semibold", getPositionColor())}>
            {getPositionLabel()}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Price Stats */}
        <div className="grid grid-cols-3 gap-4">
          <div className="text-center">
            <p className="text-xs text-muted-foreground mb-1">52W Low</p>
            <p className="text-lg font-bold text-red-600">${low52Week.toFixed(2)}</p>
            <p className="text-[10px] text-muted-foreground mt-1">{formatDate(low52WeekDate)}</p>
          </div>
          <div className="text-center">
            <p className="text-xs text-muted-foreground mb-1">Current</p>
            <p className={cn("text-2xl font-bold", getPositionColor())}>
              ${currentPrice.toFixed(2)}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {positionPercentage.toFixed(1)}% of range
            </p>
          </div>
          <div className="text-center">
            <p className="text-xs text-muted-foreground mb-1">52W High</p>
            <p className="text-lg font-bold text-green-600">${high52Week.toFixed(2)}</p>
            <p className="text-[10px] text-muted-foreground mt-1">{formatDate(high52WeekDate)}</p>
          </div>
        </div>

        {/* Visual Range Bar */}
        <div className="space-y-3">
          <div className="relative h-12 bg-gradient-to-r from-red-100 via-yellow-100 to-green-100 dark:from-red-950/30 dark:via-yellow-950/30 dark:to-green-950/30 rounded-lg border border-gray-300 dark:border-gray-700">
            {/* Low marker */}
            <div className="absolute left-0 top-0 bottom-0 w-1 bg-red-600 rounded-l-lg" />
            <div className="absolute left-2 top-1/2 -translate-y-1/2 text-[10px] font-semibold text-red-700 dark:text-red-300">
              LOW
            </div>

            {/* High marker */}
            <div className="absolute right-0 top-0 bottom-0 w-1 bg-green-600 rounded-r-lg" />
            <div className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] font-semibold text-green-700 dark:text-green-300">
              HIGH
            </div>

            {/* Current price indicator */}
            <div
              className="absolute top-0 bottom-0 w-0.5 bg-blue-600 dark:bg-blue-400 shadow-lg"
              style={{ left: `${positionPercentage}%` }}
            >
              <div className="absolute -top-6 left-1/2 -translate-x-1/2 flex flex-col items-center">
                <TrendingUp className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                <div className="text-xs font-bold text-blue-600 dark:text-blue-400 whitespace-nowrap">
                  ${currentPrice.toFixed(2)}
                </div>
              </div>
            </div>
          </div>

          {/* Price change indicators */}
          <div className="grid grid-cols-2 gap-3">
            <div className="p-3 rounded-lg bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800">
              <div className="flex items-center gap-2">
                <TrendingDown className="w-4 h-4 text-red-600" />
                <div className="flex-1">
                  <p className="text-xs text-red-700 dark:text-red-300 font-semibold">From 52W Low</p>
                  <p className="text-lg font-bold text-red-600">+{distanceFromLow.toFixed(1)}%</p>
                </div>
              </div>
            </div>
            <div className="p-3 rounded-lg bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-800">
              <div className="flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-green-600" />
                <div className="flex-1">
                  <p className="text-xs text-green-700 dark:text-green-300 font-semibold">To 52W High</p>
                  <p className="text-lg font-bold text-green-600">{distanceFromHigh.toFixed(1)}%</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Analysis */}
        <div className="p-3 rounded-lg bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-800">
          <p className="text-xs font-semibold text-muted-foreground mb-2">Price Position Analysis</p>
          <p className="text-sm leading-relaxed">
            {positionPercentage > 80 ? (
              <>
                {symbol} is trading near its 52-week high at <strong>${currentPrice.toFixed(2)}</strong>.
                The stock has strong momentum but may face resistance. Consider this when evaluating put credit spreads.
              </>
            ) : positionPercentage > 60 ? (
              <>
                {symbol} is trading in the upper portion of its 52-week range at <strong>${currentPrice.toFixed(2)}</strong>.
                The stock has positive momentum with room to grow. Good positioning for put credit spreads.
              </>
            ) : positionPercentage > 40 ? (
              <>
                {symbol} is trading in the middle of its 52-week range at <strong>${currentPrice.toFixed(2)}</strong>.
                The stock has balanced positioning with potential movement in either direction.
              </>
            ) : positionPercentage > 20 ? (
              <>
                {symbol} is trading in the lower portion of its 52-week range at <strong>${currentPrice.toFixed(2)}</strong>.
                The stock may have support nearby but watch for further downside risk.
              </>
            ) : (
              <>
                {symbol} is trading near its 52-week low at <strong>${currentPrice.toFixed(2)}</strong>.
                Exercise caution - the stock may find support here or continue declining. Consider wider spreads for safety.
              </>
            )}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
