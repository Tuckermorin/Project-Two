"use client";

import React from 'react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { Info } from 'lucide-react';

interface IPSFactorTooltipProps {
  factor: string;
  score?: number;
  passed: boolean;
  description?: string;
}

/**
 * Educational descriptions for common IPS factors
 * Helps users understand what each factor means
 */
const FACTOR_DESCRIPTIONS: Record<string, string> = {
  'delta': 'Measures the rate of change in option price relative to underlying stock price. Lower delta means less directional risk.',
  'delta_max': 'Maximum acceptable delta (directional exposure) for the trade. Lower values indicate more conservative positioning.',
  'iv_rank': 'Percentile rank of current implied volatility vs. historical range (0-100%). Higher IV Rank means better premium collection opportunities.',
  'theta': 'Time decay - how much option value decreases per day as expiration approaches. Higher theta means faster profit realization for sellers.',
  'dte': 'Days to expiration - time remaining until options contract expires. Affects time decay rate and probability calculations.',
  'risk_reward': 'Ratio of maximum profit potential to maximum loss. Higher ratios indicate more favorable setups.',
  'liquidity': 'Ease of entering/exiting position based on trading volume and bid-ask spreads. Higher liquidity reduces slippage.',
  'probability_of_profit': 'Estimated likelihood (0-100%) of trade being profitable at expiration based on statistical models.',
  'pop': 'Probability of Profit - statistical chance this trade ends profitable at expiration.',
  'term_slope': 'Difference in implied volatility between near-term and longer-dated options. Positive slope can indicate favorable conditions.',
  'volume_oi_ratio': 'Trading volume relative to open interest. Higher ratios suggest active trading and better liquidity.',
  'put_skew': 'Difference in implied volatility between puts and calls. Can indicate market sentiment and tail risk pricing.',
  'vega': 'Sensitivity to changes in implied volatility. Important for understanding how volatility moves affect position value.',
  'gamma': 'Rate of change in delta. Higher gamma means delta changes faster as stock price moves.',
  'earnings_risk': 'Whether the trade expires near an earnings announcement, which can cause large unexpected price moves.',
  'sector': 'Industry classification of the underlying stock. Used for portfolio diversification analysis.',
  'market_cap': 'Total market value of the company. Larger cap stocks typically have more liquidity and less volatility.',
  'beta': 'Correlation with broader market (SPY). Beta > 1 means more volatile than market, < 1 means less volatile.',
};

/**
 * Tooltip component that explains IPS factors to users
 * Educational, non-manipulative design
 */
export function IPSFactorTooltip({
  factor,
  score,
  passed,
  description
}: IPSFactorTooltipProps) {
  const factorDescription = description || FACTOR_DESCRIPTIONS[factor.toLowerCase()] || 'IPS factor criteria for trade evaluation.';

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className={`inline-flex items-center gap-1 text-xs cursor-help ${
            passed ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
          }`}>
            {passed ? '✓' : '✗'} {factor}
            <Info className="w-3 h-3" />
          </span>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs">
          <div className="space-y-2">
            <p className="font-semibold">{factor}</p>
            <p className="text-sm">{factorDescription}</p>
            {score !== undefined && (
              <p className="text-xs text-muted-foreground">
                Score: {score.toFixed(1)}% • {passed ? 'Passed ✓' : 'Failed ✗'}
              </p>
            )}
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
