/**
 * Orion Exchange Module
 *
 * Enhanced marketplace features including:
 * - Evidence-based ranking with explainability
 * - AI-assisted listing and request processing
 * - Comprehensive proof-of-work scoring
 *
 * @version 4.0.0
 */

// Services
export {
  calculateEvidenceScore,
  calculateAggregateEvidenceScore,
  EVIDENCE_SCORING_CONFIG,
  type EvidenceScoringConfig,
  type ProofData,
  type BusinessProfileData,
  type FraudIndicators,
  type EvidenceScoreResult,
  type EvidenceReason,
  type EvidenceReference,
  type ProofArtifact,
  type ChecklistItem,
  type CustomerConfirmation,
} from './services/evidenceScoring';

export {
  exchangeSearch,
  EXCHANGE_SEARCH_CONFIG,
  type ExchangeSearchConfig,
  type ExchangeSearchRequest,
  type ExchangeSearchResponse,
  type ExchangeSearchResult,
  type ExchangeScoreBreakdown,
  type ExchangeRankingExplanation,
  type ExchangeReasonChip,
  type ExchangeSearchFilters,
  type UserSearchPreferences,
  type BusinessData,
  type ListingData,
  type BusinessEvidenceMetrics,
} from './services/exchangeSearch';

export {
  generateListingDraft,
  parseServiceRequest,
  generateMatchmaking,
  AI_ASSISTANT_CONFIG,
  type AIAssistantConfig,
  type AIListingDraftRequest,
  type AIListingDraft,
  type AIParseRequestInput,
  type ParsedServiceRequest,
  type MatchmakingRequest,
  type MatchmakingResult,
} from './services/aiAssistant';

// API Routes
export { routeExchangeRequest } from './api/routes';
