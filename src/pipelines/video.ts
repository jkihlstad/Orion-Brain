/**
 * Neural Intelligence Platform - Video Processing Pipeline
 *
 * Handles:
 * - Frame extraction (keyframe detection or fixed interval)
 * - CLIP embedding generation for each frame
 * - Scene change detection
 * - Video segment normalization with embeddings
 */

import {
  VideoFrame,
  VideoSegment,
  VideoProcessingResult,
  VideoPipelineConfig,
  EmbeddingVector,
  MediaSource,
  DEFAULT_PIPELINE_CONFIG,
} from '../types';
import {
  OpenRouterAdapter,
  getDefaultAdapter,
} from '../adapters/openrouter';
import {
  cosineSimilarity,
  vectorMean,
  generateId,
} from '../utils/math';

// ============================================================================
// Types
// ============================================================================

interface ExtractedFrame {
  frameNumber: number;
  timestamp: number;
  imageData: string;  // Base64 or URL
  isKeyframe: boolean;
  metadata: {
    width: number;
    height: number;
  };
}

interface SceneChangeResult {
  timestamp: number;
  frameNumber: number;
  changeScore: number;
  isSceneChange: boolean;
}

interface VideoPipelineContext {
  config: VideoPipelineConfig;
  adapter: OpenRouterAdapter;
}

// ============================================================================
// Video Pipeline Implementation
// ============================================================================

/**
 * Process video content and return structured results
 */
export async function processVideo(
  source: MediaSource,
  config: Partial<VideoPipelineConfig> = {},
  adapter?: OpenRouterAdapter
): Promise<VideoProcessingResult> {
  const startTime = Date.now();
  const resolvedConfig = { ...DEFAULT_PIPELINE_CONFIG.video, ...config };
  const resolvedAdapter = adapter || getDefaultAdapter();

  // Step 1: Extract video metadata
  console.log('[Video Pipeline] Extracting video metadata...');
  const videoMetadata = await extractVideoMetadata(source.url);

  // Step 2: Determine frame extraction strategy
  console.log('[Video Pipeline] Determining frame extraction strategy...');
  const frameTimestamps = calculateFrameExtractionPoints(
    videoMetadata.duration,
    videoMetadata.fps,
    resolvedConfig
  );

  // Step 3: Extract frames
  console.log(`[Video Pipeline] Extracting ${frameTimestamps.length} frames...`);
  const extractedFrames = await extractFrames(
    source.url,
    frameTimestamps,
    resolvedConfig
  );

  // Step 4: Generate CLIP embeddings for each frame
  console.log('[Video Pipeline] Generating CLIP embeddings...');
  const framesWithEmbeddings = await generateFrameEmbeddings(
    extractedFrames,
    resolvedAdapter,
    resolvedConfig
  );

  // Step 5: Detect scene changes and segment video
  console.log('[Video Pipeline] Detecting scene changes...');
  const sceneChanges = detectSceneChanges(
    framesWithEmbeddings,
    resolvedConfig.sceneChangeThreshold
  );

  // Step 6: Create video segments based on scene changes
  console.log('[Video Pipeline] Creating video segments...');
  const segments = createVideoSegments(framesWithEmbeddings, sceneChanges);

  const processingTimeMs = Date.now() - startTime;

  return {
    segments,
    frames: framesWithEmbeddings,
    totalFramesExtracted: framesWithEmbeddings.length,
    duration: videoMetadata.duration,
    fps: videoMetadata.fps,
    processingTimeMs,
  };
}

// ============================================================================
// Video Metadata Extraction
// ============================================================================

interface VideoMetadata {
  duration: number;
  fps: number;
  width: number;
  height: number;
  codec?: string;
}

/**
 * Extract video metadata
 */
async function extractVideoMetadata(videoUrl: string): Promise<VideoMetadata> {
  // TODO: Implement actual video metadata extraction
  // This would typically use ffprobe or a similar tool
  // Options:
  // 1. Use ffprobe via command line
  // 2. Use a video processing library (fluent-ffmpeg)
  // 3. Use a cloud service (AWS MediaConvert, etc.)

  console.warn('[Video Pipeline] Using placeholder metadata - implement video metadata extraction');

  // Simulated metadata
  // In production, parse actual video file headers
  return {
    duration: 60,  // Default 60 seconds
    fps: 30,
    width: 1920,
    height: 1080,
  };
}

// ============================================================================
// Frame Extraction
// ============================================================================

/**
 * Calculate which frames to extract based on configuration
 */
function calculateFrameExtractionPoints(
  duration: number,
  fps: number,
  config: VideoPipelineConfig
): number[] {
  const timestamps: number[] = [];

  if (config.frameExtractionMode === 'interval') {
    // Fixed interval extraction
    const interval = config.frameInterval;
    let time = 0;

    while (time < duration && timestamps.length < config.maxFrames) {
      timestamps.push(time);
      time += interval;
    }
  } else {
    // Keyframe extraction - we'll sample more densely and detect changes later
    // For now, sample at a higher rate and filter by scene changes
    const sampleInterval = Math.max(0.5, duration / (config.maxFrames * 2));
    let time = 0;

    while (time < duration) {
      timestamps.push(time);
      time += sampleInterval;
    }
  }

  return timestamps;
}

/**
 * Extract frames from video at specified timestamps
 */
async function extractFrames(
  videoUrl: string,
  timestamps: number[],
  config: VideoPipelineConfig
): Promise<ExtractedFrame[]> {
  // TODO: Implement actual frame extraction
  // Options:
  // 1. Use ffmpeg to extract frames: ffmpeg -i video.mp4 -vf "select=eq(n\\,0)" -vsync vfr frame.jpg
  // 2. Use a video processing service
  // 3. Use WebCodecs API in browser environments

  console.warn('[Video Pipeline] Using placeholder frame extraction - implement ffmpeg integration');

  // Simulated frame extraction
  // In production, this would actually extract frames from the video
  const frames: ExtractedFrame[] = [];

  for (let i = 0; i < timestamps.length; i++) {
    frames.push({
      frameNumber: i,
      timestamp: timestamps[i],
      imageData: `frame_placeholder_${i}`, // Would be base64 or temp file URL
      isKeyframe: i === 0 || i % 10 === 0, // Simulated keyframe detection
      metadata: {
        width: 1920,
        height: 1080,
      },
    });
  }

  return frames;
}

// ============================================================================
// CLIP Embedding Generation
// ============================================================================

/**
 * Generate CLIP embeddings for extracted frames
 */
async function generateFrameEmbeddings(
  frames: ExtractedFrame[],
  adapter: OpenRouterAdapter,
  config: VideoPipelineConfig
): Promise<VideoFrame[]> {
  const results: VideoFrame[] = [];

  // Process frames in batches to respect rate limits
  const batchSize = 5;

  for (let i = 0; i < frames.length; i += batchSize) {
    const batch = frames.slice(i, i + batchSize);

    const embeddings = await Promise.all(
      batch.map(async (frame) => {
        // TODO: Use actual CLIP model when available
        // For now, we use the vision-based embedding approach

        // In production with actual frame data:
        // const embedding = await adapter.generateClipEmbeddingFromBase64(
        //   frame.imageData,
        //   'image/jpeg'
        // );

        // Placeholder: Generate embedding based on frame position
        // This should be replaced with actual CLIP embedding
        const embedding = await adapter.generateTextEmbedding(
          `Video frame at ${frame.timestamp}s, frame ${frame.frameNumber}`,
          { model: 'openai/text-embedding-3-small' }
        );

        return embedding;
      })
    );

    for (let j = 0; j < batch.length; j++) {
      results.push({
        id: generateId('frm'),
        frameNumber: batch[j].frameNumber,
        timestamp: batch[j].timestamp,
        isKeyframe: batch[j].isKeyframe,
        embedding: embeddings[j],
        metadata: {
          width: batch[j].metadata.width,
          height: batch[j].metadata.height,
        },
      });
    }
  }

  return results;
}

// ============================================================================
// Scene Change Detection
// ============================================================================

/**
 * Detect scene changes by comparing consecutive frame embeddings
 */
function detectSceneChanges(
  frames: VideoFrame[],
  threshold: number
): SceneChangeResult[] {
  const results: SceneChangeResult[] = [];

  // First frame is always a scene start
  if (frames.length > 0) {
    results.push({
      timestamp: frames[0].timestamp,
      frameNumber: frames[0].frameNumber,
      changeScore: 1.0,
      isSceneChange: true,
    });
  }

  // Compare consecutive frames
  for (let i = 1; i < frames.length; i++) {
    const prevEmbedding = frames[i - 1].embedding.values;
    const currEmbedding = frames[i].embedding.values;

    // Calculate similarity between consecutive frames
    const similarity = cosineSimilarity(prevEmbedding, currEmbedding);

    // Scene change if similarity drops below threshold
    const changeScore = 1 - similarity;
    const isSceneChange = changeScore > threshold;

    results.push({
      timestamp: frames[i].timestamp,
      frameNumber: frames[i].frameNumber,
      changeScore,
      isSceneChange,
    });
  }

  return results;
}

/**
 * Create video segments based on scene changes
 */
function createVideoSegments(
  frames: VideoFrame[],
  sceneChanges: SceneChangeResult[]
): VideoSegment[] {
  const segments: VideoSegment[] = [];

  if (frames.length === 0) return segments;

  // Find scene change points
  const sceneStarts: number[] = [0];
  for (let i = 1; i < sceneChanges.length; i++) {
    if (sceneChanges[i].isSceneChange) {
      sceneStarts.push(i);
    }
  }
  sceneStarts.push(frames.length); // End marker

  // Create segments between scene changes
  for (let i = 0; i < sceneStarts.length - 1; i++) {
    const startIdx = sceneStarts[i];
    const endIdx = sceneStarts[i + 1];
    const segmentFrames = frames.slice(startIdx, endIdx);

    if (segmentFrames.length === 0) continue;

    // Calculate dominant embedding (average of frame embeddings)
    const embeddings = segmentFrames.map(f => f.embedding.values);
    const meanEmbedding = vectorMean(embeddings);

    segments.push({
      id: generateId('vseg'),
      startTime: segmentFrames[0].timestamp,
      endTime: segmentFrames[segmentFrames.length - 1].timestamp,
      frames: segmentFrames,
      dominantEmbedding: {
        values: meanEmbedding,
        dimensions: meanEmbedding.length,
        model: segmentFrames[0].embedding.model,
        normalizedAt: Date.now(),
      },
    });
  }

  return segments;
}

// ============================================================================
// Keyframe Extraction Mode
// ============================================================================

/**
 * Extract only keyframes based on visual distinctiveness
 */
export async function extractKeyframes(
  source: MediaSource,
  maxFrames: number = 30,
  config: Partial<VideoPipelineConfig> = {},
  adapter?: OpenRouterAdapter
): Promise<VideoFrame[]> {
  const resolvedConfig = {
    ...DEFAULT_PIPELINE_CONFIG.video,
    ...config,
    frameExtractionMode: 'keyframe' as const,
    maxFrames,
  };

  const result = await processVideo(source, resolvedConfig, adapter);

  // Filter to only include actual keyframes or scene change frames
  const keyframes = result.frames.filter((frame, index) => {
    if (frame.isKeyframe) return true;

    // Check if this frame was detected as a scene change
    const frameResult = result.segments.find(
      seg => seg.frames[0].frameNumber === frame.frameNumber
    );
    return !!frameResult;
  });

  // Limit to maxFrames
  return keyframes.slice(0, maxFrames);
}

// ============================================================================
// Video Similarity Search Support
// ============================================================================

/**
 * Find frames most similar to a query embedding
 */
export function findSimilarFrames(
  frames: VideoFrame[],
  queryEmbedding: number[],
  topK: number = 5
): { frame: VideoFrame; similarity: number }[] {
  const similarities = frames.map(frame => ({
    frame,
    similarity: cosineSimilarity(frame.embedding.values, queryEmbedding),
  }));

  return similarities
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, topK);
}

/**
 * Find segments most similar to a query embedding
 */
export function findSimilarSegments(
  segments: VideoSegment[],
  queryEmbedding: number[],
  topK: number = 3
): { segment: VideoSegment; similarity: number }[] {
  const similarities = segments.map(segment => ({
    segment,
    similarity: cosineSimilarity(segment.dominantEmbedding.values, queryEmbedding),
  }));

  return similarities
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, topK);
}

// ============================================================================
// Batch Processing
// ============================================================================

/**
 * Process multiple videos in batch
 */
export async function processVideoBatch(
  sources: MediaSource[],
  config: Partial<VideoPipelineConfig> = {},
  adapter?: OpenRouterAdapter
): Promise<VideoProcessingResult[]> {
  const results: VideoProcessingResult[] = [];

  for (const source of sources) {
    try {
      const result = await processVideo(source, config, adapter);
      results.push(result);
    } catch (error) {
      console.error(`[Video Pipeline] Failed to process ${source.url}:`, error);
      // Continue with other videos
    }
  }

  return results;
}
