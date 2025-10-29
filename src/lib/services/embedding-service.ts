/**
 * Unified Embedding Service
 *
 * Supports multiple embedding providers:
 * - OpenAI (text-embedding-3-large, text-embedding-3-small)
 * - Ollama (local models)
 *
 * Configured to output 2000 dimensions for Supabase HNSW index compatibility
 */

import OpenAI from 'openai';

// Lazy initialization of OpenAI client
let openai: OpenAI | null = null;

function getOpenAIClient(): OpenAI {
  if (!openai) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY not configured in environment variables');
    }
    openai = new OpenAI({ apiKey });
  }
  return openai;
}

// ============================================================================
// Configuration
// ============================================================================

const EMBEDDING_PROVIDER = process.env.EMBEDDING_PROVIDER || 'openai';
const TARGET_DIMENSIONS = 2000; // Supabase HNSW index limit

// OpenAI configuration
const OPENAI_MODEL = process.env.OPENAI_EMBEDDING_MODEL || 'text-embedding-3-large';
const OPENAI_DIMENSIONS = parseInt(process.env.OPENAI_EMBEDDING_DIMENSIONS || '2000');

// Ollama configuration
const OLLAMA_HOST = process.env.OLLAMA_HOST || 'http://golem:11434';
const OLLAMA_MODEL = process.env.OLLAMA_EMBEDDING_MODEL || 'nomic-embed-text:latest';

// ============================================================================
// OpenAI Provider
// ============================================================================

async function generateOpenAIEmbedding(text: string): Promise<number[]> {
  try {
    const client = getOpenAIClient();
    console.log(`[Embedding] Using OpenAI ${OPENAI_MODEL} with ${OPENAI_DIMENSIONS} dimensions`);

    const response = await client.embeddings.create({
      model: OPENAI_MODEL,
      input: text,
      dimensions: OPENAI_DIMENSIONS, // OpenAI supports custom dimensions
    });

    const embedding = response.data[0].embedding;

    // Verify dimensions
    if (embedding.length !== OPENAI_DIMENSIONS) {
      console.warn(
        `[Embedding] Expected ${OPENAI_DIMENSIONS} dimensions, got ${embedding.length}`
      );
    }

    return embedding;
  } catch (error: any) {
    console.error('[Embedding] OpenAI embedding failed:', error.message);
    throw new Error(`OpenAI embedding failed: ${error.message}`);
  }
}

async function generateOpenAIEmbeddings(texts: string[]): Promise<number[][]> {
  try {
    const client = getOpenAIClient();
    console.log(
      `[Embedding] Batch generating ${texts.length} embeddings with OpenAI ${OPENAI_MODEL}`
    );

    const response = await client.embeddings.create({
      model: OPENAI_MODEL,
      input: texts,
      dimensions: OPENAI_DIMENSIONS,
    });

    return response.data.map((item) => item.embedding);
  } catch (error: any) {
    console.error('[Embedding] OpenAI batch embedding failed:', error.message);
    throw new Error(`OpenAI batch embedding failed: ${error.message}`);
  }
}

// ============================================================================
// Ollama Provider
// ============================================================================

async function generateOllamaEmbedding(text: string): Promise<number[]> {
  try {
    console.log(`[Embedding] Using Ollama ${OLLAMA_MODEL} at ${OLLAMA_HOST}`);

    const response = await fetch(`${OLLAMA_HOST}/api/embeddings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: OLLAMA_MODEL,
        prompt: text,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Ollama API error (${response.status}): ${errorText}`);
    }

    const data = await response.json();
    let embedding = data.embedding;

    // Truncate or pad to target dimensions
    if (embedding.length > TARGET_DIMENSIONS) {
      console.log(
        `[Embedding] Truncating from ${embedding.length} to ${TARGET_DIMENSIONS} dimensions`
      );
      embedding = embedding.slice(0, TARGET_DIMENSIONS);
    } else if (embedding.length < TARGET_DIMENSIONS) {
      console.warn(
        `[Embedding] Padding from ${embedding.length} to ${TARGET_DIMENSIONS} dimensions`
      );
      embedding = [
        ...embedding,
        ...new Array(TARGET_DIMENSIONS - embedding.length).fill(0),
      ];
    }

    return embedding;
  } catch (error: any) {
    console.error('[Embedding] Ollama embedding failed:', error.message);
    throw new Error(`Ollama embedding failed: ${error.message}`);
  }
}

async function generateOllamaEmbeddings(texts: string[]): Promise<number[][]> {
  const embeddings: number[][] = [];

  for (const text of texts) {
    const embedding = await generateOllamaEmbedding(text);
    embeddings.push(embedding);

    // Small delay to avoid overwhelming the server
    if (texts.length > 1) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }

  return embeddings;
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Generate a single embedding using the configured provider
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  if (EMBEDDING_PROVIDER === 'openai') {
    return generateOpenAIEmbedding(text);
  } else if (EMBEDDING_PROVIDER === 'ollama') {
    return generateOllamaEmbedding(text);
  } else {
    throw new Error(`Unknown embedding provider: ${EMBEDDING_PROVIDER}`);
  }
}

/**
 * Generate multiple embeddings using the configured provider
 */
export async function generateEmbeddings(texts: string[]): Promise<number[][]> {
  if (EMBEDDING_PROVIDER === 'openai') {
    return generateOpenAIEmbeddings(texts);
  } else if (EMBEDDING_PROVIDER === 'ollama') {
    return generateOllamaEmbeddings(texts);
  } else {
    throw new Error(`Unknown embedding provider: ${EMBEDDING_PROVIDER}`);
  }
}

/**
 * Get the configured embedding dimensions
 */
export function getEmbeddingDimensions(): number {
  return TARGET_DIMENSIONS;
}

/**
 * Get the configured embedding provider
 */
export function getEmbeddingProvider(): string {
  return EMBEDDING_PROVIDER;
}

/**
 * Get the configured model name
 */
export function getEmbeddingModel(): string {
  if (EMBEDDING_PROVIDER === 'openai') {
    return OPENAI_MODEL;
  } else if (EMBEDDING_PROVIDER === 'ollama') {
    return OLLAMA_MODEL;
  }
  return 'unknown';
}

/**
 * Test the embedding service configuration
 */
export async function testEmbeddingService(): Promise<boolean> {
  try {
    console.log(`[Embedding] Testing ${EMBEDDING_PROVIDER} provider...`);
    const testText = 'This is a test embedding';
    const embedding = await generateEmbedding(testText);

    console.log(`[Embedding] ✓ Generated ${embedding.length}-dimensional embedding`);

    if (embedding.length !== TARGET_DIMENSIONS) {
      console.warn(
        `[Embedding] Warning: Expected ${TARGET_DIMENSIONS} dimensions, got ${embedding.length}`
      );
    }

    return true;
  } catch (error: any) {
    console.error('[Embedding] Test failed:', error.message);
    return false;
  }
}
