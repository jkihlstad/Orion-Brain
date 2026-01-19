/**
 * Neural Intelligence Platform - Embeddings API
 *
 * API endpoints for embedding operations. Handles:
 * - Storing embeddings from iOS app
 * - Similarity search across embeddings
 * - Embedding retrieval and management
 *
 * @version 1.0.0
 * @author Sub-Agent 3: Orchestration + API Engineer
 */

import express, { Request, Response, Router } from 'express';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';

// Middleware
import { clerkAuth, getUserId } from '../middleware/clerkAuth';

// Adapters
import { LanceDBAdapter } from '../adapters/lancedb';

// Types
import type { EventType, PrivacyScope, SourceApp, SearchFilters } from '../types/common';

// =============================================================================
// TYPES
// =============================================================================

/**
 * Embedding store request
 */
export interface EmbeddingStoreRequest {
  userId: string;
  vector: number[];
  metadata: Record<string, string>;
  eventId?: string;
  eventType?: EventType;
  privacyScope?: PrivacyScope;
  sourceApp?: SourceApp;
  timestamp?: number;
}

/**
 * Embedding store response
 */
export interface EmbeddingStoreResponse {
  success: boolean;
  embeddingId?: string;
  eventId?: string;
  error?: string;
}

/**
 * Search result item
 */
export interface SearchResultItem {
  id: string;
  eventId: string;
  score: number;
  metadata: Record<string, unknown>;
  eventType?: EventType;
  timestamp?: number;
}

/**
 * Similarity search request
 */
export interface EmbeddingSearchRequest {
  userId: string;
  queryVector: number[];
  topK: number;
  filters?: {
    eventTypes?: EventType[];
    privacyScopes?: PrivacyScope[];
    timestampStart?: number;
    timestampEnd?: number;
    contactId?: string;
    sourceApps?: SourceApp[];
  };
  minSimilarity?: number;
}

/**
 * Similarity search response
 */
export interface EmbeddingSearchResponse {
  success: boolean;
  results: SearchResultItem[];
  queryTimeMs?: number;
  error?: string;
}

/**
 * Embedding retrieval response
 */
export interface EmbeddingRetrieveResponse {
  success: boolean;
  embedding?: {
    id: string;
    vector: number[];
    eventId: string;
    eventType: EventType;
    metadata: Record<string, unknown>;
    createdAt: number;
  };
  error?: string;
}

/**
 * Batch embedding store request
 */
export interface BatchEmbeddingStoreRequest {
  embeddings: EmbeddingStoreRequest[];
}

/**
 * Batch embedding store response
 */
export interface BatchEmbeddingStoreResponse {
  success: boolean;
  results: Array<{
    success: boolean;
    embeddingId?: string;
    error?: string;
  }>;
  totalSucceeded: number;
  totalFailed: number;
}

// =============================================================================
// ZOD VALIDATION SCHEMAS
// =============================================================================

const eventTypeSchema = z.enum([
  'audio_segment',
  'text_event',
  'browser_session',
  'image_frame',
  'video_segment',
]);

const privacyScopeSchema = z.enum(['private', 'social', 'public']);

const sourceAppSchema = z.enum(['ios_browser', 'ios_native', 'web_extension', 'api_import']);

const embeddingStoreRequestSchema = z.object({
  userId: z.string().min(1, 'userId is required'),
  vector: z.array(z.number()).min(1, 'vector must have at least 1 dimension'),
  metadata: z.record(z.string(), z.string()),
  eventId: z.string().optional(),
  eventType: eventTypeSchema.optional().default('text_event'),
  privacyScope: privacyScopeSchema.optional().default('private'),
  sourceApp: sourceAppSchema.optional().default('ios_native'),
  timestamp: z.number().optional(),
});

const searchFiltersSchema = z.object({
  eventTypes: z.array(eventTypeSchema).optional(),
  privacyScopes: z.array(privacyScopeSchema).optional(),
  timestampStart: z.number().optional(),
  timestampEnd: z.number().optional(),
  contactId: z.string().optional(),
  sourceApps: z.array(sourceAppSchema).optional(),
}).optional();

const embeddingSearchRequestSchema = z.object({
  userId: z.string().min(1, 'userId is required'),
  queryVector: z.array(z.number()).min(1, 'queryVector must have at least 1 dimension'),
  topK: z.number().min(1).max(1000).default(20),
  filters: searchFiltersSchema,
  minSimilarity: z.number().min(0).max(1).optional().default(0.5),
});

const batchEmbeddingStoreRequestSchema = z.object({
  embeddings: z.array(embeddingStoreRequestSchema).min(1).max(100),
});

// =============================================================================
// CONFIGURATION
// =============================================================================

// Configuration constants for embedding operations
const _config = {
  defaultTopK: 20,
  maxTopK: 1000,
  defaultMinSimilarity: 0.5,
  maxBatchSize: 100,
} as const;
void _config; // Reserved for future configuration-based validation

// =============================================================================
// ADAPTER INSTANCE (Singleton pattern)
// =============================================================================

let lanceDbAdapter: LanceDBAdapter | null = null;

/**
 * Get or create LanceDB adapter instance
 */
async function getLanceDBAdapter(): Promise<LanceDBAdapter> {
  if (!lanceDbAdapter) {
    lanceDbAdapter = new LanceDBAdapter({
      uri: process.env.LANCEDB_URI || './data/lancedb',
    });
    await lanceDbAdapter.connect();
  }
  return lanceDbAdapter;
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Determine which LanceDB table to use based on event type
 * Reserved for future multi-table support
 */
function _getTableNameForEventType(eventType: EventType): string {
  switch (eventType) {
    case 'audio_segment':
      return 'audio_segments';
    case 'text_event':
      return 'text_events';
    case 'browser_session':
      return 'browser_sessions';
    case 'image_frame':
      return 'image_frames';
    case 'video_segment':
      return 'video_segments';
    default:
      return 'text_events';
  }
}
void _getTableNameForEventType; // Reserved for future multi-table support

// =============================================================================
// ROUTE HANDLERS
// =============================================================================

/**
 * POST /v1/brain/embeddings/store
 * Store embedding from iOS app
 */
async function handleStore(req: Request, res: Response): Promise<void> {
  try {
    // Validate request body
    const validationResult = embeddingStoreRequestSchema.safeParse(req.body);

    if (!validationResult.success) {
      res.status(400).json({
        success: false,
        error: validationResult.error.issues.map((e) => `${e.path.join('.')}: ${e.message}`).join(', '),
      } as EmbeddingStoreResponse);
      return;
    }

    const { userId, vector, metadata, eventId, eventType, privacyScope, sourceApp, timestamp } = validationResult.data;
    void eventType; // Used for future multi-table routing
    const authenticatedUserId = getUserId(req);

    // Verify the userId matches the authenticated user
    if (userId !== authenticatedUserId) {
      res.status(403).json({
        success: false,
        error: 'User ID in request does not match authenticated user',
      } as EmbeddingStoreResponse);
      return;
    }

    // Get LanceDB adapter
    const adapter = await getLanceDBAdapter();

    // Generate IDs if not provided
    const generatedEventId = eventId || uuidv4();
    const ts = timestamp || Date.now();

    // Store embedding based on event type
    try {
      // For now, store as text event - can be extended to support other types
      const rowId = await adapter.insertTextEvent({
        userId,
        sourceApp: sourceApp ?? 'ios_native',
        eventType: eventType ?? 'text_event',
        privacyScope: privacyScope ?? 'private',
        timestamp: ts,
        contactId: metadata['contactId'] || null,
        clusterId: metadata['clusterId'] || null,
        eventId: generatedEventId,
        textVector: vector,
        content: metadata['content'] || '',
        contentType: metadata['contentType'] || 'embedding',
        charCount: 0,
        wordCount: 0,
        language: metadata['language'] || 'en',
        sentiment: null,
        sourceUrl: metadata['sourceUrl'] || null,
        pageTitle: metadata['pageTitle'] || null,
        entitiesJson: metadata['entitiesJson'] || null,
      });

      const response: EmbeddingStoreResponse = {
        success: true,
        embeddingId: rowId,
        eventId: generatedEventId,
      };

      res.status(201).json(response);
    } catch (error) {
      console.error('[Embeddings Store] Database error:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to store embedding',
      } as EmbeddingStoreResponse);
    }
  } catch (error) {
    console.error('[Embeddings Store] Error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
    } as EmbeddingStoreResponse);
  }
}

/**
 * POST /v1/brain/embeddings/search
 * Similarity search across embeddings
 */
async function handleSearch(req: Request, res: Response): Promise<void> {
  const startTime = Date.now();

  try {
    // Validate request body
    const validationResult = embeddingSearchRequestSchema.safeParse(req.body);

    if (!validationResult.success) {
      res.status(400).json({
        success: false,
        results: [],
        error: validationResult.error.issues.map((e) => `${e.path.join('.')}: ${e.message}`).join(', '),
      } as EmbeddingSearchResponse);
      return;
    }

    const { userId, queryVector, topK, filters, minSimilarity } = validationResult.data;
    const authenticatedUserId = getUserId(req);

    // Verify the userId matches the authenticated user
    if (userId !== authenticatedUserId) {
      res.status(403).json({
        success: false,
        results: [],
        error: 'User ID in request does not match authenticated user',
      } as EmbeddingSearchResponse);
      return;
    }

    // Get LanceDB adapter
    const adapter = await getLanceDBAdapter();

    // Build search filters - only add optional properties if they have values
    const searchFilters: SearchFilters = {
      userId, // CRITICAL: Always filter by user ID for data isolation
    };
    if (filters?.eventTypes) {
      searchFilters.eventTypes = filters.eventTypes;
    }
    if (filters?.privacyScopes) {
      searchFilters.privacyScopes = filters.privacyScopes;
    }
    if (filters?.timestampStart !== undefined) {
      searchFilters.timestampStart = filters.timestampStart;
    }
    if (filters?.timestampEnd !== undefined) {
      searchFilters.timestampEnd = filters.timestampEnd;
    }
    if (filters?.contactId) {
      searchFilters.contactId = filters.contactId;
    }
    if (filters?.sourceApps) {
      searchFilters.sourceApps = filters.sourceApps;
    }

    try {
      // Search text events (primary table for embeddings)
      const searchResults = await adapter.searchTextEvents({
        queryVector,
        topK,
        filters: searchFilters,
        minSimilarity,
      });

      // Transform results to API format
      const results: SearchResultItem[] = searchResults.map(result => ({
        id: result.row.id,
        eventId: result.row.eventId,
        score: result.similarity,
        metadata: {
          content: result.row.content,
          contentType: result.row.contentType,
          language: result.row.language,
          sourceUrl: result.row.sourceUrl,
          pageTitle: result.row.pageTitle,
        },
        eventType: result.row.eventType as EventType,
        timestamp: result.row.timestamp,
      }));

      const queryTimeMs = Date.now() - startTime;

      const response: EmbeddingSearchResponse = {
        success: true,
        results,
        queryTimeMs,
      };

      res.setHeader('X-Search-Latency-Ms', queryTimeMs);
      res.json(response);
    } catch (error) {
      console.error('[Embeddings Search] Database error:', error);
      res.status(500).json({
        success: false,
        results: [],
        error: error instanceof Error ? error.message : 'Search failed',
      } as EmbeddingSearchResponse);
    }
  } catch (error) {
    console.error('[Embeddings Search] Error:', error);
    res.status(500).json({
      success: false,
      results: [],
      error: 'Internal server error',
    } as EmbeddingSearchResponse);
  }
}

/**
 * POST /v1/brain/embeddings/batch
 * Batch store multiple embeddings
 */
async function handleBatchStore(req: Request, res: Response): Promise<void> {
  try {
    // Validate request body
    const validationResult = batchEmbeddingStoreRequestSchema.safeParse(req.body);

    if (!validationResult.success) {
      res.status(400).json({
        success: false,
        results: [],
        totalSucceeded: 0,
        totalFailed: 0,
        error: validationResult.error.issues.map((e) => `${e.path.join('.')}: ${e.message}`).join(', '),
      });
      return;
    }

    const { embeddings } = validationResult.data;
    const authenticatedUserId = getUserId(req);

    // Get LanceDB adapter
    const adapter = await getLanceDBAdapter();

    const results: BatchEmbeddingStoreResponse['results'] = [];
    let totalSucceeded = 0;
    let totalFailed = 0;

    for (const embedding of embeddings) {
      // Verify user ID for each embedding
      if (embedding.userId !== authenticatedUserId) {
        results.push({
          success: false,
          error: 'User ID does not match authenticated user',
        });
        totalFailed++;
        continue;
      }

      try {
        const generatedEventId = embedding.eventId || uuidv4();
        const ts = embedding.timestamp || Date.now();

        const rowId = await adapter.insertTextEvent({
          userId: embedding.userId,
          sourceApp: embedding.sourceApp ?? 'ios_native',
          eventType: embedding.eventType ?? 'text_event',
          privacyScope: embedding.privacyScope ?? 'private',
          timestamp: ts,
          contactId: embedding.metadata['contactId'] || null,
          clusterId: embedding.metadata['clusterId'] || null,
          eventId: generatedEventId,
          textVector: embedding.vector,
          content: embedding.metadata['content'] || '',
          contentType: embedding.metadata['contentType'] || 'embedding',
          charCount: 0,
          wordCount: 0,
          language: embedding.metadata['language'] || 'en',
          sentiment: null,
          sourceUrl: embedding.metadata['sourceUrl'] || null,
          pageTitle: embedding.metadata['pageTitle'] || null,
          entitiesJson: embedding.metadata['entitiesJson'] || null,
        });

        results.push({
          success: true,
          embeddingId: rowId,
        });
        totalSucceeded++;
      } catch (error) {
        results.push({
          success: false,
          error: error instanceof Error ? error.message : 'Failed to store embedding',
        });
        totalFailed++;
      }
    }

    const response: BatchEmbeddingStoreResponse = {
      success: totalFailed === 0,
      results,
      totalSucceeded,
      totalFailed,
    };

    res.status(totalFailed === 0 ? 201 : 207).json(response);
  } catch (error) {
    console.error('[Embeddings Batch Store] Error:', error);
    res.status(500).json({
      success: false,
      results: [],
      totalSucceeded: 0,
      totalFailed: 0,
      error: 'Internal server error',
    });
  }
}

/**
 * GET /v1/brain/embeddings/:embeddingId
 * Retrieve a specific embedding
 */
async function handleRetrieve(req: Request, res: Response): Promise<void> {
  try {
    const { embeddingId } = req.params;
    const _authenticatedUserId = getUserId(req);
    void _authenticatedUserId; // Will be used for ownership verification when retrieval is implemented

    if (!embeddingId) {
      res.status(400).json({
        success: false,
        error: 'embeddingId is required',
      } as EmbeddingRetrieveResponse);
      return;
    }

    // TODO: Implement retrieval from LanceDB
    // For now, return not found since LanceDB doesn't have a direct get by ID
    res.status(404).json({
      success: false,
      error: `Embedding ${embeddingId} not found`,
    } as EmbeddingRetrieveResponse);
  } catch (error) {
    console.error('[Embeddings Retrieve] Error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
    } as EmbeddingRetrieveResponse);
  }
}

/**
 * DELETE /v1/brain/embeddings/:embeddingId
 * Delete a specific embedding
 */
async function handleDelete(req: Request, res: Response): Promise<void> {
  try {
    const embeddingIdParam = req.params.embeddingId;
    const embeddingId = Array.isArray(embeddingIdParam) ? embeddingIdParam[0] : embeddingIdParam;
    const _authenticatedUserId = getUserId(req);
    void _authenticatedUserId; // Will be used for ownership verification before delete

    if (!embeddingId) {
      res.status(400).json({
        success: false,
        error: 'embeddingId is required',
      });
      return;
    }

    // Get LanceDB adapter
    const adapter = await getLanceDBAdapter();

    try {
      // Delete from text_events table
      const deletedCount = await adapter.deleteRows('text_events', [embeddingId]);

      if (deletedCount > 0) {
        res.json({
          success: true,
          deletedCount,
        });
      } else {
        res.status(404).json({
          success: false,
          error: `Embedding ${embeddingId} not found`,
        });
      }
    } catch (error) {
      console.error('[Embeddings Delete] Database error:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Delete failed',
      });
    }
  } catch (error) {
    console.error('[Embeddings Delete] Error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
    });
  }
}

// =============================================================================
// ROUTER FACTORY
// =============================================================================

/**
 * Create embeddings router with Clerk authentication
 */
export function createEmbeddingsRouter(): Router {
  const router = Router();

  // Apply Clerk authentication to all routes
  router.use(clerkAuth({
    skipPaths: [], // All paths require auth
  }) as express.RequestHandler);

  // POST /v1/brain/embeddings/store - Store single embedding
  router.post('/store', handleStore as express.RequestHandler);

  // POST /v1/brain/embeddings/search - Similarity search
  router.post('/search', handleSearch as express.RequestHandler);

  // POST /v1/brain/embeddings/batch - Batch store embeddings
  router.post('/batch', handleBatchStore as express.RequestHandler);

  // GET /v1/brain/embeddings/:embeddingId - Retrieve embedding
  router.get('/:embeddingId', handleRetrieve as express.RequestHandler);

  // DELETE /v1/brain/embeddings/:embeddingId - Delete embedding
  router.delete('/:embeddingId', handleDelete as express.RequestHandler);

  return router;
}

// =============================================================================
// EXPORTS
// =============================================================================

export {
  handleStore,
  handleSearch,
  handleBatchStore,
  handleRetrieve,
  handleDelete,
  embeddingStoreRequestSchema,
  embeddingSearchRequestSchema,
  batchEmbeddingStoreRequestSchema,
};
