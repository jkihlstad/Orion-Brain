/**
 * Neural Intelligence Platform - LangGraph Orchestration
 *
 * Defines the event processing workflow using LangGraph patterns.
 * Routes events by modality and handles the full processing pipeline.
 *
 * Nodes:
 * - fetch_event: Get event details from Convex
 * - route_by_modality: Conditional routing based on event type
 * - embed_text/audio/video/image: Modality-specific pipelines
 * - enrich: Sentiment, entities, metadata extraction
 * - store_vector: Write to LanceDB
 * - update_graph: Write to Neo4j
 * - check_prompt: Determine if user prompt needed
 * - create_prompt: Write prompt to Convex
 * - finalize: Mark event as processed
 * - handle_error: Error handling node
 */

import {
  ConvexEvent,
  EmbeddingRecord,
  ProcessingResult,
  PromptRequest,
  BrainError,
  BrainConfig,
  EventType,
} from '../types';
import { generateId } from '../utils/id';
import { logger } from '../utils/logger';

// =============================================================================
// STATE DEFINITION
// =============================================================================

export interface BrainState {
  // Input
  eventId: string;
  event: ConvexEvent | null;
  eventType: EventType | null;

  // Processing outputs
  embeddings: EmbeddingRecord[];
  enrichments: Enrichments | null;
  storageResults: StorageResults | null;
  graphResults: GraphResults | null;
  promptRequired: PromptRequest | null;

  // Control flow
  error: Error | null;
  retryCount: number;
  currentNode: string;
  completedNodes: string[];

  // Metadata
  startTime: number;
  endTime: number | null;
}

interface Enrichments {
  sentiment?: {
    label: 'positive' | 'negative' | 'neutral';
    score: number;
  };
  entities?: Array<{
    type: string;
    value: string;
  }>;
  speakerClusters?: Array<{
    clusterId: string;
    isNew: boolean;
    needsLabeling: boolean;
  }>;
}

interface StorageResults {
  tableName: string;
  rowIds: string[];
  success: boolean;
}

interface GraphResults {
  nodesCreated: number;
  relationshipsCreated: number;
  success: boolean;
}

// =============================================================================
// INITIAL STATE
// =============================================================================

export function createInitialState(eventId: string): BrainState {
  return {
    eventId,
    event: null,
    eventType: null,
    embeddings: [],
    enrichments: null,
    storageResults: null,
    graphResults: null,
    promptRequired: null,
    error: null,
    retryCount: 0,
    currentNode: 'START',
    completedNodes: [],
    startTime: Date.now(),
    endTime: null,
  };
}

// =============================================================================
// NODE DEFINITIONS
// =============================================================================

type NodeFunction = (state: BrainState, config: BrainConfig) => Promise<Partial<BrainState>>;

/**
 * Fetch event details from Convex.
 */
export const fetchEventNode: NodeFunction = async (state, config) => {
  logger.debug('fetchEventNode executing', { eventId: state.eventId });

  // TODO: Implement actual Convex fetch
  // const convex = createConvexAdapter(config);
  // const event = await convex.getEvent(state.eventId);

  // Placeholder
  const event: ConvexEvent = {
    _id: state.eventId,
    _creationTime: Date.now(),
    userId: 'user_placeholder',
    eventType: 'text',
    sourceApp: 'ios_browser',
    privacyScope: 'private',
    schemaVersion: 1,
    content: 'Placeholder event content',
  };

  if (!event) {
    throw new BrainError('Event not found', 'EVENT_NOT_FOUND', false);
  }

  return {
    event,
    eventType: event.eventType,
    currentNode: 'fetch_event',
    completedNodes: [...state.completedNodes, 'fetch_event'],
  };
};

/**
 * Route to appropriate embedding node based on modality.
 */
export const routeByModalityNode: NodeFunction = async (state, config) => {
  logger.debug('routeByModalityNode executing', { eventType: state.eventType });

  // Routing happens in graph edges, this node just validates
  if (!state.event || !state.eventType) {
    throw new BrainError('Cannot route: no event loaded', 'INVALID_EVENT', false);
  }

  return {
    currentNode: 'route_by_modality',
    completedNodes: [...state.completedNodes, 'route_by_modality'],
  };
};

/**
 * Embed text content.
 */
export const embedTextNode: NodeFunction = async (state, config) => {
  logger.debug('embedTextNode executing');

  if (!state.event?.content) {
    return {
      embeddings: [],
      currentNode: 'embed_text',
      completedNodes: [...state.completedNodes, 'embed_text'],
    };
  }

  // TODO: Call OpenRouter for embedding
  const mockEmbedding: EmbeddingRecord = {
    id: generateId('emb'),
    vector: Array(1536).fill(0).map(() => Math.random()),
    dimension: 1536,
    model: config.openrouter.models.textEmbedding,
    timestamp: Date.now(),
  };

  return {
    embeddings: [mockEmbedding],
    currentNode: 'embed_text',
    completedNodes: [...state.completedNodes, 'embed_text'],
  };
};

/**
 * Process audio content.
 */
export const embedAudioNode: NodeFunction = async (state, config) => {
  logger.debug('embedAudioNode executing');

  if (!state.event?.mediaUrl) {
    return {
      embeddings: [],
      currentNode: 'embed_audio',
      completedNodes: [...state.completedNodes, 'embed_audio'],
    };
  }

  // TODO: Call audio pipeline
  // 1. Transcribe
  // 2. Diarize
  // 3. Generate embeddings per segment
  // 4. Cluster speakers

  const mockEmbedding: EmbeddingRecord = {
    id: generateId('emb'),
    vector: Array(1536).fill(0).map(() => Math.random()),
    dimension: 1536,
    model: config.openrouter.models.textEmbedding,
    timestamp: Date.now(),
  };

  return {
    embeddings: [mockEmbedding],
    enrichments: {
      speakerClusters: [{
        clusterId: generateId('cluster'),
        isNew: true,
        needsLabeling: false,
      }],
    },
    currentNode: 'embed_audio',
    completedNodes: [...state.completedNodes, 'embed_audio'],
  };
};

/**
 * Process video content.
 */
export const embedVideoNode: NodeFunction = async (state, config) => {
  logger.debug('embedVideoNode executing');

  if (!state.event?.mediaUrl) {
    return {
      embeddings: [],
      currentNode: 'embed_video',
      completedNodes: [...state.completedNodes, 'embed_video'],
    };
  }

  // TODO: Call video pipeline
  // 1. Extract frames
  // 2. Generate CLIP embeddings

  const frameCount = Math.min(
    config.thresholds.maxFramesPerVideo,
    10 // Placeholder
  );

  const embeddings: EmbeddingRecord[] = Array(frameCount).fill(null).map(() => ({
    id: generateId('emb'),
    vector: Array(768).fill(0).map(() => Math.random()),
    dimension: 768,
    model: config.openrouter.models.clipEmbedding,
    timestamp: Date.now(),
  }));

  return {
    embeddings,
    currentNode: 'embed_video',
    completedNodes: [...state.completedNodes, 'embed_video'],
  };
};

/**
 * Process image content.
 */
export const embedImageNode: NodeFunction = async (state, config) => {
  logger.debug('embedImageNode executing');

  if (!state.event?.mediaUrl) {
    return {
      embeddings: [],
      currentNode: 'embed_image',
      completedNodes: [...state.completedNodes, 'embed_image'],
    };
  }

  // TODO: Call image pipeline with CLIP

  const mockEmbedding: EmbeddingRecord = {
    id: generateId('emb'),
    vector: Array(768).fill(0).map(() => Math.random()),
    dimension: 768,
    model: config.openrouter.models.clipEmbedding,
    timestamp: Date.now(),
  };

  return {
    embeddings: [mockEmbedding],
    currentNode: 'embed_image',
    completedNodes: [...state.completedNodes, 'embed_image'],
  };
};

/**
 * Enrich with sentiment and entities.
 */
export const enrichNode: NodeFunction = async (state, config) => {
  logger.debug('enrichNode executing');

  // TODO: Call OpenRouter for enrichment
  const enrichments: Enrichments = {
    sentiment: {
      label: 'neutral',
      score: 0,
    },
    entities: [],
    ...state.enrichments,
  };

  return {
    enrichments,
    currentNode: 'enrich',
    completedNodes: [...state.completedNodes, 'enrich'],
  };
};

/**
 * Store vectors in LanceDB.
 */
export const storeVectorNode: NodeFunction = async (state, config) => {
  logger.debug('storeVectorNode executing', {
    embeddingCount: state.embeddings.length,
  });

  if (state.embeddings.length === 0) {
    return {
      storageResults: { tableName: '', rowIds: [], success: true },
      currentNode: 'store_vector',
      completedNodes: [...state.completedNodes, 'store_vector'],
    };
  }

  // TODO: Implement LanceDB storage
  // const lancedb = createLanceDbAdapter(config);
  // const tableName = getTableForEventType(state.eventType);
  // const rowIds = await lancedb.insertBatch(tableName, ...);

  const storageResults: StorageResults = {
    tableName: `${state.eventType}_events`,
    rowIds: state.embeddings.map((e) => e.id),
    success: true,
  };

  return {
    storageResults,
    currentNode: 'store_vector',
    completedNodes: [...state.completedNodes, 'store_vector'],
  };
};

/**
 * Update Neo4j graph.
 */
export const updateGraphNode: NodeFunction = async (state, config) => {
  logger.debug('updateGraphNode executing');

  // TODO: Implement Neo4j updates
  // const neo4j = createNeo4jAdapter(config);
  // await neo4j.upsertEvent(...);
  // await neo4j.createUserGeneratedEvent(...);

  const graphResults: GraphResults = {
    nodesCreated: 1,
    relationshipsCreated: 1,
    success: true,
  };

  return {
    graphResults,
    currentNode: 'update_graph',
    completedNodes: [...state.completedNodes, 'update_graph'],
  };
};

/**
 * Check if a prompt is needed.
 */
export const checkPromptNode: NodeFunction = async (state, config) => {
  logger.debug('checkPromptNode executing');

  let promptRequired: PromptRequest | null = null;

  // Check speaker clusters for unknown speakers
  const speakerClusters = state.enrichments?.speakerClusters || [];
  const needsLabeling = speakerClusters.filter((c) => c.needsLabeling);

  if (needsLabeling.length > 0) {
    promptRequired = {
      type: 'speaker_label',
      userId: state.event?.userId || '',
      data: {
        clusterId: needsLabeling[0].clusterId,
        sampleSegmentIds: [],
        sampleTranscriptions: [],
        occurrenceCount: config.thresholds.unknownSpeakerPromptCount,
      },
      priority: 'medium',
    };
  }

  return {
    promptRequired,
    currentNode: 'check_prompt',
    completedNodes: [...state.completedNodes, 'check_prompt'],
  };
};

/**
 * Create prompt in Convex.
 */
export const createPromptNode: NodeFunction = async (state, config) => {
  logger.debug('createPromptNode executing', {
    hasPrompt: !!state.promptRequired,
  });

  if (!state.promptRequired) {
    return {
      currentNode: 'create_prompt',
      completedNodes: [...state.completedNodes, 'create_prompt'],
    };
  }

  // TODO: Create prompt in Convex
  // const convex = createConvexAdapter(config);
  // await convex.createPrompt(state.promptRequired);

  logger.info('Would create prompt', { prompt: state.promptRequired });

  return {
    currentNode: 'create_prompt',
    completedNodes: [...state.completedNodes, 'create_prompt'],
  };
};

/**
 * Finalize processing.
 */
export const finalizeNode: NodeFunction = async (state, config) => {
  logger.debug('finalizeNode executing');

  return {
    endTime: Date.now(),
    currentNode: 'finalize',
    completedNodes: [...state.completedNodes, 'finalize'],
  };
};

/**
 * Handle errors.
 */
export const handleErrorNode: NodeFunction = async (state, config) => {
  logger.error('handleErrorNode executing', {
    error: state.error?.message,
    retryCount: state.retryCount,
  });

  const isRetryable =
    state.error instanceof BrainError ? state.error.retryable : true;
  const maxRetries = config.worker.maxRetries;

  if (isRetryable && state.retryCount < maxRetries) {
    // Will be retried
    return {
      retryCount: state.retryCount + 1,
      currentNode: 'handle_error',
      completedNodes: [...state.completedNodes, 'handle_error'],
    };
  }

  // Mark as permanently failed
  return {
    endTime: Date.now(),
    currentNode: 'handle_error',
    completedNodes: [...state.completedNodes, 'handle_error'],
  };
};

// =============================================================================
// GRAPH DEFINITION
// =============================================================================

export interface GraphEdge {
  from: string;
  to: string | ((state: BrainState) => string);
}

export const graphNodes: Record<string, NodeFunction> = {
  fetch_event: fetchEventNode,
  route_by_modality: routeByModalityNode,
  embed_text: embedTextNode,
  embed_audio: embedAudioNode,
  embed_video: embedVideoNode,
  embed_image: embedImageNode,
  enrich: enrichNode,
  store_vector: storeVectorNode,
  update_graph: updateGraphNode,
  check_prompt: checkPromptNode,
  create_prompt: createPromptNode,
  finalize: finalizeNode,
  handle_error: handleErrorNode,
};

export const graphEdges: GraphEdge[] = [
  { from: 'START', to: 'fetch_event' },
  { from: 'fetch_event', to: 'route_by_modality' },
  {
    from: 'route_by_modality',
    to: (state) => {
      switch (state.eventType) {
        case 'text':
          return 'embed_text';
        case 'audio':
          return 'embed_audio';
        case 'video':
          return 'embed_video';
        case 'image':
          return 'embed_image';
        default:
          return 'enrich';
      }
    },
  },
  { from: 'embed_text', to: 'enrich' },
  { from: 'embed_audio', to: 'enrich' },
  { from: 'embed_video', to: 'enrich' },
  { from: 'embed_image', to: 'enrich' },
  { from: 'enrich', to: 'store_vector' },
  { from: 'store_vector', to: 'update_graph' },
  { from: 'update_graph', to: 'check_prompt' },
  {
    from: 'check_prompt',
    to: (state) => (state.promptRequired ? 'create_prompt' : 'finalize'),
  },
  { from: 'create_prompt', to: 'finalize' },
];

// =============================================================================
// GRAPH EXECUTION
// =============================================================================

/**
 * Execute the processing graph for an event.
 */
export async function executeGraph(
  eventId: string,
  config: BrainConfig
): Promise<BrainState> {
  let state = createInitialState(eventId);

  logger.info('Starting graph execution', { eventId });

  try {
    // Walk the graph
    let currentNodeName = 'START';

    while (currentNodeName !== 'finalize' && currentNodeName !== 'handle_error') {
      // Find the edge from current node
      const edge = graphEdges.find((e) => e.from === currentNodeName);

      if (!edge) {
        throw new Error(`No edge from node: ${currentNodeName}`);
      }

      // Determine next node
      const nextNodeName =
        typeof edge.to === 'function' ? edge.to(state) : edge.to;

      // Execute next node if it exists
      if (nextNodeName !== 'finalize' && graphNodes[nextNodeName]) {
        try {
          const updates = await graphNodes[nextNodeName](state, config);
          state = { ...state, ...updates };
        } catch (error) {
          state.error = error instanceof Error ? error : new Error(String(error));
          currentNodeName = 'handle_error';
          continue;
        }
      }

      currentNodeName = nextNodeName;
    }

    // Execute final node
    if (currentNodeName === 'finalize') {
      const updates = await finalizeNode(state, config);
      state = { ...state, ...updates };
    } else if (currentNodeName === 'handle_error') {
      const updates = await handleErrorNode(state, config);
      state = { ...state, ...updates };
    }

    logger.info('Graph execution completed', {
      eventId,
      success: !state.error,
      duration: (state.endTime || Date.now()) - state.startTime,
    });

    return state;

  } catch (error) {
    logger.error('Graph execution failed', { eventId, error });
    state.error = error instanceof Error ? error : new Error(String(error));
    state.endTime = Date.now();
    return state;
  }
}

/**
 * Convert graph state to ProcessingResult.
 */
export function stateToResult(state: BrainState): ProcessingResult {
  return {
    success: !state.error,
    eventId: state.eventId,
    jobId: generateId('job'),
    embeddings: state.embeddings,
    graphUpdates: state.graphResults?.nodesCreated || 0,
    promptCreated: !!state.promptRequired,
    error: state.error?.message,
    retryCount: state.retryCount,
  };
}
