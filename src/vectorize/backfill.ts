/**
 * Vectorization Backfill Job
 *
 * Processes historical events to ensure 100% vector coverage.
 * Supports batch processing, checkpointing, and progress monitoring.
 *
 * @version 1.0.0
 */

import type { Env } from '../env';
import type { RawEvent } from '../types/rawEvent';
import {
  createVectorizationPipeline,
  type VectorizationPipeline,
  type BatchVectorizeResult,
} from './pipeline';

// =============================================================================
// TYPES
// =============================================================================

/**
 * Backfill job configuration.
 */
export interface BackfillConfig {
  /** Batch size for processing */
  batchSize: number;

  /** Maximum events to process (0 = unlimited) */
  maxEvents: number;

  /** Starting cursor/offset */
  startCursor?: string;

  /** Event types to include (empty = all) */
  eventTypes?: string[];

  /** Domains to include (empty = all) */
  domains?: string[];

  /** Start timestamp filter (inclusive) */
  startTimestampMs?: number;

  /** End timestamp filter (inclusive) */
  endTimestampMs?: number;

  /** Skip already vectorized events */
  skipVectorized: boolean;

  /** Dry run mode (don't write) */
  dryRun: boolean;

  /** Progress callback */
  onProgress?: (progress: BackfillProgress) => void;
}

/**
 * Backfill progress information.
 */
export interface BackfillProgress {
  /** Total events processed so far */
  totalProcessed: number;

  /** Successfully vectorized */
  succeeded: number;

  /** Skipped (already vectorized or filtered) */
  skipped: number;

  /** Failed */
  failed: number;

  /** Current batch number */
  currentBatch: number;

  /** Current cursor for checkpointing */
  currentCursor: string;

  /** Estimated completion percentage */
  completionPercent: number;

  /** Events per second rate */
  eventsPerSecond: number;

  /** Elapsed time in ms */
  elapsedTimeMs: number;
}

/**
 * Backfill job result.
 */
export interface BackfillResult {
  /** Whether the job completed successfully */
  success: boolean;

  /** Final progress state */
  progress: BackfillProgress;

  /** Errors encountered */
  errors: Array<{ eventId: string; error: string }>;

  /** Final cursor for resumption */
  finalCursor: string;

  /** Whether there are more events to process */
  hasMore: boolean;

  /** Total job duration in ms */
  durationMs: number;
}

// =============================================================================
// DEFAULT CONFIGURATION
// =============================================================================

const DEFAULT_CONFIG: BackfillConfig = {
  batchSize: 50,
  maxEvents: 0,
  skipVectorized: true,
  dryRun: false,
};

// =============================================================================
// BACKFILL JOB
// =============================================================================

/**
 * Backfill Job class for processing historical events.
 */
export class BackfillJob {
  private config: BackfillConfig;
  private pipeline: VectorizationPipeline;
  private aborted: boolean = false;

  constructor(env: Env, config: Partial<BackfillConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.pipeline = createVectorizationPipeline(env);
  }

  /**
   * Run the backfill job.
   */
  async run(events: RawEvent[]): Promise<BackfillResult> {
    const startTime = Date.now();
    const errors: Array<{ eventId: string; error: string }> = [];

    // Initialize pipeline
    await this.pipeline.initialize();

    const progress: BackfillProgress = {
      totalProcessed: 0,
      succeeded: 0,
      skipped: 0,
      failed: 0,
      currentBatch: 0,
      currentCursor: this.config.startCursor || '',
      completionPercent: 0,
      eventsPerSecond: 0,
      elapsedTimeMs: 0,
    };

    // Filter events if needed
    let filteredEvents = this.filterEvents(events);

    // Apply max events limit
    if (this.config.maxEvents > 0) {
      filteredEvents = filteredEvents.slice(0, this.config.maxEvents);
    }

    const totalEvents = filteredEvents.length;

    // Process in batches
    for (let i = 0; i < totalEvents && !this.aborted; i += this.config.batchSize) {
      const batch = filteredEvents.slice(i, i + this.config.batchSize);
      progress.currentBatch++;

      let batchResult: BatchVectorizeResult;

      if (this.config.dryRun) {
        // Dry run - just count without processing
        batchResult = {
          totalProcessed: batch.length,
          succeeded: batch.length,
          skipped: 0,
          failed: 0,
          results: batch.map((e) => ({
            eventId: e.eventId,
            success: true,
            skipped: false,
            embeddingsGenerated: 0,
            rowsWritten: 0,
            entitiesLinked: 0,
            processingTimeMs: 0,
          })),
          totalProcessingTimeMs: 0,
        };
      } else {
        // Actual processing
        batchResult = await this.pipeline.vectorizeBatch(batch);
      }

      // Update progress
      progress.totalProcessed += batchResult.totalProcessed;
      progress.succeeded += batchResult.succeeded;
      progress.skipped += batchResult.skipped;
      progress.failed += batchResult.failed;

      // Collect errors
      for (const result of batchResult.results) {
        if (!result.success && result.error) {
          errors.push({ eventId: result.eventId, error: result.error });
        }
      }

      // Update cursor (use last event ID in batch)
      if (batch.length > 0) {
        progress.currentCursor = batch[batch.length - 1]!.eventId;
      }

      // Calculate progress metrics
      progress.elapsedTimeMs = Date.now() - startTime;
      progress.completionPercent = totalEvents > 0
        ? Math.round((progress.totalProcessed / totalEvents) * 100)
        : 100;
      progress.eventsPerSecond = progress.elapsedTimeMs > 0
        ? Math.round((progress.totalProcessed / progress.elapsedTimeMs) * 1000)
        : 0;

      // Call progress callback
      if (this.config.onProgress) {
        this.config.onProgress({ ...progress });
      }

      console.log(
        `[BackfillJob] Batch ${progress.currentBatch}: ` +
          `${progress.totalProcessed}/${totalEvents} processed ` +
          `(${progress.completionPercent}%), ` +
          `${progress.eventsPerSecond} events/sec`
      );
    }

    const durationMs = Date.now() - startTime;

    return {
      success: progress.failed === 0,
      progress,
      errors,
      finalCursor: progress.currentCursor,
      hasMore: this.aborted || (this.config.maxEvents > 0 && progress.totalProcessed >= this.config.maxEvents),
      durationMs,
    };
  }

  /**
   * Abort the running backfill job.
   */
  abort(): void {
    this.aborted = true;
    console.log('[BackfillJob] Abort requested');
  }

  /**
   * Filter events based on configuration.
   */
  private filterEvents(events: RawEvent[]): RawEvent[] {
    return events.filter((event) => {
      // Filter by event type
      if (this.config.eventTypes && this.config.eventTypes.length > 0) {
        if (!this.config.eventTypes.includes(event.eventType)) {
          return false;
        }
      }

      // Filter by domain
      if (this.config.domains && this.config.domains.length > 0) {
        const domain = event.eventType.split('.')[0] || '';
        if (!this.config.domains.includes(domain)) {
          return false;
        }
      }

      // Filter by timestamp
      if (this.config.startTimestampMs !== undefined) {
        if (event.timestampMs < this.config.startTimestampMs) {
          return false;
        }
      }

      if (this.config.endTimestampMs !== undefined) {
        if (event.timestampMs > this.config.endTimestampMs) {
          return false;
        }
      }

      return true;
    });
  }
}

/**
 * Create a backfill job instance.
 */
export function createBackfillJob(
  env: Env,
  config?: Partial<BackfillConfig>
): BackfillJob {
  return new BackfillJob(env, config);
}

/**
 * Run a simple backfill for a list of events.
 */
export async function runBackfill(
  env: Env,
  events: RawEvent[],
  config?: Partial<BackfillConfig>
): Promise<BackfillResult> {
  const job = createBackfillJob(env, config);
  return job.run(events);
}
