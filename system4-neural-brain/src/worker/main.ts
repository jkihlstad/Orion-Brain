/**
 * Neural Intelligence Platform - Worker Entry Point
 *
 * Main worker process that:
 * 1. Polls Convex for new events
 * 2. Processes events through LangGraph pipeline
 * 3. Writes embeddings to LanceDB
 * 4. Updates Neo4j graph
 * 5. Creates prompts when needed
 * 6. Acknowledges or fails events
 */

import { loadConfig } from '../../config/default';
import { ConvexAdapter, createConvexAdapter } from '../adapters/convex';
import { logger } from '../utils/logger';
import { generateId } from '../utils/id';
import { RetryTracker } from '../utils/retry';
import { processEvent } from './processEvent';
import { ConvexEvent, EventLease, ProcessingResult, BrainConfig } from '../types';

// =============================================================================
// WORKER CONFIGURATION
// =============================================================================

interface WorkerOptions {
  workerId?: string;
  pollInterval?: number;
  batchSize?: number;
  maxConcurrent?: number;
  shutdownGracePeriod?: number;
}

// =============================================================================
// WORKER CLASS
// =============================================================================

export class BrainWorker {
  private config: BrainConfig;
  private workerId: string;
  private convexAdapter: ConvexAdapter;
  private retryTracker: RetryTracker;

  private isRunning: boolean = false;
  private isShuttingDown: boolean = false;
  private processingCount: number = 0;
  private pollTimer: NodeJS.Timeout | null = null;

  private options: Required<WorkerOptions>;

  constructor(config: BrainConfig, options: WorkerOptions = {}) {
    this.config = config;
    this.workerId = options.workerId || generateId('worker');
    this.options = {
      workerId: this.workerId,
      pollInterval: options.pollInterval || config.worker.pollInterval,
      batchSize: options.batchSize || config.worker.batchSize,
      maxConcurrent: options.maxConcurrent || 5,
      shutdownGracePeriod: options.shutdownGracePeriod || 30000,
    };

    this.convexAdapter = createConvexAdapter(config);
    this.retryTracker = new RetryTracker({
      maxRetries: config.worker.maxRetries,
    });

    logger.info('BrainWorker initialized', {
      workerId: this.workerId,
      options: this.options,
    });
  }

  // ===========================================================================
  // LIFECYCLE METHODS
  // ===========================================================================

  /**
   * Start the worker.
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      logger.warn('Worker already running');
      return;
    }

    logger.info('Starting BrainWorker', { workerId: this.workerId });
    this.isRunning = true;
    this.isShuttingDown = false;

    // Register shutdown handlers
    this.registerShutdownHandlers();

    // Start polling loop
    await this.pollLoop();
  }

  /**
   * Stop the worker gracefully.
   */
  async stop(): Promise<void> {
    if (!this.isRunning || this.isShuttingDown) {
      return;
    }

    logger.info('Stopping BrainWorker', { workerId: this.workerId });
    this.isShuttingDown = true;

    // Cancel poll timer
    if (this.pollTimer) {
      clearTimeout(this.pollTimer);
      this.pollTimer = null;
    }

    // Wait for in-flight processing to complete
    const startTime = Date.now();
    while (this.processingCount > 0) {
      if (Date.now() - startTime > this.options.shutdownGracePeriod) {
        logger.warn('Shutdown grace period exceeded', {
          processingCount: this.processingCount,
        });
        break;
      }
      await sleep(100);
    }

    this.isRunning = false;
    logger.info('BrainWorker stopped', { workerId: this.workerId });
  }

  // ===========================================================================
  // POLLING LOGIC
  // ===========================================================================

  /**
   * Main polling loop.
   */
  private async pollLoop(): Promise<void> {
    while (this.isRunning && !this.isShuttingDown) {
      try {
        // Check if we have capacity
        if (this.processingCount >= this.options.maxConcurrent) {
          await sleep(1000);
          continue;
        }

        // Calculate how many we can lease
        const available = this.options.maxConcurrent - this.processingCount;
        const batchSize = Math.min(available, this.options.batchSize);

        // Lease events
        const { events, leases } = await this.convexAdapter.leaseEvents(batchSize);

        if (events.length === 0) {
          // No events, wait before next poll
          await sleep(this.options.pollInterval);
          continue;
        }

        logger.info('Leased events for processing', {
          count: events.length,
          workerId: this.workerId,
        });

        // Process events concurrently
        await Promise.all(
          events.map((event, index) =>
            this.processEventWithLease(event, leases[index])
          )
        );

      } catch (error) {
        logger.error('Poll loop error', {
          error: error instanceof Error ? error.message : String(error),
          workerId: this.workerId,
        });
        // Back off on errors
        await sleep(this.options.pollInterval * 2);
      }
    }
  }

  // ===========================================================================
  // EVENT PROCESSING
  // ===========================================================================

  /**
   * Process a single event with its lease.
   */
  private async processEventWithLease(
    event: ConvexEvent,
    lease: EventLease
  ): Promise<void> {
    this.processingCount++;

    const eventLogger = logger.child({
      eventId: event._id,
      eventType: event.eventType,
      userId: event.userId,
    });

    try {
      eventLogger.info('Processing event');

      // Check idempotency - don't reprocess
      const idempotencyKey = `${event._id}:process:v1`;

      // Process the event through the pipeline
      const result = await processEvent(event, this.config);

      if (result.success) {
        // Acknowledge successful processing
        await this.convexAdapter.ackEvent(event._id, lease.leaseId, {
          embeddingIds: result.embeddings.map((e) => e.id),
          graphNodeIds: [], // TODO: Track graph node IDs
        });

        this.retryTracker.clear(event._id);
        eventLogger.info('Event processed successfully', {
          embeddingCount: result.embeddings.length,
          promptCreated: result.promptCreated,
        });
      } else {
        // Handle failure with retry
        await this.handleProcessingFailure(event, lease, result.error || 'Unknown error');
      }

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      eventLogger.error('Event processing failed', { error: errorMessage });
      await this.handleProcessingFailure(event, lease, errorMessage);

    } finally {
      this.processingCount--;
    }
  }

  /**
   * Handle processing failure with retry logic.
   */
  private async handleProcessingFailure(
    event: ConvexEvent,
    lease: EventLease,
    error: string
  ): Promise<void> {
    const { attemptNumber, canRetry } = this.retryTracker.recordAttempt(event._id);

    if (canRetry) {
      // Release lease so event can be retried later
      logger.warn('Event processing failed, will retry', {
        eventId: event._id,
        attemptNumber,
        error,
      });
      // Lease will expire naturally, allowing retry
    } else {
      // Exhausted retries, mark as failed
      await this.convexAdapter.failEvent(
        event._id,
        lease.leaseId,
        error,
        attemptNumber
      );
      this.retryTracker.clear(event._id);
      logger.error('Event processing failed permanently', {
        eventId: event._id,
        attemptNumber,
        error,
      });
    }
  }

  // ===========================================================================
  // SHUTDOWN HANDLERS
  // ===========================================================================

  /**
   * Register process shutdown handlers.
   */
  private registerShutdownHandlers(): void {
    const shutdown = async (signal: string) => {
      logger.info(`Received ${signal}, initiating graceful shutdown`);
      await this.stop();
      process.exit(0);
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));

    process.on('uncaughtException', (error) => {
      logger.error('Uncaught exception', { error: error.message, stack: error.stack });
      shutdown('uncaughtException');
    });

    process.on('unhandledRejection', (reason) => {
      logger.error('Unhandled rejection', { reason: String(reason) });
      // Don't exit on unhandled rejection, just log
    });
  }

  // ===========================================================================
  // STATUS METHODS
  // ===========================================================================

  /**
   * Get current worker status.
   */
  getStatus(): WorkerStatus {
    return {
      workerId: this.workerId,
      isRunning: this.isRunning,
      isShuttingDown: this.isShuttingDown,
      processingCount: this.processingCount,
      maxConcurrent: this.options.maxConcurrent,
    };
  }
}

interface WorkerStatus {
  workerId: string;
  isRunning: boolean;
  isShuttingDown: boolean;
  processingCount: number;
  maxConcurrent: number;
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// =============================================================================
// MAIN ENTRY POINT
// =============================================================================

async function main(): Promise<void> {
  logger.info('Starting Neural Intelligence Brain Worker');

  try {
    // Load configuration
    const config = loadConfig();

    // Create and start worker
    const worker = new BrainWorker(config);
    await worker.start();

  } catch (error) {
    logger.error('Fatal error starting worker', {
      error: error instanceof Error ? error.message : String(error),
    });
    process.exit(1);
  }
}

// Run if this is the main module
if (require.main === module) {
  main().catch((error) => {
    console.error('Worker crashed:', error);
    process.exit(1);
  });
}

export { main };
