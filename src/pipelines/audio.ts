/**
 * Neural Intelligence Platform - Audio Processing Pipeline
 *
 * Handles:
 * - Audio transcription via OpenRouter (Whisper)
 * - Speaker diarization (segment by speaker)
 * - Speaker embedding extraction per segment
 * - Incremental speaker clustering
 * - Sentiment + emotion tagging per segment
 * - Unknown speaker detection
 */

import {
  AudioSegment,
  AudioProcessingResult,
  AudioPipelineConfig,
  SpeakerCluster,
  SpeakerClusterUpdate,
  SentimentAnalysis,
  EmotionTag,
  MediaSource,
  PromptRequest,
  DEFAULT_PIPELINE_CONFIG,
} from '../types';
import {
  OpenRouterAdapter,
  getDefaultAdapter,
} from '../adapters/openrouter';
import {
  cosineSimilarity,
  normalize,
  generateId,
} from '../utils/math';

// ============================================================================
// Types
// ============================================================================

interface SpeakerEmbeddingSegment {
  segmentId: string;
  startTime: number;
  endTime: number;
  text: string;
  embedding: number[];
  confidence: number;
}

interface DiarizationResult {
  segments: {
    start: number;
    end: number;
    speaker: string;
    text: string;
    confidence: number;
  }[];
  speakerCount: number;
}

// ============================================================================
// Speaker Clustering Manager
// ============================================================================

class SpeakerClusterManager {
  private clusters: Map<string, SpeakerCluster> = new Map();
  private readonly similarityThreshold: number;
  private readonly occurrenceThreshold: number;

  constructor(
    existingClusters: SpeakerCluster[],
    similarityThreshold: number = 0.85,
    occurrenceThreshold: number = 5
  ) {
    this.similarityThreshold = similarityThreshold;
    this.occurrenceThreshold = occurrenceThreshold;

    // Load existing clusters
    for (const cluster of existingClusters) {
      this.clusters.set(cluster.id, { ...cluster });
    }
  }

  /**
   * Find or create cluster for a speaker embedding
   * Returns the cluster ID and whether it was newly created
   */
  assignToCluster(
    embedding: number[],
    userId: string
  ): { clusterId: string; isNew: boolean; update: SpeakerClusterUpdate } {
    const normalizedEmbedding = normalize(embedding);

    // Find best matching cluster
    let bestMatch: { clusterId: string; similarity: number } | null = null;

    for (const [clusterId, cluster] of this.clusters) {
      const similarity = cosineSimilarity(normalizedEmbedding, normalize(cluster.centroid));
      if (!bestMatch || similarity > bestMatch.similarity) {
        bestMatch = { clusterId, similarity };
      }
    }

    // Check if we should join existing cluster
    if (bestMatch && bestMatch.similarity >= this.similarityThreshold) {
      const cluster = this.clusters.get(bestMatch.clusterId)!;

      // Update centroid using weighted average
      const totalWeight = cluster.memberCount + 1;
      const newCentroid = cluster.centroid.map((v, i) =>
        (v * cluster.memberCount + embedding[i]!) / totalWeight
      );

      // Update cluster
      cluster.centroid = newCentroid;
      cluster.memberCount += 1;
      cluster.occurrenceCount += 1;
      cluster.lastUpdated = Date.now();

      return {
        clusterId: bestMatch.clusterId,
        isNew: false,
        update: {
          clusterId: bestMatch.clusterId,
          action: 'update',
          newCentroid,
          memberCount: cluster.memberCount,
          occurrenceCount: cluster.occurrenceCount,
        },
      };
    }

    // Create new cluster
    const newClusterId = generateId('spk');
    const newCluster: SpeakerCluster = {
      id: newClusterId,
      userId,
      centroid: embedding,
      memberCount: 1,
      occurrenceCount: 1,
      isLabeled: false,
      lastUpdated: Date.now(),
      createdAt: Date.now(),
    };

    this.clusters.set(newClusterId, newCluster);

    return {
      clusterId: newClusterId,
      isNew: true,
      update: {
        clusterId: newClusterId,
        action: 'create',
        newCentroid: embedding,
        memberCount: 1,
        occurrenceCount: 1,
      },
    };
  }

  /**
   * Check if any unlabeled clusters have hit the occurrence threshold
   */
  getUnlabeledClustersNeedingPrompt(): SpeakerCluster[] {
    const needsPrompt: SpeakerCluster[] = [];

    for (const cluster of this.clusters.values()) {
      if (!cluster.isLabeled && cluster.occurrenceCount >= this.occurrenceThreshold) {
        needsPrompt.push(cluster);
      }
    }

    return needsPrompt;
  }

  /**
   * Get cluster by ID
   */
  getCluster(clusterId: string): SpeakerCluster | undefined {
    return this.clusters.get(clusterId);
  }

  /**
   * Get all clusters
   */
  getAllClusters(): SpeakerCluster[] {
    return Array.from(this.clusters.values());
  }
}

// ============================================================================
// Audio Pipeline Implementation
// ============================================================================

/**
 * Process audio content and return structured results
 */
export async function processAudio(
  source: MediaSource,
  userId: string,
  existingClusters: SpeakerCluster[] = [],
  config: Partial<AudioPipelineConfig> = {},
  adapter?: OpenRouterAdapter
): Promise<AudioProcessingResult & { promptRequired?: PromptRequest }> {
  const startTime = Date.now();
  const resolvedConfig = { ...DEFAULT_PIPELINE_CONFIG.audio, ...config };
  const resolvedAdapter = adapter || getDefaultAdapter();

  // Initialize cluster manager
  const clusterManager = new SpeakerClusterManager(
    existingClusters,
    resolvedConfig.speakerSimilarityThreshold,
    resolvedConfig.unknownSpeakerOccurrenceThreshold
  );

  // Step 1: Transcribe audio with timestamps
  console.log('[Audio Pipeline] Starting transcription...');
  const transcriptionResult = await transcribeWithDiarization(
    source.url,
    resolvedAdapter,
    resolvedConfig
  );

  // Step 2: Generate speaker embeddings for each segment
  console.log('[Audio Pipeline] Generating speaker embeddings...');
  const segmentsWithEmbeddings = await generateSpeakerEmbeddings(
    transcriptionResult.segments,
    resolvedAdapter
  );

  // Step 3: Cluster speakers and update assignments
  console.log('[Audio Pipeline] Clustering speakers...');
  const clusterUpdates: SpeakerClusterUpdate[] = [];
  const processedSegments: AudioSegment[] = [];

  for (const segment of segmentsWithEmbeddings) {
    // Assign to cluster
    const { clusterId, isNew: _isNew, update } = clusterManager.assignToCluster(
      segment.embedding,
      userId
    );
    clusterUpdates.push(update);

    // Analyze sentiment and emotions (if enabled)
    let sentiment: SentimentAnalysis = { score: 0, label: 'neutral', confidence: 0.5 };
    let emotions: EmotionTag[] = [];

    if (resolvedConfig.enableSentimentAnalysis && segment.text.trim().length > 0) {
      sentiment = await resolvedAdapter.analyzeSentiment(segment.text);
    }

    if (resolvedConfig.enableEmotionTagging && segment.text.trim().length > 0) {
      emotions = await resolvedAdapter.analyzeEmotions(segment.text);
    }

    // Create processed segment
    processedSegments.push({
      id: segment.segmentId,
      startTime: segment.startTime,
      endTime: segment.endTime,
      speakerId: null,  // Will be filled in when labeled
      speakerClusterId: clusterId,
      transcription: segment.text,
      confidence: segment.confidence,
      sentiment,
      emotions,
      embedding: {
        values: segment.embedding,
        dimensions: segment.embedding.length,
        model: 'speaker-embedding-v1',
        normalizedAt: Date.now(),
      },
    });
  }

  // Step 4: Check for unknown speakers needing labels
  const unlabeledClusters = clusterManager.getUnlabeledClustersNeedingPrompt();
  const unknownSpeakerDetected = unlabeledClusters.length > 0;

  // Create prompt request for the first unlabeled cluster (if any)
  let promptRequired: PromptRequest | undefined;
  if (unlabeledClusters.length > 0) {
    const clusterToLabel = unlabeledClusters[0]!;
    promptRequired = {
      type: 'speaker_label',
      clusterId: clusterToLabel.id,
      context: `A speaker has been detected ${clusterToLabel.occurrenceCount} times but has not been labeled. ` +
               `Sample transcript: "${processedSegments.find(s => s.speakerClusterId === clusterToLabel.id)?.transcription.slice(0, 100)}..."`,
      priority: clusterToLabel.occurrenceCount >= 10 ? 'high' : 'medium',
    };
  }

  // Deduplicate cluster updates (keep latest for each cluster)
  const uniqueUpdates = deduplicateClusterUpdates(clusterUpdates);

  const processingTimeMs = Date.now() - startTime;

  const result: AudioProcessingResult & { promptRequired?: PromptRequest } = {
    segments: processedSegments,
    speakerClusters: uniqueUpdates,
    unknownSpeakerDetected,
    transcription: processedSegments.map(s => s.transcription).join(' '),
    duration: transcriptionResult.duration || 0,
    processingTimeMs,
  };

  if (promptRequired !== undefined) {
    result.promptRequired = promptRequired;
  }

  return result;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Transcribe audio with speaker diarization
 */
async function transcribeWithDiarization(
  audioUrl: string,
  adapter: OpenRouterAdapter,
  config: AudioPipelineConfig
): Promise<{ text: string; duration?: number; language?: string; segments: DiarizationResult['segments'] }> {
  // TODO: Implement actual transcription via OpenRouter Whisper API
  // The implementation below is a placeholder that simulates the expected output

  // In production, this would:
  // 1. Download or stream the audio file
  // 2. Send to OpenRouter's Whisper endpoint with diarization enabled
  // 3. Process the response to extract speaker-segmented transcription

  console.warn('[Audio Pipeline] Using placeholder transcription - implement OpenRouter Whisper API');

  // Simulated transcription result
  // In reality, this would come from the Whisper API with speaker diarization
  const transcription = await adapter.transcribeAudio(audioUrl, {
    model: config.transcriptionModel,
    enableTimestamps: true,
    enableSpeakerDiarization: true,
  });

  // If the API doesn't support diarization, we simulate basic segmentation
  // based on pauses or fixed intervals
  const segments: DiarizationResult['segments'] = [];

  if (transcription.segments && transcription.segments.length > 0) {
    // Use API-provided segments
    for (const seg of transcription.segments) {
      segments.push({
        start: seg.start,
        end: seg.end,
        speaker: seg.speaker || 'SPEAKER_UNKNOWN',
        text: seg.text,
        confidence: seg.confidence || 0.8,
      });
    }
  } else {
    // Fallback: Create a single segment with full text
    segments.push({
      start: 0,
      end: transcription.duration || 0,
      speaker: 'SPEAKER_UNKNOWN',
      text: transcription.text,
      confidence: 0.7,
    });
  }

  return {
    ...transcription,
    segments,
  };
}

/**
 * Generate speaker embeddings for each segment
 * These embeddings represent the speaker's voice characteristics
 */
async function generateSpeakerEmbeddings(
  segments: DiarizationResult['segments'],
  adapter: OpenRouterAdapter
): Promise<SpeakerEmbeddingSegment[]> {
  const results: SpeakerEmbeddingSegment[] = [];

  for (const segment of segments) {
    // TODO: Generate actual speaker embeddings from audio
    // In production, this would use a speaker embedding model like:
    // - SpeechBrain's ECAPA-TDNN
    // - Resemblyzer
    // - PyAnnote speaker embedding
    //
    // For now, we generate a pseudo-embedding based on the text content
    // This is a placeholder - real implementation would extract voice features

    console.warn('[Audio Pipeline] Using text-based pseudo-embedding - implement speaker embedding model');

    // Generate text embedding as a proxy for speaker embedding
    // In production, replace with actual voice feature extraction
    const textEmbedding = await adapter.generateTextEmbedding(
      `Speaker says: ${segment.text}`,
      { model: 'openai/text-embedding-3-small' }
    );

    results.push({
      segmentId: generateId('seg'),
      startTime: segment.start,
      endTime: segment.end,
      text: segment.text,
      embedding: textEmbedding.values,
      confidence: segment.confidence,
    });
  }

  return results;
}

/**
 * Deduplicate cluster updates, keeping the latest update for each cluster
 */
function deduplicateClusterUpdates(updates: SpeakerClusterUpdate[]): SpeakerClusterUpdate[] {
  const latestByCluster = new Map<string, SpeakerClusterUpdate>();

  for (const update of updates) {
    const existing = latestByCluster.get(update.clusterId);
    if (!existing || update.action === 'create' || (update.occurrenceCount || 0) > (existing.occurrenceCount || 0)) {
      latestByCluster.set(update.clusterId, update);
    }
  }

  return Array.from(latestByCluster.values());
}

// ============================================================================
// Batch Processing
// ============================================================================

/**
 * Process multiple audio files in batch
 */
export async function processAudioBatch(
  sources: MediaSource[],
  userId: string,
  existingClusters: SpeakerCluster[] = [],
  config: Partial<AudioPipelineConfig> = {},
  adapter?: OpenRouterAdapter
): Promise<{
  results: (AudioProcessingResult & { promptRequired?: PromptRequest })[];
  aggregatedClusters: SpeakerClusterUpdate[];
}> {
  const results: (AudioProcessingResult & { promptRequired?: PromptRequest })[] = [];
  const currentClusters = [...existingClusters];
  const allClusterUpdates: SpeakerClusterUpdate[] = [];

  for (const source of sources) {
    const result = await processAudio(source, userId, currentClusters, config, adapter);
    results.push(result);

    // Apply cluster updates for next iteration
    for (const update of result.speakerClusters) {
      if (update.action === 'create') {
        currentClusters.push({
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
        const idx = currentClusters.findIndex(c => c.id === update.clusterId);
        if (idx >= 0) {
          const existingCluster = currentClusters[idx]!;
          currentClusters[idx] = {
            ...existingCluster,
            centroid: update.newCentroid || existingCluster.centroid,
            memberCount: update.memberCount || existingCluster.memberCount,
            occurrenceCount: update.occurrenceCount || existingCluster.occurrenceCount,
            lastUpdated: Date.now(),
          };
        }
      }
    }

    allClusterUpdates.push(...result.speakerClusters);
  }

  return {
    results,
    aggregatedClusters: deduplicateClusterUpdates(allClusterUpdates),
  };
}

// ============================================================================
// Utility Exports
// ============================================================================

export { SpeakerClusterManager };
