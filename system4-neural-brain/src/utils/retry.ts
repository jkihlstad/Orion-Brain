/**
 * Retry Utilities
 *
 * Provides exponential backoff retry logic with configurable options.
 */

import { logger } from './logger';

export interface RetryConfig {
  maxRetries: number;
  baseDelay: number; // ms
  maxDelay: number; // ms
  backoffMultiplier: number;
  retryableErrors?: string[];
}

export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  baseDelay: 1000,
  maxDelay: 30000,
  backoffMultiplier: 2,
  retryableErrors: ['TIMEOUT', 'RATE_LIMITED', 'TRANSIENT', 'ECONNRESET'],
};

/**
 * Calculate delay for a given retry attempt using exponential backoff.
 */
export function calculateBackoffDelay(
  attempt: number,
  config: RetryConfig
): number {
  const delay = Math.min(
    config.baseDelay * Math.pow(config.backoffMultiplier, attempt),
    config.maxDelay
  );
  // Add jitter (±10%)
  const jitter = delay * 0.1 * (Math.random() * 2 - 1);
  return Math.round(delay + jitter);
}

/**
 * Check if an error is retryable based on config.
 */
export function isRetryableError(
  error: unknown,
  config: RetryConfig
): boolean {
  if (!config.retryableErrors || config.retryableErrors.length === 0) {
    return true;
  }

  if (error instanceof Error) {
    const errorString = `${error.name} ${error.message}`.toUpperCase();
    return config.retryableErrors.some((code) =>
      errorString.includes(code.toUpperCase())
    );
  }

  return false;
}

/**
 * Sleep for a given duration.
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Execute a function with retry logic.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  config: Partial<RetryConfig> = {},
  operationName: string = 'operation'
): Promise<T> {
  const fullConfig = { ...DEFAULT_RETRY_CONFIG, ...config };
  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= fullConfig.maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      if (attempt === fullConfig.maxRetries) {
        logger.error(`${operationName} failed after ${attempt + 1} attempts`, {
          error: lastError.message,
          attempt,
        });
        throw lastError;
      }

      if (!isRetryableError(error, fullConfig)) {
        logger.error(`${operationName} failed with non-retryable error`, {
          error: lastError.message,
          attempt,
        });
        throw lastError;
      }

      const delay = calculateBackoffDelay(attempt, fullConfig);
      logger.warn(`${operationName} failed, retrying in ${delay}ms`, {
        error: lastError.message,
        attempt,
        nextAttempt: attempt + 1,
        maxRetries: fullConfig.maxRetries,
      });

      await sleep(delay);
    }
  }

  throw lastError || new Error(`${operationName} failed`);
}

/**
 * Retry state tracker for manual retry handling.
 */
export class RetryTracker {
  private attempts: Map<string, number> = new Map();
  private config: RetryConfig;

  constructor(config: Partial<RetryConfig> = {}) {
    this.config = { ...DEFAULT_RETRY_CONFIG, ...config };
  }

  /**
   * Record an attempt and return whether more retries are allowed.
   */
  recordAttempt(key: string): { attemptNumber: number; canRetry: boolean } {
    const current = this.attempts.get(key) || 0;
    const next = current + 1;
    this.attempts.set(key, next);

    return {
      attemptNumber: next,
      canRetry: next < this.config.maxRetries,
    };
  }

  /**
   * Get the current attempt count for a key.
   */
  getAttempts(key: string): number {
    return this.attempts.get(key) || 0;
  }

  /**
   * Calculate the next retry delay for a key.
   */
  getNextDelay(key: string): number {
    const attempts = this.getAttempts(key);
    return calculateBackoffDelay(attempts, this.config);
  }

  /**
   * Clear retry state for a key (on success).
   */
  clear(key: string): void {
    this.attempts.delete(key);
  }

  /**
   * Check if retries are exhausted for a key.
   */
  isExhausted(key: string): boolean {
    return this.getAttempts(key) >= this.config.maxRetries;
  }
}
