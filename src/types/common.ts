/**
 * Neural Intelligence Platform - Common Types
 *
 * Shared type definitions used across LanceDB and Neo4j adapters.
 * These types ensure consistency in metadata across all storage layers.
 *
 * @version 1.0.0
 * @author Sub-Agent 1: Data + Storage Engineer
 */

// =============================================================================
// SCHEMA VERSION
// =============================================================================

/**
 * Current schema version for all tables.
 * Increment this when making breaking changes to table structures.
 */
export const SCHEMA_VERSION = 1;

// =============================================================================
// PRIVACY SCOPE
// =============================================================================

/**
 * Privacy classification for events.
 * - private: Only visible to the user
 * - social: Visible to user's contacts
 * - public: Publicly accessible
 */
export type PrivacyScope = 'private' | 'social' | 'public';

// =============================================================================
// EVENT TYPES
// =============================================================================

/**
 * Types of events that can be captured from the iOS browser app.
 */
export type EventType =
  | 'audio_segment'
  | 'text_event'
  | 'browser_session'
  | 'image_frame'
  | 'video_segment';

// =============================================================================
// SOURCE APPLICATIONS
// =============================================================================

/**
 * Source applications that generate events.
 */
export type SourceApp =
  | 'ios_browser'
  | 'ios_native'
  | 'web_extension'
  | 'api_import';

// =============================================================================
// BASE METADATA
// =============================================================================

/**
 * Base metadata interface that ALL LanceDB tables must include.
 * This ensures consistency across all vector storage tables.
 */
export interface BaseMetadata {
  /** Unique identifier for the user */
  userId: string;

  /** Source application that generated this event */
  sourceApp: SourceApp;

  /** Type of event */
  eventType: EventType;

  /** Privacy classification */
  privacyScope: PrivacyScope;

  /** Unix timestamp in milliseconds */
  timestamp: number;

  /** Resolved contact ID (null until cluster is labeled) */
  contactId: string | null;

  /** Speaker cluster ID (null for non-audio events) */
  clusterId: string | null;

  /** Reference back to immutable event in Convex */
  eventId: string;

  /** Schema version for migrations */
  schemaVersion: number;
}

// =============================================================================
// EMBEDDING DIMENSIONS
// =============================================================================

/**
 * Standard embedding dimensions used in the platform.
 */
export const EMBEDDING_DIMENSIONS = {
  /** OpenAI text-embedding-ada-002 or similar */
  TEXT: 1536,

  /** Speaker embedding dimension (e.g., from Pyannote or similar) */
  SPEAKER: 256,

  /** OpenAI CLIP ViT-L/14 */
  CLIP: 768,

  /** Combined/multimodal embeddings */
  MULTIMODAL: 1024,
} as const;

// =============================================================================
// CONVEX EVENT REFERENCE
// =============================================================================

/**
 * Reference to an event in the Convex immutable event store.
 */
export interface ConvexEventRef {
  /** Convex document ID */
  _id: string;

  /** Convex creation time */
  _creationTime: number;

  /** Table name in Convex */
  tableName: string;
}

// =============================================================================
// PAGINATION
// =============================================================================

/**
 * Pagination parameters for queries.
 */
export interface PaginationParams {
  /** Number of results to return */
  limit: number;

  /** Offset for pagination */
  offset?: number;

  /** Cursor-based pagination token */
  cursor?: string;
}

/**
 * Paginated response wrapper.
 */
export interface PaginatedResponse<T> {
  /** Result items */
  items: T[];

  /** Total count (if available) */
  totalCount?: number;

  /** Next cursor for pagination */
  nextCursor?: string;

  /** Whether there are more results */
  hasMore: boolean;
}

// =============================================================================
// SEARCH PARAMETERS
// =============================================================================

/**
 * Base search parameters for vector similarity search.
 */
export interface VectorSearchParams {
  /** Query vector */
  queryVector: number[];

  /** Number of results to return */
  topK: number;

  /** Optional filters */
  filters?: SearchFilters;

  /** Minimum similarity threshold (0-1) */
  minSimilarity?: number;
}

/**
 * Filters that can be applied to vector searches.
 */
export interface SearchFilters {
  /** Filter by user ID */
  userId?: string;

  /** Filter by event types */
  eventTypes?: EventType[];

  /** Filter by privacy scope */
  privacyScopes?: PrivacyScope[];

  /** Filter by time range (start, inclusive) */
  timestampStart?: number;

  /** Filter by time range (end, exclusive) */
  timestampEnd?: number;

  /** Filter by contact ID */
  contactId?: string;

  /** Filter by cluster ID */
  clusterId?: string;

  /** Filter by source app */
  sourceApps?: SourceApp[];
}

// =============================================================================
// BATCH OPERATIONS
// =============================================================================

/**
 * Result of a batch operation.
 */
export interface BatchOperationResult {
  /** Number of items successfully processed */
  successCount: number;

  /** Number of items that failed */
  failureCount: number;

  /** Error messages for failed items */
  errors: Array<{
    index: number;
    error: string;
  }>;
}

// =============================================================================
// DATABASE CONNECTION STATUS
// =============================================================================

/**
 * Connection status for database adapters.
 */
export interface ConnectionStatus {
  /** Whether the connection is active */
  connected: boolean;

  /** Last successful connection time */
  lastConnectedAt?: number;

  /** Error message if connection failed */
  error?: string;

  /** Database-specific metadata */
  metadata?: Record<string, unknown>;
}
