/**
 * Ollama Embedding Service
 *
 * Provides vector embeddings using qwen3-embedding model
 * Running on local Ollama server for privacy and cost savings
 *
 * Model: qwen3-embedding:latest
 * Dimensions: 2000 (configured to match Supabase HNSW index limit)
 * Base URL: golem:11434 (or configured OLLAMA_BASE_URL)
 */

interface OllamaEmbeddingResponse {
  embedding: number[];
}

interface OllamaEmbeddingRequest {
  model: string;
  prompt: string;
  options?: {
    num_ctx?: number;
    truncate?: boolean;
  };
}

export class OllamaEmbeddingService {
  private baseUrl: string;
  private model: string;
  private dimensions: number;

  constructor() {
    // Normalize base URL - remove trailing slashes and /api/chat paths
    const rawUrl = process.env.OLLAMA_BASE_URL || process.env.OLLAMA_HOST || 'http://golem:11434';
    this.baseUrl = this.normalizeBaseUrl(rawUrl);
    this.model = process.env.OLLAMA_EMBEDDING_MODEL || 'qwen3-embedding:latest';
    this.dimensions = 2000; // Configured to match Supabase HNSW index limit (max 2000 dims)

    console.log(`[OllamaEmbedding] Initialized with model ${this.model} at ${this.baseUrl}`);
  }

  /**
   * Normalize Ollama base URL
   */
  private normalizeBaseUrl(raw: string): string {
    const trimmed = raw.trim();

    // Remove /api/chat or /api if present
    let normalized = trimmed.replace(/\/api\/chat\/?$/i, '').replace(/\/api\/?$/i, '');

    // Remove trailing slash
    normalized = normalized.replace(/\/$/, '');

    // Ensure http:// or https://
    if (!normalized.startsWith('http://') && !normalized.startsWith('https://')) {
      normalized = `http://${normalized}`;
    }

    return normalized;
  }

  /**
   * Generate embedding for a single text
   */
  async generateEmbedding(text: string): Promise<number[]> {
    try {
      const url = `${this.baseUrl}/api/embeddings`;

      const requestBody: OllamaEmbeddingRequest = {
        model: this.model,
        prompt: text,
        options: {
          truncate: true // Enable truncation for dimension control
        }
      };

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Ollama embedding failed (${response.status}): ${errorText}`);
      }

      const data: OllamaEmbeddingResponse = await response.json();

      if (!data.embedding || !Array.isArray(data.embedding)) {
        throw new Error('Invalid embedding response from Ollama');
      }

      // Truncate to desired dimensions if needed
      let embedding = data.embedding;
      if (embedding.length > this.dimensions) {
        console.log(
          `[OllamaEmbedding] Truncating embedding from ${embedding.length} to ${this.dimensions} dimensions`
        );
        embedding = embedding.slice(0, this.dimensions);
      } else if (embedding.length < this.dimensions) {
        console.warn(
          `[OllamaEmbedding] Expected ${this.dimensions} dimensions, got ${embedding.length}. Padding with zeros.`
        );
        // Pad with zeros if needed
        embedding = [...embedding, ...new Array(this.dimensions - embedding.length).fill(0)];
      }

      return embedding;

    } catch (error: any) {
      console.error('[OllamaEmbedding] Failed to generate embedding:', error.message);
      throw new Error(`Embedding generation failed: ${error.message}`);
    }
  }

  /**
   * Generate embeddings for multiple texts (batched)
   */
  async generateEmbeddings(texts: string[]): Promise<number[][]> {
    const embeddings: number[][] = [];

    for (const text of texts) {
      const embedding = await this.generateEmbedding(text);
      embeddings.push(embedding);

      // Small delay to avoid overwhelming the server
      if (texts.length > 1) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

    return embeddings;
  }

  /**
   * Get embedding dimensions
   */
  getDimensions(): number {
    return this.dimensions;
  }

  /**
   * Get model name
   */
  getModel(): string {
    return this.model;
  }

  /**
   * Test connection to Ollama server
   */
  async testConnection(): Promise<boolean> {
    try {
      const url = `${this.baseUrl}/api/tags`;
      const response = await fetch(url);

      if (!response.ok) {
        throw new Error(`Failed to connect: ${response.status}`);
      }

      const data = await response.json();

      // Check if embedding model is available
      const hasModel = data.models?.some((m: any) => m.name === this.model);

      if (!hasModel) {
        console.warn(`[OllamaEmbedding] Model ${this.model} not found on server`);
        console.warn('[OllamaEmbedding] Available models:', data.models?.map((m: any) => m.name));
        return false;
      }

      console.log(`[OllamaEmbedding] Connection successful, model ${this.model} available`);
      return true;

    } catch (error: any) {
      console.error('[OllamaEmbedding] Connection test failed:', error.message);
      return false;
    }
  }
}

// Singleton instance
let embeddingService: OllamaEmbeddingService | null = null;

/**
 * Get the shared Ollama embedding service instance
 */
export function getOllamaEmbeddingService(): OllamaEmbeddingService {
  if (!embeddingService) {
    embeddingService = new OllamaEmbeddingService();
  }
  return embeddingService;
}

/**
 * Convenience function to generate a single embedding
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  const service = getOllamaEmbeddingService();
  return service.generateEmbedding(text);
}

/**
 * Convenience function to generate multiple embeddings
 */
export async function generateEmbeddings(texts: string[]): Promise<number[][]> {
  const service = getOllamaEmbeddingService();
  return service.generateEmbeddings(texts);
}
