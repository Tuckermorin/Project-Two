import React from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Flame,
  Star,
  Award,
  TrendingUp,
  Shield,
  AlertTriangle
} from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

interface ScoreTier {
  name: string;
  className: string;
  animationClass: string;
  IconComponent: React.ComponentType<{ className?: string }>;
  message: string;
  borderClass: string;
  textClass: string;
}

interface AITradeScoreButtonProps {
  score: number;
  tradeName: string;
  symbol: string;
  strategy: string;
  onClick: () => void;
  ipsFactors?: {
    passed: string[];
    failed: string[];
    scores: Record<string, number>;
  };
  disabled?: boolean;
  className?: string;
}

function getScoreTier(score: number): ScoreTier {
  if (score >= 95) {
    return {
      name: 'Perfect Match',
      className: 'bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600',
      animationClass: 'fire-effect',
      IconComponent: Flame,
      message: 'Exceptional IPS alignment!',
      borderClass: 'border-2 border-orange-400',
      textClass: 'text-white'
    };
  }

  if (score >= 90) {
    return {
      name: 'Elite Quality',
      className: 'bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600',
      animationClass: 'shimmer-effect',
      IconComponent: Star,
      message: 'Elite opportunity',
      borderClass: 'border-2 border-purple-400',
      textClass: 'text-white'
    };
  }

  if (score >= 80) {
    return {
      name: 'High Quality',
      className: 'bg-gradient-to-r from-blue-500 to-cyan-500 hover:from-blue-600 hover:to-cyan-600',
      animationClass: 'glow-pulse',
      IconComponent: Award,
      message: 'High-quality match',
      borderClass: 'border-2 border-blue-400',
      textClass: 'text-white'
    };
  }

  if (score >= 70) {
    return {
      name: 'Good Quality',
      className: 'bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-600 hover:to-emerald-600',
      animationClass: 'subtle-glow',
      IconComponent: TrendingUp,
      message: 'Solid trade',
      borderClass: 'border border-green-400',
      textClass: 'text-white'
    };
  }

  if (score >= 60) {
    return {
      name: 'Acceptable',
      className: 'bg-gradient-to-r from-yellow-500 to-orange-500 hover:from-yellow-600 hover:to-orange-600',
      animationClass: 'standard',
      IconComponent: Shield,
      message: 'Meets baseline criteria',
      borderClass: 'border border-yellow-400',
      textClass: 'text-white'
    };
  }

  return {
    name: 'Review Needed',
    className: 'bg-gradient-to-r from-orange-600 to-red-600 opacity-80',
    animationClass: 'warning-state',
    IconComponent: AlertTriangle,
    message: 'Manual review recommended',
    borderClass: 'border border-orange-500 border-dashed',
    textClass: 'text-white'
  };
}

export function AITradeScoreButton({
  score,
  tradeName,
  symbol,
  strategy,
  onClick,
  ipsFactors,
  disabled = false,
  className = ''
}: AITradeScoreButtonProps) {
  const tier = getScoreTier(score);
  const { IconComponent } = tier;

  return (
    <div className={`space-y-2 ${className}`}>
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              onClick={onClick}
              disabled={disabled}
              className={`
                ${tier.className}
                ${tier.animationClass}
                ${tier.borderClass}
                ${tier.textClass}
                w-full py-6 relative overflow-hidden
                transition-all duration-300
                disabled:opacity-50 disabled:cursor-not-allowed
                motion-reduce:transition-none motion-reduce:animation-none
              `}
            >
              <span className="relative z-10 flex items-center justify-between w-full">
                <span className="flex items-center gap-3">
                  <IconComponent className="w-5 h-5" />
                  <div className="text-left">
                    <div className="font-bold text-lg">{symbol} {tradeName}</div>
                    <div className="text-sm opacity-90">{strategy}</div>
                  </div>
                </span>
                <Badge
                  variant="secondary"
                  className="text-lg font-bold bg-white/20 text-white"
                >
                  {score}%
                </Badge>
              </span>
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top" className="max-w-xs">
            <div className="space-y-2">
              <p className="font-semibold">{tier.name}</p>
              <p className="text-sm">{tier.message}</p>
              {ipsFactors && (
                <>
                  <div className="text-xs pt-2 border-t">
                    <p className="font-semibold mb-1">IPS Factors:</p>
                    {ipsFactors.passed.length > 0 && (
                      <div className="text-green-400">
                        ✓ {ipsFactors.passed.join(', ')}
                      </div>
                    )}
                    {ipsFactors.failed.length > 0 && (
                      <div className="text-red-400 mt-1">
                        ✗ {ipsFactors.failed.join(', ')}
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>

      <p className="text-sm text-muted-foreground text-center">
        {tier.message}
      </p>
    </div>
  );
}
