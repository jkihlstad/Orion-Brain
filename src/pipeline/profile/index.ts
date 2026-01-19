/**
 * Neural Intelligence Platform - Profile Pipeline Module
 *
 * Exports all profile synthesis related types and functions.
 *
 * @version 1.0.0
 */

// =============================================================================
// PROFILE SYNTHESIS
// =============================================================================

export {
  // Main functions
  synthesizeProfile,
  recomputeProfile,

  // Helper functions
  mergeAnswers,
  canonicalizeAnswers,
  computePersonaSummary,
  computeNotificationRules,
  computeLLMPolicy,

  // Types
  type AccumulatedAnswers,
  type ProfileSynthesisConfig,
} from './profileSynthesis';

// =============================================================================
// PROFILE EMBEDDING
// =============================================================================

export {
  // Main functions
  embedProfileToLanceDB,
  canonicalizeProfileToText,
  closeLanceDBAdapter,

  // Helper functions
  getLanceDBAdapter,
  createProfileDocuments,
  generateTextEmbedding,

  // Types
  type ProfileEmbeddingResult,
  type ProfileDocument,
  type ProfileEmbeddingConfig,
} from './profileEmbedding';

// =============================================================================
// CONVEX SYNC
// =============================================================================

export {
  // Main functions
  writeProfileSnapshotToConvex,
  readProfileSnapshotFromConvex,
  readQuestionnaireAnswersFromConvex,
  deleteProfileSnapshotFromConvex,

  // Helper functions
  serializeProfileForConvex,
  deserializeProfileFromConvex,
  executeConvexMutation,

  // Types
  type ConvexSyncResult,
  type ConvexSyncConfig,
  type ConvexMutationPayload,
  type ConvexMutationResponse,
} from './convexSync';

// =============================================================================
// PROFILE EVENT HANDLER
// =============================================================================

export {
  // Main functions
  handleProfileEvent,
  handleProfileEventBatch,
  isProfileEvent,
  getProfileEventType,
  extractModuleIdFromEventType,
  convertToProfileSubmissionEvent,

  // Constants
  PROFILE_EVENT_PATTERNS,

  // Helper functions
  extractQuestionnaireAnswers,
  convertStoredAnswersToAccumulated,

  // Types
  type PipelineEvent,
  type ProfileEventHandlerResult,
  type ProfileEventHandlerConfig,
} from './profileEventHandler';
