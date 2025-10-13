// Test script for Agent v3
// Run with: npx tsx scripts/tests/test-agent-v3.ts

import { runAgentV3 } from "../../src/lib/agent/options-agent-v3";
import { seedTradeEmbeddings } from "../../src/lib/agent/rag-embeddings";

async function main() {
  const command = process.argv[2];

  if (command === "seed") {
    // Seed RAG embeddings
    const userId = process.argv[3];
    if (!userId) {
      console.error("Usage: npx tsx scripts/test-agent-v3.ts seed <userId>");
      process.exit(1);
    }

    console.log(`🌱 Seeding embeddings for user ${userId}...`);
    const count = await seedTradeEmbeddings(userId);
    console.log(`✅ Embedded ${count} trades`);

  } else if (command === "run") {
    // Run agent
    const symbolsArg = process.argv[3];
    const ipsId = process.argv[4];

    if (!symbolsArg || !ipsId) {
      console.error("Usage: npx tsx scripts/test-agent-v3.ts run <symbols> <ipsId>");
      console.error("Example: npx tsx scripts/test-agent-v3.ts run AAPL,AMD,TSLA abc-123");
      process.exit(1);
    }

    const symbols = symbolsArg.split(",");

    console.log(`🤖 Running Agent v3 with ${symbols.length} symbols...`);
    console.log(`Symbols: ${symbols.join(", ")}`);
    console.log(`IPS ID: ${ipsId}`);
    console.log("");

    const result = await runAgentV3({
      symbols,
      mode: "paper",
      ipsId,
    });

    console.log("\n" + "=".repeat(80));
    console.log("📊 AGENT V3 RESULTS");
    console.log("=".repeat(80) + "\n");

    console.log(`Run ID: ${result.runId}`);
    console.log(`Candidates Generated: ${result.candidates?.length || 0}`);
    console.log(`Selected Trades: ${result.selected?.length || 0}`);
    console.log(`Errors: ${result.errors?.length || 0}\n`);

    if (result.reasoningDecisions && result.reasoningDecisions.length > 0) {
      console.log("🧠 Reasoning Decisions:");
      result.reasoningDecisions.forEach((d, i) => {
        console.log(`  ${i + 1}. ${d.checkpoint}`);
        console.log(`     Decision: ${d.decision}`);
        console.log(`     Reasoning: ${d.reasoning}`);
        console.log("");
      });
    }

    if (result.selected && result.selected.length > 0) {
      console.log("\n✅ Selected Trades:\n");
      result.selected.forEach((trade, i) => {
        console.log(`${i + 1}. ${trade.symbol} ${trade.strategy}`);
        console.log(`   Entry: $${trade.entry_mid?.toFixed(2)} | Max Profit: $${trade.max_profit?.toFixed(2)} | Max Loss: $${trade.max_loss?.toFixed(2)}`);
        console.log(`   IPS Score: ${trade.ips_score?.toFixed(1)}% | Composite: ${trade.composite_score?.toFixed(1)}`);

        if (trade.historical_analysis?.has_data) {
          console.log(`   Historical: ${(trade.historical_analysis.win_rate * 100).toFixed(1)}% win rate (${trade.historical_analysis.trade_count} similar trades)`);
        } else {
          console.log(`   Historical: No data available`);
        }

        if (trade.diversification_warnings && trade.diversification_warnings.length > 0) {
          console.log(`   Warnings: ${trade.diversification_warnings.join(", ")}`);
        }
        console.log("");
      });
    }

    if (result.errors && result.errors.length > 0) {
      console.log("\n❌ Errors:\n");
      result.errors.forEach((error, i) => {
        console.log(`  ${i + 1}. ${error}`);
      });
    }

  } else {
    console.log("Usage:");
    console.log("  npx tsx scripts/test-agent-v3.ts seed <userId>");
    console.log("  npx tsx scripts/test-agent-v3.ts run <symbols> <ipsId>");
    console.log("");
    console.log("Examples:");
    console.log("  npx tsx scripts/test-agent-v3.ts seed user-abc-123");
    console.log("  npx tsx scripts/test-agent-v3.ts run AAPL,AMD,TSLA ips-xyz-789");
  }
}

main().catch(console.error);
