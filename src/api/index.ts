/**
 * Neural Intelligence Platform - API Module Index
 *
 * Exports all API-related modules for easy importing.
 *
 * @version 1.0.0
 * @author Sub-Agent 3: Orchestration + API Engineer
 */

// Server
export { createServer, startServer, config as serverConfig } from './server';

// Search
export {
  semanticSearch,
  multimodalSearch,
  searchSimilarSpeakers,
  searchByContact,
  searchBySession,
  getSearchFacets,
  logSearchQuery,
} from './search';

export type {
  SearchResult,
  MultimodalSearchResult,
  RelatedMedia,
  SearchResultMetadata,
} from './search';

// Insights
export {
  generateInsights,
  streamInsights,
} from './insights';

export type {
  InsightsRequest,
  InsightsResponse,
  InsightSummary,
  Pattern,
  Recommendation,
  RecommendationType,
  InsightMetrics,
  InsightFocusArea,
} from './insights';

// iOS Ingestion
export {
  createiOSIngestRouter,
  handleIngest,
  handleBatchIngest,
  handleTaskStatus,
  iOSIngestRequestSchema,
  iOSBatchIngestRequestSchema,
} from './ios-ingest';

export type {
  iOSMediaType,
  iOSTaskType,
  iOSIngestPayload,
  iOSIngestRequest,
  iOSIngestResponse,
  iOSBatchIngestRequest,
  iOSBatchIngestResponse,
  TaskStatus,
  TaskStatusResponse,
} from './ios-ingest';

// Embeddings
export {
  createEmbeddingsRouter,
  handleStore,
  handleSearch,
  handleBatchStore,
  handleRetrieve,
  handleDelete,
  embeddingStoreRequestSchema,
  embeddingSearchRequestSchema,
  batchEmbeddingStoreRequestSchema,
} from './embeddings';

export type {
  EmbeddingStoreRequest,
  EmbeddingStoreResponse,
  SearchResultItem,
  EmbeddingSearchRequest,
  EmbeddingSearchResponse,
  EmbeddingRetrieveResponse,
  BatchEmbeddingStoreRequest,
  BatchEmbeddingStoreResponse,
} from './embeddings';

// Graph
export {
  createGraphRouter,
  handleAddRelationship,
  handleUpdateNode,
  handlePathQuery,
  handleNeighborsQuery,
  handleCreateNode,
  handleDeleteRelationship,
  addRelationshipRequestSchema,
  updateNodeRequestSchema,
  pathQueryRequestSchema,
  createNodeRequestSchema,
} from './graph';

export type {
  RelationshipType,
  NodeType,
  AddRelationshipRequest,
  AddRelationshipResponse,
  UpdateNodeRequest,
  UpdateNodeResponse,
  PathQueryRequest,
  PathNode,
  PathRelationship,
  PathQueryResponse,
  NeighborsQueryResponse,
  CreateNodeRequest,
  CreateNodeResponse,
} from './graph';

// Profile
export {
  createProfileRouter,
  handleGetProfile,
  handleRecomputeProfile,
  handleSubmitQuestionnaire,
  handleGetProfileGraph,
  questionnaireSubmissionSchema,
  recomputeRequestSchema,
  graphDataToProfileSnapshot,
  convertStoredAnswers,
} from './profile';

export type {
  ProfileResponse,
  RecomputeResponse,
  SubmitResponse,
} from './profile';

// Demo (Public API - No Authentication)
export {
  routeDemoRequest,
  handleDemoSearch,
  handleDemoUsers,
  handleDemoInsights,
  handleDemoEvents,
  handleDemoCors,
} from './demo';

export type {
  DemoSearchResult,
  DemoUser,
  DemoInsight,
  DemoEvent,
} from './demo';

// Vector Coverage (Dashboard Diagnostics)
export {
  routeVectorCoverageRequest,
  handleGetCoverageMetrics,
  handleVectorHealth,
  handleGetEventVectorStatus,
  handleVectorSearch,
} from './vector-coverage';

export type {
  CoverageMetricsResponse,
  VectorHealthResponse,
  EventVectorStatusResponse,
  VectorSearchResponse,
} from './vector-coverage';
