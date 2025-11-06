/**
 * IPS AI Analyzer Service
 *
 * Provides AI-powered analysis of IPS configurations and performance
 * using actual trade data and optional backtest results.
 * Uses Ollama (gpt-oss:20b) for LLM-based insights.
 */

import { ChatOllama } from "@langchain/ollama";

const normalizeBaseUrl = (raw?: string | null): string => {
  const fallback = "http://golem:11434";
  if (!raw) return fallback;
  const trimmed = raw.trim();
  if (!trimmed) return fallback;
  try {
    const url = new URL(trimmed);
    if (url.pathname && url.pathname !== "/") {
      url.pathname = "/";
    }
    url.search = "";
    url.hash = "";
    const base = url.origin + (url.pathname === "/" ? "" : url.pathname);
    return base.replace(/\/$/, "");
  } catch (error) {
    return trimmed.replace(/\/api\/chat$/i, "").replace(/\/$/, "") || fallback;
  }
};

const ollamaBaseUrl = normalizeBaseUrl(process.env.OLLAMA_BASE_URL || process.env.OLLAMA_HOST);

const llm = new ChatOllama({
  model: "gpt-oss:20b",
  temperature: 0.3,
  baseUrl: ollamaBaseUrl,
  numCtx: 32768,
});

export interface IPSAnalysisInput {
  ipsId: string
  ipsName: string
  ipsConfig: {
    strategies: string[]
    factors: Array<{
      factor_id: string
      factor_name: string
      weight: number
      enabled: boolean
      target_value?: any
      target_operator?: string
      preference_direction?: string
    }>
    min_dte?: number
    max_dte?: number
    exit_strategies?: any
    watch_criteria?: any
    ai_weight?: number
  }
  trades: any[]
  backtestResults?: any
}

export interface IPSAnalysisOutput {
  executiveSummary: string
  strengths: string[]
  weaknesses: string[]
  recommendations: Array<{
    category: 'configuration' | 'timing' | 'risk' | 'execution'
    title: string
    description: string
    priority: 'high' | 'medium' | 'low'
    actionable: boolean
  }>
  configurationSuggestions?: {
    factorWeights?: Record<string, number>
    dteRange?: { min: number; max: number }
    exitStrategies?: any
  }
  expectedImprovement?: {
    winRateIncrease?: number
    roiIncrease?: number
    sharpeImprovement?: number
  }
  metrics: {
    currentWinRate: number
    avgROI: number
    totalTrades: number
    avgDaysHeld: number
    bestPerformingFactors: string[]
    worstPerformingFactors: string[]
  }
}

export async function analyzeIPSPerformance(
  input: IPSAnalysisInput
): Promise<IPSAnalysisOutput> {
  // Calculate metrics from trades
  const closedTrades = input.trades.filter(t => t.status === 'closed')
  const wins = closedTrades.filter(t => (t.realized_pl || t.realized_pnl || 0) > 0)
  const currentWinRate = closedTrades.length > 0
    ? (wins.length / closedTrades.length) * 100
    : 0

  const avgROI = closedTrades.length > 0
    ? closedTrades.reduce((sum, t) => sum + (t.realized_pl_percent || 0), 0) / closedTrades.length
    : 0

  const avgDaysHeld = closedTrades.length > 0
    ? closedTrades.reduce((sum, t) => {
        const entry = new Date(t.entry_date)
        const close = new Date(t.closed_at || Date.now())
        const days = Math.floor((close.getTime() - entry.getTime()) / (1000 * 60 * 60 * 24))
        return sum + days
      }, 0) / closedTrades.length
    : 0

  // Prepare prompt for AI analysis
  const prompt = buildAnalysisPrompt(input, {
    currentWinRate,
    avgROI,
    avgDaysHeld,
    totalTrades: closedTrades.length,
  })

  // Call Ollama LLM
  const messages = [
    {
      role: "system" as const,
      content: "You are an expert options trading analyst specializing in Investment Policy Statement optimization. Analyze IPS performance data and provide actionable, specific recommendations.\n\nCRITICAL: Output ONLY valid JSON in the exact format requested. Do NOT include any thinking process, explanation, or text before or after the JSON. Start your response with { and end with }. No markdown formatting, no code blocks, no preamble, no commentary.",
    },
    { role: "user" as const, content: prompt },
  ]

  const response = await llm.invoke(messages)
  const responseText = response.content?.toString().trim() ?? ""

  // Parse AI response
  const analysis = parseAIResponse(responseText)

  // Combine metrics with AI analysis
  return {
    ...analysis,
    metrics: {
      currentWinRate,
      avgROI,
      totalTrades: closedTrades.length,
      avgDaysHeld,
      bestPerformingFactors: identifyTopFactors(input, wins),
      worstPerformingFactors: identifyWorstFactors(input, closedTrades.filter(t => !wins.includes(t))),
    },
  }
}

function buildAnalysisPrompt(
  input: IPSAnalysisInput,
  metrics: {
    currentWinRate: number
    avgROI: number
    avgDaysHeld: number
    totalTrades: number
  }
): string {
  const { ipsConfig, trades, backtestResults } = input

  return `You are an expert options trading analyst. Analyze the following Investment Policy Statement (IPS) performance and provide actionable insights.

## IPS Configuration
Name: ${input.ipsName}
Strategies: ${ipsConfig.strategies.join(', ')}
Days to Expiration Range: ${ipsConfig.min_dte || 'N/A'} - ${ipsConfig.max_dte || 'N/A'} days
AI Weight: ${ipsConfig.ai_weight || 20}%

### Factors (${ipsConfig.factors.length} total)
${ipsConfig.factors
  .filter(f => f.enabled)
  .map(f => `- ${f.factor_name}: Weight ${f.weight}, Target ${f.target_operator} ${f.target_value}`)
  .join('\n')}

## Actual Performance
- Total Closed Trades: ${metrics.totalTrades}
- Win Rate: ${metrics.currentWinRate.toFixed(2)}%
- Average ROI: ${metrics.avgROI.toFixed(2)}%
- Average Days Held: ${metrics.avgDaysHeld.toFixed(1)} days

## Trade Sample
${trades.slice(0, 10).map((t, i) => `
Trade ${i + 1}:
  - Symbol: ${t.symbol}
  - Strategy: ${t.strategy_type}
  - Delta: ${t.delta_short_leg}
  - Implied Volatility: ${t.iv_at_entry}
  - Days to Expiration: ${t.dte_at_entry}
  - IPS Score: ${t.ips_score}
  - Result: ${(t.realized_pl || 0) > 0 ? 'WIN' : 'LOSS'} (${(t.realized_pl_percent || 0).toFixed(2)}%)
`).join('\n')}

${backtestResults ? `
## Backtest Results (Historical)
- Win Rate: ${backtestResults.win_rate?.toFixed(2)}%
- Average ROI: ${backtestResults.avg_roi?.toFixed(2)}%
- Sharpe Ratio: ${backtestResults.sharpe_ratio?.toFixed(2)}
- Max Drawdown: ${backtestResults.max_drawdown?.toFixed(2)}%
` : ''}

## Analysis Instructions
Provide a comprehensive analysis in the following JSON format:

{
  "executiveSummary": "3-5 sentence summary of overall IPS performance",
  "strengths": ["strength 1", "strength 2", "strength 3"],
  "weaknesses": ["weakness 1", "weakness 2", "weakness 3"],
  "recommendations": [
    {
      "category": "configuration|timing|risk|execution",
      "title": "Brief title",
      "description": "Detailed recommendation",
      "priority": "high|medium|low",
      "actionable": true|false
    }
  ],
  "configurationSuggestions": {
    "factorWeights": { "factor_name": new_weight },
    "dteRange": { "min": number, "max": number }
  },
  "expectedImprovement": {
    "winRateIncrease": number,
    "roiIncrease": number
  }
}

Focus on:
1. Configuration tuning (factor weights, Days to Expiration range optimization)
2. Entry/exit timing patterns
3. Risk management effectiveness
4. Comparison between backtest expectations and actual results (if available)

Provide specific, actionable recommendations that can improve performance.`
}

function parseAIResponse(responseText: string): Partial<IPSAnalysisOutput> {
  try {
    // Remove markdown code blocks if present
    let cleaned = responseText.trim()

    // Remove ```json or ``` markers
    cleaned = cleaned.replace(/^```json\s*/i, '')
    cleaned = cleaned.replace(/^```\s*/, '')
    cleaned = cleaned.replace(/\s*```$/, '')
    cleaned = cleaned.trim()

    // Try to find JSON object in the response (handle LLM thinking process)
    // Look for the first { and last } to extract just the JSON
    const firstBrace = cleaned.indexOf('{')
    const lastBrace = cleaned.lastIndexOf('}')

    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      cleaned = cleaned.substring(firstBrace, lastBrace + 1)
      console.log('Extracted JSON from position', firstBrace, 'to', lastBrace)
    }

    const parsed = JSON.parse(cleaned)

    return parsed
  } catch (error) {
    console.error('Failed to parse AI response:', error)
    console.error('Raw response:', responseText.substring(0, 500))

    // Fallback parsing
    return {
      executiveSummary: 'Failed to parse AI analysis response. The analysis service encountered an error.',
      strengths: ['Analysis unavailable due to parsing error'],
      weaknesses: ['Unable to generate analysis'],
      recommendations: [],
    }
  }
}

function identifyTopFactors(input: IPSAnalysisInput, wins: any[]): string[] {
  // Identify which factors correlate with winning trades
  const factorScores: Record<string, number> = {}

  input.ipsConfig.factors.forEach(factor => {
    if (!factor.enabled) return

    // Simple correlation: check if factor was relevant in wins
    const relevantWins = wins.filter(t => {
      // Check if this trade would have scored high on this factor
      // This is a simplified heuristic
      return t.ips_score && t.ips_score > 70
    })

    factorScores[factor.factor_name] = relevantWins.length
  })

  return Object.entries(factorScores)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5)
    .map(([name]) => name)
}

function identifyWorstFactors(input: IPSAnalysisInput, losses: any[]): string[] {
  // Identify which factors may be contributing to losses
  const factorScores: Record<string, number> = {}

  input.ipsConfig.factors.forEach(factor => {
    if (!factor.enabled) return

    // Check if factor presence correlates with losses
    const relevantLosses = losses.filter(t => {
      return t.ips_score && t.ips_score > 70
    })

    factorScores[factor.factor_name] = relevantLosses.length
  })

  return Object.entries(factorScores)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 3)
    .map(([name]) => name)
}

export default {
  analyzeIPSPerformance,
}
