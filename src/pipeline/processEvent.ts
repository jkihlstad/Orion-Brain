/**
 * Neural Intelligence Platform - Event Processing Pipeline
 *
 * The main event processing pipeline that:
 * - Loads events from the queue/input
 * - Checks if brain processing is enabled for the event type
 * - If graphRequired: loads mapping, runs mappingEngine, executes Neo4j
 * - Marks status (graphUpserted=true, done)
 * - Handles errors and retries
 *
 * This pipeline is completely generic - all transformation logic comes
 * from the mapping specifications and registry configuration.
 *
 * @version 1.0.0
 */

import {
  isBrainEnabled,
  getMappingPath,
  getProcessingRequirements,
  type ProcessingRequirement,
} from '../contracts/registry';
import {
  getMappingForEventType,
  type EventMapping,
} from '../contracts/mappings';
import {
  mapEventToGraphOps,
  type MappableEvent,
} from '../graph/mappingEngine';
import {
  Neo4jClient,
  getDefaultClient,
  type BatchExecutionResult,
} from '../graph/neo4j';
import {
  StatusWriter,
  createStatusWriter,
  type ProcessingStatus,
} from './statusWriter';

// =============================================================================
// TYPE DEFINITIONS
// =============================================================================

/**
 * Event from the input queue.
 */
export interface QueuedEvent {
  /** Unique event identifier */
  eventId: string;

  /** Event type */
  eventType: string;

  /** User ID who generated the event */
  userId: string;

  /** Event timestamp */
  timestamp: number;

  /** Event payload */
  payload: Record<string, unknown>;

  /** Retry count */
  retryCount?: number;

  /** Original queue message ID (for acknowledgment) */
  messageId?: string;
}

/**
 * Result of processing a single event.
 */
export interface EventProcessingResult {
  /** Event ID that was processed */
  eventId: string;

  /** Whether processing succeeded */
  success: boolean;

  /** Processing status details */
  status: ProcessingStatus;

  /** Number of graph operations executed */
  graphOperationsCount: number;

  /** Errors encountered */
  errors: string[];

  /** Warnings encountered */
  warnings: string[];

  /** Processing time in milliseconds */
  processingTimeMs: number;
}

/**
 * Result of processing a batch of events.
 */
export interface BatchProcessingResult {
  /** Total events processed */
  totalEvents: number;

  /** Successfully processed events */
  successCount: number;

  /** Failed events */
  failedCount: number;

  /** Skipped events (brain not enabled) */
  skippedCount: number;

  /** Individual event results */
  results: EventProcessingResult[];

  /** Total processing time in milliseconds */
  totalProcessingTimeMs: number;
}

/**
 * Configuration for the event processor.
 */
export interface EventProcessorConfig {
  /** Neo4j client instance */
  neo4jClient?: Neo4jClient;

  /** Status writer instance */
  statusWriter?: StatusWriter;

  /** Directory containing mapping files */
  mappingsDir?: string;

  /** Maximum retry attempts for failed processing */
  maxRetries?: number;

  /** Whether to use transactions for graph operations */
  useTransactions?: boolean;

  /** Whether to continue processing on individual event failure */
  continueOnError?: boolean;

  /** Callback for event processing progress */
  onProgress?: (eventId: string, status: 'started' | 'completed' | 'failed') => void;
}

// =============================================================================
// EVENT PROCESSOR CLASS
// =============================================================================

/**
 * Event processor that orchestrates the complete processing pipeline.
 */
export class EventProcessor {
  private config: Required<EventProcessorConfig>;
  private neo4jClient: Neo4jClient | null;
  private statusWriter: StatusWriter;
  private mappingCache: Map<string, EventMapping> = new Map();

  constructor(config: EventProcessorConfig = {}) {
    this.config = {
      neo4jClient: config.neo4jClient ?? null,
      statusWriter: config.statusWriter ?? createStatusWriter(),
      mappingsDir: config.mappingsDir ?? './mappings',
      maxRetries: config.maxRetries ?? 3,
      useTransactions: config.useTransactions ?? true,
      continueOnError: config.continueOnError ?? true,
      onProgress: config.onProgress ?? (() => {}),
    } as Required<EventProcessorConfig>;

    this.neo4jClient = this.config.neo4jClient ?? getDefaultClient();
    this.statusWriter = this.config.statusWriter;
  }

  // ===========================================================================
  // MAIN PROCESSING METHODS
  // ===========================================================================

  /**
   * Processes a single event through the pipeline.
   */
  async processEvent(event: QueuedEvent): Promise<EventProcessingResult> {
    const startTime = Date.now();
    const errors: string[] = [];
    const warnings: string[] = [];
    let graphOperationsCount = 0;

    this.config.onProgress(event.eventId, 'started');

    try {
      // Step 1: Check if brain processing is enabled
      if (!isBrainEnabled(event.eventType)) {
        const status: ProcessingStatus = {
          eventId: event.eventId,
          brainEnabled: false,
          graphRequired: false,
          graphUpserted: false,
          vectorRequired: false,
          vectorUpserted: false,
          llmEnrichmentRequired: false,
          llmEnriched: false,
          done: true,
          processedAt: Date.now(),
        };

        await this.statusWriter.markSkipped(event.eventId, 'Brain not enabled');

        this.config.onProgress(event.eventId, 'completed');

        return {
          eventId: event.eventId,
          success: true,
          status,
          graphOperationsCount: 0,
          errors: [],
          warnings: ['Brain processing not enabled for this event type'],
          processingTimeMs: Date.now() - startTime,
        };
      }

      // Step 2: Get processing requirements
      const requirements = getProcessingRequirements(event.eventType);

      // Step 3: Process graph if required
      let graphUpserted = false;
      if (requirements.graphRequired) {
        const graphResult = await this.processGraphOperations(event);
        graphUpserted = graphResult.success;
        graphOperationsCount = graphResult.operationsCount;
        errors.push(...graphResult.errors);
        warnings.push(...graphResult.warnings);

        if (!graphResult.success && !this.config.continueOnError) {
          throw new Error(`Graph processing failed: ${graphResult.errors.join(', ')}`);
        }
      }

      // Step 4: Process vector if required (placeholder for future implementation)
      const vectorUpserted = false;
      if (requirements.vectorRequired) {
        // TODO: Implement vector processing
        warnings.push('Vector processing not yet implemented');
      }

      // Step 5: Process LLM enrichment if required (placeholder for future implementation)
      const llmEnriched = false;
      if (requirements.llmEnrichmentRequired) {
        // TODO: Implement LLM enrichment
        warnings.push('LLM enrichment not yet implemented');
      }

      // Step 6: Build final status
      const status: ProcessingStatus = {
        eventId: event.eventId,
        brainEnabled: requirements.brainEnabled,
        graphRequired: requirements.graphRequired,
        graphUpserted,
        vectorRequired: requirements.vectorRequired,
        vectorUpserted,
        llmEnrichmentRequired: requirements.llmEnrichmentRequired,
        llmEnriched,
        done: this.isProcessingComplete(requirements, {
          graphUpserted,
          vectorUpserted,
          llmEnriched,
        }),
        processedAt: Date.now(),
      };
      if (errors.length > 0) {
        status.errors = errors;
      }

      // Step 7: Write status
      if (status.done && errors.length === 0) {
        await this.statusWriter.markProcessed(event.eventId, status);
      } else if (errors.length > 0) {
        await this.statusWriter.markFailed(event.eventId, errors, event.retryCount);
      }

      this.config.onProgress(event.eventId, errors.length > 0 ? 'failed' : 'completed');

      return {
        eventId: event.eventId,
        success: errors.length === 0,
        status,
        graphOperationsCount,
        errors,
        warnings,
        processingTimeMs: Date.now() - startTime,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      errors.push(errorMessage);

      await this.statusWriter.markFailed(event.eventId, [errorMessage], event.retryCount);

      this.config.onProgress(event.eventId, 'failed');

      return {
        eventId: event.eventId,
        success: false,
        status: {
          eventId: event.eventId,
          brainEnabled: true,
          graphRequired: false,
          graphUpserted: false,
          vectorRequired: false,
          vectorUpserted: false,
          llmEnrichmentRequired: false,
          llmEnriched: false,
          done: false,
          processedAt: Date.now(),
          errors,
        },
        graphOperationsCount,
        errors,
        warnings,
        processingTimeMs: Date.now() - startTime,
      };
    }
  }

  /**
   * Processes a batch of events.
   */
  async processBatch(events: QueuedEvent[]): Promise<BatchProcessingResult> {
    const startTime = Date.now();
    const results: EventProcessingResult[] = [];
    let successCount = 0;
    let failedCount = 0;
    let skippedCount = 0;

    for (const event of events) {
      const result = await this.processEvent(event);
      results.push(result);

      if (result.success) {
        if (result.status.brainEnabled) {
          successCount++;
        } else {
          skippedCount++;
        }
      } else {
        failedCount++;
      }
    }

    return {
      totalEvents: events.length,
      successCount,
      failedCount,
      skippedCount,
      results,
      totalProcessingTimeMs: Date.now() - startTime,
    };
  }

  // ===========================================================================
  // GRAPH PROCESSING
  // ===========================================================================

  /**
   * Processes graph operations for an event.
   */
  private async processGraphOperations(
    event: QueuedEvent
  ): Promise<{
    success: boolean;
    operationsCount: number;
    errors: string[];
    warnings: string[];
  }> {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Step 1: Load mapping
    const mapping = await this.loadMapping(event.eventType);
    if (!mapping) {
      errors.push(`No mapping found for event type: ${event.eventType}`);
      return { success: false, operationsCount: 0, errors, warnings };
    }

    // Step 2: Build mappable event
    const mappableEvent: MappableEvent = {
      eventId: event.eventId,
      eventType: event.eventType,
      userId: event.userId,
      timestamp: event.timestamp,
      payload: event.payload,
      ...event.payload, // Spread payload at top level for easier path access
    };

    // Step 3: Run mapping engine
    const mappingResult = mapEventToGraphOps(mappableEvent, mapping);
    errors.push(...mappingResult.errors);
    warnings.push(...mappingResult.warnings);

    if (!mappingResult.success) {
      return {
        success: false,
        operationsCount: 0,
        errors,
        warnings,
      };
    }

    if (mappingResult.operations.length === 0) {
      warnings.push('No graph operations generated from mapping');
      return { success: true, operationsCount: 0, errors, warnings };
    }

    // Step 4: Execute graph operations
    if (!this.neo4jClient) {
      errors.push('Neo4j client not configured');
      return { success: false, operationsCount: 0, errors, warnings };
    }

    try {
      let result: BatchExecutionResult;

      if (this.config.useTransactions) {
        result = await this.neo4jClient.executeOperationsInTransaction(
          mappingResult.operations
        );
      } else {
        result = await this.neo4jClient.executeOperations(
          mappingResult.operations
        );
      }

      if (!result.success) {
        errors.push(...result.errors);
      }

      return {
        success: result.success,
        operationsCount: result.successCount,
        errors,
        warnings,
      };
    } catch (error) {
      errors.push(
        `Graph execution failed: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`
      );
      return { success: false, operationsCount: 0, errors, warnings };
    }
  }

  /**
   * Loads a mapping for an event type.
   */
  private async loadMapping(eventType: string): Promise<EventMapping | null> {
    // Check cache
    if (this.mappingCache.has(eventType)) {
      return this.mappingCache.get(eventType)!;
    }

    // Get mapping path from registry
    const mappingPath = getMappingPath(eventType);

    // Try to load mapping
    const mapping = getMappingForEventType(
      eventType,
      mappingPath ? undefined : this.config.mappingsDir
    );

    if (mapping) {
      this.mappingCache.set(eventType, mapping);
    }

    return mapping;
  }

  /**
   * Determines if processing is complete based on requirements.
   */
  private isProcessingComplete(
    requirements: ProcessingRequirement,
    results: { graphUpserted: boolean; vectorUpserted: boolean; llmEnriched: boolean }
  ): boolean {
    if (requirements.graphRequired && !results.graphUpserted) {
      return false;
    }
    if (requirements.vectorRequired && !results.vectorUpserted) {
      return false;
    }
    if (requirements.llmEnrichmentRequired && !results.llmEnriched) {
      return false;
    }
    return true;
  }

  // ===========================================================================
  // CONFIGURATION
  // ===========================================================================

  /**
   * Sets the Neo4j client.
   */
  setNeo4jClient(client: Neo4jClient): void {
    this.neo4jClient = client;
  }

  /**
   * Sets the status writer.
   */
  setStatusWriter(writer: StatusWriter): void {
    this.statusWriter = writer;
  }

  /**
   * Clears the mapping cache.
   */
  clearMappingCache(): void {
    this.mappingCache.clear();
  }

  /**
   * Preloads mappings for specified event types.
   */
  async preloadMappings(eventTypes: string[]): Promise<void> {
    for (const eventType of eventTypes) {
      await this.loadMapping(eventType);
    }
  }
}

// =============================================================================
// FACTORY FUNCTIONS
// =============================================================================

/**
 * Creates an event processor with default configuration.
 */
export function createEventProcessor(
  config?: EventProcessorConfig
): EventProcessor {
  return new EventProcessor(config);
}

/**
 * Processes a single event using the default processor.
 */
export async function processEvent(
  event: QueuedEvent,
  config?: EventProcessorConfig
): Promise<EventProcessingResult> {
  const processor = createEventProcessor(config);
  return processor.processEvent(event);
}

/**
 * Processes a batch of events using the default processor.
 */
export async function processBatch(
  events: QueuedEvent[],
  config?: EventProcessorConfig
): Promise<BatchProcessingResult> {
  const processor = createEventProcessor(config);
  return processor.processBatch(events);
}

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

/**
 * Validates a queued event structure.
 */
export function validateQueuedEvent(event: unknown): string[] {
  const errors: string[] = [];

  if (!event || typeof event !== 'object') {
    return ['Event must be an object'];
  }

  const e = event as Record<string, unknown>;

  if (!e.eventId || typeof e.eventId !== 'string') {
    errors.push('eventId is required and must be a string');
  }

  if (!e.eventType || typeof e.eventType !== 'string') {
    errors.push('eventType is required and must be a string');
  }

  if (!e.userId || typeof e.userId !== 'string') {
    errors.push('userId is required and must be a string');
  }

  if (typeof e.timestamp !== 'number') {
    errors.push('timestamp is required and must be a number');
  }

  if (!e.payload || typeof e.payload !== 'object') {
    errors.push('payload is required and must be an object');
  }

  return errors;
}

/**
 * Creates a queued event from raw input.
 */
export function createQueuedEvent(
  input: Record<string, unknown>
): QueuedEvent {
  const errors = validateQueuedEvent(input);
  if (errors.length > 0) {
    throw new Error(`Invalid event: ${errors.join(', ')}`);
  }

  const event: QueuedEvent = {
    eventId: input.eventId as string,
    eventType: input.eventType as string,
    userId: input.userId as string,
    timestamp: input.timestamp as number,
    payload: input.payload as Record<string, unknown>,
    retryCount: (input.retryCount as number) ?? 0,
  };
  if (typeof input.messageId === 'string') {
    event.messageId = input.messageId;
  }
  return event;
}
