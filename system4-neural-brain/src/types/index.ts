/**
 * Core Types for Neural Intelligence Platform (System #4)
 * Version: 1.0.0
 */

// =============================================================================
// SCHEMA VERSIONS
// =============================================================================

export const SCHEMA_VERSIONS = {
  EVENT: 1,
  EMBEDDING: 1,
  PROMPT: 1,
  GRAPH: 1,
} as const;

// =============================================================================
// PRIVACY SCOPES
// =============================================================================

export type PrivacyScope = 'private' | 'social' | 'public';

export const DEFAULT_PRIVACY_SCOPE: PrivacyScope = 'private';

// =============================================================================
// EVENT TYPES
// =============================================================================

export type EventType =
  | 'text'
  | 'audio'
  | 'image'
  | 'video'
  | 'browser_session'
  | 'speaker_cluster_labeled'
  | 'consent_updated';

export type SourceApp = 'ios_browser' | 'dashboard' | 'system';

// =============================================================================
// CONVEX EVENT SCHEMAS
// =============================================================================

export interface ConvexEvent {
  _id: string;
  _creationTime: number;
  userId: string;
  eventType: EventType;
  sourceApp: SourceApp;
  privacyScope: PrivacyScope;
  schemaVersion: number;

  // Content (varies by type)
  content?: string;
  mediaUrl?: string;
  mediaType?: string;
  mediaDuration?: number;

  // Session context
  sessionId?: string;
  url?: string;
  pageTitle?: string;

  // Speaker labeling
  clusterId?: string;
  contactId?: string;

  // Processing state
  processingState?: ProcessingState;
  processingError?: string;
  processedAt?: number;

  // Metadata
  metadata?: Record<string, unknown>;
}

export type ProcessingState =
  | 'pending'
  | 'leased'
  | 'processing'
  | 'completed'
  | 'failed';

// =============================================================================
// LEASE TYPES
// =============================================================================

export interface EventLease {
  eventId: string;
  leaseId: string;
  leasedAt: number;
  expiresAt: number;
  workerId: string;
}

export interface LeaseResult {
  events: ConvexEvent[];
  leases: EventLease[];
}

export interface AckResult {
  success: boolean;
  eventId: string;
  error?: string;
}

// =============================================================================
// EMBEDDING TYPES
// =============================================================================

export interface EmbeddingRecord {
  id: string;
  vector: number[];
  dimension: number;
  model: string;
  timestamp: number;
}

export interface BaseMetadata {
  eventId: string;
  userId: string;
  sourceApp: SourceApp;
  eventType: EventType;
  privacyScope: PrivacyScope;
  timestamp: number;
  schemaVersion: number;
  contactId: string | null;
  clusterId: string | null;
}

// =============================================================================
// AUDIO TYPES
// =============================================================================

export interface AudioSegment extends BaseMetadata {
  segmentId: string;
  vector: number[];
  startTime: number;
  endTime: number;
  speakerId: string;
  transcription: string;
  confidence: number;
  sentiment: SentimentResult;
  emotion: EmotionResult;
}

export interface SentimentResult {
  label: 'positive' | 'negative' | 'neutral';
  score: number;
}

export interface EmotionResult {
  primary: string;
  scores: Record<string, number>;
}

export interface SpeakerClusterUpdate {
  clusterId: string;
  userId: string;
  embedding: number[];
  occurrenceCount: number;
  isNew: boolean;
  needsLabeling: boolean;
  sampleSegmentIds: string[];
}

// =============================================================================
// VIDEO/IMAGE TYPES
// =============================================================================

export interface VideoSegment extends BaseMetadata {
  segmentId: string;
  vector: number[];
  frameIndex: number;
  frameTimestamp: number;
  isKeyframe: boolean;
}

export interface ImageFrame extends BaseMetadata {
  frameId: string;
  vector: number[];
  ocrText?: string;
}

// =============================================================================
// TEXT TYPES
// =============================================================================

export interface TextEvent extends BaseMetadata {
  textId: string;
  vector: number[];
  content: string;
  entities: ExtractedEntity[];
}

export interface ExtractedEntity {
  type: 'person' | 'place' | 'organization' | 'date' | 'other';
  value: string;
  confidence: number;
}

// =============================================================================
// SESSION TYPES
// =============================================================================

export interface BrowserSession extends BaseMetadata {
  sessionId: string;
  vector: number[];
  startTime: number;
  endTime: number;
  urlCount: number;
  eventCount: number;
  summary?: string;
}

// =============================================================================
// GRAPH TYPES (Neo4j)
// =============================================================================

export interface UserNode {
  userId: string;
  createdAt: number;
  updatedAt: number;
}

export interface EventNode {
  eventId: string;
  userId: string;
  eventType: EventType;
  timestamp: number;
  privacyScope: PrivacyScope;
}

export interface SpeakerClusterNode {
  clusterId: string;
  userId: string;
  centroidEmbedding: number[];
  occurrenceCount: number;
  isLabeled: boolean;
  contactId: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface ContactNode {
  contactId: string;
  userId: string;
  name: string;
  createdAt: number;
}

export interface SessionNode {
  sessionId: string;
  userId: string;
  startTime: number;
  endTime: number;
}

export interface UrlNode {
  urlId: string;
  url: string;
  domain: string;
  title?: string;
  firstSeen: number;
  lastSeen: number;
}

// =============================================================================
// PROMPT TYPES
// =============================================================================

export interface PromptRequest {
  type: 'speaker_label' | 'content_review' | 'privacy_check';
  userId: string;
  data: SpeakerLabelPromptData | ContentReviewPromptData;
  priority: 'low' | 'medium' | 'high';
  expiresAt?: number;
}

export interface SpeakerLabelPromptData {
  clusterId: string;
  sampleSegmentIds: string[];
  sampleTranscriptions: string[];
  occurrenceCount: number;
  suggestedContacts?: string[];
}

export interface ContentReviewPromptData {
  eventId: string;
  reason: string;
}

// =============================================================================
// SEARCH TYPES
// =============================================================================

export interface SearchFilters {
  eventTypes?: EventType[];
  privacyScopes?: PrivacyScope[];
  startTime?: number;
  endTime?: number;
  contactIds?: string[];
  clusterIds?: string[];
  sessionIds?: string[];
  sourceApps?: SourceApp[];
}

export interface SearchResult {
  id: string;
  score: number;
  eventType: EventType;
  timestamp: number;
  preview: string;
  contact?: { id: string; name: string };
  session?: { id: string; title: string };
  metadata: Record<string, unknown>;
}

export interface MultimodalSearchResult extends SearchResult {
  modality: 'text' | 'audio' | 'image' | 'video';
  mediaUrl?: string;
  thumbnailUrl?: string;
}

// =============================================================================
// PROCESSING JOB TYPES
// =============================================================================

export interface EmbeddingJob {
  jobId: string;
  eventId: string;
  userId: string;
  eventType: EventType;
  privacyScope: PrivacyScope;
  timestamp: number;
  embeddings: EmbeddingRecord[];
  metadata: Record<string, unknown>;
  speakerUpdates?: SpeakerClusterUpdate[];
  promptRequired?: PromptRequest;
  processingTime: number;
}

export interface ProcessingResult {
  success: boolean;
  eventId: string;
  jobId: string;
  embeddings: EmbeddingRecord[];
  graphUpdates: number;
  promptCreated: boolean;
  error?: string;
  retryCount: number;
}

// =============================================================================
// ERROR TYPES
// =============================================================================

export class BrainError extends Error {
  constructor(
    message: string,
    public code: BrainErrorCode,
    public retryable: boolean = false,
    public context?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'BrainError';
  }
}

export type BrainErrorCode =
  | 'EVENT_NOT_FOUND'
  | 'LEASE_EXPIRED'
  | 'LEASE_CONFLICT'
  | 'EMBEDDING_FAILED'
  | 'STORAGE_ERROR'
  | 'GRAPH_ERROR'
  | 'OPENROUTER_ERROR'
  | 'RATE_LIMITED'
  | 'INVALID_EVENT'
  | 'UNAUTHORIZED'
  | 'INTERNAL_ERROR';

// =============================================================================
// CONFIG TYPES
// =============================================================================

export interface BrainConfig {
  convex: {
    url: string;
    deployKey: string;
  };
  openrouter: {
    apiKey: string;
    baseUrl: string;
    models: {
      textEmbedding: string;
      clipEmbedding: string;
      transcription: string;
      chat: string;
    };
  };
  lancedb: {
    path: string;
  };
  neo4j: {
    uri: string;
    username: string;
    password: string;
  };
  clerk: {
    secretKey: string;
    publishableKey: string;
  };
  worker: {
    batchSize: number;
    pollInterval: number;
    leaseTimeout: number;
    maxRetries: number;
  };
  thresholds: {
    speakerClusterSimilarity: number;
    unknownSpeakerPromptCount: number;
    maxFramesPerVideo: number;
    frameIntervalSeconds: number;
  };
}
