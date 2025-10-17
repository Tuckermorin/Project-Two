// Agent Configuration
// Centralized settings for the options trading agent

export const AGENT_CONFIG = {
  // Candidate pool sizes at each filtering stage
  filtering: {
    // Number of candidates to keep after initial high-weight factor filtering
    topCandidatesAfterInitialFilter: 150,

    // Number of candidates to consider before diversity filtering
    topCandidatesBeforeDiversity: 100,

    // Final number of recommendations to return (top 20 with detailed analysis)
    finalRecommendations: 20,

    // Number of additional candidates to show with failure analysis
    failureAnalysisCount: 20,
  },

  // Diversity constraints to ensure portfolio balance
  diversity: {
    // Maximum number of trades from the same sector
    maxPerSector: 5,

    // Maximum number of contracts per individual stock
    maxPerSymbol: 3,

    // Maximum number of trades with the same strategy type (e.g., put credit spread)
    maxPerStrategy: 50,
  },

  // API rate limiting
  rateLimit: {
    // Alpha Vantage free tier: 25 calls per day
    apiCallsPerMinute: 25,
    waitTimeMs: 60000,
  },

  // Score thresholds for tier classification
  tiers: {
    elite: 90,      // IPS score ≥ 90
    quality: 75,    // IPS score ≥ 75
    speculative: 60 // IPS score ≥ 60
  }
};

/**
 * Get agent configuration with optional overrides
 */
export function getAgentConfig(overrides?: Partial<typeof AGENT_CONFIG>) {
  if (!overrides) return AGENT_CONFIG;

  return {
    ...AGENT_CONFIG,
    filtering: { ...AGENT_CONFIG.filtering, ...overrides.filtering },
    diversity: { ...AGENT_CONFIG.diversity, ...overrides.diversity },
    rateLimit: { ...AGENT_CONFIG.rateLimit, ...overrides.rateLimit },
    tiers: { ...AGENT_CONFIG.tiers, ...overrides.tiers },
  };
}
