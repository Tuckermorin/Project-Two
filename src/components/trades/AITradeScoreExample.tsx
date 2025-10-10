/**
 * Example Component: AI Trade Score Gamification
 *
 * This file demonstrates how to integrate the gamification components
 * with real agent data from options-agent-v3.ts
 *
 * USAGE:
 * Import this in any page where you want to display AI trade recommendations
 * with gamified visual feedback.
 */

"use client";

import { AITradeScoreCard } from './AITradeScoreCard';
import { AITradeScoreButton } from './AITradeScoreButton';

// Example: Type definition for agent candidate with reasoning chain
type AgentCandidate = {
  id: string;
  symbol: string;
  strategy: string;
  contract_legs: Array<{
    type: "BUY" | "SELL";
    right: "P" | "C";
    strike: number;
    expiry: string;
  }>;
  entry_mid?: number;
  est_pop?: number;
  max_profit?: number;
  max_loss?: number;
  score?: number;
  rationale?: string;
  reasoning_chain?: {
    ips_compliance: {
      passes: string[];
      violations: string[];
      factor_scores: Record<string, { value: number; target: string; pass: boolean }>;
    };
  };
};

interface AITradeScoreExampleProps {
  candidates: AgentCandidate[];
  onAcceptTrade: (candidate: AgentCandidate) => void;
  onRejectTrade: (candidateId: string) => void;
  onViewDetails: (candidate: AgentCandidate) => void;
}

export function AITradeScoreExample({
  candidates,
  onAcceptTrade,
  onRejectTrade,
  onViewDetails
}: AITradeScoreExampleProps) {

  /**
   * Extract IPS factors from reasoning chain
   */
  function extractIPSFactors(candidate: AgentCandidate) {
    const reasoning = candidate.reasoning_chain;
    if (!reasoning) return undefined;

    return {
      passed: reasoning.ips_compliance.passes || [],
      failed: reasoning.ips_compliance.violations || [],
      scores: Object.fromEntries(
        Object.entries(reasoning.ips_compliance.factor_scores || {})
          .map(([key, val]) => [key, val.value])
      )
    };
  }

  /**
   * Format strategy name for display
   */
  function formatStrategy(strategy: string): string {
    return strategy
      .split('_')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }

  /**
   * Get contract type description
   */
  function getContractType(candidate: AgentCandidate): string {
    const hasPuts = candidate.contract_legs.some(leg => leg.right === 'P');
    const hasCalls = candidate.contract_legs.some(leg => leg.right === 'C');
    const sellLegs = candidate.contract_legs.filter(leg => leg.type === 'SELL').length;

    if (hasPuts && hasCalls) return 'Iron Condor';
    if (sellLegs === 2 && hasPuts) return 'Bull Put Spread';
    if (sellLegs === 2 && hasCalls) return 'Bear Call Spread';
    if (sellLegs === 1) return 'Cash Secured Put';
    return 'Complex Spread';
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">AI Trade Recommendations</h2>
        <p className="text-sm text-muted-foreground">
          {candidates.length} opportunities found
        </p>
      </div>

      {/* Grid Layout for Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {candidates.map((candidate) => {
          const score = candidate.score ?? 0;
          const ipsFactors = extractIPSFactors(candidate);

          return (
            <AITradeScoreCard
              key={candidate.id}
              score={score}
              symbol={candidate.symbol}
              strategy={formatStrategy(candidate.strategy)}
              contractType={getContractType(candidate)}
              entryPrice={candidate.entry_mid ?? 0}
              maxProfit={candidate.max_profit ?? 0}
              maxLoss={candidate.max_loss ?? 0}
              probabilityOfProfit={(candidate.est_pop ?? 0) * 100}
              ipsFactors={ipsFactors}
              rationale={candidate.rationale}
              onAccept={() => onAcceptTrade(candidate)}
              onReject={() => onRejectTrade(candidate.id)}
              onViewDetails={() => onViewDetails(candidate)}
            />
          );
        })}
      </div>

      {/* Alternative: List Layout with Buttons */}
      <div className="mt-8">
        <h3 className="text-lg font-semibold mb-4">Quick View (Button Style)</h3>
        <div className="space-y-3">
          {candidates.slice(0, 3).map((candidate) => {
            const score = candidate.score ?? 0;
            const ipsFactors = extractIPSFactors(candidate);

            return (
              <AITradeScoreButton
                key={candidate.id}
                score={score}
                tradeName={formatStrategy(candidate.strategy)}
                symbol={candidate.symbol}
                strategy={getContractType(candidate)}
                onClick={() => onViewDetails(candidate)}
                ipsFactors={ipsFactors}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}

/**
 * INTEGRATION EXAMPLE:
 *
 * // In your page or component:
 * import { AITradeScoreExample } from '@/components/trades/AITradeScoreExample';
 *
 * function TradingPage() {
 *   const [candidates, setCandidates] = useState<AgentCandidate[]>([]);
 *
 *   async function runAgent() {
 *     const res = await fetch('/api/agent/run', {
 *       method: 'POST',
 *       body: JSON.stringify({ symbols: ['AAPL', 'TSLA'], ipsId: '...' })
 *     });
 *     const data = await res.json();
 *     setCandidates(data.selected || []);
 *   }
 *
 *   return (
 *     <AITradeScoreExample
 *       candidates={candidates}
 *       onAcceptTrade={(c) => console.log('Accept', c)}
 *       onRejectTrade={(id) => console.log('Reject', id)}
 *       onViewDetails={(c) => console.log('View', c)}
 *     />
 *   );
 * }
 */

/**
 * DATA EXTRACTION FROM AGENT:
 *
 * If your agent doesn't populate reasoning_chain automatically,
 * add this to your agent code (options-agent-v3.ts):
 *
 * ```typescript
 * import { buildReasoningChain } from './deep-reasoning';
 *
 * // After scoring each candidate:
 * for (const candidate of candidates) {
 *   const reasoning = await buildReasoningChain(
 *     candidate,
 *     features,
 *     ipsConfig,
 *     macroData
 *   );
 *
 *   candidate.reasoning_chain = reasoning;
 *   candidate.score = reasoning.adjusted_score;
 * }
 * ```
 */
