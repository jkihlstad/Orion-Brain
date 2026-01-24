/**
 * Vectorization Pipeline
 *
 * Main orchestrator that processes events through the full vectorization flow:
 * 1. Load embedding policy
 * 2. Build CFD from raw event
 * 3. Generate embeddings
 * 4. Store in LanceDB
 * 5. Link entities in Neo4j
 * 6. Track coverage metrics
 *
 * @version 1.0.0
 */

import type { Env } from '../env';
import type { RawEvent } from '../types/rawEvent';
import {
  buildCFD,
  shouldVectorize,
  type CanonicalFeatureDocument,
  type EmbeddingPolicyConfig,
} from './cfd';
import {
  generateAllEmbeddings,
  createPlaceholderEmbedding,
  type GeneratedEmbedding,
} from './embed';
import {
  createVectorStorage,
  toVectorEventRow,
  type VectorStorage,
  type VectorEventRow,
  type VectorSearchFilters,
} from './vectorStorage';
import {
  createEntityLinker,
  type EntityLinker,
  type EntityLinkingResult,
} from './entityLinker';

// =============================================================================
// TYPES
// =============================================================================

/**
 * Result of vectorizing a single event.
 */
export interface VectorizeResult {
  /** Event ID */
  eventId: string;

  /** Whether vectorization was successful */
  success: boolean;

  /** Whether event was skipped (disabled by policy) */
  skipped: boolean;

  /** Error message if failed */
  error?: string;

  /** Number of embeddings generated */
  embeddingsGenerated: number;

  /** Number of rows written to LanceDB */
  rowsWritten: number;

  /** Number of entities linked in Neo4j */
  entitiesLinked: number;

  /** Processing time in ms */
  processingTimeMs: number;

  /** CFD generated (for debugging) */
  cfd?: CanonicalFeatureDocument;

  /** Entity linking result (if entities were present) */
  entityLinkingResult?: EntityLinkingResult;
}

/**
 * Result of batch vectorization.
 */
export interface BatchVectorizeResult {
  /** Total events processed */
  totalProcessed: number;

  /** Successfully vectorized */
  succeeded: number;

  /** Skipped (disabled by policy) */
  skipped: number;

  /** Failed */
  failed: number;

  /** Individual results */
  results: VectorizeResult[];

  /** Total processing time in ms */
  totalProcessingTimeMs: number;
}

/**
 * Vector coverage metrics.
 */
export interface VectorCoverageMetrics {
  /** Total events in system */
  totalEvents: number;

  /** Events with vectors */
  vectorizedEvents: number;

  /** Coverage percentage */
  coveragePercent: number;

  /** Events pending vectorization */
  pendingEvents: number;

  /** Events that failed vectorization */
  failedEvents: number;

  /** By event type */
  byEventType: Record<string, {
    total: number;
    vectorized: number;
    coverage: number;
  }>;

  /** Last updated */
  lastUpdatedAt: number;
}

// =============================================================================
// PIPELINE IMPLEMENTATION
// =============================================================================

// Default embedding policy (fallback)
const DEFAULT_EMBEDDING_POLICY: EmbeddingPolicyConfig = {
  version: '2026-01-24',
  globalRedactKeys: [
    'password', 'secret', 'apiKey', 'accessToken', 'refreshToken',
    'ssn', 'cardNumber', 'cvv', 'routingNumber', 'accountNumber',
  ],
  defaultPolicy: {
    embedTextFields: ['payloadPreview'],
    embedStructuredFields: ['eventType', 'sourceApp', 'domain'],
    redactFields: [],
    entityRefPaths: [],
    modalityHint: 'text',
    enabled: true,
  },
  policies: {},
};

/**
 * Load embedding policy from suite-contracts or use default.
 * In production, this would fetch from a remote source or local file.
 */
async function loadEmbeddingPolicy(_env: Env): Promise<EmbeddingPolicyConfig> {
  // TODO: Load from suite-contracts or environment
  // For now, return default policy
  return DEFAULT_EMBEDDING_POLICY;
}

/**
 * Vectorization Pipeline class.
 */
export class VectorizationPipeline {
  private env: Env;
  private storage: VectorStorage;
  private entityLinker: EntityLinker;
  private policyConfig: EmbeddingPolicyConfig | null = null;

  constructor(env: Env) {
    this.env = env;
    this.storage = createVectorStorage(env);
    this.entityLinker = createEntityLinker(env);
  }

  /**
   * Initialize the pipeline (load policy).
   */
  async initialize(): Promise<void> {
    this.policyConfig = await loadEmbeddingPolicy(this.env);
    console.log(`[VectorizePipeline] Initialized with policy v${this.policyConfig.version}`);
  }

  /**
   * Get the current policy config.
   */
  getPolicy(): EmbeddingPolicyConfig {
    if (!this.policyConfig) {
      throw new Error('Pipeline not initialized. Call initialize() first.');
    }
    return this.policyConfig;
  }

  /**
   * Vectorize a single event.
   */
  async vectorizeEvent(event: RawEvent): Promise<VectorizeResult> {
    const startTime = Date.now();

    if (!this.policyConfig) {
      await this.initialize();
    }

    const policy = this.policyConfig!;

    // Check if event should be vectorized
    if (!shouldVectorize(event.eventType, policy)) {
      return {
        eventId: event.eventId,
        success: true,
        skipped: true,
        embeddingsGenerated: 0,
        rowsWritten: 0,
        entitiesLinked: 0,
        processingTimeMs: Date.now() - startTime,
      };
    }

    try {
      // Step 1: Build CFD
      const cfd = buildCFD(event, policy);

      // Step 2: Check if already vectorized (idempotency)
      const alreadyVectorized = await this.storage.hasVector(event.eventId);
      if (alreadyVectorized) {
        console.log(`[VectorizePipeline] Event ${event.eventId} already vectorized, skipping`);
        return {
          eventId: event.eventId,
          success: true,
          skipped: true,
          embeddingsGenerated: 0,
          rowsWritten: 0,
          entitiesLinked: 0,
          processingTimeMs: Date.now() - startTime,
          cfd,
        };
      }

      // Step 3: Generate embeddings
      let embeddings: GeneratedEmbedding[];
      try {
        embeddings = await generateAllEmbeddings(this.env, cfd);
      } catch (embedError) {
        // Create placeholder on embedding failure
        console.error(`[VectorizePipeline] Embedding failed for ${event.eventId}:`, embedError);
        const reason = embedError instanceof Error ? embedError.message : 'Unknown error';
        embeddings = [createPlaceholderEmbedding(event.eventId, reason)];
      }

      // Step 4: Convert to storage rows
      const rows: VectorEventRow[] = embeddings.map(emb => toVectorEventRow(cfd, emb));

      // Step 5: Write to storage
      const writeResult = await this.storage.writeRows(rows);

      // Step 6: Link entities in Neo4j graph
      let entityLinkingResult: EntityLinkingResult | undefined;
      if (cfd.entityRefs.length > 0) {
        try {
          entityLinkingResult = await this.entityLinker.linkEntities(cfd);
        } catch (linkError) {
          console.error(`[VectorizePipeline] Entity linking failed for ${event.eventId}:`, linkError);
          // Don't fail the whole operation for entity linking errors
        }
      }

      console.log(`[VectorizePipeline] Vectorized ${event.eventId}: ` +
        `${writeResult.written} written, ${writeResult.skipped} skipped, ` +
        `${entityLinkingResult?.entitiesProcessed || 0} entities linked`);

      const result: VectorizeResult = {
        eventId: event.eventId,
        success: true,
        skipped: false,
        embeddingsGenerated: embeddings.length,
        rowsWritten: writeResult.written,
        entitiesLinked: entityLinkingResult?.entitiesProcessed || 0,
        processingTimeMs: Date.now() - startTime,
        cfd,
      };

      if (entityLinkingResult) {
        result.entityLinkingResult = entityLinkingResult;
      }

      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error(`[VectorizePipeline] Failed to vectorize ${event.eventId}:`, error);

      return {
        eventId: event.eventId,
        success: false,
        skipped: false,
        error: message,
        embeddingsGenerated: 0,
        rowsWritten: 0,
        entitiesLinked: 0,
        processingTimeMs: Date.now() - startTime,
      };
    }
  }

  /**
   * Vectorize a batch of events.
   */
  async vectorizeBatch(events: RawEvent[]): Promise<BatchVectorizeResult> {
    const startTime = Date.now();
    const results: VectorizeResult[] = [];

    let succeeded = 0;
    let skipped = 0;
    let failed = 0;

    for (const event of events) {
      const result = await this.vectorizeEvent(event);
      results.push(result);

      if (result.skipped) {
        skipped++;
      } else if (result.success) {
        succeeded++;
      } else {
        failed++;
      }
    }

    return {
      totalProcessed: events.length,
      succeeded,
      skipped,
      failed,
      results,
      totalProcessingTimeMs: Date.now() - startTime,
    };
  }

  /**
   * Get vector coverage metrics.
   */
  async getCoverageMetrics(): Promise<VectorCoverageMetrics> {
    const stats = await this.storage.getCoverageStats();

    // Calculate coverage by event type
    const byEventType: Record<string, { total: number; vectorized: number; coverage: number }> = {};
    for (const [eventType, count] of Object.entries(stats.byEventType)) {
      // Note: In production, we'd compare against total events in Convex
      byEventType[eventType] = {
        total: count, // Placeholder - would need Convex data
        vectorized: count,
        coverage: 100, // Placeholder
      };
    }

    return {
      totalEvents: stats.totalRows, // Placeholder
      vectorizedEvents: stats.totalRows,
      coveragePercent: 100, // Placeholder - would calculate properly
      pendingEvents: 0, // Placeholder
      failedEvents: 0, // Placeholder
      byEventType,
      lastUpdatedAt: Date.now(),
    };
  }

  /**
   * Search for similar events.
   */
  async searchSimilar(
    queryText: string,
    filters?: {
      userId?: string;
      eventTypes?: string[];
      domains?: string[];
      privacyScope?: 'private' | 'social' | 'public';
    },
    limit: number = 20
  ): Promise<Array<{
    eventId: string;
    eventType: string;
    similarity: number;
    textSummary: string;
    keywords: string[];
  }>> {
    // Generate embedding for query using OpenRouter
    const openRouterApiKey = this.env.OPENROUTER_API_KEY;
    const openRouterBaseUrl = this.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1';

    const response = await fetch(`${openRouterBaseUrl}/embeddings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${openRouterApiKey}`,
        'HTTP-Referer': 'https://orion.suite',
        'X-Title': 'Orion Brain Search',
      },
      body: JSON.stringify({
        model: 'openai/text-embedding-3-small',
        input: queryText,
      }),
    });

    if (!response.ok) {
      throw new Error(`Query embedding failed: ${response.status}`);
    }

    const data = await response.json() as { data: Array<{ embedding: number[] }> };
    const queryVector = data.data?.[0]?.embedding;

    if (!queryVector) {
      throw new Error('No query embedding returned');
    }

    // Build search filters, only including defined values
    const searchFilters: VectorSearchFilters = {
      embeddingView: 'content',
    };
    if (filters?.userId) searchFilters.userId = filters.userId;
    if (filters?.eventTypes) searchFilters.eventTypes = filters.eventTypes;
    if (filters?.domains) searchFilters.domains = filters.domains;
    if (filters?.privacyScope) searchFilters.privacyScope = filters.privacyScope;

    // Search storage
    const results = await this.storage.searchSimilar(
      queryVector,
      searchFilters,
      limit
    );

    return results.map(r => ({
      eventId: r.row.eventId,
      eventType: r.row.eventType,
      similarity: r.similarity,
      textSummary: r.row.textSummary,
      keywords: JSON.parse(r.row.keywordsJson) as string[],
    }));
  }
}

/**
 * Create a vectorization pipeline instance.
 */
export function createVectorizationPipeline(env: Env): VectorizationPipeline {
  return new VectorizationPipeline(env);
}
