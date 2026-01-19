/**
 * Neural Intelligence Platform - LangGraph Workflow Definition
 *
 * This module defines the core event processing workflow using LangGraph.
 * It orchestrates the flow from event ingestion through embedding,
 * enrichment, storage, and optional user prompting.
 *
 * @version 1.0.0
 * @author Sub-Agent 3: Orchestration + API Engineer
 */

import { StateGraph, END, START, Annotation } from '@langchain/langgraph';
import { RunnableConfig } from '@langchain/core/runnables';

import type {
  EventType,
  PrivacyScope,
  EmbeddingRecord,
  SpeakerClusterUpdate,
  PromptRequest,
  AudioProcessingResult,
  VideoProcessingResult,
  ImageProcessingResult,
  TextProcessingResult,
  SentimentAnalysis,
  ExtractedEntity,
} from '../types/index';

// =============================================================================
// BRAIN STATE DEFINITION
// =============================================================================

/**
 * Convex event structure as received from the event store
 */
export interface ConvexEvent {
  _id: string;
  _creationTime: number;
  userId: string;
  eventType: EventType;
  privacyScope: PrivacyScope;
  source: {
    url?: string;
    mimeType?: string;
    size?: number;
    storageId?: string;
    text?: string;
  };
  timestamp: number;
  metadata?: Record<string, unknown>;
}

/**
 * Enrichments extracted from content
 */
export interface Enrichments {
  sentiment: SentimentAnalysis | null;
  entities: ExtractedEntity[];
  topics: string[];
  keywords: string[];
  summary: string | null;
  actionItems: ActionItem[];
  decisions: Decision[];
  speakerStats: SpeakerStat[];
}

export interface ActionItem {
  text: string;
  assignee: string | null;
  priority: 'low' | 'medium' | 'high';
  status: 'open' | 'completed';
}

export interface Decision {
  text: string;
  participants: string[];
  timestamp: number;
}

export interface SpeakerStat {
  speakerId: string;
  speakerName: string | null;
  talkTimeMs: number;
  wordCount: number;
}

/**
 * Results from LanceDB storage operations
 */
export interface StorageResults {
  success: boolean;
  tableName: string;
  insertedCount: number;
  latencyMs: number;
  error: string | null;
}

/**
 * Results from Neo4j graph operations
 */
export interface GraphResults {
  success: boolean;
  nodesCreated: number;
  nodesUpdated: number;
  relationshipsCreated: number;
  relationshipsUpdated: number;
  latencyMs: number;
  error: string | null;
}

/**
 * Processing result union type
 */
export type ProcessingResult =
  | AudioProcessingResult
  | VideoProcessingResult
  | ImageProcessingResult
  | TextProcessingResult;

/**
 * Brain State - The central state object that flows through the graph
 *
 * This state is designed to be serializable for checkpointing and
 * supports idempotent processing via the eventId.
 */
export interface BrainState {
  // Input
  eventId: string;
  event: ConvexEvent | null;
  eventType: EventType | null;

  // Processing results
  processingResult: ProcessingResult | null;
  embeddings: EmbeddingRecord[];
  speakerUpdates: SpeakerClusterUpdate[];

  // Enrichments
  enrichments: Enrichments | null;

  // Storage results
  storageResults: StorageResults | null;
  graphResults: GraphResults | null;

  // Prompt handling
  promptRequired: PromptRequest | null;
  promptCreated: boolean;

  // Error handling
  error: Error | null;
  errorMessage: string | null;
  retryCount: number;

  // Metadata
  startedAt: number;
  completedAt: number | null;
  processingTimeMs: number | null;
}

// LangGraph State Annotation for type-safe state management
export const BrainStateAnnotation = Annotation.Root({
  eventId: Annotation<string>(),
  event: Annotation<ConvexEvent | null>(),
  eventType: Annotation<EventType | null>(),
  processingResult: Annotation<ProcessingResult | null>(),
  embeddings: Annotation<EmbeddingRecord[]>({
    reducer: (current: EmbeddingRecord[], update: EmbeddingRecord[]) => [...current, ...update],
    default: () => [],
  }),
  speakerUpdates: Annotation<SpeakerClusterUpdate[]>({
    reducer: (current: SpeakerClusterUpdate[], update: SpeakerClusterUpdate[]) => [...current, ...update],
    default: () => [],
  }),
  enrichments: Annotation<Enrichments | null>(),
  storageResults: Annotation<StorageResults | null>(),
  graphResults: Annotation<GraphResults | null>(),
  promptRequired: Annotation<PromptRequest | null>(),
  promptCreated: Annotation<boolean>(),
  error: Annotation<Error | null>(),
  errorMessage: Annotation<string | null>(),
  retryCount: Annotation<number>(),
  startedAt: Annotation<number>(),
  completedAt: Annotation<number | null>(),
  processingTimeMs: Annotation<number | null>(),
});

// =============================================================================
// CONFIGURATION
// =============================================================================

export interface BrainGraphConfig {
  maxRetries: number;
  retryDelayMs: number;
  deadLetterQueueEnabled: boolean;
  idempotencyTtlMs: number;
}

export const DEFAULT_CONFIG: BrainGraphConfig = {
  maxRetries: 3,
  retryDelayMs: 1000,
  deadLetterQueueEnabled: true,
  idempotencyTtlMs: 24 * 60 * 60 * 1000, // 24 hours
};

// =============================================================================
// IDEMPOTENCY STORE (In-Memory for Development)
// =============================================================================

/**
 * Simple in-memory idempotency store.
 * In production, replace with Redis or similar distributed cache.
 */
class IdempotencyStore {
  private processed: Map<string, { timestamp: number; result: 'success' | 'failed' }> =
    new Map();

  isProcessed(eventId: string): boolean {
    const entry = this.processed.get(eventId);
    if (!entry) return false;

    // Check if TTL has expired
    if (Date.now() - entry.timestamp > DEFAULT_CONFIG.idempotencyTtlMs) {
      this.processed.delete(eventId);
      return false;
    }

    return true;
  }

  markProcessed(eventId: string, result: 'success' | 'failed'): void {
    this.processed.set(eventId, { timestamp: Date.now(), result });
  }

  getResult(eventId: string): 'success' | 'failed' | null {
    const entry = this.processed.get(eventId);
    return entry?.result ?? null;
  }

  // Cleanup expired entries periodically
  cleanup(): void {
    const now = Date.now();
    for (const [eventId, entry] of this.processed.entries()) {
      if (now - entry.timestamp > DEFAULT_CONFIG.idempotencyTtlMs) {
        this.processed.delete(eventId);
      }
    }
  }
}

export const idempotencyStore = new IdempotencyStore();

// =============================================================================
// DEAD LETTER QUEUE
// =============================================================================

/**
 * Dead Letter Queue for permanently failed events.
 * In production, use a persistent queue like SQS or Redis Streams.
 */
class DeadLetterQueue {
  private queue: Array<{
    eventId: string;
    error: string;
    timestamp: number;
    retryCount: number;
    state: Partial<BrainState>;
  }> = [];

  enqueue(
    eventId: string,
    error: string,
    retryCount: number,
    state: Partial<BrainState>
  ): void {
    const stateToStore: Partial<BrainState> = {};
    if (state.eventId !== undefined) {
      stateToStore.eventId = state.eventId;
    }
    if (state.eventType !== undefined) {
      stateToStore.eventType = state.eventType;
    }
    if (state.errorMessage !== undefined) {
      stateToStore.errorMessage = state.errorMessage;
    }
    this.queue.push({
      eventId,
      error,
      timestamp: Date.now(),
      retryCount,
      state: stateToStore,
    });

    console.error(`[DLQ] Event ${eventId} added to dead letter queue: ${error}`);
  }

  getAll(): typeof this.queue {
    return [...this.queue];
  }

  size(): number {
    return this.queue.length;
  }

  // Retry a specific event from DLQ
  async retry(eventId: string): Promise<boolean> {
    const index = this.queue.findIndex((_item) => _item.eventId === eventId);
    if (index === -1) return false;

    this.queue.splice(index, 1);
    // Caller should re-invoke the graph with this eventId
    console.log(`[DLQ] Event ${eventId} removed for retry`);
    return true;
  }
}

export const deadLetterQueue = new DeadLetterQueue();

// =============================================================================
// NODE IMPLEMENTATIONS
// =============================================================================

/**
 * Fetch event details from Convex
 */
async function fetchEvent(
  state: typeof BrainStateAnnotation.State,
  _config?: RunnableConfig
): Promise<Partial<typeof BrainStateAnnotation.State>> {
  const { eventId } = state;

  // Check idempotency
  if (idempotencyStore.isProcessed(eventId)) {
    console.log(`[fetchEvent] Event ${eventId} already processed, skipping`);
    return {
      error: new Error('Event already processed'),
      errorMessage: 'ALREADY_PROCESSED',
    };
  }

  try {
    // TODO: Replace with actual Convex client call
    // const convex = getConvexClient();
    // const event = await convex.query(api.events.get, { eventId });

    // Placeholder - in production, fetch from Convex
    const event: ConvexEvent = await fetchEventFromConvex(eventId);

    if (!event) {
      throw new Error(`Event not found: ${eventId}`);
    }

    return {
      event,
      eventType: event.eventType,
    };
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    return {
      error: err,
      errorMessage: err.message,
    };
  }
}

/**
 * Placeholder for Convex fetch - implement with actual Convex client
 */
async function fetchEventFromConvex(_eventId: string): Promise<ConvexEvent> {
  // TODO: Implement with Convex client
  // import { ConvexClient } from 'convex/browser';
  // const client = new ConvexClient(process.env.CONVEX_URL!);
  // return await client.query(api.events.getById, { id: _eventId });

  throw new Error('Convex client not implemented');
}

/**
 * Route by modality - determines which embedding pipeline to use
 */
function routeByModality(
  state: typeof BrainStateAnnotation.State
): 'embed_audio' | 'embed_video' | 'embed_image' | 'embed_text' | 'handle_error' {
  if (state.error) {
    return 'handle_error';
  }

  switch (state.eventType) {
    case 'audio':
      return 'embed_audio';
    case 'video':
      return 'embed_video';
    case 'image':
      return 'embed_image';
    case 'text':
      return 'embed_text';
    default:
      // Default to text for unknown types
      return 'embed_text';
  }
}

/**
 * Text embedding pipeline
 */
async function embedText(
  state: typeof BrainStateAnnotation.State,
  _config?: RunnableConfig
): Promise<Partial<typeof BrainStateAnnotation.State>> {
  try {
    const { event } = state;
    if (!event) throw new Error('No event in state');

    // TODO: Replace with actual text embedding implementation
    // import { embedText as doEmbedText } from '../embedding/text';
    // const result = await doEmbedText(event);

    const result: TextProcessingResult = await processTextEvent(event);

    const embeddingRecord: EmbeddingRecord = {
      id: `${event._id}-text-0`,
      vector: {
        values: result.embedding.values,
        dimensions: result.embedding.dimensions,
        model: result.embedding.model,
      },
      contentType: 'text',
      metadata: {
        eventId: event._id,
        userId: event.userId,
        timestamp: event.timestamp,
        entities: result.entities,
      },
      createdAt: Date.now(),
    };

    return {
      processingResult: result,
      embeddings: [embeddingRecord],
    };
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    return {
      error: err,
      errorMessage: err.message,
    };
  }
}

/**
 * Audio embedding pipeline with speaker diarization
 */
async function embedAudio(
  state: typeof BrainStateAnnotation.State,
  _config?: RunnableConfig
): Promise<Partial<typeof BrainStateAnnotation.State>> {
  try {
    const { event } = state;
    if (!event) throw new Error('No event in state');

    // TODO: Replace with actual audio processing implementation
    // import { processAudio } from '../embedding/audio';
    // const result = await processAudio(event);

    const result: AudioProcessingResult = await processAudioEvent(event);

    // Create embedding records for each segment
    const embeddingRecords: EmbeddingRecord[] = result.segments
      .filter((seg) => seg.embedding)
      .map((segment, index) => ({
        id: `${event._id}-audio-${index}`,
        vector: segment.embedding!,
        contentType: 'audio' as const,
        startTime: segment.startTime,
        endTime: segment.endTime,
        metadata: {
          eventId: event._id,
          userId: event.userId,
          timestamp: event.timestamp,
          speakerId: segment.speakerId,
          speakerClusterId: segment.speakerClusterId,
          transcription: segment.transcription,
          sentiment: segment.sentiment,
        },
        createdAt: Date.now(),
      }));

    return {
      processingResult: result,
      embeddings: embeddingRecords,
      speakerUpdates: result.speakerClusters,
    };
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    return {
      error: err,
      errorMessage: err.message,
    };
  }
}

/**
 * Video embedding pipeline
 */
async function embedVideo(
  state: typeof BrainStateAnnotation.State,
  _config?: RunnableConfig
): Promise<Partial<typeof BrainStateAnnotation.State>> {
  try {
    const { event } = state;
    if (!event) throw new Error('No event in state');

    // TODO: Replace with actual video processing implementation
    // import { processVideo } from '../embedding/video';
    // const result = await processVideo(event);

    const result: VideoProcessingResult = await processVideoEvent(event);

    // Create embedding records for each frame
    const embeddingRecords: EmbeddingRecord[] = result.frames.map((frame, index) => ({
      id: `${event._id}-video-${index}`,
      vector: frame.embedding,
      contentType: 'video' as const,
      startTime: frame.timestamp,
      endTime: frame.timestamp,
      metadata: {
        eventId: event._id,
        userId: event.userId,
        timestamp: event.timestamp,
        frameNumber: frame.frameNumber,
        isKeyframe: frame.isKeyframe,
      },
      createdAt: Date.now(),
    }));

    return {
      processingResult: result,
      embeddings: embeddingRecords,
    };
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    return {
      error: err,
      errorMessage: err.message,
    };
  }
}

/**
 * Image embedding pipeline
 */
async function embedImage(
  state: typeof BrainStateAnnotation.State,
  _config?: RunnableConfig
): Promise<Partial<typeof BrainStateAnnotation.State>> {
  try {
    const { event } = state;
    if (!event) throw new Error('No event in state');

    // TODO: Replace with actual image processing implementation
    // import { processImage } from '../embedding/image';
    // const result = await processImage(event);

    const result: ImageProcessingResult = await processImageEvent(event);

    const embeddingRecord: EmbeddingRecord = {
      id: `${event._id}-image-0`,
      vector: result.embedding,
      contentType: 'image' as const,
      metadata: {
        eventId: event._id,
        userId: event.userId,
        timestamp: event.timestamp,
        ocrText: result.ocrText,
        dimensions: result.dimensions,
      },
      createdAt: Date.now(),
    };

    return {
      processingResult: result,
      embeddings: [embeddingRecord],
    };
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    return {
      error: err,
      errorMessage: err.message,
    };
  }
}

/**
 * Enrichment node - extracts sentiment, entities, and metadata
 */
async function enrich(
  state: typeof BrainStateAnnotation.State,
  _config?: RunnableConfig
): Promise<Partial<typeof BrainStateAnnotation.State>> {
  try {
    const { event, processingResult, embeddings: _embeddings } = state;
    if (!event) throw new Error('No event in state');

    // TODO: Replace with actual enrichment implementation
    // import { enrichContent } from '../enrichment/enrich';
    // const enrichments = await enrichContent(event, processingResult);

    const enrichments = await enrichContent(event, processingResult);

    return { enrichments };
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    return {
      error: err,
      errorMessage: err.message,
    };
  }
}

/**
 * Store vectors in LanceDB
 */
async function storeVector(
  state: typeof BrainStateAnnotation.State,
  _config?: RunnableConfig
): Promise<Partial<typeof BrainStateAnnotation.State>> {
  try {
    const { embeddings, event, enrichments } = state;
    if (!event) throw new Error('No event in state');

    const startTime = Date.now();

    // TODO: Replace with actual LanceDB client
    // import { lanceDbClient } from '../storage/lancedb';
    // await lanceDbClient.insert(embeddings.map(e => ({
    //   ...e,
    //   userId: event.userId,
    //   privacyScope: event.privacyScope,
    //   sentiment: enrichments?.sentiment,
    // })));

    // Placeholder - implement with actual LanceDB client
    await storeTolanceDb(embeddings, event, enrichments);

    const storageResults: StorageResults = {
      success: true,
      tableName: `embeddings_${event.eventType}`,
      insertedCount: embeddings.length,
      latencyMs: Date.now() - startTime,
      error: null,
    };

    return { storageResults };
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    return {
      error: err,
      errorMessage: err.message,
      storageResults: {
        success: false,
        tableName: '',
        insertedCount: 0,
        latencyMs: 0,
        error: err.message,
      },
    };
  }
}

/**
 * Update Neo4j graph with relationships
 */
async function updateGraph(
  state: typeof BrainStateAnnotation.State,
  _config?: RunnableConfig
): Promise<Partial<typeof BrainStateAnnotation.State>> {
  try {
    const { event, enrichments, speakerUpdates } = state;
    if (!event) throw new Error('No event in state');

    const startTime = Date.now();

    // TODO: Replace with actual Neo4j client
    // import { neo4jClient } from '../storage/neo4j';
    // const result = await neo4jClient.updateGraph({
    //   event,
    //   entities: enrichments?.entities,
    //   speakerUpdates,
    // });

    // Placeholder - implement with actual Neo4j client
    const result = await updateNeo4jGraph(event, enrichments, speakerUpdates);

    const graphResults: GraphResults = {
      success: true,
      nodesCreated: result.nodesCreated,
      nodesUpdated: result.nodesUpdated,
      relationshipsCreated: result.relationshipsCreated,
      relationshipsUpdated: result.relationshipsUpdated,
      latencyMs: Date.now() - startTime,
      error: null,
    };

    return { graphResults };
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    return {
      error: err,
      errorMessage: err.message,
      graphResults: {
        success: false,
        nodesCreated: 0,
        nodesUpdated: 0,
        relationshipsCreated: 0,
        relationshipsUpdated: 0,
        latencyMs: 0,
        error: err.message,
      },
    };
  }
}

/**
 * Check if user prompt is required
 */
async function checkPrompt(
  state: typeof BrainStateAnnotation.State,
  _config?: RunnableConfig
): Promise<Partial<typeof BrainStateAnnotation.State>> {
  try {
    const { event, speakerUpdates, processingResult } = state;
    if (!event) throw new Error('No event in state');

    let promptRequired: PromptRequest | null = null;

    // Check for unknown speakers that need labeling
    if (speakerUpdates && speakerUpdates.length > 0) {
      const newClusters = speakerUpdates.filter(
        (update: SpeakerClusterUpdate) => update.action === 'create' && !update.labeledName
      );

      if (newClusters.length > 0) {
        // Check occurrence threshold
        const audioResult = processingResult as AudioProcessingResult | undefined;
        if (audioResult?.unknownSpeakerDetected) {
          promptRequired = {
            type: 'speaker_label',
            clusterId: newClusters[0]!.clusterId,
            context: `New speaker detected in audio from ${new Date(event.timestamp).toLocaleString()}`,
            priority: 'medium',
            expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000, // 7 days
          };
        }
      }
    }

    return { promptRequired };
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    return {
      error: err,
      errorMessage: err.message,
    };
  }
}

/**
 * Route based on whether prompt is required
 */
function routePrompt(
  state: typeof BrainStateAnnotation.State
): 'create_prompt' | 'finalize' | 'handle_error' {
  if (state.error) {
    return 'handle_error';
  }
  return state.promptRequired ? 'create_prompt' : 'finalize';
}

/**
 * Create prompt in Convex for dashboard to display
 */
async function createPrompt(
  state: typeof BrainStateAnnotation.State,
  _config?: RunnableConfig
): Promise<Partial<typeof BrainStateAnnotation.State>> {
  try {
    const { event, promptRequired } = state;
    if (!event) throw new Error('No event in state');
    if (!promptRequired) throw new Error('No prompt required');

    // TODO: Replace with actual Convex mutation
    // const convex = getConvexClient();
    // await convex.mutation(api.prompts.create, {
    //   userId: event.userId,
    //   eventId: event._id,
    //   ...promptRequired,
    // });

    // Placeholder - implement with actual Convex client
    await createPromptInConvex(event.userId, event._id, promptRequired);

    return { promptCreated: true };
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    return {
      error: err,
      errorMessage: err.message,
    };
  }
}

/**
 * Finalize processing - mark event as completed
 */
async function finalize(
  state: typeof BrainStateAnnotation.State,
  _config?: RunnableConfig
): Promise<Partial<typeof BrainStateAnnotation.State>> {
  try {
    const { eventId, event, storageResults, graphResults } = state;
    if (!event) throw new Error('No event in state');

    // Mark as processed in idempotency store
    idempotencyStore.markProcessed(eventId, 'success');

    // TODO: Update event status in Convex
    // const convex = getConvexClient();
    // await convex.mutation(api.events.markProcessed, {
    //   eventId: event._id,
    //   processedAt: Date.now(),
    // });

    const completedAt = Date.now();

    console.log(`[finalize] Event ${eventId} processed successfully`, {
      embeddings: state.embeddings.length,
      vectorsStored: storageResults?.insertedCount,
      graphNodes: graphResults?.nodesCreated,
    });

    return {
      completedAt,
      processingTimeMs: completedAt - state.startedAt,
    };
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    return {
      error: err,
      errorMessage: err.message,
    };
  }
}

/**
 * Handle errors with retry logic
 */
async function handleError(
  state: typeof BrainStateAnnotation.State,
  _config?: RunnableConfig
): Promise<Partial<typeof BrainStateAnnotation.State>> {
  const { eventId, error, retryCount } = state;

  console.error(`[handleError] Event ${eventId} error:`, error?.message, {
    retryCount,
  });

  // Check if we should retry
  if (retryCount < DEFAULT_CONFIG.maxRetries) {
    // Exponential backoff
    const delay = DEFAULT_CONFIG.retryDelayMs * Math.pow(2, retryCount);
    await new Promise((resolve) => setTimeout(resolve, delay));

    return {
      retryCount: retryCount + 1,
      error: null,
      errorMessage: null,
    };
  }

  // Max retries exceeded - send to dead letter queue
  if (DEFAULT_CONFIG.deadLetterQueueEnabled) {
    deadLetterQueue.enqueue(
      eventId,
      error?.message || 'Unknown error',
      retryCount,
      state
    );
  }

  // Mark as failed in idempotency store
  idempotencyStore.markProcessed(eventId, 'failed');

  // TODO: Update event status in Convex
  // await updateEventStatus(eventId, 'failed', error?.message);

  return {
    completedAt: Date.now(),
    processingTimeMs: Date.now() - state.startedAt,
  };
}

/**
 * Route after error handling
 */
function routeAfterError(
  state: typeof BrainStateAnnotation.State
): 'fetch_event' | typeof END {
  // If retry count is below max and error was cleared, retry from beginning
  if (state.retryCount <= DEFAULT_CONFIG.maxRetries && !state.error) {
    return 'fetch_event';
  }
  return END;
}

// =============================================================================
// PLACEHOLDER IMPLEMENTATIONS
// =============================================================================

// These functions are placeholders - implement with actual clients

async function processTextEvent(_event: ConvexEvent): Promise<TextProcessingResult> {
  // TODO: Implement with OpenRouter embedding API
  throw new Error('Text processing not implemented');
}

async function processAudioEvent(_event: ConvexEvent): Promise<AudioProcessingResult> {
  // TODO: Implement with Whisper + speaker diarization
  throw new Error('Audio processing not implemented');
}

async function processVideoEvent(_event: ConvexEvent): Promise<VideoProcessingResult> {
  // TODO: Implement with CLIP frame extraction
  throw new Error('Video processing not implemented');
}

async function processImageEvent(_event: ConvexEvent): Promise<ImageProcessingResult> {
  // TODO: Implement with CLIP + OCR
  throw new Error('Image processing not implemented');
}

async function enrichContent(
  _event: ConvexEvent,
  _processingResult: ProcessingResult | null
): Promise<Enrichments> {
  // TODO: Implement with LLM enrichment
  return {
    sentiment: null,
    entities: [],
    topics: [],
    keywords: [],
    summary: null,
    actionItems: [],
    decisions: [],
    speakerStats: [],
  };
}

async function storeTolanceDb(
  embeddings: EmbeddingRecord[],
  _event: ConvexEvent,
  _enrichments: Enrichments | null
): Promise<void> {
  // TODO: Implement with LanceDB client
  console.log(`[LanceDB] Would store ${embeddings.length} embeddings`);
}

async function updateNeo4jGraph(
  event: ConvexEvent,
  _enrichments: Enrichments | null,
  _speakerUpdates: SpeakerClusterUpdate[]
): Promise<{
  nodesCreated: number;
  nodesUpdated: number;
  relationshipsCreated: number;
  relationshipsUpdated: number;
}> {
  // TODO: Implement with Neo4j client
  console.log(`[Neo4j] Would update graph for event ${event._id}`);
  return {
    nodesCreated: 0,
    nodesUpdated: 0,
    relationshipsCreated: 0,
    relationshipsUpdated: 0,
  };
}

async function createPromptInConvex(
  userId: string,
  _eventId: string,
  _prompt: PromptRequest
): Promise<void> {
  // TODO: Implement with Convex client
  console.log(`[Convex] Would create prompt for user ${userId}`);
}

// =============================================================================
// GRAPH CONSTRUCTION
// =============================================================================

/**
 * Create the Brain processing graph
 */
export function createBrainGraph() {
  const workflow = new StateGraph(BrainStateAnnotation)
    // Add all nodes
    .addNode('fetch_event', fetchEvent)
    .addNode('embed_text', embedText)
    .addNode('embed_audio', embedAudio)
    .addNode('embed_video', embedVideo)
    .addNode('embed_image', embedImage)
    .addNode('enrich', enrich)
    .addNode('store_vector', storeVector)
    .addNode('update_graph', updateGraph)
    .addNode('check_prompt', checkPrompt)
    .addNode('create_prompt', createPrompt)
    .addNode('finalize', finalize)
    .addNode('handle_error', handleError)

    // Define edges
    .addEdge(START, 'fetch_event')
    .addConditionalEdges('fetch_event', routeByModality)
    .addEdge('embed_text', 'enrich')
    .addEdge('embed_audio', 'enrich')
    .addEdge('embed_video', 'enrich')
    .addEdge('embed_image', 'enrich')
    .addEdge('enrich', 'store_vector')
    .addEdge('store_vector', 'update_graph')
    .addEdge('update_graph', 'check_prompt')
    .addConditionalEdges('check_prompt', routePrompt)
    .addEdge('create_prompt', 'finalize')
    .addEdge('finalize', END)
    .addConditionalEdges('handle_error', routeAfterError);

  return workflow.compile();
}

// =============================================================================
// GRAPH INVOCATION
// =============================================================================

/**
 * Process a single event through the brain graph
 */
export async function processEvent(
  eventId: string,
  _config?: Partial<BrainGraphConfig>
): Promise<typeof BrainStateAnnotation.State> {
  const graph = createBrainGraph();

  const initialState: typeof BrainStateAnnotation.State = {
    eventId,
    event: null,
    eventType: null,
    processingResult: null,
    embeddings: [],
    speakerUpdates: [],
    enrichments: null,
    storageResults: null,
    graphResults: null,
    promptRequired: null,
    promptCreated: false,
    error: null,
    errorMessage: null,
    retryCount: 0,
    startedAt: Date.now(),
    completedAt: null,
    processingTimeMs: null,
  };

  const result = await graph.invoke(initialState);

  return result;
}

/**
 * Process multiple events in parallel with concurrency control
 */
export async function processEvents(
  eventIds: string[],
  concurrency: number = 5
): Promise<Map<string, typeof BrainStateAnnotation.State>> {
  const results = new Map<string, typeof BrainStateAnnotation.State>();

  // Process in batches for concurrency control
  for (let i = 0; i < eventIds.length; i += concurrency) {
    const batch = eventIds.slice(i, i + concurrency);
    const batchResults = await Promise.all(
      batch.map((eventId) => processEvent(eventId))
    );

    batch.forEach((eventId, index) => {
      results.set(eventId, batchResults[index]!);
    });
  }

  return results;
}

// Export graph instance for direct use
export const brainGraph = createBrainGraph();
