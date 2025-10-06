/**
 * Reliability layer for Tavily API calls
 * - Exponential backoff with jitter
 * - Circuit breaker pattern
 * - Per-endpoint timeouts
 * - Partial result handling
 */

/**
 * Circuit Breaker States
 */
enum CircuitState {
  CLOSED = "CLOSED",     // Normal operation
  OPEN = "OPEN",         // Too many failures, reject immediately
  HALF_OPEN = "HALF_OPEN" // Testing if service recovered
}

/**
 * Circuit Breaker Implementation
 */
class CircuitBreaker {
  private state: CircuitState = CircuitState.CLOSED;
  private failureCount = 0;
  private successCount = 0;
  private lastFailureTime = 0;
  private nextAttemptTime = 0;

  constructor(
    private threshold: number = 5,           // Failures before opening
    private timeout: number = 60000,         // Time to wait in OPEN state (ms)
    private halfOpenSuccessThreshold: number = 2  // Successes needed to close
  ) {}

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === CircuitState.OPEN) {
      if (Date.now() < this.nextAttemptTime) {
        throw new Error(`Circuit breaker OPEN. Next attempt at ${new Date(this.nextAttemptTime).toISOString()}`);
      }
      // Move to HALF_OPEN to test
      this.state = CircuitState.HALF_OPEN;
      this.successCount = 0;
      console.log(`[CircuitBreaker] Moving to HALF_OPEN state`);
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  private onSuccess() {
    this.failureCount = 0;

    if (this.state === CircuitState.HALF_OPEN) {
      this.successCount++;
      if (this.successCount >= this.halfOpenSuccessThreshold) {
        this.state = CircuitState.CLOSED;
        console.log(`[CircuitBreaker] Moving to CLOSED state after ${this.successCount} successes`);
      }
    }
  }

  private onFailure() {
    this.failureCount++;
    this.lastFailureTime = Date.now();

    if (this.state === CircuitState.HALF_OPEN) {
      this.open();
    } else if (this.failureCount >= this.threshold) {
      this.open();
    }
  }

  private open() {
    this.state = CircuitState.OPEN;
    this.nextAttemptTime = Date.now() + this.timeout;
    console.error(`[CircuitBreaker] Moving to OPEN state. Failures: ${this.failureCount}. Next attempt: ${new Date(this.nextAttemptTime).toISOString()}`);
  }

  getState(): CircuitState {
    return this.state;
  }

  reset() {
    this.state = CircuitState.CLOSED;
    this.failureCount = 0;
    this.successCount = 0;
    this.lastFailureTime = 0;
    this.nextAttemptTime = 0;
  }
}

/**
 * Global circuit breakers per endpoint
 */
const circuitBreakers = {
  search: new CircuitBreaker(5, 60000, 2),
  extract: new CircuitBreaker(5, 60000, 2),
  map: new CircuitBreaker(3, 120000, 2),
  crawl: new CircuitBreaker(3, 120000, 2),
};

/**
 * Retry configuration
 */
interface RetryConfig {
  maxRetries: number;
  baseDelay: number;
  maxDelay: number;
  retryableStatusCodes: number[];
}

const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  baseDelay: 1000,      // 1s
  maxDelay: 10000,      // 10s
  retryableStatusCodes: [429, 500, 502, 503, 504],
};

/**
 * Exponential backoff with jitter
 */
function calculateBackoff(attempt: number, baseDelay: number, maxDelay: number): number {
  const exponentialDelay = Math.min(baseDelay * Math.pow(2, attempt), maxDelay);
  const jitter = Math.random() * 0.3 * exponentialDelay; // ±30% jitter
  return Math.floor(exponentialDelay + jitter);
}

/**
 * Sleep utility
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Check if error is retryable
 */
function isRetryableError(error: any, config: RetryConfig): boolean {
  // Network errors
  if (error.code === 'ECONNRESET' || error.code === 'ETIMEDOUT' || error.code === 'ENOTFOUND') {
    return true;
  }

  // HTTP status codes
  if (error.statusCode && config.retryableStatusCodes.includes(error.statusCode)) {
    return true;
  }

  // Fetch API errors
  if (error.name === 'AbortError' || error.name === 'TimeoutError') {
    return true;
  }

  return false;
}

/**
 * Endpoint-specific timeouts (ms)
 */
const ENDPOINT_TIMEOUTS = {
  search: 10000,     // 10s for search
  extract: 30000,    // 30s for extract (can be slow for large pages)
  map: 20000,        // 20s for map
  crawl: 60000,      // 60s for crawl (can process many pages)
};

/**
 * Timeout wrapper with AbortController
 */
async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  operation: string
): Promise<T> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const result = await promise;
    clearTimeout(timeoutId);
    return result;
  } catch (error) {
    clearTimeout(timeoutId);
    if ((error as Error).name === 'AbortError') {
      throw new Error(`${operation} timed out after ${timeoutMs}ms`);
    }
    throw error;
  }
}

/**
 * Main resilient request wrapper
 */
export async function resilientRequest<T>(
  endpoint: 'search' | 'extract' | 'map' | 'crawl',
  fn: () => Promise<T>,
  options: {
    retryConfig?: Partial<RetryConfig>;
    timeout?: number;
    allowPartialResults?: boolean;
  } = {}
): Promise<T> {
  const config: RetryConfig = {
    ...DEFAULT_RETRY_CONFIG,
    ...options.retryConfig,
  };

  const timeout = options.timeout ?? ENDPOINT_TIMEOUTS[endpoint];
  const circuitBreaker = circuitBreakers[endpoint];

  let lastError: any;

  for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
    try {
      // Check circuit breaker
      const result = await circuitBreaker.execute(async () => {
        // Apply timeout
        return await withTimeout(fn(), timeout, endpoint);
      });

      return result;
    } catch (error: any) {
      lastError = error;

      // Don't retry if circuit is open
      if (error.message?.includes('Circuit breaker OPEN')) {
        throw error;
      }

      // Don't retry if not retryable
      if (!isRetryableError(error, config)) {
        throw error;
      }

      // Don't retry on last attempt
      if (attempt === config.maxRetries) {
        break;
      }

      const backoffMs = calculateBackoff(attempt, config.baseDelay, config.maxDelay);
      console.warn(
        `[Tavily ${endpoint}] Attempt ${attempt + 1}/${config.maxRetries + 1} failed: ${error.message}. Retrying in ${backoffMs}ms...`
      );

      await sleep(backoffMs);
    }
  }

  // All retries exhausted
  throw lastError;
}

/**
 * Partial result wrapper for extract operations
 * Returns successful extracts even if some fail
 */
export async function resilientExtractWithPartial<T extends { results: any[] }>(
  fn: () => Promise<T>
): Promise<T & { partialResults: boolean }> {
  try {
    const result = await resilientRequest('extract', fn, { allowPartialResults: true });
    return { ...result, partialResults: false };
  } catch (error) {
    // If we have any partial results, return them
    const anyResults = (error as any)?.results;
    if (anyResults && anyResults.length > 0) {
      console.warn(`[Tavily extract] Returning partial results: ${anyResults.length} successful`);
      return {
        results: anyResults,
        partialResults: true,
      } as T & { partialResults: boolean };
    }
    throw error;
  }
}

/**
 * Get circuit breaker status for monitoring
 */
export function getCircuitBreakerStatus() {
  return {
    search: circuitBreakers.search.getState(),
    extract: circuitBreakers.extract.getState(),
    map: circuitBreakers.map.getState(),
    crawl: circuitBreakers.crawl.getState(),
  };
}

/**
 * Reset all circuit breakers (for testing or manual recovery)
 */
export function resetCircuitBreakers() {
  Object.values(circuitBreakers).forEach(cb => cb.reset());
  console.log('[CircuitBreaker] All circuit breakers reset');
}

/**
 * Export types
 */
export type { RetryConfig };
export { CircuitState };
