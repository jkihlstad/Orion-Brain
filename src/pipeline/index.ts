/**
 * Neural Intelligence Platform - Pipeline Module
 *
 * Exports all types and functions for the event processing pipeline,
 * including the event processor and status writer.
 *
 * @version 1.0.0
 */

// =============================================================================
// PROCESS EVENT
// =============================================================================

export {
  // Types
  type QueuedEvent,
  type EventProcessingResult,
  type BatchProcessingResult,
  type EventProcessorConfig,

  // Class
  EventProcessor,

  // Factory
  createEventProcessor,

  // Convenience Functions
  processEvent,
  processBatch,

  // Utilities
  validateQueuedEvent,
  createQueuedEvent,
} from './processEvent';

// =============================================================================
// STATUS WRITER
// =============================================================================

export {
  // Types
  type ProcessingStatus,
  type EventStatus,
  type StatusWriterOptions,
  type StatusStorage,

  // Class
  StatusWriter,

  // Factory
  createStatusWriter,
  createInMemoryStatusWriter,
  createConvexStatusStorage,

  // Utilities
  summarizeStatuses,
  filterRetryableEvents,
  getStuckEvents,
} from './statusWriter';

// =============================================================================
// PROFILE PIPELINE
// =============================================================================

export {
  // Profile Synthesis
  synthesizeProfile,
  recomputeProfile,
  mergeAnswers,
  canonicalizeAnswers,
  computePersonaSummary,
  computeNotificationRules,
  computeLLMPolicy,
  type AccumulatedAnswers,
  type ProfileSynthesisConfig,

  // Profile Embedding
  embedProfileToLanceDB,
  canonicalizeProfileToText,
  closeLanceDBAdapter,
  getLanceDBAdapter,
  createProfileDocuments,
  generateTextEmbedding,
  type ProfileEmbeddingResult,
  type ProfileDocument,
  type ProfileEmbeddingConfig,

  // Convex Sync
  writeProfileSnapshotToConvex,
  readProfileSnapshotFromConvex,
  readQuestionnaireAnswersFromConvex,
  deleteProfileSnapshotFromConvex,
  serializeProfileForConvex,
  deserializeProfileFromConvex,
  type ConvexSyncResult,
  type ConvexSyncConfig,

  // Profile Event Handler
  handleProfileEvent,
  handleProfileEventBatch,
  isProfileEvent,
  getProfileEventType,
  extractModuleIdFromEventType,
  convertToProfileSubmissionEvent,
  PROFILE_EVENT_PATTERNS,
  type PipelineEvent,
  type ProfileEventHandlerResult,
  type ProfileEventHandlerConfig,
} from './profile';
