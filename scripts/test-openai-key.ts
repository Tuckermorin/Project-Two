// Quick test to verify OpenAI API key works
// Run with: npx tsx scripts/test-openai-key.ts

import { config } from "dotenv";
import { resolve } from "path";
import OpenAI from "openai";

// Load .env file
config({ path: resolve(__dirname, "../.env") });

async function testOpenAIKey() {
  console.log("🔑 Testing OpenAI API Key...\n");

  if (!process.env.OPENAI_API_KEY) {
    console.error("❌ OPENAI_API_KEY not found in environment");
    console.error("   Make sure it's set in your .env file");
    process.exit(1);
  }

  console.log("✅ OPENAI_API_KEY found in environment");
  console.log(`   Key starts with: ${process.env.OPENAI_API_KEY.substring(0, 10)}...`);

  try {
    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });

    console.log("\n📡 Testing embedding generation...");

    const response = await openai.embeddings.create({
      model: "text-embedding-3-small",
      input: "Test: AAPL put credit spread, delta 0.15, IV rank 62",
    });

    const embedding = response.data[0].embedding;

    console.log("✅ Successfully generated embedding!");
    console.log(`   Embedding dimensions: ${embedding.length}`);
    console.log(`   First 5 values: [${embedding.slice(0, 5).map(v => v.toFixed(4)).join(', ')}...]`);
    console.log(`   Model used: ${response.model}`);
    console.log(`   Total tokens: ${response.usage.total_tokens}`);

    console.log("\n🎉 OpenAI API key is working correctly!");
    console.log("   You're ready to seed RAG embeddings.");

  } catch (error: any) {
    console.error("\n❌ OpenAI API test failed:");
    console.error(`   Error: ${error.message}`);

    if (error.message.includes("401")) {
      console.error("\n   This looks like an authentication error.");
      console.error("   Please check that your API key is correct.");
    } else if (error.message.includes("429")) {
      console.error("\n   Rate limit exceeded.");
      console.error("   Wait a moment and try again.");
    }

    process.exit(1);
  }
}

testOpenAIKey().catch(console.error);
