/**
 * Token bucket rate limiter for Tavily API
 * - Dev: 100 RPM
 * - Prod: 1000 RPM
 * - Queues requests when limit exceeded
 */

/**
 * Token Bucket Implementation
 */
class TokenBucket {
  private tokens: number;
  private lastRefill: number;
  private queue: Array<{
    resolve: () => void;
    reject: (error: Error) => void;
    timestamp: number;
  }> = [];

  constructor(
    private capacity: number,      // Max tokens (e.g., 100 for dev, 1000 for prod)
    private refillRate: number,    // Tokens per minute
    private maxQueueSize: number = 100
  ) {
    this.tokens = capacity;
    this.lastRefill = Date.now();
  }

  /**
   * Refill tokens based on time elapsed
   */
  private refill(): void {
    const now = Date.now();
    const elapsed = now - this.lastRefill;
    const tokensToAdd = (elapsed / 60000) * this.refillRate;

    if (tokensToAdd >= 1) {
      this.tokens = Math.min(this.capacity, this.tokens + Math.floor(tokensToAdd));
      this.lastRefill = now;
    }
  }

  /**
   * Process queued requests
   */
  private processQueue(): void {
    while (this.queue.length > 0 && this.tokens > 0) {
      const item = this.queue.shift();
      if (item) {
        this.tokens--;
        item.resolve();
      }
    }
  }

  /**
   * Acquire a token (async, waits if needed)
   */
  async acquire(): Promise<void> {
    this.refill();

    // If tokens available, consume immediately
    if (this.tokens > 0) {
      this.tokens--;
      return Promise.resolve();
    }

    // Check queue size
    if (this.queue.length >= this.maxQueueSize) {
      throw new Error(`Rate limit queue full (${this.maxQueueSize} requests waiting)`);
    }

    // Queue the request
    return new Promise((resolve, reject) => {
      this.queue.push({
        resolve: () => resolve(),
        reject,
        timestamp: Date.now(),
      });

      console.log(`[RateLimiter] Request queued. Queue size: ${this.queue.length}`);

      // Set up a refill check interval
      const checkInterval = setInterval(() => {
        this.refill();
        this.processQueue();

        // Clean up if resolved
        if (!this.queue.find(item => item.resolve === resolve)) {
          clearInterval(checkInterval);
        }
      }, 100); // Check every 100ms

      // Timeout after 30 seconds
      setTimeout(() => {
        const index = this.queue.findIndex(item => item.resolve === resolve);
        if (index !== -1) {
          this.queue.splice(index, 1);
          clearInterval(checkInterval);
          reject(new Error('Rate limit queue timeout (30s)'));
        }
      }, 30000);
    });
  }

  /**
   * Try to acquire without waiting
   */
  tryAcquire(): boolean {
    this.refill();

    if (this.tokens > 0) {
      this.tokens--;
      return true;
    }

    return false;
  }

  /**
   * Get current status
   */
  getStatus() {
    this.refill();
    return {
      availableTokens: this.tokens,
      capacity: this.capacity,
      queueSize: this.queue.length,
      utilizationPercent: ((this.capacity - this.tokens) / this.capacity) * 100,
    };
  }

  /**
   * Reset the bucket (for testing)
   */
  reset(): void {
    this.tokens = this.capacity;
    this.lastRefill = Date.now();
    this.queue.forEach(item => item.reject(new Error('Rate limiter reset')));
    this.queue = [];
  }
}

/**
 * Detect tier based on environment
 */
function detectTier(): 'dev' | 'prod' {
  const apiKey = process.env.TAVILY_API_KEY || '';

  // Heuristic: production keys are typically longer or have specific prefixes
  // Adjust this based on your actual key format
  if (apiKey.includes('prod') || apiKey.length > 50) {
    return 'prod';
  }

  return 'dev';
}

/**
 * Rate limiter configuration per tier
 */
const RATE_LIMITS = {
  dev: { rpm: 100, capacity: 100 },
  prod: { rpm: 1000, capacity: 1000 },
};

/**
 * Global rate limiter instance
 */
const tier = detectTier();
const rateLimiter = new TokenBucket(
  RATE_LIMITS[tier].capacity,
  RATE_LIMITS[tier].rpm,
  100 // Max queue size
);

console.log(`[RateLimiter] Initialized for ${tier.toUpperCase()} tier (${RATE_LIMITS[tier].rpm} RPM)`);

/**
 * Rate-limited request wrapper
 */
export async function rateLimitedRequest<T>(
  fn: () => Promise<T>,
  options: {
    skipQueue?: boolean;
  } = {}
): Promise<T> {
  if (options.skipQueue) {
    // Try to acquire without waiting
    const acquired = rateLimiter.tryAcquire();
    if (!acquired) {
      throw new Error('Rate limit exceeded (non-blocking mode)');
    }
  } else {
    // Wait for token if needed
    await rateLimiter.acquire();
  }

  return await fn();
}

/**
 * Batch requests with rate limiting
 * Automatically spreads requests to respect RPM
 */
export async function rateLimitedBatch<T, R>(
  items: T[],
  fn: (item: T) => Promise<R>,
  options: {
    concurrency?: number;
  } = {}
): Promise<R[]> {
  const concurrency = options.concurrency || 5;
  const results: R[] = [];
  const errors: Error[] = [];

  // Process in chunks
  for (let i = 0; i < items.length; i += concurrency) {
    const chunk = items.slice(i, i + concurrency);

    const chunkResults = await Promise.allSettled(
      chunk.map(item => rateLimitedRequest(() => fn(item)))
    );

    chunkResults.forEach((result, idx) => {
      if (result.status === 'fulfilled') {
        results.push(result.value);
      } else {
        errors.push(result.reason);
        console.error(`[RateLimitedBatch] Item ${i + idx} failed:`, result.reason.message);
      }
    });
  }

  if (errors.length > 0) {
    console.warn(`[RateLimitedBatch] ${errors.length}/${items.length} requests failed`);
  }

  return results;
}

/**
 * Get rate limiter status for monitoring
 */
export function getRateLimiterStatus() {
  return {
    tier,
    limits: RATE_LIMITS[tier],
    status: rateLimiter.getStatus(),
  };
}

/**
 * Reset rate limiter (for testing)
 */
export function resetRateLimiter() {
  rateLimiter.reset();
  console.log('[RateLimiter] Reset');
}

/**
 * Export the rate limiter for direct access
 */
export { rateLimiter };
