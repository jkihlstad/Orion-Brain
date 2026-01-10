/**
 * Neural Intelligence Platform - Pipeline Exports
 *
 * Main entry point for all media processing pipelines
 */

// Audio Pipeline
export {
  processAudio,
  processAudioBatch,
  SpeakerClusterManager,
} from './audio';

// Video Pipeline
export {
  processVideo,
  processVideoBatch,
  extractKeyframes,
  findSimilarFrames,
  findSimilarSegments,
} from './video';

// Image Pipeline
export {
  processImage,
  processImageBatch,
  compareImages,
  findSimilarImages,
  isImageUrl,
  isImageMimeType,
  imageUrlToBase64,
  getBase64ImageDimensions,
} from './image';

// Text Pipeline
export {
  processText,
  processTextSource,
  processTextBatch,
  generateTextEmbeddingsBatch,
  compareTexts,
  findSimilarTexts,
  chunkText,
  processLongDocument,
} from './text';

// Embedding Job Management
export {
  createEmbeddingJob,
  createEmbeddingJobBatch,
  processEmbeddingJob,
  processEmbeddingJobBatch,
  isJobComplete,
  isJobFailed,
  getJobDuration,
  getEmbeddingCount,
  serializeJob,
  deserializeJob,
  summarizeJob,
} from './embedding-job';

// Re-export types for convenience
export type {
  AudioProcessingResult,
} from '../types';

export type {
  VideoProcessingResult,
  VideoFrame,
  VideoSegment,
} from '../types';

export type {
  ImageProcessingResult,
} from '../types';

export type {
  TextProcessingResult,
  ExtractedEntity,
} from '../types';

export type {
  EmbeddingJob,
  EmbeddingRecord,
  SpeakerCluster,
  SpeakerClusterUpdate,
  PromptRequest,
} from '../types';
