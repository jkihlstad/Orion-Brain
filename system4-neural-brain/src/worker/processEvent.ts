/**
 * Neural Intelligence Platform - Event Processing Logic
 *
 * Core processing logic for different event types.
 * Routes events to appropriate pipelines based on modality.
 */

import {
  ConvexEvent,
  ProcessingResult,
  EmbeddingRecord,
  BrainConfig,
  EventType,
  BrainError,
} from '../types';
import { generateId, generateIdempotencyKey } from '../utils/id';
import { logger } from '../utils/logger';

// =============================================================================
// PROCESSING RESULT BUILDER
// =============================================================================

class ProcessingResultBuilder {
  private result: ProcessingResult;

  constructor(eventId: string) {
    this.result = {
      success: false,
      eventId,
      jobId: generateId('job'),
      embeddings: [],
      graphUpdates: 0,
      promptCreated: false,
      retryCount: 0,
    };
  }

  addEmbedding(embedding: EmbeddingRecord): this {
    this.result.embeddings.push(embedding);
    return this;
  }

  addEmbeddings(embeddings: EmbeddingRecord[]): this {
    this.result.embeddings.push(...embeddings);
    return this;
  }

  incrementGraphUpdates(count: number = 1): this {
    this.result.graphUpdates += count;
    return this;
  }

  setPromptCreated(created: boolean): this {
    this.result.promptCreated = created;
    return this;
  }

  setError(error: string): this {
    this.result.error = error;
    return this;
  }

  setRetryCount(count: number): this {
    this.result.retryCount = count;
    return this;
  }

  succeed(): ProcessingResult {
    this.result.success = true;
    return this.result;
  }

  fail(error: string): ProcessingResult {
    this.result.success = false;
    this.result.error = error;
    return this.result;
  }

  build(): ProcessingResult {
    return this.result;
  }
}

// =============================================================================
// MAIN PROCESSING FUNCTION
// =============================================================================

/**
 * Process a single event through the appropriate pipeline.
 */
export async function processEvent(
  event: ConvexEvent,
  config: BrainConfig
): Promise<ProcessingResult> {
  const builder = new ProcessingResultBuilder(event._id);
  const startTime = Date.now();

  const eventLogger = logger.child({
    eventId: event._id,
    eventType: event.eventType,
    userId: event.userId,
    jobId: builder.build().jobId,
  });

  try {
    eventLogger.info('Starting event processing');

    // Route to appropriate pipeline based on event type
    const embeddings = await routeByModality(event, config, eventLogger);
    builder.addEmbeddings(embeddings);

    // Store embeddings in LanceDB
    const storageResult = await storeEmbeddings(event, embeddings, config);
    eventLogger.debug('Stored embeddings', { count: embeddings.length });

    // Update Neo4j graph
    const graphUpdates = await updateGraph(event, embeddings, config);
    builder.incrementGraphUpdates(graphUpdates);
    eventLogger.debug('Updated graph', { updates: graphUpdates });

    // Check for speaker labeling prompts (audio events only)
    if (event.eventType === 'audio') {
      const promptCreated = await checkAndCreatePrompt(event, config);
      builder.setPromptCreated(promptCreated);
      if (promptCreated) {
        eventLogger.info('Created speaker labeling prompt');
      }
    }

    // Handle special event types
    if (event.eventType === 'speaker_cluster_labeled') {
      await handleSpeakerLabeledEvent(event, config);
      eventLogger.info('Processed speaker label event');
    }

    const processingTime = Date.now() - startTime;
    eventLogger.info('Event processing completed', {
      processingTime,
      embeddingCount: embeddings.length,
      graphUpdates,
    });

    return builder.succeed();

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    eventLogger.error('Event processing failed', { error: errorMessage });

    if (error instanceof BrainError && !error.retryable) {
      // Non-retryable error
      return builder.fail(`Non-retryable error: ${errorMessage}`);
    }

    return builder.fail(errorMessage);
  }
}

// =============================================================================
// MODALITY ROUTING
// =============================================================================

/**
 * Route event to appropriate processing pipeline based on modality.
 */
async function routeByModality(
  event: ConvexEvent,
  config: BrainConfig,
  eventLogger: ReturnType<typeof logger.child>
): Promise<EmbeddingRecord[]> {
  switch (event.eventType) {
    case 'text':
      return processTextEvent(event, config);

    case 'audio':
      return processAudioEvent(event, config);

    case 'image':
      return processImageEvent(event, config);

    case 'video':
      return processVideoEvent(event, config);

    case 'browser_session':
      return processSessionEvent(event, config);

    case 'speaker_cluster_labeled':
      // Label events don't produce new embeddings
      return [];

    default:
      eventLogger.warn('Unknown event type', { eventType: event.eventType });
      return [];
  }
}

// =============================================================================
// TEXT PROCESSING
// =============================================================================

async function processTextEvent(
  event: ConvexEvent,
  config: BrainConfig
): Promise<EmbeddingRecord[]> {
  if (!event.content) {
    throw new BrainError('Text event missing content', 'INVALID_EVENT', false);
  }

  // TODO: Call OpenRouter adapter for text embedding
  // const openrouter = createOpenRouterAdapter(config);
  // const embedding = await openrouter.generateTextEmbedding(event.content);

  // Placeholder: Generate mock embedding
  const embedding = await generateTextEmbedding(event.content, config);

  return [
    {
      id: generateId('emb'),
      vector: embedding,
      dimension: embedding.length,
      model: config.openrouter.models.textEmbedding,
      timestamp: Date.now(),
    },
  ];
}

// =============================================================================
// AUDIO PROCESSING
// =============================================================================

async function processAudioEvent(
  event: ConvexEvent,
  config: BrainConfig
): Promise<EmbeddingRecord[]> {
  if (!event.mediaUrl) {
    throw new BrainError('Audio event missing media URL', 'INVALID_EVENT', false);
  }

  const embeddings: EmbeddingRecord[] = [];

  // TODO: Implement full audio pipeline:
  // 1. Transcribe audio
  // 2. Diarize speakers
  // 3. Generate text embeddings for each segment
  // 4. Generate speaker embeddings for clustering
  // 5. Perform sentiment analysis
  // 6. Check for unknown speakers

  // Placeholder implementation
  const transcription = await transcribeAudio(event.mediaUrl, config);
  const textEmbedding = await generateTextEmbedding(transcription, config);

  embeddings.push({
    id: generateId('emb'),
    vector: textEmbedding,
    dimension: textEmbedding.length,
    model: config.openrouter.models.textEmbedding,
    timestamp: Date.now(),
  });

  return embeddings;
}

// =============================================================================
// IMAGE PROCESSING
// =============================================================================

async function processImageEvent(
  event: ConvexEvent,
  config: BrainConfig
): Promise<EmbeddingRecord[]> {
  if (!event.mediaUrl) {
    throw new BrainError('Image event missing media URL', 'INVALID_EVENT', false);
  }

  // TODO: Implement CLIP embedding via OpenRouter
  // const openrouter = createOpenRouterAdapter(config);
  // const clipEmbedding = await openrouter.generateClipEmbedding(event.mediaUrl);

  // Placeholder
  const clipEmbedding = await generateClipEmbedding(event.mediaUrl, config);

  return [
    {
      id: generateId('emb'),
      vector: clipEmbedding,
      dimension: clipEmbedding.length,
      model: config.openrouter.models.clipEmbedding,
      timestamp: Date.now(),
    },
  ];
}

// =============================================================================
// VIDEO PROCESSING
// =============================================================================

async function processVideoEvent(
  event: ConvexEvent,
  config: BrainConfig
): Promise<EmbeddingRecord[]> {
  if (!event.mediaUrl) {
    throw new BrainError('Video event missing media URL', 'INVALID_EVENT', false);
  }

  const embeddings: EmbeddingRecord[] = [];

  // TODO: Implement video processing pipeline:
  // 1. Extract keyframes (or sample at intervals)
  // 2. Generate CLIP embeddings for each frame
  // 3. Limit to maxFramesPerVideo

  // Placeholder: Extract N frames and embed each
  const frameCount = Math.min(
    config.thresholds.maxFramesPerVideo,
    estimateFrameCount(event.mediaDuration, config.thresholds.frameIntervalSeconds)
  );

  for (let i = 0; i < frameCount; i++) {
    const frameEmbedding = await generateClipEmbedding(
      `${event.mediaUrl}#frame=${i}`,
      config
    );

    embeddings.push({
      id: generateId('emb'),
      vector: frameEmbedding,
      dimension: frameEmbedding.length,
      model: config.openrouter.models.clipEmbedding,
      timestamp: Date.now(),
    });
  }

  return embeddings;
}

// =============================================================================
// SESSION PROCESSING
// =============================================================================

async function processSessionEvent(
  event: ConvexEvent,
  config: BrainConfig
): Promise<EmbeddingRecord[]> {
  // Session events aggregate information
  // Generate embedding from session summary or page titles

  const sessionText = [
    event.pageTitle,
    event.url,
    event.content,
  ]
    .filter(Boolean)
    .join(' ');

  if (!sessionText.trim()) {
    return [];
  }

  const embedding = await generateTextEmbedding(sessionText, config);

  return [
    {
      id: generateId('emb'),
      vector: embedding,
      dimension: embedding.length,
      model: config.openrouter.models.textEmbedding,
      timestamp: Date.now(),
    },
  ];
}

// =============================================================================
// STORAGE OPERATIONS
// =============================================================================

async function storeEmbeddings(
  event: ConvexEvent,
  embeddings: EmbeddingRecord[],
  config: BrainConfig
): Promise<{ success: boolean; rowIds: string[] }> {
  if (embeddings.length === 0) {
    return { success: true, rowIds: [] };
  }

  // TODO: Implement LanceDB storage via adapter
  // const lancedb = createLanceDbAdapter(config);
  // const table = getTableForEventType(event.eventType);
  // const rowIds = await lancedb.insertBatch(table, embeddings.map(e => ({
  //   ...e,
  //   userId: event.userId,
  //   eventId: event._id,
  //   privacyScope: event.privacyScope,
  //   timestamp: event._creationTime,
  // })));

  // Placeholder
  logger.debug('Would store embeddings in LanceDB', {
    eventId: event._id,
    embeddingCount: embeddings.length,
  });

  return {
    success: true,
    rowIds: embeddings.map((e) => e.id),
  };
}

// =============================================================================
// GRAPH OPERATIONS
// =============================================================================

async function updateGraph(
  event: ConvexEvent,
  embeddings: EmbeddingRecord[],
  config: BrainConfig
): Promise<number> {
  let updateCount = 0;

  // TODO: Implement Neo4j updates via adapter
  // const neo4j = createNeo4jAdapter(config);
  //
  // // 1. Upsert Event node
  // await neo4j.upsertEvent({
  //   eventId: event._id,
  //   userId: event.userId,
  //   eventType: event.eventType,
  //   timestamp: event._creationTime,
  //   privacyScope: event.privacyScope,
  // });
  // updateCount++;
  //
  // // 2. Create User -> Event relationship
  // await neo4j.createUserGeneratedEvent(event.userId, event._id);
  // updateCount++;
  //
  // // 3. Link to session if applicable
  // if (event.sessionId) {
  //   await neo4j.createEventInSession(event._id, event.sessionId);
  //   updateCount++;
  // }

  // Placeholder
  logger.debug('Would update Neo4j graph', {
    eventId: event._id,
    eventType: event.eventType,
  });

  return updateCount + 2; // Simulated: event node + relationship
}

// =============================================================================
// PROMPT HANDLING
// =============================================================================

async function checkAndCreatePrompt(
  event: ConvexEvent,
  config: BrainConfig
): Promise<boolean> {
  // TODO: Implement speaker cluster checking
  // 1. Get speaker clusters for this event from processing result
  // 2. Check if any unknown cluster exceeds threshold
  // 3. Create prompt if needed

  // Placeholder: No prompt created
  return false;
}

async function handleSpeakerLabeledEvent(
  event: ConvexEvent,
  config: BrainConfig
): Promise<void> {
  if (!event.clusterId || !event.contactId) {
    throw new BrainError(
      'Speaker label event missing clusterId or contactId',
      'INVALID_EVENT',
      false
    );
  }

  // TODO: Implement label handling:
  // 1. Update Neo4j: (SpeakerCluster)-[:RESOLVES_TO]->(Contact)
  // 2. Backfill LanceDB: Update all rows with this clusterId to set contactId

  logger.info('Would handle speaker label event', {
    eventId: event._id,
    clusterId: event.clusterId,
    contactId: event.contactId,
  });
}

// =============================================================================
// PLACEHOLDER AI FUNCTIONS
// TODO: Replace with actual OpenRouter adapter calls
// =============================================================================

async function generateTextEmbedding(
  text: string,
  config: BrainConfig
): Promise<number[]> {
  // Placeholder: Return random embedding of correct dimension
  // TODO: Replace with actual API call
  const dimension = 1536; // OpenAI embedding dimension
  return Array.from({ length: dimension }, () => Math.random() * 2 - 1);
}

async function generateClipEmbedding(
  imageUrl: string,
  config: BrainConfig
): Promise<number[]> {
  // Placeholder: Return random CLIP embedding
  // TODO: Replace with actual API call
  const dimension = 768; // CLIP dimension
  return Array.from({ length: dimension }, () => Math.random() * 2 - 1);
}

async function transcribeAudio(
  audioUrl: string,
  config: BrainConfig
): Promise<string> {
  // Placeholder: Return empty transcription
  // TODO: Replace with actual Whisper API call
  return '';
}

function estimateFrameCount(duration?: number, interval: number = 2): number {
  if (!duration) return 1;
  return Math.max(1, Math.floor(duration / interval));
}
