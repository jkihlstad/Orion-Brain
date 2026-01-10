/**
 * Neural Intelligence Platform - Worker Configuration
 *
 * Configuration management for the Convex event poller/worker service.
 * All values can be overridden via environment variables.
 *
 * @version 1.0.0
 * @author Sub-Agent 4: Feature Engineer
 */

// =============================================================================
// CONFIGURATION INTERFACE
// =============================================================================

/**
 * Worker configuration interface.
 * All timing values are in milliseconds unless otherwise specified.
 */
export interface WorkerConfig {
  /** Interval between poll cycles (WORKER_POLL_INTERVAL) */
  pollIntervalMs: number;

  /** Number of events to fetch per poll cycle (WORKER_BATCH_SIZE) */
  batchSize: number;

  /** Lease timeout duration - how long we hold a lock (WORKER_LEASE_TIMEOUT) */
  leaseTimeoutMs: number;

  /** Maximum retry attempts before marking event as failed (WORKER_MAX_RETRIES) */
  maxRetries: number;

  /** Grace period for shutdown - wait for in-flight work (WORKER_SHUTDOWN_TIMEOUT) */
  shutdownTimeoutMs: number;

  /** Maximum concurrent event processing (WORKER_MAX_CONCURRENT) */
  maxConcurrent: number;

  /** Interval for lease renewal during long operations (WORKER_LEASE_RENEWAL_INTERVAL) */
  leaseRenewalIntervalMs: number;

  /** Minimum lease remaining before renewal (WORKER_LEASE_RENEWAL_THRESHOLD) */
  leaseRenewalThresholdMs: number;

  /** Base delay for exponential backoff retries (WORKER_RETRY_BASE_DELAY) */
  retryBaseDelayMs: number;

  /** Maximum delay for exponential backoff retries (WORKER_RETRY_MAX_DELAY) */
  retryMaxDelayMs: number;

  /** Backoff multiplier for retry delays (WORKER_RETRY_MULTIPLIER) */
  retryMultiplier: number;

  /** Health check interval (WORKER_HEALTH_CHECK_INTERVAL) */
  healthCheckIntervalMs: number;

  /** Worker instance identifier (WORKER_ID) */
  workerId: string;

  /** Enable debug logging (WORKER_DEBUG) */
  debug: boolean;
}

// =============================================================================
// DEFAULT CONFIGURATION
// =============================================================================

/**
 * Default worker configuration values.
 * These are sensible defaults for development and can be tuned for production.
 */
export const DEFAULT_WORKER_CONFIG: WorkerConfig = {
  pollIntervalMs: 5000,             // 5 seconds
  batchSize: 10,                    // 10 events per batch
  leaseTimeoutMs: 300000,           // 5 minutes
  maxRetries: 3,                    // 3 retry attempts
  shutdownTimeoutMs: 30000,         // 30 seconds shutdown grace
  maxConcurrent: 5,                 // 5 concurrent events
  leaseRenewalIntervalMs: 60000,    // Renew every 60 seconds
  leaseRenewalThresholdMs: 120000,  // Renew when less than 2 minutes left
  retryBaseDelayMs: 1000,           // 1 second initial retry delay
  retryMaxDelayMs: 30000,           // 30 seconds max retry delay
  retryMultiplier: 2,               // Double delay each retry
  healthCheckIntervalMs: 30000,     // Health check every 30 seconds
  workerId: '',                     // Generated at runtime
  debug: false,                     // Debug mode off by default
};

// =============================================================================
// ENVIRONMENT VARIABLE PARSING
// =============================================================================

/**
 * Parse an integer environment variable with fallback.
 */
function parseIntEnv(key: string, defaultValue: number): number {
  const value = process.env[key];
  if (value === undefined || value === '') {
    return defaultValue;
  }
  const parsed = parseInt(value, 10);
  if (isNaN(parsed)) {
    console.warn(`Invalid integer value for ${key}: ${value}, using default: ${defaultValue}`);
    return defaultValue;
  }
  return parsed;
}

/**
 * Parse a float environment variable with fallback.
 */
function parseFloatEnv(key: string, defaultValue: number): number {
  const value = process.env[key];
  if (value === undefined || value === '') {
    return defaultValue;
  }
  const parsed = parseFloat(value);
  if (isNaN(parsed)) {
    console.warn(`Invalid float value for ${key}: ${value}, using default: ${defaultValue}`);
    return defaultValue;
  }
  return parsed;
}

/**
 * Parse a boolean environment variable with fallback.
 */
function parseBoolEnv(key: string, defaultValue: boolean): boolean {
  const value = process.env[key];
  if (value === undefined || value === '') {
    return defaultValue;
  }
  return value.toLowerCase() === 'true' || value === '1';
}

/**
 * Generate a unique worker ID.
 */
function generateWorkerId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 8);
  const hostname = process.env.HOSTNAME || 'local';
  return `worker-${hostname}-${timestamp}-${random}`;
}

// =============================================================================
// CONFIGURATION LOADER
// =============================================================================

/**
 * Load worker configuration from environment variables.
 * Falls back to defaults for any missing values.
 */
export function loadWorkerConfig(overrides?: Partial<WorkerConfig>): WorkerConfig {
  const config: WorkerConfig = {
    pollIntervalMs: parseIntEnv('WORKER_POLL_INTERVAL', DEFAULT_WORKER_CONFIG.pollIntervalMs),
    batchSize: parseIntEnv('WORKER_BATCH_SIZE', DEFAULT_WORKER_CONFIG.batchSize),
    leaseTimeoutMs: parseIntEnv('WORKER_LEASE_TIMEOUT', DEFAULT_WORKER_CONFIG.leaseTimeoutMs),
    maxRetries: parseIntEnv('WORKER_MAX_RETRIES', DEFAULT_WORKER_CONFIG.maxRetries),
    shutdownTimeoutMs: parseIntEnv('WORKER_SHUTDOWN_TIMEOUT', DEFAULT_WORKER_CONFIG.shutdownTimeoutMs),
    maxConcurrent: parseIntEnv('WORKER_MAX_CONCURRENT', DEFAULT_WORKER_CONFIG.maxConcurrent),
    leaseRenewalIntervalMs: parseIntEnv('WORKER_LEASE_RENEWAL_INTERVAL', DEFAULT_WORKER_CONFIG.leaseRenewalIntervalMs),
    leaseRenewalThresholdMs: parseIntEnv('WORKER_LEASE_RENEWAL_THRESHOLD', DEFAULT_WORKER_CONFIG.leaseRenewalThresholdMs),
    retryBaseDelayMs: parseIntEnv('WORKER_RETRY_BASE_DELAY', DEFAULT_WORKER_CONFIG.retryBaseDelayMs),
    retryMaxDelayMs: parseIntEnv('WORKER_RETRY_MAX_DELAY', DEFAULT_WORKER_CONFIG.retryMaxDelayMs),
    retryMultiplier: parseFloatEnv('WORKER_RETRY_MULTIPLIER', DEFAULT_WORKER_CONFIG.retryMultiplier),
    healthCheckIntervalMs: parseIntEnv('WORKER_HEALTH_CHECK_INTERVAL', DEFAULT_WORKER_CONFIG.healthCheckIntervalMs),
    workerId: process.env.WORKER_ID || generateWorkerId(),
    debug: parseBoolEnv('WORKER_DEBUG', DEFAULT_WORKER_CONFIG.debug),
  };

  // Apply any overrides
  if (overrides) {
    Object.assign(config, overrides);
  }

  return config;
}

// =============================================================================
// CONFIGURATION VALIDATION
// =============================================================================

/**
 * Validation result interface.
 */
export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Validate worker configuration for production use.
 */
export function validateWorkerConfig(config: WorkerConfig): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Validate poll interval
  if (config.pollIntervalMs < 1000) {
    warnings.push('Poll interval less than 1 second may cause excessive load');
  }
  if (config.pollIntervalMs > 60000) {
    warnings.push('Poll interval greater than 60 seconds may cause delayed processing');
  }

  // Validate batch size
  if (config.batchSize < 1) {
    errors.push('Batch size must be at least 1');
  }
  if (config.batchSize > 100) {
    warnings.push('Batch size greater than 100 may cause memory issues');
  }

  // Validate lease timeout
  if (config.leaseTimeoutMs < 60000) {
    warnings.push('Lease timeout less than 60 seconds may cause premature lease expiry');
  }
  if (config.leaseTimeoutMs > 3600000) {
    warnings.push('Lease timeout greater than 1 hour may cause stale locks');
  }

  // Validate lease renewal
  if (config.leaseRenewalThresholdMs >= config.leaseTimeoutMs) {
    errors.push('Lease renewal threshold must be less than lease timeout');
  }
  if (config.leaseRenewalIntervalMs >= config.leaseRenewalThresholdMs) {
    warnings.push('Lease renewal interval should be less than renewal threshold');
  }

  // Validate retry settings
  if (config.maxRetries < 0) {
    errors.push('Max retries cannot be negative');
  }
  if (config.maxRetries > 10) {
    warnings.push('Max retries greater than 10 may cause excessive delays');
  }
  if (config.retryBaseDelayMs < 100) {
    warnings.push('Retry base delay less than 100ms may cause rapid retries');
  }

  // Validate concurrency
  if (config.maxConcurrent < 1) {
    errors.push('Max concurrent must be at least 1');
  }
  if (config.maxConcurrent > config.batchSize) {
    warnings.push('Max concurrent greater than batch size is inefficient');
  }

  // Validate shutdown timeout
  if (config.shutdownTimeoutMs < 5000) {
    warnings.push('Shutdown timeout less than 5 seconds may cause incomplete processing');
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

// =============================================================================
// CONFIGURATION LOGGING
// =============================================================================

/**
 * Get a safe version of config for logging (no sensitive data).
 */
export function getLoggableConfig(config: WorkerConfig): Record<string, unknown> {
  return {
    pollIntervalMs: config.pollIntervalMs,
    batchSize: config.batchSize,
    leaseTimeoutMs: config.leaseTimeoutMs,
    maxRetries: config.maxRetries,
    shutdownTimeoutMs: config.shutdownTimeoutMs,
    maxConcurrent: config.maxConcurrent,
    leaseRenewalIntervalMs: config.leaseRenewalIntervalMs,
    leaseRenewalThresholdMs: config.leaseRenewalThresholdMs,
    retryBaseDelayMs: config.retryBaseDelayMs,
    retryMaxDelayMs: config.retryMaxDelayMs,
    retryMultiplier: config.retryMultiplier,
    healthCheckIntervalMs: config.healthCheckIntervalMs,
    workerId: config.workerId,
    debug: config.debug,
  };
}
