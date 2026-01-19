/**
 * Neural Intelligence Platform - Processing Status Writer
 *
 * Tracks and persists the processing status of events through the pipeline.
 * Provides functions to:
 * - Mark events as processed
 * - Mark events as failed with error details
 * - Track graphUpserted, vectorUpserted, and other processing flags
 * - Support retry logic with attempt tracking
 *
 * @version 1.0.0
 */

// =============================================================================
// TYPE DEFINITIONS
// =============================================================================

/**
 * Processing status for an event.
 */
export interface ProcessingStatus {
  /** Event ID */
  eventId: string;

  /** Whether brain processing is enabled for this event type */
  brainEnabled: boolean;

  /** Whether graph processing is required */
  graphRequired: boolean;

  /** Whether graph upsert completed successfully */
  graphUpserted: boolean;

  /** Whether vector processing is required */
  vectorRequired: boolean;

  /** Whether vector upsert completed successfully */
  vectorUpserted: boolean;

  /** Whether LLM enrichment is required */
  llmEnrichmentRequired: boolean;

  /** Whether LLM enrichment completed successfully */
  llmEnriched: boolean;

  /** Whether all processing is complete */
  done: boolean;

  /** Timestamp when processing completed */
  processedAt: number;

  /** Error messages if processing failed */
  errors?: string[];

  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Event status record in the store.
 */
export interface EventStatus {
  /** Event ID */
  eventId: string;

  /** Current processing status */
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'skipped';

  /** Processing details */
  processing: ProcessingStatus | null;

  /** Number of retry attempts */
  retryCount: number;

  /** Maximum retries allowed */
  maxRetries: number;

  /** Timestamp when event was created/received */
  createdAt: number;

  /** Timestamp of last update */
  updatedAt: number;

  /** Timestamp when processing started */
  startedAt?: number;

  /** Timestamp when processing completed (success or final failure) */
  completedAt?: number;

  /** Last error message */
  lastError?: string;

  /** All error messages from retries */
  errorHistory?: Array<{ timestamp: number; error: string }>;
}

/**
 * Options for status writer.
 */
export interface StatusWriterOptions {
  /** Maximum retry attempts */
  maxRetries?: number;

  /** Callback when status changes */
  onStatusChange?: (eventId: string, status: EventStatus) => void;

  /** Storage backend ('memory' | 'convex' | 'custom') */
  backend?: 'memory' | 'convex' | 'custom';

  /** Custom storage implementation */
  customStorage?: StatusStorage;
}

/**
 * Interface for custom status storage implementations.
 */
export interface StatusStorage {
  /** Get status for an event */
  get(eventId: string): Promise<EventStatus | null>;

  /** Set status for an event */
  set(eventId: string, status: EventStatus): Promise<void>;

  /** Delete status for an event */
  delete(eventId: string): Promise<void>;

  /** Get all pending events */
  getPending(): Promise<EventStatus[]>;

  /** Get all failed events */
  getFailed(): Promise<EventStatus[]>;

  /** Get events by status */
  getByStatus(status: EventStatus['status']): Promise<EventStatus[]>;
}

// =============================================================================
// IN-MEMORY STORAGE
// =============================================================================

/**
 * In-memory status storage implementation.
 * Useful for testing and development.
 */
class InMemoryStatusStorage implements StatusStorage {
  private store = new Map<string, EventStatus>();

  async get(eventId: string): Promise<EventStatus | null> {
    return this.store.get(eventId) ?? null;
  }

  async set(eventId: string, status: EventStatus): Promise<void> {
    this.store.set(eventId, status);
  }

  async delete(eventId: string): Promise<void> {
    this.store.delete(eventId);
  }

  async getPending(): Promise<EventStatus[]> {
    return Array.from(this.store.values()).filter(
      (s) => s.status === 'pending'
    );
  }

  async getFailed(): Promise<EventStatus[]> {
    return Array.from(this.store.values()).filter((s) => s.status === 'failed');
  }

  async getByStatus(status: EventStatus['status']): Promise<EventStatus[]> {
    return Array.from(this.store.values()).filter((s) => s.status === status);
  }

  // Additional helper methods for testing
  getAll(): EventStatus[] {
    return Array.from(this.store.values());
  }

  clear(): void {
    this.store.clear();
  }

  size(): number {
    return this.store.size;
  }
}

// =============================================================================
// STATUS WRITER CLASS
// =============================================================================

/**
 * Status writer for tracking event processing progress.
 */
export class StatusWriter {
  private options: Required<StatusWriterOptions>;
  private storage: StatusStorage;

  constructor(options: StatusWriterOptions = {}) {
    this.options = {
      maxRetries: options.maxRetries ?? 3,
      onStatusChange: options.onStatusChange ?? (() => {}),
      backend: options.backend ?? 'memory',
      customStorage: options.customStorage ?? new InMemoryStatusStorage(),
    };

    if (this.options.backend === 'custom' && options.customStorage) {
      this.storage = options.customStorage;
    } else {
      this.storage = new InMemoryStatusStorage();
    }
  }

  // ===========================================================================
  // STATUS MANAGEMENT
  // ===========================================================================

  /**
   * Creates an initial status record for an event.
   */
  async initializeStatus(eventId: string): Promise<EventStatus> {
    const now = Date.now();
    const status: EventStatus = {
      eventId,
      status: 'pending',
      processing: null,
      retryCount: 0,
      maxRetries: this.options.maxRetries,
      createdAt: now,
      updatedAt: now,
    };

    await this.storage.set(eventId, status);
    this.options.onStatusChange(eventId, status);

    return status;
  }

  /**
   * Marks an event as currently being processed.
   */
  async markProcessing(eventId: string): Promise<EventStatus> {
    let status = await this.storage.get(eventId);

    if (!status) {
      status = await this.initializeStatus(eventId);
    }

    const now = Date.now();
    status = {
      ...status,
      status: 'processing',
      startedAt: status.startedAt ?? now,
      updatedAt: now,
    };

    await this.storage.set(eventId, status);
    this.options.onStatusChange(eventId, status);

    return status;
  }

  /**
   * Marks an event as successfully processed.
   */
  async markProcessed(
    eventId: string,
    processing: ProcessingStatus
  ): Promise<EventStatus> {
    let status = await this.storage.get(eventId);

    if (!status) {
      status = await this.initializeStatus(eventId);
    }

    const now = Date.now();
    status = {
      ...status,
      status: 'completed',
      processing,
      updatedAt: now,
      completedAt: now,
    };

    await this.storage.set(eventId, status);
    this.options.onStatusChange(eventId, status);

    return status;
  }

  /**
   * Marks an event as failed.
   */
  async markFailed(
    eventId: string,
    errors: string[],
    currentRetryCount?: number
  ): Promise<EventStatus> {
    let status = await this.storage.get(eventId);

    if (!status) {
      status = await this.initializeStatus(eventId);
    }

    const now = Date.now();
    const retryCount = (currentRetryCount ?? status.retryCount) + 1;
    const errorHistory = status.errorHistory ?? [];

    for (const error of errors) {
      errorHistory.push({ timestamp: now, error });
    }

    const isFinalFailure = retryCount >= status.maxRetries;

    const updatedStatus: EventStatus = {
      ...status,
      status: isFinalFailure ? 'failed' : 'pending',
      retryCount,
      updatedAt: now,
      errorHistory,
    };

    const lastError = errors[errors.length - 1];
    if (lastError !== undefined) {
      updatedStatus.lastError = lastError;
    }

    if (isFinalFailure) {
      updatedStatus.completedAt = now;
    }

    await this.storage.set(eventId, updatedStatus);
    this.options.onStatusChange(eventId, updatedStatus);

    return updatedStatus;
  }

  /**
   * Marks an event as skipped (brain not enabled).
   */
  async markSkipped(eventId: string, reason?: string): Promise<EventStatus> {
    let status = await this.storage.get(eventId);

    if (!status) {
      status = await this.initializeStatus(eventId);
    }

    const now = Date.now();
    const processingStatus: ProcessingStatus = {
      eventId,
      brainEnabled: false,
      graphRequired: false,
      graphUpserted: false,
      vectorRequired: false,
      vectorUpserted: false,
      llmEnrichmentRequired: false,
      llmEnriched: false,
      done: true,
      processedAt: now,
    };

    if (reason) {
      processingStatus.metadata = { skipReason: reason };
    }

    const updatedStatus: EventStatus = {
      ...status,
      status: 'skipped',
      processing: processingStatus,
      updatedAt: now,
      completedAt: now,
    };

    await this.storage.set(eventId, updatedStatus);
    this.options.onStatusChange(eventId, updatedStatus);

    return updatedStatus;
  }

  /**
   * Updates partial processing status.
   */
  async updateProcessingStatus(
    eventId: string,
    updates: Partial<ProcessingStatus>
  ): Promise<EventStatus> {
    let status = await this.storage.get(eventId);

    if (!status) {
      status = await this.initializeStatus(eventId);
    }

    const now = Date.now();
    const processing: ProcessingStatus = {
      eventId,
      brainEnabled: false,
      graphRequired: false,
      graphUpserted: false,
      vectorRequired: false,
      vectorUpserted: false,
      llmEnrichmentRequired: false,
      llmEnriched: false,
      done: false,
      processedAt: now,
      ...(status.processing ?? {}),
      ...updates,
    };

    status = {
      ...status,
      processing,
      updatedAt: now,
    };

    await this.storage.set(eventId, status);
    this.options.onStatusChange(eventId, status);

    return status;
  }

  // ===========================================================================
  // QUERY METHODS
  // ===========================================================================

  /**
   * Gets the status for an event.
   */
  async getStatus(eventId: string): Promise<EventStatus | null> {
    return this.storage.get(eventId);
  }

  /**
   * Gets all pending events.
   */
  async getPendingEvents(): Promise<EventStatus[]> {
    return this.storage.getPending();
  }

  /**
   * Gets all failed events.
   */
  async getFailedEvents(): Promise<EventStatus[]> {
    return this.storage.getFailed();
  }

  /**
   * Gets events by status.
   */
  async getEventsByStatus(status: EventStatus['status']): Promise<EventStatus[]> {
    return this.storage.getByStatus(status);
  }

  /**
   * Checks if an event can be retried.
   */
  async canRetry(eventId: string): Promise<boolean> {
    const status = await this.storage.get(eventId);
    if (!status) return true;
    return status.retryCount < status.maxRetries;
  }

  /**
   * Gets the retry count for an event.
   */
  async getRetryCount(eventId: string): Promise<number> {
    const status = await this.storage.get(eventId);
    return status?.retryCount ?? 0;
  }

  // ===========================================================================
  // CLEANUP METHODS
  // ===========================================================================

  /**
   * Resets an event status for retry.
   */
  async resetForRetry(eventId: string): Promise<EventStatus | null> {
    const status = await this.storage.get(eventId);
    if (!status) return null;

    if (status.retryCount >= status.maxRetries) {
      return status; // Cannot retry
    }

    const now = Date.now();
    const updated: EventStatus = {
      ...status,
      status: 'pending',
      updatedAt: now,
    };

    await this.storage.set(eventId, updated);
    this.options.onStatusChange(eventId, updated);

    return updated;
  }

  /**
   * Deletes status for an event.
   */
  async deleteStatus(eventId: string): Promise<void> {
    await this.storage.delete(eventId);
  }

  /**
   * Gets the underlying storage (for testing/debugging).
   */
  getStorage(): StatusStorage {
    return this.storage;
  }
}

// =============================================================================
// FACTORY FUNCTIONS
// =============================================================================

/**
 * Creates a status writer with default configuration.
 */
export function createStatusWriter(
  options?: StatusWriterOptions
): StatusWriter {
  return new StatusWriter(options);
}

/**
 * Creates an in-memory status writer for testing.
 */
export function createInMemoryStatusWriter(): StatusWriter {
  return new StatusWriter({ backend: 'memory' });
}

// =============================================================================
// CONVEX STORAGE ADAPTER (Placeholder)
// =============================================================================

/**
 * Creates a Convex-backed status storage.
 * This is a placeholder - implement based on your Convex setup.
 */
export function createConvexStatusStorage(
  _convexClient: unknown
): StatusStorage {
  // TODO: Implement Convex storage
  console.warn('[StatusWriter] Convex storage not yet implemented, using in-memory');
  return new InMemoryStatusStorage();
}

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

/**
 * Summarizes processing status for an array of event statuses.
 */
export function summarizeStatuses(statuses: EventStatus[]): {
  total: number;
  pending: number;
  processing: number;
  completed: number;
  failed: number;
  skipped: number;
  averageRetries: number;
} {
  const summary = {
    total: statuses.length,
    pending: 0,
    processing: 0,
    completed: 0,
    failed: 0,
    skipped: 0,
    averageRetries: 0,
  };

  let totalRetries = 0;

  for (const status of statuses) {
    switch (status.status) {
      case 'pending':
        summary.pending++;
        break;
      case 'processing':
        summary.processing++;
        break;
      case 'completed':
        summary.completed++;
        break;
      case 'failed':
        summary.failed++;
        break;
      case 'skipped':
        summary.skipped++;
        break;
    }
    totalRetries += status.retryCount;
  }

  summary.averageRetries =
    statuses.length > 0 ? totalRetries / statuses.length : 0;

  return summary;
}

/**
 * Filters events that are eligible for retry.
 */
export function filterRetryableEvents(statuses: EventStatus[]): EventStatus[] {
  return statuses.filter(
    (s) =>
      (s.status === 'failed' || s.status === 'pending') &&
      s.retryCount < s.maxRetries
  );
}

/**
 * Gets events that have been stuck in processing.
 */
export function getStuckEvents(
  statuses: EventStatus[],
  maxProcessingTimeMs: number = 300000 // 5 minutes
): EventStatus[] {
  const now = Date.now();
  return statuses.filter(
    (s) =>
      s.status === 'processing' &&
      s.startedAt &&
      now - s.startedAt > maxProcessingTimeMs
  );
}
