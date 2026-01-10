/**
 * Convex Adapter for Neural Intelligence Platform
 *
 * Handles communication with Convex for:
 * - Leasing events for processing
 * - Acknowledging processed events
 * - Creating prompts for user labeling
 * - Reading event data
 *
 * Uses polling/lease pattern for reliable event consumption.
 */

import {
  ConvexEvent,
  EventLease,
  LeaseResult,
  AckResult,
  PromptRequest,
  ProcessingState,
  BrainError,
  BrainConfig,
} from '../types';
import { generateId } from '../utils/id';
import { logger } from '../utils/logger';

// =============================================================================
// CONFIGURATION
// =============================================================================

interface ConvexAdapterConfig {
  url: string;
  deployKey: string;
  leaseTimeout: number; // ms
  batchSize: number;
}

// =============================================================================
// CONVEX CLIENT ADAPTER
// =============================================================================

export class ConvexAdapter {
  private config: ConvexAdapterConfig;
  private workerId: string;

  // TODO: Replace with actual Convex client when SDK is integrated
  // import { ConvexHttpClient } from 'convex/browser';
  // private client: ConvexHttpClient;

  constructor(config: ConvexAdapterConfig, workerId?: string) {
    this.config = config;
    this.workerId = workerId || generateId('worker');
    logger.info('ConvexAdapter initialized', { workerId: this.workerId });
  }

  // ===========================================================================
  // EVENT LEASING
  // ===========================================================================

  /**
   * Lease a batch of events for processing.
   * Events are locked for the lease duration to prevent double-processing.
   */
  async leaseEvents(batchSize?: number): Promise<LeaseResult> {
    const size = batchSize || this.config.batchSize;
    const now = Date.now();
    const expiresAt = now + this.config.leaseTimeout;

    try {
      // TODO: Replace with actual Convex mutation call
      // const result = await this.client.mutation('events:leaseForProcessing', {
      //   workerId: this.workerId,
      //   batchSize: size,
      //   leaseTimeout: this.config.leaseTimeout,
      // });

      // Placeholder: This would call the Convex mutation
      const result = await this.callConvexMutation<{
        events: ConvexEvent[];
        leaseIds: string[];
      }>('events:leaseForProcessing', {
        workerId: this.workerId,
        batchSize: size,
        leaseTimeout: this.config.leaseTimeout,
      });

      const leases: EventLease[] = result.events.map((event, i) => ({
        eventId: event._id,
        leaseId: result.leaseIds[i],
        leasedAt: now,
        expiresAt,
        workerId: this.workerId,
      }));

      logger.info('Leased events', {
        count: result.events.length,
        workerId: this.workerId,
      });

      return {
        events: result.events,
        leases,
      };
    } catch (error) {
      logger.error('Failed to lease events', { error });
      throw new BrainError(
        'Failed to lease events from Convex',
        'INTERNAL_ERROR',
        true,
        { error }
      );
    }
  }

  /**
   * Acknowledge successful processing of an event.
   */
  async ackEvent(
    eventId: string,
    leaseId: string,
    result: {
      embeddingIds: string[];
      graphNodeIds: string[];
    }
  ): Promise<AckResult> {
    try {
      // TODO: Replace with actual Convex mutation call
      await this.callConvexMutation('events:ackProcessed', {
        eventId,
        leaseId,
        workerId: this.workerId,
        processingState: 'completed' as ProcessingState,
        processedAt: Date.now(),
        result,
      });

      logger.info('Acknowledged event', { eventId });
      return { success: true, eventId };
    } catch (error) {
      logger.error('Failed to ack event', { eventId, error });
      return {
        success: false,
        eventId,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Mark an event as failed after exhausting retries.
   */
  async failEvent(
    eventId: string,
    leaseId: string,
    error: string,
    retryCount: number
  ): Promise<AckResult> {
    try {
      await this.callConvexMutation('events:markFailed', {
        eventId,
        leaseId,
        workerId: this.workerId,
        processingState: 'failed' as ProcessingState,
        processingError: error,
        retryCount,
        failedAt: Date.now(),
      });

      logger.warn('Marked event as failed', { eventId, error, retryCount });
      return { success: true, eventId };
    } catch (err) {
      logger.error('Failed to mark event as failed', { eventId, error: err });
      return {
        success: false,
        eventId,
        error: err instanceof Error ? err.message : 'Unknown error',
      };
    }
  }

  /**
   * Extend the lease on an event (for long-running processing).
   */
  async extendLease(eventId: string, leaseId: string): Promise<boolean> {
    try {
      await this.callConvexMutation('events:extendLease', {
        eventId,
        leaseId,
        workerId: this.workerId,
        newExpiresAt: Date.now() + this.config.leaseTimeout,
      });

      logger.debug('Extended lease', { eventId });
      return true;
    } catch (error) {
      logger.error('Failed to extend lease', { eventId, error });
      return false;
    }
  }

  // ===========================================================================
  // EVENT READING
  // ===========================================================================

  /**
   * Get a single event by ID.
   */
  async getEvent(eventId: string): Promise<ConvexEvent | null> {
    try {
      // TODO: Replace with actual Convex query
      const event = await this.callConvexQuery<ConvexEvent | null>(
        'events:getById',
        { eventId }
      );
      return event;
    } catch (error) {
      logger.error('Failed to get event', { eventId, error });
      throw new BrainError(
        `Failed to get event: ${eventId}`,
        'EVENT_NOT_FOUND',
        false
      );
    }
  }

  /**
   * Get multiple events by IDs.
   */
  async getEvents(eventIds: string[]): Promise<ConvexEvent[]> {
    try {
      const events = await this.callConvexQuery<ConvexEvent[]>(
        'events:getByIds',
        { eventIds }
      );
      return events;
    } catch (error) {
      logger.error('Failed to get events', { eventIds, error });
      throw new BrainError('Failed to get events', 'INTERNAL_ERROR', true);
    }
  }

  /**
   * Get media URL for an event (signed URL for S3/R2/etc).
   */
  async getMediaUrl(eventId: string): Promise<string | null> {
    try {
      const result = await this.callConvexQuery<{ url: string | null }>(
        'events:getMediaUrl',
        { eventId }
      );
      return result.url;
    } catch (error) {
      logger.error('Failed to get media URL', { eventId, error });
      return null;
    }
  }

  // ===========================================================================
  // PROMPTS
  // ===========================================================================

  /**
   * Create a prompt for user labeling/review.
   */
  async createPrompt(prompt: PromptRequest): Promise<string> {
    try {
      const result = await this.callConvexMutation<{ promptId: string }>(
        'prompts:create',
        {
          type: prompt.type,
          userId: prompt.userId,
          data: prompt.data,
          priority: prompt.priority,
          expiresAt: prompt.expiresAt,
          createdAt: Date.now(),
          status: 'pending',
        }
      );

      logger.info('Created prompt', {
        promptId: result.promptId,
        type: prompt.type,
        userId: prompt.userId,
      });

      return result.promptId;
    } catch (error) {
      logger.error('Failed to create prompt', { prompt, error });
      throw new BrainError('Failed to create prompt', 'INTERNAL_ERROR', true);
    }
  }

  /**
   * Update prompt status.
   */
  async updatePromptStatus(
    promptId: string,
    status: 'pending' | 'completed' | 'expired' | 'dismissed'
  ): Promise<void> {
    try {
      await this.callConvexMutation('prompts:updateStatus', {
        promptId,
        status,
        updatedAt: Date.now(),
      });
    } catch (error) {
      logger.error('Failed to update prompt status', { promptId, status, error });
    }
  }

  // ===========================================================================
  // CONTACTS
  // ===========================================================================

  /**
   * Get contact by ID.
   */
  async getContact(
    contactId: string
  ): Promise<{ contactId: string; name: string; userId: string } | null> {
    try {
      const contact = await this.callConvexQuery<{
        _id: string;
        name: string;
        userId: string;
      } | null>('contacts:getById', { contactId });

      if (!contact) return null;

      return {
        contactId: contact._id,
        name: contact.name,
        userId: contact.userId,
      };
    } catch (error) {
      logger.error('Failed to get contact', { contactId, error });
      return null;
    }
  }

  // ===========================================================================
  // INTERNAL HELPERS
  // ===========================================================================

  /**
   * Make a mutation call to Convex.
   * TODO: Replace with actual Convex client implementation.
   */
  private async callConvexMutation<T>(
    functionName: string,
    args: Record<string, unknown>
  ): Promise<T> {
    // TODO: Implement actual Convex HTTP client call
    // Example with ConvexHttpClient:
    //
    // import { ConvexHttpClient } from 'convex/browser';
    // const client = new ConvexHttpClient(this.config.url);
    // client.setAuth(this.config.deployKey);
    // return await client.mutation(api[functionName], args);

    const response = await fetch(`${this.config.url}/api/mutation`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.config.deployKey}`,
      },
      body: JSON.stringify({
        path: functionName,
        args,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Convex mutation failed: ${error}`);
    }

    const result = await response.json();
    return result.value as T;
  }

  /**
   * Make a query call to Convex.
   * TODO: Replace with actual Convex client implementation.
   */
  private async callConvexQuery<T>(
    functionName: string,
    args: Record<string, unknown>
  ): Promise<T> {
    // TODO: Implement actual Convex HTTP client call
    const response = await fetch(`${this.config.url}/api/query`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.config.deployKey}`,
      },
      body: JSON.stringify({
        path: functionName,
        args,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Convex query failed: ${error}`);
    }

    const result = await response.json();
    return result.value as T;
  }
}

// =============================================================================
// FACTORY
// =============================================================================

export function createConvexAdapter(config: BrainConfig): ConvexAdapter {
  return new ConvexAdapter({
    url: config.convex.url,
    deployKey: config.convex.deployKey,
    leaseTimeout: config.worker.leaseTimeout,
    batchSize: config.worker.batchSize,
  });
}
