/**
 * Neural Intelligence Platform - Event Processor
 *
 * Wraps LangGraph execution with lease renewal, error classification,
 * and metrics reporting for the Convex event poller/worker.
 *
 * Features:
 * - Lease renewal for long-running operations
 * - Error classification (retryable vs non-retryable)
 * - Processing metrics collection
 * - Graceful handling of processing failures
 *
 * @version 1.0.0
 * @author Sub-Agent 4: Feature Engineer
 */

import { WorkerConfig } from './config';
import { HealthMonitor } from './health';
import { processEvent as processEventGraph, BrainState, ConvexEvent } from '../langgraph';

// =============================================================================
// TYPES
// =============================================================================

/**
 * Event lease information.
 */
export interface EventLease {
  eventId: string;
  leaseId: string;
  expiresAt: number;
  workerId: string;
}

/**
 * Result of event processing.
 */
export interface ProcessingResult {
  success: boolean;
  eventId: string;
  processingTimeMs: number;
  retryable: boolean;
  error?: string;
  errorCode?: ErrorCode;
  brainState?: BrainState;
}

/**
 * Error codes for classification.
 */
export type ErrorCode =
  | 'TIMEOUT'
  | 'LEASE_EXPIRED'
  | 'LEASE_RENEWAL_FAILED'
  | 'PROCESSING_ERROR'
  | 'NETWORK_ERROR'
  | 'RATE_LIMITED'
  | 'INVALID_EVENT'
  | 'STORAGE_ERROR'
  | 'GRAPH_ERROR'
  | 'UNKNOWN_ERROR';

/**
 * Convex adapter interface for lease operations.
 */
export interface ConvexLeaseAdapter {
  extendLease(eventId: string, leaseId: string, newExpiresAt: number): Promise<boolean>;
  getEvent(eventId: string): Promise<ConvexEvent | null>;
}

// =============================================================================
// ERROR CLASSIFICATION
// =============================================================================

/**
 * Non-retryable error codes - these errors won't benefit from retrying.
 */
const NON_RETRYABLE_ERRORS: ErrorCode[] = [
  'INVALID_EVENT',
  'LEASE_EXPIRED',
];

/**
 * Error patterns for classification.
 */
const ERROR_PATTERNS: Array<{ pattern: RegExp; code: ErrorCode; retryable: boolean }> = [
  { pattern: /timeout/i, code: 'TIMEOUT', retryable: true },
  { pattern: /lease.*expired/i, code: 'LEASE_EXPIRED', retryable: false },
  { pattern: /rate.*(limit|throttle)/i, code: 'RATE_LIMITED', retryable: true },
  { pattern: /network|connect|ECONNREFUSED|ENOTFOUND/i, code: 'NETWORK_ERROR', retryable: true },
  { pattern: /invalid.*event|event.*not.*found|missing.*field/i, code: 'INVALID_EVENT', retryable: false },
  { pattern: /storage|lancedb|database/i, code: 'STORAGE_ERROR', retryable: true },
  { pattern: /graph|neo4j/i, code: 'GRAPH_ERROR', retryable: true },
];

/**
 * Classify an error and determine if it's retryable.
 */
export function classifyError(error: unknown): { code: ErrorCode; retryable: boolean; message: string } {
  const message = error instanceof Error ? error.message : String(error);

  // Check against known patterns
  for (const { pattern, code, retryable } of ERROR_PATTERNS) {
    if (pattern.test(message)) {
      return { code, retryable, message };
    }
  }

  // Default to unknown, retryable
  return {
    code: 'UNKNOWN_ERROR',
    retryable: true,
    message,
  };
}

/**
 * Check if an error code is retryable.
 */
export function isRetryableError(code: ErrorCode): boolean {
  return !NON_RETRYABLE_ERRORS.includes(code);
}

// =============================================================================
// LEASE RENEWAL MANAGER
// =============================================================================

/**
 * Manages lease renewal for long-running operations.
 */
class LeaseRenewalManager {
  private renewalTimer: NodeJS.Timeout | null = null;
  private isActive: boolean = false;
  private renewalCount: number = 0;

  constructor(
    private config: WorkerConfig,
    private convexAdapter: ConvexLeaseAdapter,
    private healthMonitor: HealthMonitor,
  ) {}

  /**
   * Start automatic lease renewal for an event.
   */
  start(eventId: string, lease: EventLease): void {
    if (this.isActive) {
      this.stop();
    }

    this.isActive = true;
    this.renewalCount = 0;

    const scheduleRenewal = () => {
      if (!this.isActive) return;

      const now = Date.now();
      const timeUntilExpiry = lease.expiresAt - now;

      // If we're within the renewal threshold, renew now
      if (timeUntilExpiry <= this.config.leaseRenewalThresholdMs) {
        this.renewLease(eventId, lease);
      }

      // Schedule next check
      this.renewalTimer = setTimeout(
        scheduleRenewal,
        this.config.leaseRenewalIntervalMs,
      );
    };

    // Start the renewal loop
    scheduleRenewal();
  }

  /**
   * Stop automatic lease renewal.
   */
  stop(): void {
    this.isActive = false;
    if (this.renewalTimer) {
      clearTimeout(this.renewalTimer);
      this.renewalTimer = null;
    }
  }

  /**
   * Renew the lease for an event.
   */
  private async renewLease(eventId: string, lease: EventLease): Promise<void> {
    try {
      const newExpiresAt = Date.now() + this.config.leaseTimeoutMs;
      const success = await this.convexAdapter.extendLease(
        eventId,
        lease.leaseId,
        newExpiresAt,
      );

      if (success) {
        lease.expiresAt = newExpiresAt;
        this.renewalCount++;
        this.healthMonitor.recordLeaseRenewal(true);

        if (this.config.debug) {
          console.log(`[LeaseRenewal] Renewed lease for ${eventId}, count: ${this.renewalCount}`);
        }
      } else {
        this.healthMonitor.recordLeaseRenewal(false);
        console.warn(`[LeaseRenewal] Failed to renew lease for ${eventId}`);
      }
    } catch (error) {
      this.healthMonitor.recordLeaseRenewal(false);
      console.error(`[LeaseRenewal] Error renewing lease for ${eventId}:`, error);
    }
  }

  /**
   * Get the number of renewals performed.
   */
  getRenewalCount(): number {
    return this.renewalCount;
  }
}

// =============================================================================
// EVENT PROCESSOR CLASS
// =============================================================================

/**
 * Event processor that wraps LangGraph execution with additional features.
 */
export class EventProcessor {
  private leaseRenewalManager: LeaseRenewalManager;

  constructor(
    private config: WorkerConfig,
    convexAdapter: ConvexLeaseAdapter,
    private healthMonitor: HealthMonitor,
  ) {
    this.leaseRenewalManager = new LeaseRenewalManager(
      config,
      convexAdapter,
      healthMonitor,
    );
  }

  /**
   * Process a single event through the LangGraph pipeline.
   */
  async processEvent(event: ConvexEvent, lease: EventLease): Promise<ProcessingResult> {
    const startTime = Date.now();
    const eventId = event._id;

    // Start lease renewal
    this.leaseRenewalManager.start(eventId, lease);
    this.healthMonitor.incrementActiveEvents();

    try {
      // Check if lease is already expired
      if (lease.expiresAt <= Date.now()) {
        return this.createFailureResult(eventId, startTime, {
          code: 'LEASE_EXPIRED',
          retryable: false,
          message: 'Lease already expired before processing started',
        });
      }

      // Process through LangGraph
      const brainState = await this.executeWithTimeout(eventId, this.config.leaseTimeoutMs);

      // Check for errors in the brain state
      if (brainState.error || brainState.errorMessage) {
        const classification = classifyError(brainState.error || brainState.errorMessage);
        return this.createFailureResult(eventId, startTime, classification, brainState);
      }

      // Success
      const processingTimeMs = Date.now() - startTime;
      this.healthMonitor.recordEventProcessed(processingTimeMs);

      return {
        success: true,
        eventId,
        processingTimeMs,
        retryable: false,
        brainState,
      };

    } catch (error) {
      const classification = classifyError(error);
      return this.createFailureResult(eventId, startTime, classification);

    } finally {
      // Always stop lease renewal and decrement active count
      this.leaseRenewalManager.stop();
      this.healthMonitor.decrementActiveEvents();
    }
  }

  /**
   * Execute the LangGraph with a timeout.
   */
  private async executeWithTimeout(eventId: string, timeoutMs: number): Promise<BrainState> {
    return new Promise<BrainState>(async (resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error(`Processing timeout after ${timeoutMs}ms`));
      }, timeoutMs);

      try {
        const result = await processEventGraph(eventId);
        clearTimeout(timeoutId);
        resolve(result);
      } catch (error) {
        clearTimeout(timeoutId);
        reject(error);
      }
    });
  }

  /**
   * Create a failure result with proper classification.
   */
  private createFailureResult(
    eventId: string,
    startTime: number,
    classification: { code: ErrorCode; retryable: boolean; message: string },
    brainState?: BrainState,
  ): ProcessingResult {
    const processingTimeMs = Date.now() - startTime;

    // Record appropriate metrics
    if (classification.retryable) {
      this.healthMonitor.recordEventRetried();
    } else {
      this.healthMonitor.recordNonRetryableError();
    }

    const result: ProcessingResult = {
      success: false,
      eventId,
      processingTimeMs,
      retryable: classification.retryable,
      error: classification.message,
      errorCode: classification.code,
    };

    if (brainState !== undefined) {
      result.brainState = brainState;
    }

    return result;
  }

  /**
   * Process multiple events in parallel with concurrency control.
   */
  async processEventBatch(
    events: ConvexEvent[],
    leases: EventLease[],
    concurrency: number,
  ): Promise<ProcessingResult[]> {
    const results: ProcessingResult[] = [];

    // Process in chunks respecting concurrency limit
    for (let i = 0; i < events.length; i += concurrency) {
      const chunk = events.slice(i, i + concurrency);
      const chunkLeases = leases.slice(i, i + concurrency);

      const chunkResults = await Promise.all(
        chunk.map((event, index) =>
          this.processEvent(event, chunkLeases[index]!)
        )
      );

      results.push(...chunkResults);
    }

    return results;
  }
}

// =============================================================================
// RETRY DELAY CALCULATOR
// =============================================================================

/**
 * Calculate the delay before next retry using exponential backoff.
 */
export function calculateRetryDelay(
  attemptNumber: number,
  config: WorkerConfig,
): number {
  const baseDelay = config.retryBaseDelayMs;
  const maxDelay = config.retryMaxDelayMs;
  const multiplier = config.retryMultiplier;

  // Calculate exponential backoff
  const delay = Math.min(
    baseDelay * Math.pow(multiplier, attemptNumber),
    maxDelay,
  );

  // Add jitter (random variation of +/- 10%)
  const jitter = delay * 0.1 * (Math.random() * 2 - 1);

  return Math.round(delay + jitter);
}

// =============================================================================
// FACTORY FUNCTION
// =============================================================================

/**
 * Create a new event processor instance.
 */
export function createEventProcessor(
  config: WorkerConfig,
  convexAdapter: ConvexLeaseAdapter,
  healthMonitor: HealthMonitor,
): EventProcessor {
  return new EventProcessor(config, convexAdapter, healthMonitor);
}
