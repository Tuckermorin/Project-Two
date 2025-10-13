// src/app/api/patterns/analyze/route.ts
// API endpoint for pattern detection and analysis

import { NextRequest, NextResponse } from 'next/server';
import { getPatternDetectionService, type PatternQuery } from '@/lib/services/pattern-detection-service';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { query, user_id } = body as { query: PatternQuery; user_id: string };

    if (!user_id) {
      return NextResponse.json({ error: 'user_id is required' }, { status: 400 });
    }

    const patternService = getPatternDetectionService();

    query.user_id = user_id;

    const analysis = await patternService.analyzePattern(query);

    return NextResponse.json({
      success: true,
      analysis,
    });
  } catch (error) {
    console.error('[Pattern API] Error:', error);

    return NextResponse.json(
      {
        error: 'Pattern analysis failed',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

// GET endpoint for common patterns
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const user_id = searchParams.get('user_id');

    if (!user_id) {
      return NextResponse.json({ error: 'user_id is required' }, { status: 400 });
    }

    const patternService = getPatternDetectionService();

    const commonPatterns = await patternService.getCommonPatterns(user_id);
    const gaveBackAnalysis = await patternService.analyzeGaveBackProfits(user_id);

    return NextResponse.json({
      success: true,
      common_patterns: commonPatterns,
      gave_back_profits: gaveBackAnalysis,
      insights: generateInsightsSummary(commonPatterns, gaveBackAnalysis),
    });
  } catch (error) {
    console.error('[Pattern API] Error:', error);

    return NextResponse.json(
      {
        error: 'Failed to fetch patterns',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

// ============================================================================
// Helpers
// ============================================================================

function generateInsightsSummary(
  patterns: any[],
  gaveBackAnalysis: any
): string[] {
  const insights: string[] = [];

  // Find most actionable patterns
  const highConfidencePatterns = patterns
    .filter(p => p.confidence === 'high')
    .sort((a, b) => b.snapshots_with_outcomes - a.snapshots_with_outcomes);

  if (highConfidencePatterns.length > 0) {
    const top = highConfidencePatterns[0];
    insights.push(
      `Top Pattern: ${top.pattern_description} - ${top.win_rate.toFixed(0)}% win rate (${top.snapshots_with_outcomes} samples)`
    );
  }

  // Gave back profits insight
  if (gaveBackAnalysis.gave_back_count > 0) {
    insights.push(
      `Risk Alert: ${gaveBackAnalysis.gave_back_count} trades (${gaveBackAnalysis.gave_back_rate.toFixed(0)}%) gave back profits. ` +
      `Avg peaked at ${gaveBackAnalysis.avg_peak_pnl.toFixed(0)}% but closed at ${gaveBackAnalysis.avg_final_pnl.toFixed(0)}%.`
    );

    if (gaveBackAnalysis.common_characteristics.length > 0) {
      insights.push(`Common traits: ${gaveBackAnalysis.common_characteristics.join(', ')}`);
    }
  }

  // Delta warning
  const highDeltaPattern = patterns.find(p => p.pattern_description.includes('Delta ≥ 0.40'));
  if (highDeltaPattern && highDeltaPattern.win_rate < 40) {
    insights.push(
      `Delta Warning: When delta reaches 0.40+, only ${highDeltaPattern.win_rate.toFixed(0)}% of trades recover. Consider this a strong exit signal.`
    );
  }

  // P&L take-profit insight
  const profitPattern = patterns.find(p => p.pattern_description.includes('P&L ≥ 50%'));
  if (profitPattern) {
    if (profitPattern.win_rate < 75) {
      insights.push(
        `Exit Strategy: Only ${profitPattern.win_rate.toFixed(0)}% of trades at 50%+ profit close profitably. Take profits early!`
      );
    } else {
      insights.push(
        `Hold Strategy: ${profitPattern.win_rate.toFixed(0)}% of trades at 50%+ profit close profitably. Safe to hold for max gain.`
      );
    }
  }

  return insights;
}
