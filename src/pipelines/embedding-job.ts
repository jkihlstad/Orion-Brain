/**
 * Neural Intelligence Platform - Embedding Job Management
 *
 * Provides unified job creation, processing, and output normalization
 * for all media types (audio, video, image, text)
 */

import {
  EmbeddingJob,
  EmbeddingRecord,
  EventType,
  MediaEvent,
  MediaSource,
  SpeakerCluster,
  SpeakerClusterUpdate,
  PipelineConfig,
  DEFAULT_PIPELINE_CONFIG,
} from '../types';
import {
  OpenRouterAdapter,
  getDefaultAdapter,
} from '../adapters/openrouter';
import { generateId } from '../utils/math';
import { processAudio } from './audio';
import { processVideo } from './video';
import { processImage } from './image';
import { processText } from './text';

// ============================================================================
// Job Creation
// ============================================================================

/**
 * Create a new embedding job from a media event
 */
export function createEmbeddingJob(
  event: MediaEvent,
  _config?: Partial<PipelineConfig>
): EmbeddingJob {
  return {
    id: generateId('job'),
    eventId: event.id,
    userId: event.userId,
    eventType: event.eventType,
    privacyScope: event.privacyScope,
    timestamp: event.timestamp,
    embeddings: [],
    metadata: event.metadata || {},
    status: 'pending',
    createdAt: Date.now(),
  };
}

/**
 * Create multiple embedding jobs from a batch of events
 */
export function createEmbeddingJobBatch(
  events: MediaEvent[],
  config?: Partial<PipelineConfig>
): EmbeddingJob[] {
  return events.map(event => createEmbeddingJob(event, config));
}

// ============================================================================
// Job Processing
// ============================================================================

interface ProcessJobOptions {
  config?: Partial<PipelineConfig>;
  adapter?: OpenRouterAdapter;
  existingSpeakerClusters?: SpeakerCluster[];
}

/**
 * Process an embedding job and return the completed job
 */
export async function processEmbeddingJob(
  job: EmbeddingJob,
  source: MediaSource,
  options: ProcessJobOptions = {}
): Promise<EmbeddingJob> {
  // Merge provided config with defaults
  const mergedConfig: PipelineConfig = {
    audio: { ...DEFAULT_PIPELINE_CONFIG.audio, ...options.config?.audio },
    video: { ...DEFAULT_PIPELINE_CONFIG.video, ...options.config?.video },
    image: { ...DEFAULT_PIPELINE_CONFIG.image, ...options.config?.image },
    text: { ...DEFAULT_PIPELINE_CONFIG.text, ...options.config?.text },
  };
  const adapter = options.adapter || getDefaultAdapter();
  const existingSpeakerClusters = options.existingSpeakerClusters || [];

  // Mark job as processing
  const processingJob: EmbeddingJob = {
    ...job,
    status: 'processing',
  };

  try {
    let result: EmbeddingJob;

    switch (job.eventType) {
      case 'audio':
        result = await processAudioJob(processingJob, source, {
          config: mergedConfig.audio,
          adapter,
          existingSpeakerClusters,
        });
        break;

      case 'video':
        result = await processVideoJob(processingJob, source, {
          config: mergedConfig.video,
          adapter,
        });
        break;

      case 'image':
        result = await processImageJob(processingJob, source, {
          config: mergedConfig.image,
          adapter,
        });
        break;

      case 'text':
        result = await processTextJob(processingJob, source, {
          config: mergedConfig.text,
          adapter,
        });
        break;

      default:
        throw new Error(`Unknown event type: ${job.eventType}`);
    }

    return {
      ...result,
      status: 'completed',
      completedAt: Date.now(),
    };
  } catch (error) {
    return {
      ...processingJob,
      status: 'failed',
      error: error instanceof Error ? error.message : String(error),
      completedAt: Date.now(),
    };
  }
}

// ============================================================================
// Type-Specific Job Processing
// ============================================================================

async function processAudioJob(
  job: EmbeddingJob,
  source: MediaSource,
  options: {
    config: typeof DEFAULT_PIPELINE_CONFIG.audio;
    adapter: OpenRouterAdapter;
    existingSpeakerClusters: SpeakerCluster[];
  }
): Promise<EmbeddingJob> {
  const result = await processAudio(
    source,
    job.userId,
    options.existingSpeakerClusters,
    options.config,
    options.adapter
  );

  // Convert audio segments to embedding records
  const embeddings: EmbeddingRecord[] = result.segments
    .filter(segment => segment.embedding)
    .map(segment => ({
      id: segment.id,
      vector: segment.embedding!,
      contentType: 'audio' as EventType,
      startTime: segment.startTime,
      endTime: segment.endTime,
      metadata: {
        transcription: segment.transcription,
        speakerClusterId: segment.speakerClusterId,
        sentiment: segment.sentiment,
        emotions: segment.emotions,
        confidence: segment.confidence,
      },
      createdAt: Date.now(),
    }));

  const jobResult: EmbeddingJob = {
    ...job,
    embeddings,
    metadata: {
      ...job.metadata,
      duration: result.duration,
      transcription: result.transcription,
      segmentCount: result.segments.length,
      processingTimeMs: result.processingTimeMs,
    },
    speakerUpdates: result.speakerClusters,
  };

  if (result.unknownSpeakerDetected && result.promptRequired !== undefined) {
    jobResult.promptRequired = result.promptRequired;
  }

  return jobResult;
}

async function processVideoJob(
  job: EmbeddingJob,
  source: MediaSource,
  options: {
    config: typeof DEFAULT_PIPELINE_CONFIG.video;
    adapter: OpenRouterAdapter;
  }
): Promise<EmbeddingJob> {
  const result = await processVideo(source, options.config, options.adapter);

  // Create embedding records for each segment (using dominant embedding)
  const segmentEmbeddings: EmbeddingRecord[] = result.segments.map(segment => ({
    id: segment.id,
    vector: segment.dominantEmbedding,
    contentType: 'video' as EventType,
    startTime: segment.startTime,
    endTime: segment.endTime,
    metadata: {
      frameCount: segment.frames.length,
      isSegment: true,
    },
    createdAt: Date.now(),
  }));

  // Create embedding records for keyframes
  const frameEmbeddings: EmbeddingRecord[] = result.frames
    .filter(frame => frame.isKeyframe)
    .map(frame => ({
      id: frame.id,
      vector: frame.embedding,
      contentType: 'video' as EventType,
      startTime: frame.timestamp,
      endTime: frame.timestamp,
      metadata: {
        frameNumber: frame.frameNumber,
        isKeyframe: true,
        width: frame.metadata.width,
        height: frame.metadata.height,
      },
      createdAt: Date.now(),
    }));

  return {
    ...job,
    embeddings: [...segmentEmbeddings, ...frameEmbeddings],
    metadata: {
      ...job.metadata,
      duration: result.duration,
      fps: result.fps,
      totalFrames: result.totalFramesExtracted,
      segmentCount: result.segments.length,
      keyframeCount: frameEmbeddings.length,
      processingTimeMs: result.processingTimeMs,
    },
  };
}

async function processImageJob(
  job: EmbeddingJob,
  source: MediaSource,
  options: {
    config: typeof DEFAULT_PIPELINE_CONFIG.image;
    adapter: OpenRouterAdapter;
  }
): Promise<EmbeddingJob> {
  const result = await processImage(source, options.config, options.adapter);

  const embedding: EmbeddingRecord = {
    id: generateId('emb'),
    vector: result.embedding,
    contentType: 'image' as EventType,
    metadata: {
      width: result.dimensions.width,
      height: result.dimensions.height,
      ocrText: result.ocrText,
      ocrConfidence: result.ocrConfidence,
    },
    createdAt: Date.now(),
  };

  return {
    ...job,
    embeddings: [embedding],
    metadata: {
      ...job.metadata,
      dimensions: result.dimensions,
      hasOcr: !!result.ocrText,
      processingTimeMs: result.processingTimeMs,
    },
  };
}

async function processTextJob(
  job: EmbeddingJob,
  source: MediaSource,
  options: {
    config: typeof DEFAULT_PIPELINE_CONFIG.text;
    adapter: OpenRouterAdapter;
  }
): Promise<EmbeddingJob> {
  // Fetch text content
  const response = await fetch(source.url);
  const text = await response.text();

  const result = await processText(text, options.config, options.adapter);

  const embedding: EmbeddingRecord = {
    id: generateId('emb'),
    vector: result.embedding,
    contentType: 'text' as EventType,
    metadata: {
      wordCount: result.wordCount,
      language: result.language,
      entityCount: result.entities.length,
    },
    createdAt: Date.now(),
  };

  return {
    ...job,
    embeddings: [embedding],
    metadata: {
      ...job.metadata,
      wordCount: result.wordCount,
      language: result.language,
      entities: result.entities,
      processingTimeMs: result.processingTimeMs,
    },
  };
}

// ============================================================================
// Batch Job Processing
// ============================================================================

interface BatchProcessingResult {
  completed: EmbeddingJob[];
  failed: EmbeddingJob[];
  totalProcessingTimeMs: number;
}

/**
 * Process multiple embedding jobs in batch
 */
export async function processEmbeddingJobBatch(
  jobs: EmbeddingJob[],
  sources: Map<string, MediaSource>,
  options: ProcessJobOptions = {}
): Promise<BatchProcessingResult> {
  const startTime = Date.now();
  const completed: EmbeddingJob[] = [];
  const failed: EmbeddingJob[] = [];

  // Track speaker clusters across audio jobs
  let currentSpeakerClusters = options.existingSpeakerClusters || [];

  for (const job of jobs) {
    const source = sources.get(job.eventId);

    if (!source) {
      failed.push({
        ...job,
        status: 'failed',
        error: 'Source not found',
        completedAt: Date.now(),
      });
      continue;
    }

    const result = await processEmbeddingJob(job, source, {
      ...options,
      existingSpeakerClusters: currentSpeakerClusters,
    });

    if (result.status === 'completed') {
      completed.push(result);

      // Update speaker clusters for subsequent audio jobs
      if (result.speakerUpdates) {
        currentSpeakerClusters = applySpeakerUpdates(
          currentSpeakerClusters,
          result.speakerUpdates,
          job.userId
        );
      }
    } else {
      failed.push(result);
    }
  }

  return {
    completed,
    failed,
    totalProcessingTimeMs: Date.now() - startTime,
  };
}

/**
 * Apply speaker cluster updates to the current cluster list
 */
function applySpeakerUpdates(
  clusters: SpeakerCluster[],
  updates: SpeakerClusterUpdate[],
  userId: string
): SpeakerCluster[] {
  const clusterMap = new Map(clusters.map(c => [c.id, c]));

  for (const update of updates) {
    if (update.action === 'create') {
      clusterMap.set(update.clusterId, {
        id: update.clusterId,
        userId,
        centroid: update.newCentroid!,
        memberCount: update.memberCount || 1,
        occurrenceCount: update.occurrenceCount || 1,
        isLabeled: false,
        lastUpdated: Date.now(),
        createdAt: Date.now(),
      });
    } else if (update.action === 'update') {
      const existing = clusterMap.get(update.clusterId);
      if (existing) {
        clusterMap.set(update.clusterId, {
          ...existing,
          centroid: update.newCentroid || existing.centroid,
          memberCount: update.memberCount || existing.memberCount,
          occurrenceCount: update.occurrenceCount || existing.occurrenceCount,
          lastUpdated: Date.now(),
        });
      }
    } else if (update.action === 'merge' && update.mergedWithId) {
      clusterMap.delete(update.mergedWithId);
      const existing = clusterMap.get(update.clusterId);
      if (existing) {
        clusterMap.set(update.clusterId, {
          ...existing,
          centroid: update.newCentroid || existing.centroid,
          memberCount: update.memberCount || existing.memberCount,
          lastUpdated: Date.now(),
        });
      }
    }
  }

  return Array.from(clusterMap.values());
}

// ============================================================================
// Job Status Helpers
// ============================================================================

/**
 * Check if a job is complete
 */
export function isJobComplete(job: EmbeddingJob): boolean {
  return job.status === 'completed' || job.status === 'failed';
}

/**
 * Check if a job failed
 */
export function isJobFailed(job: EmbeddingJob): boolean {
  return job.status === 'failed';
}

/**
 * Get job processing duration
 */
export function getJobDuration(job: EmbeddingJob): number | null {
  if (!job.completedAt) return null;
  return job.completedAt - job.createdAt;
}

/**
 * Get embedding count for a job
 */
export function getEmbeddingCount(job: EmbeddingJob): number {
  return job.embeddings.length;
}

// ============================================================================
// Job Serialization
// ============================================================================

/**
 * Serialize a job to JSON for storage
 */
export function serializeJob(job: EmbeddingJob): string {
  return JSON.stringify(job);
}

/**
 * Deserialize a job from JSON
 */
export function deserializeJob(json: string): EmbeddingJob {
  return JSON.parse(json) as EmbeddingJob;
}

/**
 * Create a summary of a completed job
 */
export function summarizeJob(job: EmbeddingJob): {
  id: string;
  eventId: string;
  eventType: EventType;
  status: string;
  embeddingCount: number;
  durationMs: number | null;
  hasPrompt: boolean;
  error?: string;
} {
  const summary: {
    id: string;
    eventId: string;
    eventType: EventType;
    status: string;
    embeddingCount: number;
    durationMs: number | null;
    hasPrompt: boolean;
    error?: string;
  } = {
    id: job.id,
    eventId: job.eventId,
    eventType: job.eventType,
    status: job.status,
    embeddingCount: job.embeddings.length,
    durationMs: getJobDuration(job),
    hasPrompt: !!job.promptRequired,
  };

  if (job.error !== undefined) {
    summary.error = job.error;
  }

  return summary;
}
