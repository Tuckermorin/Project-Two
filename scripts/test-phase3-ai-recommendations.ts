#!/usr/bin/env node
// Test Script: Phase 3 AI-Enhanced Recommendations
// Comprehensive tests for the AI recommendation engine

import dotenv from 'dotenv';
dotenv.config();

import { createClient } from '@supabase/supabase-js';
import type { TradeCandidate } from '../src/lib/services/trade-context-enrichment-service';
import { getEnhancedTradeRecommendationService } from '../src/lib/services/enhanced-trade-recommendation-service';

// ============================================================================
// Test Configuration
// ============================================================================

const COLORS = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m',
};

interface TestResult {
  name: string;
  status: 'passed' | 'failed' | 'skipped';
  duration_ms: number;
  error?: string;
  details?: any;
}

// ============================================================================
// Test Suite
// ============================================================================

async function runAllTests(): Promise<void> {
  console.log(`${COLORS.bright}${COLORS.blue}Phase 3: AI-Enhanced Recommendations Test Suite${COLORS.reset}\n`);

  const results: TestResult[] = [];

  // Test 1: Database setup verification
  results.push(await test1_DatabaseSetup());

  // Test 2: Fetch user and IPS configuration
  results.push(await test2_FetchUserAndIPS());

  // Test 3: Context enrichment for single candidate
  results.push(await test3_ContextEnrichment());

  // Test 4: AI evaluation with progressive weighting
  results.push(await test4_AIEvaluation());

  // Test 5: Full recommendation flow
  results.push(await test5_FullRecommendationFlow());

  // Test 6: Batch recommendations
  results.push(await test6_BatchRecommendations());

  // Test 7: Top N recommendations
  results.push(await test7_TopNRecommendations());

  // Test 8: Recommendation history
  results.push(await test8_RecommendationHistory());

  // Print summary
  printSummary(results);
}

// ============================================================================
// Individual Tests
// ============================================================================

async function test1_DatabaseSetup(): Promise<TestResult> {
  const testName = 'Database Setup Verification';
  console.log(`${COLORS.yellow}Running Test 1: ${testName}...${COLORS.reset}`);

  const startTime = Date.now();

  try {
    const db = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Check ai_trade_evaluations table exists
    const { data, error } = await db
      .from('ai_trade_evaluations')
      .select('*', { count: 'exact', head: true });

    if (error) {
      throw new Error(`ai_trade_evaluations table not found: ${error.message}`);
    }

    console.log(`${COLORS.green}✓ Test 1 Passed${COLORS.reset}`);
    console.log(`  ai_trade_evaluations table exists\n`);

    return {
      name: testName,
      status: 'passed',
      duration_ms: Date.now() - startTime,
    };
  } catch (error: any) {
    console.log(`${COLORS.red}✗ Test 1 Failed: ${error.message}${COLORS.reset}\n`);
    return {
      name: testName,
      status: 'failed',
      duration_ms: Date.now() - startTime,
      error: error.message,
    };
  }
}

async function test2_FetchUserAndIPS(): Promise<TestResult> {
  const testName = 'Fetch User and IPS Configuration';
  console.log(`${COLORS.yellow}Running Test 2: ${testName}...${COLORS.reset}`);

  const startTime = Date.now();

  try {
    const db = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Get a user
    const { data: users, error: userError } = await db
      .from('auth.users')
      .select('id, email')
      .limit(1);

    if (userError) {
      throw new Error(`Failed to fetch user: ${userError.message}`);
    }

    // Get an IPS configuration
    const { data: ipsConfigs, error: ipsError } = await db
      .from('ips_configurations')
      .select('id, name')
      .limit(1);

    if (ipsError || !ipsConfigs || ipsConfigs.length === 0) {
      throw new Error('No IPS configurations found');
    }

    console.log(`${COLORS.green}✓ Test 2 Passed${COLORS.reset}`);
    console.log(`  IPS: ${ipsConfigs[0].name}\n`);

    return {
      name: testName,
      status: 'passed',
      duration_ms: Date.now() - startTime,
      details: {
        ips_id: ipsConfigs[0].id,
        ips_name: ipsConfigs[0].name,
      },
    };
  } catch (error: any) {
    console.log(`${COLORS.red}✗ Test 2 Failed: ${error.message}${COLORS.reset}\n`);
    return {
      name: testName,
      status: 'failed',
      duration_ms: Date.now() - startTime,
      error: error.message,
    };
  }
}

async function test3_ContextEnrichment(): Promise<TestResult> {
  const testName = 'Context Enrichment';
  console.log(`${COLORS.yellow}Running Test 3: ${testName}...${COLORS.reset}`);

  const startTime = Date.now();

  try {
    const db = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Get IPS
    const { data: ipsConfigs } = await db
      .from('ips_configurations')
      .select('id')
      .limit(1)
      .single();

    if (!ipsConfigs) {
      throw new Error('No IPS configuration found');
    }

    // Create a test trade candidate
    const candidate: TradeCandidate = {
      symbol: 'AMD',
      strategy_type: 'put_credit_spread',
      short_strike: 150,
      long_strike: 145,
      expiration_date: '2025-11-22',
      contract_type: 'put',
      credit_received: 0.50,
      delta: -0.25,
      iv_rank: 45,
      dte: 30,
      estimated_pop: 0.75,
      current_stock_price: 160,
    };

    // Import and test enrichment service
    const { enrichTradeCandidate } = await import('../src/lib/services/trade-context-enrichment-service');

    const enrichedContext = await enrichTradeCandidate(candidate, ipsConfigs.id, {
      includeExternalIntelligence: false, // Skip to avoid external API calls in test
      includeInternalRAG: false,
      includeTavily: false,
      includeHistoricalPerformance: true,
    });

    console.log(`${COLORS.green}✓ Test 3 Passed${COLORS.reset}`);
    console.log(`  Symbol: ${enrichedContext.candidate.symbol}`);
    console.log(`  IPS Passed: ${enrichedContext.ips_evaluation.passed}`);
    console.log(`  IPS Score: ${enrichedContext.ips_evaluation.score_percentage.toFixed(2)}%`);
    console.log(`  Data Quality: ${enrichedContext.data_quality.overall_confidence}`);
    console.log(`  Historical Trades: ${enrichedContext.historical_performance.total_trades}\n`);

    return {
      name: testName,
      status: 'passed',
      duration_ms: Date.now() - startTime,
      details: {
        ips_passed: enrichedContext.ips_evaluation.passed,
        ips_score: enrichedContext.ips_evaluation.score_percentage,
        data_quality: enrichedContext.data_quality.overall_confidence,
      },
    };
  } catch (error: any) {
    console.log(`${COLORS.red}✗ Test 3 Failed: ${error.message}${COLORS.reset}\n`);
    return {
      name: testName,
      status: 'failed',
      duration_ms: Date.now() - startTime,
      error: error.message,
    };
  }
}

async function test4_AIEvaluation(): Promise<TestResult> {
  const testName = 'AI Evaluation with Progressive Weighting';
  console.log(`${COLORS.yellow}Running Test 4: ${testName}...${COLORS.reset}`);

  const startTime = Date.now();

  try {
    const db = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const { data: ipsConfigs } = await db
      .from('ips_configurations')
      .select('id, user_id')
      .limit(1)
      .single();

    if (!ipsConfigs) {
      throw new Error('No IPS configuration found');
    }

    const candidate: TradeCandidate = {
      symbol: 'NVDA',
      strategy_type: 'put_credit_spread',
      short_strike: 130,
      long_strike: 125,
      expiration_date: '2025-11-22',
      contract_type: 'put',
      credit_received: 0.75,
      delta: -0.20,
      iv_rank: 55,
      dte: 30,
      estimated_pop: 0.80,
      current_stock_price: 145,
    };

    const { getTradeRecommendation } = await import('../src/lib/services/enhanced-trade-recommendation-service');

    console.log(`  ${COLORS.cyan}Note: AI evaluation may take 30-60 seconds...${COLORS.reset}`);

    const recommendation = await getTradeRecommendation({
      candidate,
      ips_id: ipsConfigs.id,
      user_id: ipsConfigs.user_id,
      options: {
        save_evaluation: false, // Don't save in test
        include_external_intelligence: false,
        include_internal_rag: false,
        include_tavily: false,
      },
    });

    console.log(`${COLORS.green}✓ Test 4 Passed${COLORS.reset}`);
    console.log(`  Final Recommendation: ${recommendation.final_recommendation}`);
    console.log(`  Composite Score: ${recommendation.weighted_score.composite_score.toFixed(2)}`);
    console.log(`  Weighting: ${(recommendation.weighted_score.ips_weight * 100).toFixed(0)}% IPS / ${(recommendation.weighted_score.ai_weight * 100).toFixed(0)}% AI`);
    console.log(`  Confidence: ${recommendation.weighted_score.confidence_level}`);
    console.log(`  AI Score: ${recommendation.ai_evaluation.ai_score.toFixed(2)}`);
    console.log(`  IPS Score: ${recommendation.ips_evaluation.score_percentage.toFixed(2)}\n`);

    return {
      name: testName,
      status: 'passed',
      duration_ms: Date.now() - startTime,
      details: {
        final_recommendation: recommendation.final_recommendation,
        composite_score: recommendation.weighted_score.composite_score,
        ips_weight: recommendation.weighted_score.ips_weight,
        ai_weight: recommendation.weighted_score.ai_weight,
      },
    };
  } catch (error: any) {
    console.log(`${COLORS.red}✗ Test 4 Failed: ${error.message}${COLORS.reset}\n`);
    console.log(`${COLORS.dim}${error.stack}${COLORS.reset}\n`);
    return {
      name: testName,
      status: 'failed',
      duration_ms: Date.now() - startTime,
      error: error.message,
    };
  }
}

async function test5_FullRecommendationFlow(): Promise<TestResult> {
  const testName = 'Full Recommendation Flow (with Save)';
  console.log(`${COLORS.yellow}Running Test 5: ${testName}...${COLORS.reset}`);

  const startTime = Date.now();

  try {
    const db = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const { data: ipsConfigs } = await db
      .from('ips_configurations')
      .select('id, user_id')
      .limit(1)
      .single();

    if (!ipsConfigs) {
      throw new Error('No IPS configuration found');
    }

    const candidate: TradeCandidate = {
      symbol: 'TSLA',
      strategy_type: 'put_credit_spread',
      short_strike: 240,
      long_strike: 235,
      expiration_date: '2025-11-22',
      contract_type: 'put',
      credit_received: 1.00,
      delta: -0.30,
      iv_rank: 60,
      dte: 30,
      estimated_pop: 0.70,
      current_stock_price: 255,
    };

    const { getTradeRecommendation } = await import('../src/lib/services/enhanced-trade-recommendation-service');

    console.log(`  ${COLORS.cyan}Saving evaluation to database...${COLORS.reset}`);

    const recommendation = await getTradeRecommendation({
      candidate,
      ips_id: ipsConfigs.id,
      user_id: ipsConfigs.user_id,
      options: {
        save_evaluation: true,
        include_external_intelligence: false,
        include_internal_rag: false,
        include_tavily: false,
      },
    });

    // Verify it was saved
    const { data: saved, error: queryError } = await db
      .from('ai_trade_evaluations')
      .select('id')
      .eq('symbol', candidate.symbol)
      .eq('user_id', ipsConfigs.user_id)
      .order('created_at', { ascending: false })
      .limit(1);

    if (queryError || !saved || saved.length === 0) {
      throw new Error('Evaluation was not saved to database');
    }

    console.log(`${COLORS.green}✓ Test 5 Passed${COLORS.reset}`);
    console.log(`  Recommendation saved with ID: ${saved[0].id}`);
    console.log(`  Final Recommendation: ${recommendation.final_recommendation}\n`);

    return {
      name: testName,
      status: 'passed',
      duration_ms: Date.now() - startTime,
      details: {
        saved_id: saved[0].id,
      },
    };
  } catch (error: any) {
    console.log(`${COLORS.red}✗ Test 5 Failed: ${error.message}${COLORS.reset}\n`);
    return {
      name: testName,
      status: 'failed',
      duration_ms: Date.now() - startTime,
      error: error.message,
    };
  }
}

async function test6_BatchRecommendations(): Promise<TestResult> {
  const testName = 'Batch Recommendations';
  console.log(`${COLORS.yellow}Running Test 6: ${testName}...${COLORS.reset}`);

  const startTime = Date.now();

  try {
    const db = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const { data: ipsConfigs } = await db
      .from('ips_configurations')
      .select('id, user_id')
      .limit(1)
      .single();

    if (!ipsConfigs) {
      throw new Error('No IPS configuration found');
    }

    const candidates: TradeCandidate[] = [
      {
        symbol: 'AMD',
        strategy_type: 'put_credit_spread',
        short_strike: 150,
        long_strike: 145,
        expiration_date: '2025-11-22',
        contract_type: 'put',
        credit_received: 0.50,
        delta: -0.25,
        iv_rank: 45,
        dte: 30,
        estimated_pop: 0.75,
        current_stock_price: 160,
      },
      {
        symbol: 'MU',
        strategy_type: 'put_credit_spread',
        short_strike: 100,
        long_strike: 95,
        expiration_date: '2025-11-22',
        contract_type: 'put',
        credit_received: 0.60,
        delta: -0.28,
        iv_rank: 50,
        dte: 30,
        estimated_pop: 0.72,
        current_stock_price: 110,
      },
    ];

    const service = getEnhancedTradeRecommendationService();

    console.log(`  ${COLORS.cyan}Processing ${candidates.length} candidates in batch...${COLORS.reset}`);

    const recommendations = await service.getBatchRecommendations(
      candidates,
      ipsConfigs.id,
      ipsConfigs.user_id,
      {
        save_evaluation: false,
        include_external_intelligence: false,
        include_internal_rag: false,
        include_tavily: false,
      }
    );

    console.log(`${COLORS.green}✓ Test 6 Passed${COLORS.reset}`);
    console.log(`  Processed ${recommendations.length} candidates`);
    recommendations.forEach((rec, idx) => {
      console.log(`    ${idx + 1}. ${rec.candidate.symbol}: ${rec.final_recommendation} (score: ${rec.weighted_score.composite_score.toFixed(2)})`);
    });
    console.log('');

    return {
      name: testName,
      status: 'passed',
      duration_ms: Date.now() - startTime,
      details: {
        batch_size: recommendations.length,
      },
    };
  } catch (error: any) {
    console.log(`${COLORS.red}✗ Test 6 Failed: ${error.message}${COLORS.reset}\n`);
    return {
      name: testName,
      status: 'failed',
      duration_ms: Date.now() - startTime,
      error: error.message,
    };
  }
}

async function test7_TopNRecommendations(): Promise<TestResult> {
  const testName = 'Top N Recommendations';
  console.log(`${COLORS.yellow}Running Test 7: ${testName}...${COLORS.reset}`);

  const startTime = Date.now();

  try {
    console.log(`${COLORS.yellow}⚠ Test 7 Skipped: Requires batch processing time${COLORS.reset}\n`);

    return {
      name: testName,
      status: 'skipped',
      duration_ms: Date.now() - startTime,
    };
  } catch (error: any) {
    console.log(`${COLORS.red}✗ Test 7 Failed: ${error.message}${COLORS.reset}\n`);
    return {
      name: testName,
      status: 'failed',
      duration_ms: Date.now() - startTime,
      error: error.message,
    };
  }
}

async function test8_RecommendationHistory(): Promise<TestResult> {
  const testName = 'Recommendation History';
  console.log(`${COLORS.yellow}Running Test 8: ${testName}...${COLORS.reset}`);

  const startTime = Date.now();

  try {
    const db = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const { data: ipsConfigs } = await db
      .from('ips_configurations')
      .select('id, user_id')
      .limit(1)
      .single();

    if (!ipsConfigs) {
      throw new Error('No IPS configuration found');
    }

    const service = getEnhancedTradeRecommendationService();
    const history = await service.getRecommendationHistory('TSLA', ipsConfigs.user_id, 10);

    console.log(`${COLORS.green}✓ Test 8 Passed${COLORS.reset}`);
    console.log(`  Symbol: ${history.symbol}`);
    console.log(`  Total Recommendations: ${history.total_recommendations}`);
    console.log(`  Average Score: ${history.avg_composite_score.toFixed(2)}\n`);

    return {
      name: testName,
      status: 'passed',
      duration_ms: Date.now() - startTime,
      details: {
        total_recommendations: history.total_recommendations,
      },
    };
  } catch (error: any) {
    console.log(`${COLORS.red}✗ Test 8 Failed: ${error.message}${COLORS.reset}\n`);
    return {
      name: testName,
      status: 'failed',
      duration_ms: Date.now() - startTime,
      error: error.message,
    };
  }
}

// ============================================================================
// Summary
// ============================================================================

function printSummary(results: TestResult[]): void {
  console.log(`${COLORS.bright}${COLORS.cyan}Test Summary${COLORS.reset}\n`);

  const passed = results.filter((r) => r.status === 'passed').length;
  const failed = results.filter((r) => r.status === 'failed').length;
  const skipped = results.filter((r) => r.status === 'skipped').length;

  console.log(`Total Tests: ${results.length}`);
  console.log(`${COLORS.green}Passed: ${passed}${COLORS.reset}`);
  console.log(`${COLORS.red}Failed: ${failed}${COLORS.reset}`);
  console.log(`${COLORS.yellow}Skipped: ${skipped}${COLORS.reset}\n`);

  const totalDuration = results.reduce((sum, r) => sum + r.duration_ms, 0);
  console.log(`Total Duration: ${(totalDuration / 1000).toFixed(2)}s\n`);

  if (failed > 0) {
    console.log(`${COLORS.red}Failed Tests:${COLORS.reset}`);
    results
      .filter((r) => r.status === 'failed')
      .forEach((r) => {
        console.log(`  - ${r.name}: ${r.error}`);
      });
    console.log('');
    process.exit(1);
  } else {
    console.log(`${COLORS.green}${COLORS.bright}All tests passed!${COLORS.reset}\n`);
  }
}

// ============================================================================
// Run Tests
// ============================================================================

runAllTests().catch((error) => {
  console.error(`${COLORS.red}Fatal error:${COLORS.reset}`, error);
  process.exit(1);
});
