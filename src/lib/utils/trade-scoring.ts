// Trade Scoring Utilities for Gamification
// Provides tier classification, color mapping, and educational messaging

export interface ScoreTier {
  min: number;
  max: number;
  name: string;
  description: string;
  emoji: string;
  color: string;
}

export const SCORE_TIERS: ScoreTier[] = [
  {
    min: 95,
    max: 100,
    name: 'Perfect Match',
    description: 'Exceptional IPS alignment',
    emoji: '🔥',
    color: 'orange'
  },
  {
    min: 90,
    max: 94,
    name: 'Elite Quality',
    description: 'Outstanding opportunity',
    emoji: '⭐',
    color: 'purple'
  },
  {
    min: 80,
    max: 89,
    name: 'High Quality',
    description: 'Strong IPS match',
    emoji: '💎',
    color: 'blue'
  },
  {
    min: 70,
    max: 79,
    name: 'Good Quality',
    description: 'Solid opportunity',
    emoji: '✓',
    color: 'green'
  },
  {
    min: 60,
    max: 69,
    name: 'Acceptable',
    description: 'Meets minimum criteria',
    emoji: '⚠️',
    color: 'yellow'
  },
  {
    min: 0,
    max: 59,
    name: 'Review Needed',
    description: 'Marginal fit',
    emoji: '⚠️',
    color: 'red'
  }
];

/**
 * Get the score tier information for a given score
 */
export function getScoreTierInfo(score: number): ScoreTier {
  const tier = SCORE_TIERS.find(tier => score >= tier.min && score <= tier.max);
  return tier || SCORE_TIERS[SCORE_TIERS.length - 1];
}

/**
 * Get the color for a score (for styling purposes)
 */
export function getScoreColor(score: number): string {
  if (score >= 95) return 'orange';
  if (score >= 90) return 'purple';
  if (score >= 80) return 'blue';
  if (score >= 70) return 'green';
  if (score >= 60) return 'yellow';
  return 'red';
}

/**
 * Format a score message with IPS factor details
 */
export function formatScoreMessage(score: number, ipsFactors?: {
  passed: string[];
  failed: string[];
}): string {
  const tier = getScoreTierInfo(score);
  let message = `${tier.emoji} ${tier.description}.`;

  if (ipsFactors) {
    if (ipsFactors.passed.length > 0) {
      message += ` Passed: ${ipsFactors.passed.join(', ')}.`;
    }
    if (ipsFactors.failed.length > 0) {
      message += ` Review: ${ipsFactors.failed.join(', ')}.`;
    }
  }

  return message;
}

/**
 * Get icon color class based on score
 */
export function getIconColor(score: number): string {
  if (score >= 95) return 'text-orange-500';
  if (score >= 90) return 'text-purple-500';
  if (score >= 80) return 'text-blue-500';
  if (score >= 70) return 'text-green-500';
  if (score >= 60) return 'text-yellow-500';
  return 'text-orange-600';
}

/**
 * Get background color class for score display areas
 */
export function getScoreBackgroundColor(score: number): string {
  if (score >= 95) return 'bg-orange-100 dark:bg-orange-950 border border-orange-200 dark:border-orange-900';
  if (score >= 90) return 'bg-purple-100 dark:bg-purple-950 border border-purple-200 dark:border-purple-900';
  if (score >= 80) return 'bg-blue-100 dark:bg-blue-950 border border-blue-200 dark:border-blue-900';
  if (score >= 70) return 'bg-green-100 dark:bg-green-950 border border-green-200 dark:border-green-900';
  if (score >= 60) return 'bg-yellow-100 dark:bg-yellow-950 border border-yellow-200 dark:border-yellow-900';
  return 'bg-orange-100 dark:bg-orange-950 border border-orange-200 dark:border-orange-900';
}
