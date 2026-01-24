/**
 * Vectorize Module Exports
 *
 * "Vectorize Everything" implementation for brain-platform.
 *
 * @version 1.0.0
 */

// CFD Builder
export {
  buildCFD,
  shouldVectorize,
  getPolicy,
  type CanonicalFeatureDocument,
  type EntityRef,
  type Facets,
  type Modality,
  type EmbeddingPolicy,
  type EmbeddingPolicyConfig,
} from './cfd';

// Embedding Generator
export {
  generateContentEmbedding,
  generateEntityEmbedding,
  generateAllEmbeddings,
  generateEmbeddingsBatch,
  createPlaceholderEmbedding,
  EMBEDDING_CONFIG,
  type EmbeddingView,
  type GeneratedEmbedding,
  type EmbeddingBatchResult,
} from './embed';

// Vector Storage
export {
  createVectorStorage,
  toVectorEventRow,
  VectorStorage,
  VECTORS_EVENTS_TABLE,
  VECTOR_DIMENSIONS,
  VECTORS_EVENTS_SCHEMA,
  type VectorEventRow,
  type VectorSearchResult,
  type VectorSearchFilters,
  type VectorWriteResult,
} from './vectorStorage';

// Pipeline
export {
  createVectorizationPipeline,
  VectorizationPipeline,
  type VectorizeResult,
  type BatchVectorizeResult,
  type VectorCoverageMetrics,
} from './pipeline';

// Entity Linker (Neo4j integration)
export {
  createEntityLinker,
  EntityLinker,
  ENTITY_NODE_LABELS,
  type EntityLinkingResult,
} from './entityLinker';

// Backfill Job
export {
  createBackfillJob,
  runBackfill,
  BackfillJob,
  type BackfillConfig,
  type BackfillProgress,
  type BackfillResult,
} from './backfill';

// QA Harness
export {
  createQAHarness,
  runQuickValidation,
  QAHarness,
  SAMPLE_EVENTS,
  QA_TEST_CASES,
  type QATestCase,
  type QATestResult,
  type QASuiteResult,
  type AssertionResult,
} from './qa-harness';
