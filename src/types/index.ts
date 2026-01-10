/**
 * Neural Intelligence Platform - Core Type Definitions
 * Media Processing Pipeline Types
 */

// Import types from common for local use
import type { PrivacyScope as CommonPrivacyScope } from './common';

// Re-export common types for compatibility (excluding EventType which is redefined below)
export {
  SCHEMA_VERSION,
  EMBEDDING_DIMENSIONS,
} from './common';

export type {
  PrivacyScope,
  SourceApp,
  BaseMetadata,
  ConvexEventRef,
  PaginationParams,
  PaginatedResponse,
  VectorSearchParams,
  SearchFilters,
  BatchOperationResult,
  ConnectionStatus,
} from './common';

// Re-export EventType from common as CommonEventType to avoid conflict
export type { EventType as CommonEventType } from './common';

// ============================================================================
// Privacy & Scope Types (Pipeline-specific)
// ============================================================================

// Pipeline-specific event types (simplified from common.ts EventType)
export type PipelineEventType = 'audio' | 'video' | 'image' | 'text';

// Alias for pipeline use
export type EventType = PipelineEventType;

// Local alias for PrivacyScope for use within this file
type PrivacyScope = CommonPrivacyScope;

// ============================================================================
// Embedding Types
// ============================================================================

export interface EmbeddingVector {
  values: number[];
  dimensions: number;
  model: string;
  normalizedAt?: number;
}

export interface EmbeddingRecord {
  id: string;
  vector: EmbeddingVector;
  contentType: EventType;
  contentHash?: string;
  startTime?: number;  // For temporal content (audio/video segments)
  endTime?: number;
  metadata: Record<string, unknown>;
  createdAt: number;
}

// ============================================================================
// Audio Types
// ============================================================================

export interface AudioSegment {
  id: string;
  startTime: number;
  endTime: number;
  speakerId: string | null;  // null if unknown
  speakerClusterId?: string;
  transcription: string;
  confidence: number;
  sentiment: SentimentAnalysis;
  emotions: EmotionTag[];
  embedding?: EmbeddingVector;
}

export interface SentimentAnalysis {
  score: number;  // -1 to 1
  label: 'negative' | 'neutral' | 'positive';
  confidence: number;
}

export interface EmotionTag {
  emotion: string;  // joy, sadness, anger, fear, surprise, disgust, neutral
  score: number;    // 0 to 1
}

export interface SpeakerCluster {
  id: string;
  userId: string;
  centroid: number[];  // Average embedding
  memberCount: number;
  occurrenceCount: number;
  labeledName?: string;
  isLabeled: boolean;
  lastUpdated: number;
  createdAt: number;
}

export interface SpeakerClusterUpdate {
  clusterId: string;
  action: 'create' | 'update' | 'merge';
  newCentroid?: number[];
  memberCount?: number;
  occurrenceCount?: number;
  labeledName?: string;
  mergedWithId?: string;  // The cluster ID that was merged into this one
}

export interface AudioProcessingResult {
  segments: AudioSegment[];
  speakerClusters: SpeakerClusterUpdate[];
  unknownSpeakerDetected: boolean;
  transcription: string;
  duration: number;
  processingTimeMs: number;
}

// ============================================================================
// Video Types
// ============================================================================

export interface VideoFrame {
  id: string;
  frameNumber: number;
  timestamp: number;  // seconds
  isKeyframe: boolean;
  embedding: EmbeddingVector;
  metadata: {
    width: number;
    height: number;
    sceneChangeScore?: number;
  };
}

export interface VideoSegment {
  id: string;
  startTime: number;
  endTime: number;
  frames: VideoFrame[];
  dominantEmbedding: EmbeddingVector;  // Average of frame embeddings
  sceneDescription?: string;
}

export interface VideoProcessingResult {
  segments: VideoSegment[];
  frames: VideoFrame[];
  totalFramesExtracted: number;
  duration: number;
  fps: number;
  processingTimeMs: number;
}

// ============================================================================
// Image Types
// ============================================================================

export interface ImageProcessingResult {
  embedding: EmbeddingVector;
  ocrText?: string;
  ocrConfidence?: number;
  dimensions: {
    width: number;
    height: number;
  };
  processingTimeMs: number;
}

// ============================================================================
// Text Types
// ============================================================================

export interface ExtractedEntity {
  type: 'person' | 'place' | 'organization' | 'date' | 'event' | 'other';
  value: string;
  confidence: number;
  startOffset: number;
  endOffset: number;
}

export interface TextProcessingResult {
  embedding: EmbeddingVector;
  entities: ExtractedEntity[];
  language?: string;
  wordCount: number;
  processingTimeMs: number;
}

// ============================================================================
// Embedding Job Types
// ============================================================================

export interface PromptRequest {
  type: 'speaker_label' | 'content_review' | 'entity_confirmation';
  clusterId?: string;
  suggestedLabel?: string;
  context: string;
  priority: 'low' | 'medium' | 'high';
  expiresAt?: number;
}

export interface EmbeddingJob {
  id: string;
  eventId: string;
  userId: string;
  eventType: EventType;
  privacyScope: PrivacyScope;
  timestamp: number;
  embeddings: EmbeddingRecord[];
  metadata: Record<string, unknown>;
  speakerUpdates?: SpeakerClusterUpdate[];
  promptRequired?: PromptRequest;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  error?: string;
  createdAt: number;
  completedAt?: number;
}

// ============================================================================
// Media Source Types (from Convex events)
// ============================================================================

export interface MediaSource {
  url: string;
  mimeType: string;
  size: number;
  filename?: string;
  storageId?: string;
}

export interface MediaEvent {
  id: string;
  userId: string;
  eventType: EventType;
  privacyScope: PrivacyScope;
  source: MediaSource;
  timestamp: number;
  metadata?: Record<string, unknown>;
}

// ============================================================================
// Pipeline Configuration Types
// ============================================================================

export interface AudioPipelineConfig {
  transcriptionModel: string;
  speakerSimilarityThreshold: number;
  unknownSpeakerOccurrenceThreshold: number;
  enableSentimentAnalysis: boolean;
  enableEmotionTagging: boolean;
  maxSegmentDuration: number;  // seconds
}

export interface VideoPipelineConfig {
  frameExtractionMode: 'keyframe' | 'interval';
  frameInterval: number;  // seconds (for interval mode)
  maxFrames: number;
  clipModel: string;
  sceneChangeThreshold: number;
}

export interface ImagePipelineConfig {
  clipModel: string;
  enableOcr: boolean;
  ocrModel?: string;
  maxImageDimension: number;
}

export interface TextPipelineConfig {
  embeddingModel: string;
  enableEntityExtraction: boolean;
  entityExtractionModel?: string;
  maxTokens: number;
}

export interface PipelineConfig {
  audio: AudioPipelineConfig;
  video: VideoPipelineConfig;
  image: ImagePipelineConfig;
  text: TextPipelineConfig;
}

// Default configuration
export const DEFAULT_PIPELINE_CONFIG: PipelineConfig = {
  audio: {
    transcriptionModel: 'openai/whisper-large-v3',
    speakerSimilarityThreshold: 0.85,
    unknownSpeakerOccurrenceThreshold: 5,
    enableSentimentAnalysis: true,
    enableEmotionTagging: true,
    maxSegmentDuration: 30,
  },
  video: {
    frameExtractionMode: 'keyframe',
    frameInterval: 2,
    maxFrames: 30,
    clipModel: 'openai/clip-vit-large-patch14',
    sceneChangeThreshold: 0.3,
  },
  image: {
    clipModel: 'openai/clip-vit-large-patch14',
    enableOcr: true,
    ocrModel: 'openai/gpt-4o',
    maxImageDimension: 1024,
  },
  text: {
    embeddingModel: 'openai/text-embedding-3-small',
    enableEntityExtraction: true,
    entityExtractionModel: 'openai/gpt-4o-mini',
    maxTokens: 8192,
  },
};
