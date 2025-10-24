#!/usr/bin/env node
// CLI Script: IPS Backtesting Tool
// Usage:
//   npm run backtest-ips -- --ips-id <uuid>
//   npm run backtest-ips -- --compare <uuid1>,<uuid2>,<uuid3>
//   npm run backtest-ips -- --leaderboard
//   npm run backtest-ips -- --optimize <uuid>

import dotenv from 'dotenv';
dotenv.config();

import { createClient } from '@supabase/supabase-js';
import { IPSBacktester, type BacktestConfig } from '../src/lib/agent/ips-backtester';
import {
  getIPSPerformanceCalculator,
  type IPSComparison,
  type IPSRankings,
  type OptimizationSuggestion,
} from '../src/lib/services/ips-performance-calculator';

// ============================================================================
// Configuration
// ============================================================================

const COLORS = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
};

// ============================================================================
// CLI Arguments Parser
// ============================================================================

function parseArgs(): any {
  const args = process.argv.slice(2);
  const parsed: any = {
    mode: null,
    ipsId: null,
    compareIds: [],
    startDate: null,
    endDate: null,
    symbols: [],
    strategyFilter: null,
    limit: 20,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    switch (arg) {
      case '--ips-id':
        parsed.mode = 'single';
        parsed.ipsId = args[++i];
        break;
      case '--compare':
        parsed.mode = 'compare';
        parsed.compareIds = args[++i].split(',');
        break;
      case '--leaderboard':
        parsed.mode = 'leaderboard';
        break;
      case '--optimize':
        parsed.mode = 'optimize';
        parsed.ipsId = args[++i];
        break;
      case '--start-date':
        parsed.startDate = args[++i];
        break;
      case '--end-date':
        parsed.endDate = args[++i];
        break;
      case '--symbols':
        parsed.symbols = args[++i].split(',');
        break;
      case '--strategy':
        parsed.strategyFilter = args[++i];
        break;
      case '--limit':
        parsed.limit = parseInt(args[++i], 10);
        break;
      case '--help':
      case '-h':
        printHelp();
        process.exit(0);
        break;
      default:
        console.error(`${COLORS.red}Unknown argument: ${arg}${COLORS.reset}`);
        printHelp();
        process.exit(1);
    }
  }

  return parsed;
}

function printHelp(): void {
  console.log(`
${COLORS.bright}IPS Backtesting CLI Tool${COLORS.reset}

${COLORS.cyan}Usage:${COLORS.reset}
  npm run backtest-ips -- [options]

${COLORS.cyan}Modes:${COLORS.reset}
  ${COLORS.green}--ips-id <uuid>${COLORS.reset}          Run backtest for single IPS
  ${COLORS.green}--compare <id1>,<id2>${COLORS.reset}    Compare multiple IPS configurations
  ${COLORS.green}--leaderboard${COLORS.reset}             Show IPS performance rankings
  ${COLORS.green}--optimize <uuid>${COLORS.reset}         Get optimization suggestions for IPS

${COLORS.cyan}Options:${COLORS.reset}
  ${COLORS.green}--start-date <date>${COLORS.reset}      Start date (YYYY-MM-DD)
  ${COLORS.green}--end-date <date>${COLORS.reset}        End date (YYYY-MM-DD)
  ${COLORS.green}--symbols <sym1>,<sym2>${COLORS.reset}  Filter by symbols
  ${COLORS.green}--strategy <type>${COLORS.reset}        Filter by strategy type
  ${COLORS.green}--limit <n>${COLORS.reset}              Limit results (default: 20)
  ${COLORS.green}--help, -h${COLORS.reset}               Show this help message

${COLORS.cyan}Examples:${COLORS.reset}
  # Run backtest for single IPS
  npm run backtest-ips -- --ips-id f6b1f402-2c5c-49a3-8af3-848f2e4ee638 --start-date 2024-01-01 --end-date 2024-12-31

  # Compare three IPS configurations
  npm run backtest-ips -- --compare id1,id2,id3 --start-date 2024-01-01 --end-date 2024-12-31

  # Show leaderboard
  npm run backtest-ips -- --leaderboard --limit 10

  # Get optimization suggestions
  npm run backtest-ips -- --optimize f6b1f402-2c5c-49a3-8af3-848f2e4ee638
  `);
}

// ============================================================================
// Main CLI Logic
// ============================================================================

async function main(): Promise<void> {
  const args = parseArgs();

  if (!args.mode) {
    console.error(`${COLORS.red}Error: No mode specified${COLORS.reset}\n`);
    printHelp();
    process.exit(1);
  }

  console.log(`${COLORS.bright}${COLORS.blue}IPS Backtesting Tool${COLORS.reset}\n`);

  try {
    switch (args.mode) {
      case 'single':
        await runSingleBacktest(args);
        break;
      case 'compare':
        await runComparison(args);
        break;
      case 'leaderboard':
        await showLeaderboard(args);
        break;
      case 'optimize':
        await showOptimizations(args);
        break;
      default:
        console.error(`${COLORS.red}Unknown mode: ${args.mode}${COLORS.reset}`);
        process.exit(1);
    }
  } catch (error: any) {
    console.error(`${COLORS.red}Error: ${error.message}${COLORS.reset}`);
    console.error(error.stack);
    process.exit(1);
  }
}

// ============================================================================
// Mode Handlers
// ============================================================================

async function runSingleBacktest(args: any): Promise<void> {
  console.log(`${COLORS.cyan}Running backtest for IPS: ${args.ipsId}${COLORS.reset}\n`);

  // Validate dates
  if (!args.startDate || !args.endDate) {
    console.error(`${COLORS.red}Error: --start-date and --end-date are required${COLORS.reset}`);
    process.exit(1);
  }

  const mainDb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // Fetch IPS configuration
  const { data: ipsConfig, error: ipsError } = await mainDb
    .from('ips_configurations')
    .select('*')
    .eq('id', args.ipsId)
    .single();

  if (ipsError || !ipsConfig) {
    console.error(`${COLORS.red}Failed to fetch IPS configuration: ${ipsError?.message}${COLORS.reset}`);
    process.exit(1);
  }

  // Fetch IPS factors
  const { data: factors, error: factorsError } = await mainDb
    .from('ips_factors')
    .select('*')
    .eq('ips_id', args.ipsId);

  if (factorsError) {
    console.error(`${COLORS.red}Failed to fetch IPS factors: ${factorsError.message}${COLORS.reset}`);
    process.exit(1);
  }

  console.log(`${COLORS.green}IPS Name:${COLORS.reset} ${ipsConfig.name}`);
  console.log(`${COLORS.green}Period:${COLORS.reset} ${args.startDate} to ${args.endDate}`);
  console.log(`${COLORS.green}Factors:${COLORS.reset} ${factors?.length || 0}`);
  if (args.symbols && args.symbols.length > 0) {
    console.log(`${COLORS.green}Symbols:${COLORS.reset} ${args.symbols.join(', ')}`);
  }
  console.log('');

  // Run backtest
  const backtester = new IPSBacktester();
  const config: BacktestConfig = {
    ipsId: args.ipsId,
    ipsName: ipsConfig.name,
    ipsConfig: {
      ...ipsConfig,
      factors: factors || [],
    },
    startDate: args.startDate,
    endDate: args.endDate,
    symbols: args.symbols.length > 0 ? args.symbols : undefined,
    strategyFilter: args.strategyFilter,
    userId: ipsConfig.user_id,
  };

  console.log(`${COLORS.yellow}Running backtest...${COLORS.reset}\n`);
  const startTime = Date.now();
  const result = await backtester.runBacktest(config);
  const duration = ((Date.now() - startTime) / 1000).toFixed(2);

  // Display results
  console.log(`${COLORS.bright}${COLORS.green}Backtest Complete!${COLORS.reset} (${duration}s)\n`);

  console.log(`${COLORS.bright}Summary:${COLORS.reset}`);
  console.log(`  Run ID: ${result.runId}`);
  console.log(`  Total Trades Analyzed: ${result.totalTradesAnalyzed}`);
  console.log(`  Trades Passed IPS: ${result.tradesPassed}`);
  console.log(`  Pass Rate: ${result.passRate.toFixed(2)}%`);
  console.log('');

  console.log(`${COLORS.bright}Performance Metrics:${COLORS.reset}`);
  console.log(`  ${COLORS.green}Win Rate:${COLORS.reset} ${result.winRate.toFixed(2)}%`);
  console.log(`  ${COLORS.green}Average ROI:${COLORS.reset} ${result.avgRoi.toFixed(2)}%`);
  console.log(`  ${COLORS.green}Sharpe Ratio:${COLORS.reset} ${result.sharpeRatio?.toFixed(2) || 'N/A'}`);
  console.log('');

  if (result.detailedResults) {
    console.log(`${COLORS.bright}Detailed Metrics:${COLORS.reset}`);
    console.log(`  Total P&L: $${result.detailedResults.totalPnl.toFixed(2)}`);
    console.log(`  Max Win: $${result.detailedResults.maxWin.toFixed(2)}`);
    console.log(`  Max Loss: $${result.detailedResults.maxLoss.toFixed(2)}`);
    console.log(`  Max Drawdown: ${result.detailedResults.maxDrawdown.toFixed(2)}%`);
    console.log(`  Profit Factor: ${result.detailedResults.profitFactor.toFixed(2)}`);
    console.log(`  Win Streak: ${result.detailedResults.winStreakMax}`);
    console.log(`  Loss Streak: ${result.detailedResults.lossStreakMax}`);
  }
}

async function runComparison(args: any): Promise<void> {
  console.log(`${COLORS.cyan}Comparing ${args.compareIds.length} IPS configurations${COLORS.reset}\n`);

  // Validate dates
  if (!args.startDate || !args.endDate) {
    console.error(`${COLORS.red}Error: --start-date and --end-date are required${COLORS.reset}`);
    process.exit(1);
  }

  const calculator = getIPSPerformanceCalculator();

  console.log(`${COLORS.yellow}Running backtests...${COLORS.reset}\n`);
  const startTime = Date.now();

  const comparison: IPSComparison = await calculator.compareIPSConfigurations(
    args.compareIds,
    args.startDate,
    args.endDate,
    {
      comparisonName: `CLI Comparison ${new Date().toISOString()}`,
      symbols: args.symbols.length > 0 ? args.symbols : undefined,
      strategyFilter: args.strategyFilter,
    }
  );

  const duration = ((Date.now() - startTime) / 1000).toFixed(2);

  console.log(`${COLORS.bright}${COLORS.green}Comparison Complete!${COLORS.reset} (${duration}s)\n`);

  // Display results table
  console.log(`${COLORS.bright}Results:${COLORS.reset}`);
  console.log(
    `${'IPS Name'.padEnd(30)} ${'Win Rate'.padEnd(12)} ${'Avg ROI'.padEnd(12)} ${'Sharpe'.padEnd(10)}`
  );
  console.log('-'.repeat(70));

  for (const [ipsId, result] of Object.entries(comparison.results)) {
    const winRateStr = `${result.winRate.toFixed(2)}%`;
    const roiStr = `${result.avgRoi.toFixed(2)}%`;
    const sharpeStr = result.sharpeRatio?.toFixed(2) || 'N/A';

    // Highlight winners
    let color = COLORS.reset;
    if (ipsId === comparison.winner.best_overall) {
      color = COLORS.green + COLORS.bright;
    }

    console.log(
      `${color}${ipsId.slice(0, 30).padEnd(30)} ${winRateStr.padEnd(12)} ${roiStr.padEnd(12)} ${sharpeStr.padEnd(10)}${COLORS.reset}`
    );
  }

  console.log('');
  console.log(`${COLORS.bright}Winners:${COLORS.reset}`);
  console.log(`  ${COLORS.green}Best Win Rate:${COLORS.reset} ${comparison.winner.best_win_rate}`);
  console.log(`  ${COLORS.green}Best ROI:${COLORS.reset} ${comparison.winner.best_roi}`);
  console.log(`  ${COLORS.green}Best Sharpe:${COLORS.reset} ${comparison.winner.best_sharpe}`);
  console.log(`  ${COLORS.green}Best Overall:${COLORS.reset} ${comparison.winner.best_overall}`);
  console.log('');

  if (comparison.statistical_significance.significant_difference) {
    console.log(`${COLORS.yellow}Statistical Significance: Differences are significant${COLORS.reset}`);
  } else {
    console.log(`${COLORS.dim}Statistical Significance: Differences may not be significant${COLORS.reset}`);
  }
}

async function showLeaderboard(args: any): Promise<void> {
  console.log(`${COLORS.cyan}IPS Performance Leaderboard${COLORS.reset}\n`);

  const calculator = getIPSPerformanceCalculator();
  const rankings: IPSRankings = await calculator.getIPSRankings({
    limit: args.limit,
    minBacktestCount: 1,
  });

  if (rankings.rankings.length === 0) {
    console.log(`${COLORS.yellow}No IPS configurations with completed backtests found${COLORS.reset}`);
    return;
  }

  console.log(`${COLORS.bright}Top ${rankings.rankings.length} IPS Configurations${COLORS.reset}`);
  console.log(`Generated: ${new Date(rankings.generated_at).toLocaleString()}\n`);

  console.log(
    `${'#'.padEnd(4)} ${'IPS Name'.padEnd(30)} ${'Score'.padEnd(8)} ${'Win%'.padEnd(8)} ${'ROI%'.padEnd(8)} ${'Sharpe'.padEnd(8)} ${'Tests'.padEnd(6)}`
  );
  console.log('-'.repeat(80));

  for (const entry of rankings.rankings) {
    const rankStr = `${entry.rank}.`;
    const scoreStr = entry.composite_score.toFixed(1);
    const winRateStr = entry.win_rate.toFixed(1) + '%';
    const roiStr = entry.avg_roi.toFixed(1) + '%';
    const sharpeStr = entry.sharpe_ratio.toFixed(2);
    const testsStr = entry.backtest_count.toString();

    // Color top 3
    let color = COLORS.reset;
    if (entry.rank === 1) {
      color = COLORS.green + COLORS.bright;
    } else if (entry.rank === 2) {
      color = COLORS.cyan;
    } else if (entry.rank === 3) {
      color = COLORS.yellow;
    }

    console.log(
      `${color}${rankStr.padEnd(4)} ${entry.ips_name.slice(0, 30).padEnd(30)} ${scoreStr.padEnd(8)} ${winRateStr.padEnd(8)} ${roiStr.padEnd(8)} ${sharpeStr.padEnd(8)} ${testsStr.padEnd(6)}${COLORS.reset}`
    );
  }

  console.log('');
  console.log(`${COLORS.dim}Score = 40% Sharpe + 30% Win Rate + 30% ROI${COLORS.reset}`);
}

async function showOptimizations(args: any): Promise<void> {
  console.log(`${COLORS.cyan}IPS Optimization Suggestions${COLORS.reset}\n`);

  const calculator = getIPSPerformanceCalculator();
  const suggestions: OptimizationSuggestion = await calculator.suggestIPSOptimizations(args.ipsId);

  console.log(`${COLORS.bright}IPS ID:${COLORS.reset} ${suggestions.ips_id}\n`);

  console.log(`${COLORS.bright}Current Performance:${COLORS.reset}`);
  console.log(`  Win Rate: ${suggestions.current_performance.win_rate.toFixed(2)}%`);
  console.log(`  Avg ROI: ${suggestions.current_performance.avg_roi.toFixed(2)}%`);
  console.log(`  Sharpe Ratio: ${suggestions.current_performance.sharpe_ratio.toFixed(2)}`);
  console.log('');

  if (suggestions.weak_factors.length > 0) {
    console.log(`${COLORS.bright}${COLORS.red}Weak Factors (${suggestions.weak_factors.length}):${COLORS.reset}`);
    for (const factor of suggestions.weak_factors) {
      console.log(`  ${COLORS.yellow}${factor.factor_name}${COLORS.reset} (${factor.impact} impact)`);
      console.log(`    ${COLORS.dim}${factor.suggestion}${COLORS.reset}`);
    }
    console.log('');
  }

  if (suggestions.strong_factors.length > 0) {
    console.log(`${COLORS.bright}${COLORS.green}Strong Factors (${suggestions.strong_factors.length}):${COLORS.reset}`);
    for (const factor of suggestions.strong_factors) {
      console.log(
        `  ${factor.factor_name} (correlation: ${(factor.correlation_with_wins * 100).toFixed(1)}%)`
      );
    }
    console.log('');
  }

  if (suggestions.recommended_adjustments.length > 0) {
    console.log(`${COLORS.bright}Recommendations:${COLORS.reset}`);
    for (const rec of suggestions.recommended_adjustments) {
      console.log(`  ${COLORS.cyan}•${COLORS.reset} ${rec}`);
    }
  }
}

// ============================================================================
// Run CLI
// ============================================================================

main().catch((error) => {
  console.error(`${COLORS.red}Fatal error:${COLORS.reset}`, error);
  process.exit(1);
});
