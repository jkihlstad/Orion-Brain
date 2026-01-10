/**
 * Neural Intelligence Platform
 * Media Processing Pipelines for Audio, Video, Image, and Text
 *
 * This module provides comprehensive media processing capabilities including:
 * - Audio transcription with speaker diarization and clustering
 * - Video frame extraction with CLIP embeddings
 * - Image embedding generation with OCR support
 * - Text embedding with entity extraction
 *
 * All pipelines integrate with OpenRouter API for AI model access.
 */

// Types
export * from './types';

// OpenRouter Adapter
export {
  OpenRouterAdapter,
  createOpenRouterAdapter,
  getDefaultAdapter,
  setDefaultAdapter,
  OpenRouterError,
} from './adapters/openrouter';

export type {
  OpenRouterConfig,
  OpenRouterRequestOptions,
  ChatMessage,
  ChatContent,
  ChatCompletionResponse,
  EmbeddingResponse,
  TranscriptionResponse,
  CostRecord,
} from './adapters/openrouter';

// Pipelines
export * from './pipelines';

// Utilities
export {
  cosineSimilarity,
  euclideanDistance,
  dotProduct,
  magnitude,
  normalize,
  vectorAdd,
  vectorSubtract,
  vectorScale,
  vectorMean,
  generateId,
  chunk,
  variance,
  standardDeviation,
  IncrementalClusterer,
} from './utils/math';

export type {
  Cluster,
  ClusteringResult,
  IncrementalClusterUpdate,
} from './utils/math';

// =============================================================================
// ORCHESTRATION + API (Sub-Agent 3)
// =============================================================================

// API Server
export {
  createServer,
  startServer,
  config as serverConfig,
} from './api/server';

// Search
export {
  semanticSearch,
  multimodalSearch,
  searchSimilarSpeakers,
  searchByContact,
  searchBySession,
  getSearchFacets,
  logSearchQuery,
} from './api/search';

export type {
  SearchResult,
  MultimodalSearchResult,
  RelatedMedia,
} from './api/search';

// Insights
export {
  generateInsights,
  streamInsights,
} from './api/insights';

export type {
  InsightsRequest,
  InsightsResponse,
  InsightSummary,
  Pattern,
  Recommendation,
  RecommendationType,
  InsightMetrics,
  InsightFocusArea,
} from './api/insights';

// LangGraph Workflow
export {
  createBrainGraph,
  brainGraph,
  processEvent,
  processEvents,
  BrainStateAnnotation,
  DEFAULT_CONFIG,
  idempotencyStore,
  deadLetterQueue,
} from './langgraph/graph';

export type {
  BrainState,
  BrainGraphConfig,
  ConvexEvent,
  Enrichments,
  StorageResults,
  GraphResults,
  ProcessingResult,
} from './langgraph/graph';

// Middleware
export {
  clerkAuth,
  requirePermissions,
  requireOrg,
  requireOrgRole,
  getUserId,
  getUserIdOptional,
  isAuthenticated,
  createMockAuth,
  AuthError,
} from './middleware/clerkAuth';

export type {
  ClerkJWTPayload,
  AuthContext,
  ClerkAuthMiddlewareOptions,
} from './middleware/clerkAuth';

export {
  serverAuth,
  apiKeyAuth,
  eitherAuth,
  generateServerAuthHeaders,
  generateServerSignature,
  isServerAuthenticated,
  getServiceName,
  createMockServerAuth,
  ServerAuthError,
} from './middleware/serverAuth';

export type {
  ServerAuthContext,
  ServerAuthMiddlewareOptions,
} from './middleware/serverAuth';
