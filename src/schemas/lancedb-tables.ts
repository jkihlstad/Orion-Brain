/**
 * Neural Intelligence Platform - LanceDB Table Schemas
 *
 * Type definitions for all LanceDB vector tables.
 * Each table stores embeddings with consistent metadata for filtering.
 *
 * @version 1.0.0
 * @author Sub-Agent 1: Data + Storage Engineer
 */

import {
  BaseMetadata,
  EMBEDDING_DIMENSIONS,
  SCHEMA_VERSION,
} from '../types/common';

// =============================================================================
// TABLE NAMES
// =============================================================================

/**
 * LanceDB table names used in the platform.
 */
export const LANCEDB_TABLES = {
  AUDIO_SEGMENTS: 'audio_segments',
  TEXT_EVENTS: 'text_events',
  BROWSER_SESSIONS: 'browser_sessions',
  IMAGE_FRAMES: 'image_frames',
  VIDEO_SEGMENTS: 'video_segments',
} as const;

export type LanceDBTableName = (typeof LANCEDB_TABLES)[keyof typeof LANCEDB_TABLES];

// =============================================================================
// AUDIO SEGMENTS TABLE
// =============================================================================

/**
 * Audio segment with transcription and speaker embedding.
 *
 * Used for:
 * - Semantic search on transcribed content
 * - Speaker identification and clustering
 * - Voice-based contact resolution
 */
export interface AudioSegmentRow extends BaseMetadata {
  /** Unique row identifier */
  id: string;

  /** Text embedding of transcribed content (1536D) */
  textVector: number[];

  /** Speaker embedding for voice identification (256D) */
  speakerVector: number[];

  /** Transcribed text content */
  transcript: string;

  /** Start time within the source audio (seconds) */
  startTime: number;

  /** End time within the source audio (seconds) */
  endTime: number;

  /** Duration in seconds */
  duration: number;

  /** Confidence score of transcription (0-1) */
  transcriptionConfidence: number;

  /** Language code (ISO 639-1) */
  language: string;

  /** Whether this is the user speaking (vs someone else) */
  isUserSpeaker: boolean;

  /** Parent audio event ID (for multi-segment audio) */
  parentEventId: string | null;

  /** Segment index within parent audio */
  segmentIndex: number;
}

/**
 * Input for creating a new audio segment row.
 */
export interface AudioSegmentInput
  extends Omit<AudioSegmentRow, 'id' | 'schemaVersion'> {}

/**
 * Schema definition for LanceDB audio_segments table.
 */
export const AUDIO_SEGMENT_SCHEMA = {
  tableName: LANCEDB_TABLES.AUDIO_SEGMENTS,
  schemaVersion: SCHEMA_VERSION,
  vectorColumns: [
    { name: 'textVector', dimensions: EMBEDDING_DIMENSIONS.TEXT },
    { name: 'speakerVector', dimensions: EMBEDDING_DIMENSIONS.SPEAKER },
  ],
  indexableColumns: [
    'userId',
    'sourceApp',
    'eventType',
    'privacyScope',
    'timestamp',
    'contactId',
    'clusterId',
    'eventId',
    'isUserSpeaker',
    'language',
  ],
} as const;

// =============================================================================
// TEXT EVENTS TABLE
// =============================================================================

/**
 * Text content with semantic embedding.
 *
 * Used for:
 * - Semantic search on text content
 * - Content categorization
 * - Context retrieval
 */
export interface TextEventRow extends BaseMetadata {
  /** Unique row identifier */
  id: string;

  /** Text embedding (1536D) */
  textVector: number[];

  /** Original text content */
  content: string;

  /** Content type (e.g., 'message', 'note', 'search', 'form_input') */
  contentType: string;

  /** Character count */
  charCount: number;

  /** Word count */
  wordCount: number;

  /** Detected language (ISO 639-1) */
  language: string;

  /** Sentiment score (-1 to 1) */
  sentiment: number | null;

  /** Associated URL (if from browser) */
  sourceUrl: string | null;

  /** Page title (if from browser) */
  pageTitle: string | null;

  /** Extracted entities (JSON stringified) */
  entitiesJson: string | null;
}

/**
 * Input for creating a new text event row.
 */
export interface TextEventInput
  extends Omit<TextEventRow, 'id' | 'schemaVersion'> {}

/**
 * Schema definition for LanceDB text_events table.
 */
export const TEXT_EVENT_SCHEMA = {
  tableName: LANCEDB_TABLES.TEXT_EVENTS,
  schemaVersion: SCHEMA_VERSION,
  vectorColumns: [
    { name: 'textVector', dimensions: EMBEDDING_DIMENSIONS.TEXT },
  ],
  indexableColumns: [
    'userId',
    'sourceApp',
    'eventType',
    'privacyScope',
    'timestamp',
    'contactId',
    'clusterId',
    'eventId',
    'contentType',
    'language',
    'sourceUrl',
  ],
} as const;

// =============================================================================
// BROWSER SESSIONS TABLE
// =============================================================================

/**
 * Browser session with aggregated embedding.
 *
 * Used for:
 * - Session-level semantic search
 * - Browsing pattern analysis
 * - Context windowing
 */
export interface BrowserSessionRow extends BaseMetadata {
  /** Unique row identifier */
  id: string;

  /** Session-level embedding (aggregated from events) (1536D) */
  sessionVector: number[];

  /** Session start time */
  sessionStart: number;

  /** Session end time */
  sessionEnd: number;

  /** Session duration in seconds */
  duration: number;

  /** Number of page views in session */
  pageViewCount: number;

  /** Number of interactions in session */
  interactionCount: number;

  /** List of domains visited (JSON stringified) */
  domainsVisitedJson: string;

  /** Primary topic/category of session */
  primaryTopic: string | null;

  /** Summary of session activity */
  summary: string | null;

  /** Device type */
  deviceType: 'mobile' | 'tablet' | 'desktop';

  /** Browser user agent */
  userAgent: string;

  /** Geolocation (city level, if available) */
  geoLocation: string | null;
}

/**
 * Input for creating a new browser session row.
 */
export interface BrowserSessionInput
  extends Omit<BrowserSessionRow, 'id' | 'schemaVersion'> {}

/**
 * Schema definition for LanceDB browser_sessions table.
 */
export const BROWSER_SESSION_SCHEMA = {
  tableName: LANCEDB_TABLES.BROWSER_SESSIONS,
  schemaVersion: SCHEMA_VERSION,
  vectorColumns: [
    { name: 'sessionVector', dimensions: EMBEDDING_DIMENSIONS.TEXT },
  ],
  indexableColumns: [
    'userId',
    'sourceApp',
    'eventType',
    'privacyScope',
    'timestamp',
    'contactId',
    'clusterId',
    'eventId',
    'sessionStart',
    'sessionEnd',
    'deviceType',
    'primaryTopic',
  ],
} as const;

// =============================================================================
// IMAGE FRAMES TABLE
// =============================================================================

/**
 * Image frame with CLIP embedding.
 *
 * Used for:
 * - Visual similarity search
 * - Image-to-text matching
 * - Content moderation
 */
export interface ImageFrameRow extends BaseMetadata {
  /** Unique row identifier */
  id: string;

  /** CLIP embedding for image (768D) */
  clipVector: number[];

  /** Image width in pixels */
  width: number;

  /** Image height in pixels */
  height: number;

  /** Image format (jpeg, png, webp, etc.) */
  format: string;

  /** File size in bytes */
  fileSizeBytes: number;

  /** Storage URL or path */
  storageUrl: string;

  /** Thumbnail storage URL */
  thumbnailUrl: string | null;

  /** Generated caption */
  caption: string | null;

  /** Detected objects (JSON stringified array) */
  detectedObjectsJson: string | null;

  /** OCR extracted text */
  ocrText: string | null;

  /** NSFW score (0-1) */
  nsfwScore: number | null;

  /** Dominant colors (JSON stringified) */
  dominantColorsJson: string | null;

  /** Source URL (if screenshot) */
  sourceUrl: string | null;

  /** Is this a screenshot */
  isScreenshot: boolean;
}

/**
 * Input for creating a new image frame row.
 */
export interface ImageFrameInput
  extends Omit<ImageFrameRow, 'id' | 'schemaVersion'> {}

/**
 * Schema definition for LanceDB image_frames table.
 */
export const IMAGE_FRAME_SCHEMA = {
  tableName: LANCEDB_TABLES.IMAGE_FRAMES,
  schemaVersion: SCHEMA_VERSION,
  vectorColumns: [
    { name: 'clipVector', dimensions: EMBEDDING_DIMENSIONS.CLIP },
  ],
  indexableColumns: [
    'userId',
    'sourceApp',
    'eventType',
    'privacyScope',
    'timestamp',
    'contactId',
    'clusterId',
    'eventId',
    'format',
    'isScreenshot',
    'sourceUrl',
  ],
} as const;

// =============================================================================
// VIDEO SEGMENTS TABLE
// =============================================================================

/**
 * Video segment with CLIP embeddings for key frames.
 *
 * Used for:
 * - Video content search
 * - Frame-level retrieval
 * - Scene detection
 */
export interface VideoSegmentRow extends BaseMetadata {
  /** Unique row identifier */
  id: string;

  /** CLIP embedding for representative frame (768D) */
  clipVector: number[];

  /** Start time in source video (seconds) */
  startTime: number;

  /** End time in source video (seconds) */
  endTime: number;

  /** Duration in seconds */
  duration: number;

  /** Video width in pixels */
  width: number;

  /** Video height in pixels */
  height: number;

  /** Frames per second */
  fps: number;

  /** Video codec */
  codec: string;

  /** Storage URL for video segment */
  storageUrl: string;

  /** Thumbnail URL for segment */
  thumbnailUrl: string | null;

  /** Parent video event ID */
  parentEventId: string | null;

  /** Segment index within parent video */
  segmentIndex: number;

  /** Scene description */
  sceneDescription: string | null;

  /** Detected objects across frames (JSON stringified) */
  detectedObjectsJson: string | null;

  /** Audio transcript for this segment (if any) */
  transcript: string | null;

  /** Motion intensity score (0-1) */
  motionIntensity: number | null;

  /** Key frame timestamps (JSON stringified array) */
  keyFrameTimestampsJson: string | null;
}

/**
 * Input for creating a new video segment row.
 */
export interface VideoSegmentInput
  extends Omit<VideoSegmentRow, 'id' | 'schemaVersion'> {}

/**
 * Schema definition for LanceDB video_segments table.
 */
export const VIDEO_SEGMENT_SCHEMA = {
  tableName: LANCEDB_TABLES.VIDEO_SEGMENTS,
  schemaVersion: SCHEMA_VERSION,
  vectorColumns: [
    { name: 'clipVector', dimensions: EMBEDDING_DIMENSIONS.CLIP },
  ],
  indexableColumns: [
    'userId',
    'sourceApp',
    'eventType',
    'privacyScope',
    'timestamp',
    'contactId',
    'clusterId',
    'eventId',
    'parentEventId',
    'segmentIndex',
  ],
} as const;

// =============================================================================
// UNIFIED ROW TYPES
// =============================================================================

/**
 * Union type for all LanceDB row types.
 */
export type LanceDBRow =
  | AudioSegmentRow
  | TextEventRow
  | BrowserSessionRow
  | ImageFrameRow
  | VideoSegmentRow;

/**
 * Union type for all LanceDB input types.
 */
export type LanceDBInput =
  | AudioSegmentInput
  | TextEventInput
  | BrowserSessionInput
  | ImageFrameInput
  | VideoSegmentInput;

/**
 * Map of table names to row types.
 */
export interface TableRowTypes {
  [LANCEDB_TABLES.AUDIO_SEGMENTS]: AudioSegmentRow;
  [LANCEDB_TABLES.TEXT_EVENTS]: TextEventRow;
  [LANCEDB_TABLES.BROWSER_SESSIONS]: BrowserSessionRow;
  [LANCEDB_TABLES.IMAGE_FRAMES]: ImageFrameRow;
  [LANCEDB_TABLES.VIDEO_SEGMENTS]: VideoSegmentRow;
}

/**
 * Map of table names to input types.
 */
export interface TableInputTypes {
  [LANCEDB_TABLES.AUDIO_SEGMENTS]: AudioSegmentInput;
  [LANCEDB_TABLES.TEXT_EVENTS]: TextEventInput;
  [LANCEDB_TABLES.BROWSER_SESSIONS]: BrowserSessionInput;
  [LANCEDB_TABLES.IMAGE_FRAMES]: ImageFrameInput;
  [LANCEDB_TABLES.VIDEO_SEGMENTS]: VideoSegmentInput;
}

// =============================================================================
// SEARCH RESULT TYPES
// =============================================================================

/**
 * Search result with similarity score.
 */
export interface LanceDBSearchResult<T extends LanceDBRow> {
  /** The matched row */
  row: T;

  /** Similarity score (0-1, higher is more similar) */
  similarity: number;

  /** Distance metric value */
  distance: number;
}

/**
 * Multi-table search result.
 */
export interface MultiTableSearchResult {
  /** Results by table */
  results: {
    [K in LanceDBTableName]?: LanceDBSearchResult<TableRowTypes[K]>[];
  };

  /** Total results across all tables */
  totalCount: number;
}
