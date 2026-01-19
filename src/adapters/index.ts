/**
 * Neural Intelligence Platform - Adapters Index
 *
 * Central export for all database adapters and related types.
 *
 * @version 1.0.0
 * @author Sub-Agent 1: Data + Storage Engineer
 */

// =============================================================================
// LANCEDB ADAPTER
// =============================================================================

export { LanceDBAdapter, createLanceDBAdapter } from './lancedb';
export type { LanceDBConfig } from './lancedb';

// Re-export LanceDB types from schemas
export { LANCEDB_TABLES } from '../schemas/lancedb-tables';
export type {
  LanceDBTableName,
  LanceDBSearchResult,
  AudioSegmentRow,
  AudioSegmentInput,
  TextEventRow,
  TextEventInput,
  BrowserSessionRow,
  BrowserSessionInput,
  ImageFrameRow,
  ImageFrameInput,
  VideoSegmentRow,
  VideoSegmentInput,
} from '../schemas/lancedb-tables';

// =============================================================================
// NEO4J ADAPTER
// =============================================================================

export { Neo4jAdapter, createNeo4jAdapter } from './neo4j';
export type { Neo4jConfig, TransactionContext } from './neo4j';

// Re-export Neo4j types from schemas
export { NODE_LABELS, RELATIONSHIP_TYPES } from '../schemas/neo4j-graph';
export type {
  UserNode,
  EventNode,
  SpeakerClusterNode,
  ContactNode,
  SessionNode,
  UrlNode,
} from '../schemas/neo4j-graph';

// =============================================================================
// BACKFILL SERVICE
// =============================================================================

export { BackfillService, createBackfillService } from './backfill';
export type {
  ClusterResolutionInput,
  ClusterResolutionResult,
  BackfillOptions,
  BackfillProgress,
} from './backfill';

// =============================================================================
// COMMON TYPES
// =============================================================================

export { SCHEMA_VERSION, EMBEDDING_DIMENSIONS } from '../types/common';
export type {
  BaseMetadata,
  PrivacyScope,
  EventType,
  SourceApp,
  ConnectionStatus,
  VectorSearchParams,
  SearchFilters,
  BatchOperationResult,
  PaginatedResponse,
  PaginationParams,
} from '../types/common';

// =============================================================================
// SCHEMA DEFINITIONS
// =============================================================================

export {
  AUDIO_SEGMENT_SCHEMA,
  TEXT_EVENT_SCHEMA,
  BROWSER_SESSION_SCHEMA,
  IMAGE_FRAME_SCHEMA,
  VIDEO_SEGMENT_SCHEMA,
} from '../schemas/lancedb-tables';
export type {
  LanceDBRow,
  LanceDBInput,
  TableRowTypes,
  TableInputTypes,
  MultiTableSearchResult,
} from '../schemas/lancedb-tables';

export {
  NEO4J_SCHEMA_VERSION,
  SCHEMA_CREATION_QUERIES,
  CYPHER_QUERIES,
} from '../schemas/neo4j-graph';
export type {
  NodeLabel,
  RelationshipType,
  CypherQueryName,
  GeneratedRelProps,
  HasSpeakerClusterRelProps,
  ResolvesToRelProps,
  HasSessionRelProps,
  ViewedRelProps,
  InSessionRelProps,
  MentionsSpeakerRelProps,
} from '../schemas/neo4j-graph';
