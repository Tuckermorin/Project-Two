#!/usr/bin/env node
// Test Script: IPS Backtesting System
// Comprehensive tests for the backtesting infrastructure

import dotenv from 'dotenv';
dotenv.config();

import { createClient } from '@supabase/supabase-js';
import { IPSBacktester, type BacktestConfig } from '../src/lib/agent/ips-backtester';
import {
  getIPSPerformanceCalculator,
  compareIPSs,
  getIPSLeaderboard,
  getIPSOptimizations,
} from '../src/lib/services/ips-performance-calculator';

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
  console.log(`${COLORS.bright}${COLORS.blue}IPS Backtesting System Test Suite${COLORS.reset}\n`);

  const results: TestResult[] = [];

  // Test 1: Database connectivity
  results.push(await test1_DatabaseConnectivity());

  // Test 2: Fetch IPS configurations
  results.push(await test2_FetchIPSConfigurations());

  // Test 3: Fetch historical trades
  results.push(await test3_FetchHistoricalTrades());

  // Test 4: Single IPS backtest
  results.push(await test4_SingleIPSBacktest());

  // Test 5: IPS comparison
  results.push(await test5_IPSComparison());

  // Test 6: Leaderboard generation
  results.push(await test6_LeaderboardGeneration());

  // Test 7: Optimization suggestions
  results.push(await test7_OptimizationSuggestions());

  // Print summary
  printSummary(results);
}

// ============================================================================
// Individual Tests
// ============================================================================

async function test1_DatabaseConnectivity(): Promise<TestResult> {
  const testName = 'Database Connectivity';
  console.log(`${COLORS.yellow}Running Test 1: ${testName}...${COLORS.reset}`);

  const startTime = Date.now();

  try {
    const mainDb = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Check backtest tables exist
    const { data: runs, error: runsError } = await mainDb
      .from('ips_backtest_runs')
      .select('*', { count: 'exact', head: true });

    if (runsError) {
      throw new Error(`Failed to query ips_backtest_runs: ${runsError.message}`);
    }

    const { data: results, error: resultsError } = await mainDb
      .from('ips_backtest_results')
      .select('*', { count: 'exact', head: true });

    if (resultsError) {
      throw new Error(`Failed to query ips_backtest_results: ${resultsError.message}`);
    }

    const { data: matches, error: matchesError } = await mainDb
      .from('ips_backtest_trade_matches')
      .select('*', { count: 'exact', head: true });

    if (matchesError) {
      throw new Error(`Failed to query ips_backtest_trade_matches: ${matchesError.message}`);
    }

    console.log(`${COLORS.green}✓ Test 1 Passed${COLORS.reset}`);
    console.log(`  Tables verified: ips_backtest_runs, ips_backtest_results, ips_backtest_trade_matches\n`);

    return {
      name: testName,
      status: 'passed',
      duration_ms: Date.now() - startTime,
      details: {
        runs_count: runs?.length || 0,
        results_count: results?.length || 0,
        matches_count: matches?.length || 0,
      },
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

async function test2_FetchIPSConfigurations(): Promise<TestResult> {
  const testName = 'Fetch IPS Configurations';
  console.log(`${COLORS.yellow}Running Test 2: ${testName}...${COLORS.reset}`);

  const startTime = Date.now();

  try {
    const mainDb = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const { data: configs, error } = await mainDb
      .from('ips_configurations')
      .select('id, name, user_id')
      .limit(5);

    if (error) {
      throw new Error(`Failed to fetch IPS configurations: ${error.message}`);
    }

    if (!configs || configs.length === 0) {
      throw new Error('No IPS configurations found in database');
    }

    // Fetch factors for first IPS
    const { data: factors, error: factorsError } = await mainDb
      .from('ips_factors')
      .select('*')
      .eq('ips_id', configs[0].id);

    if (factorsError) {
      throw new Error(`Failed to fetch IPS factors: ${factorsError.message}`);
    }

    console.log(`${COLORS.green}✓ Test 2 Passed${COLORS.reset}`);
    console.log(`  Found ${configs.length} IPS configurations`);
    console.log(`  First IPS: ${configs[0].name} (${factors?.length || 0} factors)\n`);

    return {
      name: testName,
      status: 'passed',
      duration_ms: Date.now() - startTime,
      details: {
        configs_count: configs.length,
        first_ips_id: configs[0].id,
        first_ips_name: configs[0].name,
        first_ips_factors: factors?.length || 0,
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

async function test3_FetchHistoricalTrades(): Promise<TestResult> {
  const testName = 'Fetch Historical Trades';
  console.log(`${COLORS.yellow}Running Test 3: ${testName}...${COLORS.reset}`);

  const startTime = Date.now();

  try {
    const mainDb = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Get closed trades from last 3 months
    const threeMonthsAgo = new Date();
    threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);

    const { data: trades, error } = await mainDb
      .from('trades')
      .select('id, symbol, status, realized_pl, realized_pl_percent, created_at, closed_at')
      .eq('status', 'closed')
      .gte('closed_at', threeMonthsAgo.toISOString())
      .order('closed_at', { ascending: false })
      .limit(100);

    if (error) {
      throw new Error(`Failed to fetch historical trades: ${error.message}`);
    }

    if (!trades || trades.length === 0) {
      console.log(`${COLORS.yellow}⚠ Test 3 Warning: No historical trades found${COLORS.reset}\n`);
      return {
        name: testName,
        status: 'skipped',
        duration_ms: Date.now() - startTime,
        details: {
          message: 'No historical trades found for backtesting',
        },
      };
    }

    const winningTrades = trades.filter((t) => (t.realized_pl || 0) > 0);
    const losingTrades = trades.filter((t) => (t.realized_pl || 0) < 0);
    const winRate = (winningTrades.length / trades.length) * 100;

    console.log(`${COLORS.green}✓ Test 3 Passed${COLORS.reset}`);
    console.log(`  Found ${trades.length} historical trades (last 3 months)`);
    console.log(`  Win Rate: ${winRate.toFixed(2)}%`);
    console.log(`  Winners: ${winningTrades.length}, Losers: ${losingTrades.length}\n`);

    return {
      name: testName,
      status: 'passed',
      duration_ms: Date.now() - startTime,
      details: {
        total_trades: trades.length,
        winning_trades: winningTrades.length,
        losing_trades: losingTrades.length,
        win_rate: winRate,
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

async function test4_SingleIPSBacktest(): Promise<TestResult> {
  const testName = 'Single IPS Backtest';
  console.log(`${COLORS.yellow}Running Test 4: ${testName}...${COLORS.reset}`);

  const startTime = Date.now();

  try {
    const mainDb = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Get first IPS configuration
    const { data: configs, error: configError } = await mainDb
      .from('ips_configurations')
      .select('*')
      .limit(1)
      .single();

    if (configError || !configs) {
      throw new Error('No IPS configuration found');
    }

    // Get factors
    const { data: factors } = await mainDb
      .from('ips_factors')
      .select('*')
      .eq('ips_id', configs.id);

    // Set date range (last month)
    const endDate = new Date();
    const startDate = new Date();
    startDate.setMonth(startDate.getMonth() - 1);

    // Run backtest
    const backtester = new IPSBacktester();
    const backtestConfig: BacktestConfig = {
      ipsId: configs.id,
      ipsName: configs.name,
      ipsConfig: {
        ...configs,
        factors: factors || [],
      },
      startDate: startDate.toISOString().split('T')[0],
      endDate: endDate.toISOString().split('T')[0],
      userId: configs.user_id,
    };

    const result = await backtester.runBacktest(backtestConfig);

    console.log(`${COLORS.green}✓ Test 4 Passed${COLORS.reset}`);
    console.log(`  IPS: ${configs.name}`);
    console.log(`  Period: ${backtestConfig.startDate} to ${backtestConfig.endDate}`);
    console.log(`  Trades Analyzed: ${result.totalTradesAnalyzed}`);
    console.log(`  Win Rate: ${result.winRate.toFixed(2)}%`);
    console.log(`  Avg ROI: ${result.avgRoi.toFixed(2)}%`);
    console.log(`  Sharpe Ratio: ${result.sharpeRatio?.toFixed(2) || 'N/A'}\n`);

    return {
      name: testName,
      status: 'passed',
      duration_ms: Date.now() - startTime,
      details: {
        run_id: result.runId,
        ips_name: configs.name,
        total_trades: result.totalTradesAnalyzed,
        win_rate: result.winRate,
        avg_roi: result.avgRoi,
        sharpe_ratio: result.sharpeRatio,
      },
    };
  } catch (error: any) {
    console.log(`${COLORS.red}✗ Test 4 Failed: ${error.message}${COLORS.reset}\n`);
    return {
      name: testName,
      status: 'failed',
      duration_ms: Date.now() - startTime,
      error: error.message,
    };
  }
}

async function test5_IPSComparison(): Promise<TestResult> {
  const testName = 'IPS Comparison';
  console.log(`${COLORS.yellow}Running Test 5: ${testName}...${COLORS.reset}`);

  const startTime = Date.now();

  try {
    const mainDb = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Get multiple IPS configurations
    const { data: configs, error: configError } = await mainDb
      .from('ips_configurations')
      .select('id, name')
      .limit(2);

    if (configError || !configs || configs.length < 2) {
      console.log(`${COLORS.yellow}⚠ Test 5 Skipped: Need at least 2 IPS configurations${COLORS.reset}\n`);
      return {
        name: testName,
        status: 'skipped',
        duration_ms: Date.now() - startTime,
        details: {
          message: 'Not enough IPS configurations for comparison',
        },
      };
    }

    const ipsIds = configs.map((c) => c.id);

    // Set date range (last month)
    const endDate = new Date();
    const startDate = new Date();
    startDate.setMonth(startDate.getMonth() - 1);

    // Run comparison
    const comparison = await compareIPSs(
      ipsIds,
      startDate.toISOString().split('T')[0],
      endDate.toISOString().split('T')[0],
      {
        comparisonName: 'Test Comparison',
      }
    );

    console.log(`${COLORS.green}✓ Test 5 Passed${COLORS.reset}`);
    console.log(`  Compared ${ipsIds.length} IPS configurations`);
    console.log(`  Best Win Rate: ${comparison.winner.best_win_rate}`);
    console.log(`  Best ROI: ${comparison.winner.best_roi}`);
    console.log(`  Best Overall: ${comparison.winner.best_overall}\n`);

    return {
      name: testName,
      status: 'passed',
      duration_ms: Date.now() - startTime,
      details: {
        ips_count: ipsIds.length,
        winner: comparison.winner,
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

async function test6_LeaderboardGeneration(): Promise<TestResult> {
  const testName = 'Leaderboard Generation';
  console.log(`${COLORS.yellow}Running Test 6: ${testName}...${COLORS.reset}`);

  const startTime = Date.now();

  try {
    const leaderboard = await getIPSLeaderboard({
      limit: 10,
      minBacktestCount: 0,
    });

    if (leaderboard.rankings.length === 0) {
      console.log(`${COLORS.yellow}⚠ Test 6 Warning: No rankings available${COLORS.reset}\n`);
      return {
        name: testName,
        status: 'skipped',
        duration_ms: Date.now() - startTime,
        details: {
          message: 'No IPS rankings available yet',
        },
      };
    }

    console.log(`${COLORS.green}✓ Test 6 Passed${COLORS.reset}`);
    console.log(`  Generated leaderboard with ${leaderboard.rankings.length} entries`);
    if (leaderboard.rankings.length > 0) {
      const top = leaderboard.rankings[0];
      console.log(`  Top IPS: ${top.ips_name}`);
      console.log(`  Score: ${top.composite_score.toFixed(2)}`);
    }
    console.log('');

    return {
      name: testName,
      status: 'passed',
      duration_ms: Date.now() - startTime,
      details: {
        rankings_count: leaderboard.rankings.length,
        top_ips: leaderboard.rankings[0]?.ips_name,
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

async function test7_OptimizationSuggestions(): Promise<TestResult> {
  const testName = 'Optimization Suggestions';
  console.log(`${COLORS.yellow}Running Test 7: ${testName}...${COLORS.reset}`);

  const startTime = Date.now();

  try {
    const mainDb = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Find a completed backtest run
    const { data: runs, error: runsError } = await mainDb
      .from('ips_backtest_runs')
      .select('id, ips_id')
      .eq('status', 'completed')
      .limit(1);

    if (runsError || !runs || runs.length === 0) {
      console.log(`${COLORS.yellow}⚠ Test 7 Skipped: No completed backtests found${COLORS.reset}\n`);
      return {
        name: testName,
        status: 'skipped',
        duration_ms: Date.now() - startTime,
        details: {
          message: 'No completed backtests to analyze',
        },
      };
    }

    const suggestions = await getIPSOptimizations(runs[0].ips_id, runs[0].id);

    console.log(`${COLORS.green}✓ Test 7 Passed${COLORS.reset}`);
    console.log(`  Analyzed IPS: ${suggestions.ips_id}`);
    console.log(`  Weak Factors: ${suggestions.weak_factors.length}`);
    console.log(`  Strong Factors: ${suggestions.strong_factors.length}`);
    console.log(`  Recommendations: ${suggestions.recommended_adjustments.length}\n`);

    return {
      name: testName,
      status: 'passed',
      duration_ms: Date.now() - startTime,
      details: {
        weak_factors_count: suggestions.weak_factors.length,
        strong_factors_count: suggestions.strong_factors.length,
        recommendations_count: suggestions.recommended_adjustments.length,
      },
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
