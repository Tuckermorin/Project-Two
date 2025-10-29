/**
 * Quick test script for embedding service
 * Usage: npx tsx src/scripts/test-embeddings.ts
 */

import dotenv from 'dotenv';
import { generateEmbedding, getEmbeddingProvider, getEmbeddingModel, getEmbeddingDimensions } from '../lib/services/embedding-service';

dotenv.config();

async function test() {
  console.log('🧪 Testing Embedding Service');
  console.log('====================================');
  console.log(`Provider: ${getEmbeddingProvider()}`);
  console.log(`Model: ${getEmbeddingModel()}`);
  console.log(`Target Dimensions: ${getEmbeddingDimensions()}`);
  console.log('====================================\n');

  const testText = 'AAPL 180/185 Call Credit Spread, 30 DTE, 0.30 delta, high IV rank';
  console.log(`Test text: "${testText}"\n`);

  console.log('Generating embedding...');
  const start = Date.now();
  const embedding = await generateEmbedding(testText);
  const duration = Date.now() - start;

  console.log(`\n✅ Generated ${embedding.length}-dimensional embedding`);
  console.log(`⏱️  Duration: ${duration}ms`);
  console.log(`📊 Sample (first 10 dims):`);
  console.log(`   [${embedding.slice(0, 10).map(n => n.toFixed(4)).join(', ')}...]`);

  // Verify dimensions
  if (embedding.length === getEmbeddingDimensions()) {
    console.log(`\n✨ Success! Embeddings are working correctly with ${embedding.length} dimensions!`);
  } else {
    console.log(`\n⚠️  Warning: Expected ${getEmbeddingDimensions()} dimensions, got ${embedding.length}`);
  }
}

test().catch((error) => {
  console.error('\n❌ Error:', error.message);
  process.exit(1);
});
