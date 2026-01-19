/**
 * Neural Intelligence Platform - Event Poller
 *
 * Main polling loop for the Convex event worker service.
 * Continuously polls Convex for pending events using lease-based locking
 * and processes them through the LangGraph pipeline.
 *
 * Features:
 * - Configurable poll interval and batch size
 * - Lease-based locking for reliable processing
 * - Graceful shutdown on SIGTERM/SIGINT
 * - Health status reporting
 * - Exponential backoff on errors
 *
 * @version 1.0.0
 * @author Sub-Agent 4: Feature Engineer
 */

import { WorkerConfig } from './config';
import { HealthMonitor, HealthCheckResult, HealthStatus } from './health';
import {
  EventProcessor,
  ProcessingResult,
  EventLease,
  ConvexLeaseAdapter,
  calculateRetryDelay,
} from './processor';
import { ConvexEvent } from '../langgraph';

// =============================================================================
// TYPES
// =============================================================================

/**
 * Poller state enum.
 */
export type PollerState =
  | 'stopped'
  | 'starting'
  | 'running'
  | 'stopping'
  | 'error';

/**
 * Poller status information.
 */
export interface PollerStatus {
  state: PollerState;
  workerId: string;
  startedAt: number | null;
  lastPollAt: number | null;
  pollCount: number;
  eventsProcessed: number;
  eventsFailed: number;
  consecutiveErrors: number;
  health: HealthStatus;
}

/**
 * Lease result from Convex.
 */
export interface LeaseResult {
  events: ConvexEvent[];
  leases: EventLease[];
}

/**
 * Convex adapter interface for polling operations.
 */
export interface ConvexPollerAdapter extends ConvexLeaseAdapter {
  leaseEvents(batchSize: number, workerId: string): Promise<LeaseResult>;
  ackEvent(eventId: string, leaseId: string, result: ProcessingResult): Promise<void>;
  failEvent(eventId: string, leaseId: string, error: string, retryCount: number): Promise<void>;
}

/**
 * Retry state for tracking event retries.
 */
interface RetryState {
  attemptCount: number;
  lastAttemptAt: number;
  nextRetryAt: number;
}

// =============================================================================
// EVENT POLLER CLASS
// =============================================================================

/**
 * Main event poller that continuously processes events from Convex.
 */
export class EventPoller {
  private state: PollerState = 'stopped';
  private startedAt: number | null = null;
  private lastPollAt: number | null = null;
  private pollCount: number = 0;
  private consecutiveErrors: number = 0;

  private pollTimer: NodeJS.Timeout | null = null;
  private healthCheckTimer: NodeJS.Timeout | null = null;
  private currentShutdownPromise: Promise<void> | null = null;
  private shutdownResolve: (() => void) | null = null;

  private processor: EventProcessor;
  private retryStates: Map<string, RetryState> = new Map();

  constructor(
    private config: WorkerConfig,
    private convexAdapter: ConvexPollerAdapter,
    private healthMonitor: HealthMonitor,
  ) {
    this.processor = new EventProcessor(config, convexAdapter, healthMonitor);
  }

  // ===========================================================================
  // LIFECYCLE METHODS
  // ===========================================================================

  /**
   * Start the poller.
   */
  async start(): Promise<void> {
    if (this.state !== 'stopped') {
      this.log('warn', 'Poller already running or starting');
      return;
    }

    this.state = 'starting';
    this.startedAt = Date.now();
    this.log('info', 'Starting event poller', { workerId: this.config.workerId });

    // Register shutdown handlers
    this.registerShutdownHandlers();

    // Start health check timer
    this.startHealthCheckTimer();

    // Start polling loop
    this.state = 'running';
    await this.pollLoop();
  }

  /**
   * Stop the poller gracefully.
   */
  async stop(): Promise<void> {
    if (this.state === 'stopped' || this.state === 'stopping') {
      return;
    }

    this.log('info', 'Stopping event poller');
    this.state = 'stopping';

    // Create a shutdown promise
    this.currentShutdownPromise = new Promise((resolve) => {
      this.shutdownResolve = resolve;
    });

    // Clear timers
    if (this.pollTimer) {
      clearTimeout(this.pollTimer);
      this.pollTimer = null;
    }

    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = null;
    }

    // Wait for in-flight processing to complete
    const shutdownStart = Date.now();
    while (this.healthMonitor.getHealthCheck().gauges.activeEvents > 0) {
      if (Date.now() - shutdownStart > this.config.shutdownTimeoutMs) {
        this.log('warn', 'Shutdown timeout exceeded, forcing shutdown', {
          activeEvents: this.healthMonitor.getHealthCheck().gauges.activeEvents,
        });
        break;
      }
      await this.sleep(100);
    }

    this.state = 'stopped';
    this.log('info', 'Event poller stopped');

    if (this.shutdownResolve) {
      this.shutdownResolve();
    }
  }

  // ===========================================================================
  // POLLING LOOP
  // ===========================================================================

  /**
   * Main polling loop.
   */
  private async pollLoop(): Promise<void> {
    while (this.state === 'running') {
      const pollStartTime = Date.now();

      try {
        await this.executePollCycle();
        this.consecutiveErrors = 0;
      } catch (error) {
        this.consecutiveErrors++;
        this.log('error', 'Poll cycle error', {
          error: error instanceof Error ? error.message : String(error),
          consecutiveErrors: this.consecutiveErrors,
        });

        // Exponential backoff on consecutive errors
        if (this.consecutiveErrors > 1) {
          const backoffDelay = calculateRetryDelay(
            this.consecutiveErrors - 1,
            this.config,
          );
          this.log('info', 'Backing off after errors', { delayMs: backoffDelay });
          await this.sleep(backoffDelay);
        }
      }

      // Calculate poll duration and record metrics
      const pollDuration = Date.now() - pollStartTime;
      this.lastPollAt = Date.now();
      this.pollCount++;
      this.healthMonitor.recordPollCycle(pollDuration, 0); // Event count will be updated in executePollCycle

      // Wait for next poll interval if still running
      if (this.state === 'running') {
        const sleepTime = Math.max(0, this.config.pollIntervalMs - pollDuration);
        await this.sleep(sleepTime);
      }
    }
  }

  /**
   * Execute a single poll cycle.
   */
  private async executePollCycle(): Promise<void> {
    // Check if we have capacity for more events
    const activeEvents = this.healthMonitor.getHealthCheck().gauges.activeEvents;
    if (activeEvents >= this.config.maxConcurrent) {
      this.log('debug', 'At max concurrent capacity, skipping poll', {
        activeEvents,
        maxConcurrent: this.config.maxConcurrent,
      });
      return;
    }

    // Calculate how many events we can lease
    const availableCapacity = this.config.maxConcurrent - activeEvents;
    const batchSize = Math.min(availableCapacity, this.config.batchSize);

    // Lease events from Convex
    const { events, leases } = await this.convexAdapter.leaseEvents(
      batchSize,
      this.config.workerId,
    );

    if (events.length === 0) {
      this.log('debug', 'No events to process');
      return;
    }

    this.log('info', 'Leased events for processing', {
      count: events.length,
      eventIds: events.map((e) => e._id),
    });

    // Process events concurrently
    await this.processEvents(events, leases);
  }

  /**
   * Process a batch of events.
   */
  private async processEvents(
    events: ConvexEvent[],
    leases: EventLease[],
  ): Promise<void> {
    // Process all events in parallel
    const results = await Promise.all(
      events.map((event, index) =>
        this.processSingleEvent(event, leases[index]!)
      )
    );

    // Log summary
    const successful = results.filter((r) => r.success).length;
    const failed = results.filter((r) => !r.success).length;

    this.log('info', 'Batch processing complete', {
      total: results.length,
      successful,
      failed,
    });
  }

  /**
   * Process a single event with retry handling.
   */
  private async processSingleEvent(
    event: ConvexEvent,
    lease: EventLease,
  ): Promise<ProcessingResult> {
    const eventId = event._id;

    // Check retry state
    const retryState = this.retryStates.get(eventId);
    if (retryState) {
      const now = Date.now();
      if (now < retryState.nextRetryAt) {
        this.log('debug', 'Event not ready for retry', {
          eventId,
          nextRetryAt: retryState.nextRetryAt,
        });
        this.healthMonitor.recordEventSkipped();
        return {
          success: false,
          eventId,
          processingTimeMs: 0,
          retryable: true,
          error: 'Not ready for retry',
        };
      }
    }

    // Process the event
    const result = await this.processor.processEvent(event, lease);

    if (result.success) {
      // Acknowledge successful processing
      await this.convexAdapter.ackEvent(eventId, lease.leaseId, result);
      this.retryStates.delete(eventId);
      this.log('info', 'Event processed successfully', {
        eventId,
        processingTimeMs: result.processingTimeMs,
      });
    } else {
      // Handle failure
      await this.handleProcessingFailure(event, lease, result);
    }

    return result;
  }

  /**
   * Handle a processing failure.
   */
  private async handleProcessingFailure(
    event: ConvexEvent,
    lease: EventLease,
    result: ProcessingResult,
  ): Promise<void> {
    const eventId = event._id;

    // Get or create retry state
    let retryState = this.retryStates.get(eventId);
    if (!retryState) {
      retryState = {
        attemptCount: 0,
        lastAttemptAt: 0,
        nextRetryAt: 0,
      };
    }

    retryState.attemptCount++;
    retryState.lastAttemptAt = Date.now();

    // Check if we should retry
    if (result.retryable && retryState.attemptCount < this.config.maxRetries) {
      // Calculate next retry time
      const delay = calculateRetryDelay(retryState.attemptCount, this.config);
      retryState.nextRetryAt = Date.now() + delay;

      this.retryStates.set(eventId, retryState);
      this.healthMonitor.recordEventRetried();

      this.log('warn', 'Event processing failed, will retry', {
        eventId,
        attemptCount: retryState.attemptCount,
        maxRetries: this.config.maxRetries,
        nextRetryDelayMs: delay,
        error: result.error,
      });

      // Release the lease so it can be picked up again
      // (lease will expire naturally)
    } else {
      // Exhausted retries or non-retryable error
      await this.convexAdapter.failEvent(
        eventId,
        lease.leaseId,
        result.error || 'Unknown error',
        retryState.attemptCount,
      );

      this.retryStates.delete(eventId);
      this.healthMonitor.recordEventFailed();

      this.log('error', 'Event processing failed permanently', {
        eventId,
        attemptCount: retryState.attemptCount,
        retryable: result.retryable,
        errorCode: result.errorCode,
        error: result.error,
      });
    }
  }

  // ===========================================================================
  // SHUTDOWN HANDLING
  // ===========================================================================

  /**
   * Register process shutdown handlers.
   */
  private registerShutdownHandlers(): void {
    const handleShutdown = async (signal: string) => {
      this.log('info', `Received ${signal}, initiating graceful shutdown`);
      await this.stop();
      process.exit(0);
    };

    process.on('SIGTERM', () => handleShutdown('SIGTERM'));
    process.on('SIGINT', () => handleShutdown('SIGINT'));

    process.on('uncaughtException', (error) => {
      this.log('error', 'Uncaught exception', {
        error: error.message,
        stack: error.stack,
      });
      this.state = 'error';
      handleShutdown('uncaughtException');
    });

    process.on('unhandledRejection', (reason) => {
      this.log('error', 'Unhandled rejection', {
        reason: String(reason),
      });
      // Don't exit on unhandled rejection, just log
    });
  }

  // ===========================================================================
  // HEALTH MONITORING
  // ===========================================================================

  /**
   * Start the health check timer.
   */
  private startHealthCheckTimer(): void {
    this.healthCheckTimer = setInterval(() => {
      const healthCheck = this.healthMonitor.getHealthCheck();

      // Log health status periodically
      if (this.config.debug || healthCheck.status !== 'healthy') {
        this.log('info', 'Health check', {
          status: healthCheck.status,
          eventsProcessed: healthCheck.counters.eventsProcessed,
          eventsFailed: healthCheck.counters.eventsFailed,
          activeEvents: healthCheck.gauges.activeEvents,
        });
      }

      // Update component health based on poller state
      this.healthMonitor.updateComponentHealth(
        'poller',
        this.state === 'running' ? 'healthy' : this.state === 'error' ? 'unhealthy' : 'degraded',
      );
    }, this.config.healthCheckIntervalMs);
  }

  /**
   * Get current poller status.
   */
  getStatus(): PollerStatus {
    const healthCheck = this.healthMonitor.getHealthCheck();

    return {
      state: this.state,
      workerId: this.config.workerId,
      startedAt: this.startedAt,
      lastPollAt: this.lastPollAt,
      pollCount: this.pollCount,
      eventsProcessed: healthCheck.counters.eventsProcessed,
      eventsFailed: healthCheck.counters.eventsFailed,
      consecutiveErrors: this.consecutiveErrors,
      health: healthCheck.status,
    };
  }

  /**
   * Get full health check result.
   */
  getHealthCheck(): HealthCheckResult {
    return this.healthMonitor.getHealthCheck();
  }

  /**
   * Get the current shutdown promise (if shutting down).
   */
  getShutdownPromise(): Promise<void> | null {
    return this.currentShutdownPromise;
  }

  // ===========================================================================
  // UTILITIES
  // ===========================================================================

  /**
   * Sleep for a given duration.
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => {
      this.pollTimer = setTimeout(resolve, ms);
    });
  }

  /**
   * Log a message with structured data.
   */
  private log(
    level: 'debug' | 'info' | 'warn' | 'error',
    message: string,
    data?: Record<string, unknown>,
  ): void {
    const entry = {
      timestamp: new Date().toISOString(),
      level,
      service: 'worker-poller',
      workerId: this.config.workerId,
      message,
      ...data,
    };

    const output = JSON.stringify(entry);

    switch (level) {
      case 'debug':
        if (this.config.debug) console.debug(output);
        break;
      case 'info':
        console.info(output);
        break;
      case 'warn':
        console.warn(output);
        break;
      case 'error':
        console.error(output);
        break;
    }
  }
}

// =============================================================================
// FACTORY FUNCTION
// =============================================================================

/**
 * Create a new event poller instance.
 */
export function createEventPoller(
  config: WorkerConfig,
  convexAdapter: ConvexPollerAdapter,
  healthMonitor: HealthMonitor,
): EventPoller {
  return new EventPoller(config, convexAdapter, healthMonitor);
}
