"use client";

import React from 'react';
import { Progress } from '@/components/ui/progress';
import { CheckCircle2, Circle, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface AgentProgressBarProps {
  currentStep: number;
  totalSteps: number;
  currentStepLabel: string;
  className?: string;
}

const AGENT_STEPS = [
  { label: 'Loading IPS Configuration', emoji: '📋' },
  { label: 'Fetching Market Data', emoji: '📊' },
  { label: 'Pre-filtering Stocks', emoji: '🔍' },
  { label: 'Fetching Options Chains', emoji: '⛓️' },
  { label: 'Scoring Candidates', emoji: '📈' },
  { label: 'Applying Filters', emoji: '✨' },
  { label: 'Generating Analysis', emoji: '🤖' },
  { label: 'Finalizing Results', emoji: '✅' },
];

export function AgentProgressBar({
  currentStep,
  totalSteps,
  currentStepLabel,
  className
}: AgentProgressBarProps) {
  const progress = Math.round((currentStep / totalSteps) * 100);

  return (
    <div className={cn('space-y-3', className)}>
      {/* Progress Bar */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-sm">
          <span className="font-medium text-muted-foreground">
            Agent Progress
          </span>
          <span className="font-bold text-primary">
            {progress}%
          </span>
        </div>
        <Progress value={progress} className="h-2" />
      </div>

      {/* Current Step */}
      <div className="flex items-center gap-2 text-sm">
        <Loader2 className="h-4 w-4 animate-spin text-primary" />
        <span className="font-medium">{currentStepLabel}</span>
      </div>

      {/* Step List (Compact) */}
      <div className="space-y-1 text-xs">
        {AGENT_STEPS.map((step, idx) => {
          const stepNumber = idx + 1;
          const isComplete = stepNumber < currentStep;
          const isCurrent = stepNumber === currentStep;
          const isPending = stepNumber > currentStep;

          return (
            <div
              key={idx}
              className={cn(
                'flex items-center gap-2 px-2 py-1 rounded transition-colors',
                isCurrent && 'bg-primary/10 border border-primary/20',
                isComplete && 'text-muted-foreground'
              )}
            >
              {isComplete ? (
                <CheckCircle2 className="h-3 w-3 text-green-600 flex-shrink-0" />
              ) : isCurrent ? (
                <Loader2 className="h-3 w-3 animate-spin text-primary flex-shrink-0" />
              ) : (
                <Circle className="h-3 w-3 text-muted-foreground/40 flex-shrink-0" />
              )}
              <span className={cn(
                'flex-1',
                isCurrent && 'font-semibold text-primary',
                isPending && 'text-muted-foreground/60'
              )}>
                {step.emoji} {step.label}
              </span>
              {isComplete && (
                <span className="text-green-600 text-[10px]">✓</span>
              )}
            </div>
          );
        })}
      </div>

      {/* Time Estimate */}
      <div className="text-xs text-muted-foreground text-center pt-2 border-t">
        Estimated time: {Math.max(1, Math.ceil((totalSteps - currentStep) * 15))}s remaining
      </div>
    </div>
  );
}
