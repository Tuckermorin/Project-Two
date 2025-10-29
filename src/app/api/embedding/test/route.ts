// API endpoint to test embedding service configuration
import { NextRequest, NextResponse } from 'next/server';
import {
  testEmbeddingService,
  getEmbeddingProvider,
  getEmbeddingModel,
  getEmbeddingDimensions,
  generateEmbedding,
} from '@/lib/services/embedding-service';

export async function GET(request: NextRequest) {
  try {
    console.log('[Embedding Test] Testing embedding service...');

    // Get configuration
    const provider = getEmbeddingProvider();
    const model = getEmbeddingModel();
    const dimensions = getEmbeddingDimensions();

    console.log(`[Embedding Test] Provider: ${provider}`);
    console.log(`[Embedding Test] Model: ${model}`);
    console.log(`[Embedding Test] Dimensions: ${dimensions}`);

    // Test embedding generation
    const testText = 'This is a test trade: AAPL 180/185 Call Credit Spread, 30 DTE, 0.30 delta';
    const startTime = Date.now();
    const embedding = await generateEmbedding(testText);
    const duration = Date.now() - startTime;

    // Validate embedding
    const isValid = Array.isArray(embedding) && embedding.length === dimensions;

    return NextResponse.json({
      success: true,
      config: {
        provider,
        model,
        target_dimensions: dimensions,
        actual_dimensions: embedding.length,
      },
      test: {
        text: testText,
        duration_ms: duration,
        valid: isValid,
        sample: embedding.slice(0, 5), // First 5 dimensions as sample
      },
    });
  } catch (error: any) {
    console.error('[Embedding Test] Error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error.message,
        provider: getEmbeddingProvider(),
        model: getEmbeddingModel(),
      },
      { status: 500 }
    );
  }
}
