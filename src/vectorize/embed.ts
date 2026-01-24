/**
 * Embedding Generator for CFDs
 *
 * Generates vector embeddings from Canonical Feature Documents.
 * Supports multiple embedding views:
 * - content_embedding: Text summary + keywords
 * - entity_embedding: Entity references
 *
 * @version 1.0.0
 */

import type { Env } from '../env';
import type { CanonicalFeatureDocument } from './cfd';

// =============================================================================
// TYPES
// =============================================================================

/**
 * Embedding view types.
 */
export type EmbeddingView = 'content' | 'entity';

/**
 * Generated embedding with metadata.
 */
export interface GeneratedEmbedding {
  /** Original event ID */
  eventId: string;

  /** Embedding view type */
  view: EmbeddingView;

  /** The embedding vector (1536 dimensions for text-embedding-3-small) */
  vector: number[];

  /** Text that was embedded */
  embeddedText: string;

  /** Embedding model used */
  model: string;

  /** Vector dimension count */
  dimensions: number;

  /** Generation timestamp */
  generatedAt: number;
}

/**
 * Batch embedding result.
 */
export interface EmbeddingBatchResult {
  /** Successfully generated embeddings */
  embeddings: GeneratedEmbedding[];

  /** Event IDs that failed */
  failed: Array<{ eventId: string; error: string }>;

  /** Total processing time in ms */
  processingTimeMs: number;
}

// =============================================================================
// CONFIGURATION
// =============================================================================

const EMBEDDING_CONFIG = {
  model: 'openai/text-embedding-3-small',
  dimensions: 1536,
  maxInputLength: 8000, // Characters
  maxBatchSize: 100,
};

// =============================================================================
// EMBEDDING GENERATION
// =============================================================================

/**
 * Generate embedding for a single text input.
 */
async function generateEmbedding(
  env: Env,
  text: string
): Promise<number[]> {
  const openRouterApiKey = env.OPENROUTER_API_KEY;
  const openRouterBaseUrl = env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1';

  // Truncate text if too long
  const truncatedText = text.length > EMBEDDING_CONFIG.maxInputLength
    ? text.slice(0, EMBEDDING_CONFIG.maxInputLength)
    : text;

  const response = await fetch(`${openRouterBaseUrl}/embeddings`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${openRouterApiKey}`,
      'HTTP-Referer': 'https://orion.suite',
      'X-Title': 'Orion Brain Vectorization',
    },
    body: JSON.stringify({
      model: EMBEDDING_CONFIG.model,
      input: truncatedText,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Embedding generation failed: ${response.status} - ${error}`);
  }

  const data = await response.json() as {
    data: Array<{ embedding: number[] }>;
  };

  const embedding = data.data?.[0]?.embedding;
  if (!embedding || !Array.isArray(embedding)) {
    throw new Error('No embedding returned from API');
  }

  return embedding;
}

/**
 * Build text for content embedding from CFD.
 */
function buildContentEmbeddingText(cfd: CanonicalFeatureDocument): string {
  const parts: string[] = [];

  // Event type provides context
  parts.push(`[${cfd.eventType}]`);

  // Main text summary
  if (cfd.textSummary) {
    parts.push(cfd.textSummary);
  }

  // Keywords
  if (cfd.keywords.length > 0) {
    parts.push(`Keywords: ${cfd.keywords.join(', ')}`);
  }

  // Facet categories
  if (cfd.facets.categories) {
    const cats = Object.entries(cfd.facets.categories)
      .map(([k, v]) => `${k}:${v}`)
      .join(', ');
    parts.push(`Categories: ${cats}`);
  }

  return parts.join(' | ');
}

/**
 * Build text for entity embedding from CFD.
 */
function buildEntityEmbeddingText(cfd: CanonicalFeatureDocument): string {
  if (cfd.entityRefs.length === 0) {
    return '';
  }

  const entityParts = cfd.entityRefs.map(ref => `${ref.type}:${ref.id}`);
  return `Entities: ${entityParts.join(', ')}`;
}

/**
 * Generate content embedding for a CFD.
 */
export async function generateContentEmbedding(
  env: Env,
  cfd: CanonicalFeatureDocument
): Promise<GeneratedEmbedding> {
  const text = buildContentEmbeddingText(cfd);

  if (!text || text.length < 5) {
    throw new Error(`Insufficient text for embedding: eventId=${cfd.eventId}`);
  }

  const vector = await generateEmbedding(env, text);

  return {
    eventId: cfd.eventId,
    view: 'content',
    vector,
    embeddedText: text,
    model: EMBEDDING_CONFIG.model,
    dimensions: EMBEDDING_CONFIG.dimensions,
    generatedAt: Date.now(),
  };
}

/**
 * Generate entity embedding for a CFD (optional, only if entities exist).
 */
export async function generateEntityEmbedding(
  env: Env,
  cfd: CanonicalFeatureDocument
): Promise<GeneratedEmbedding | null> {
  const text = buildEntityEmbeddingText(cfd);

  if (!text || text.length < 5) {
    return null; // No entity embedding needed
  }

  const vector = await generateEmbedding(env, text);

  return {
    eventId: cfd.eventId,
    view: 'entity',
    vector,
    embeddedText: text,
    model: EMBEDDING_CONFIG.model,
    dimensions: EMBEDDING_CONFIG.dimensions,
    generatedAt: Date.now(),
  };
}

/**
 * Generate all embeddings for a CFD.
 */
export async function generateAllEmbeddings(
  env: Env,
  cfd: CanonicalFeatureDocument
): Promise<GeneratedEmbedding[]> {
  const embeddings: GeneratedEmbedding[] = [];

  // Always generate content embedding
  try {
    const contentEmbed = await generateContentEmbedding(env, cfd);
    embeddings.push(contentEmbed);
  } catch (error) {
    console.error(`[Embed] Content embedding failed for ${cfd.eventId}:`, error);
    throw error;
  }

  // Optionally generate entity embedding
  try {
    const entityEmbed = await generateEntityEmbedding(env, cfd);
    if (entityEmbed) {
      embeddings.push(entityEmbed);
    }
  } catch (error) {
    // Entity embedding is optional, log but don't fail
    console.warn(`[Embed] Entity embedding failed for ${cfd.eventId}:`, error);
  }

  return embeddings;
}

/**
 * Process a batch of CFDs and generate embeddings.
 */
export async function generateEmbeddingsBatch(
  env: Env,
  cfds: CanonicalFeatureDocument[]
): Promise<EmbeddingBatchResult> {
  const startTime = Date.now();
  const embeddings: GeneratedEmbedding[] = [];
  const failed: Array<{ eventId: string; error: string }> = [];

  // Process in batches to avoid rate limits
  const batchSize = Math.min(cfds.length, EMBEDDING_CONFIG.maxBatchSize);

  for (let i = 0; i < cfds.length; i += batchSize) {
    const batch = cfds.slice(i, i + batchSize);

    // Process batch concurrently (but limited)
    const promises = batch.map(async (cfd) => {
      try {
        const embeds = await generateAllEmbeddings(env, cfd);
        return { success: true as const, eventId: cfd.eventId, embeds };
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        return { success: false as const, eventId: cfd.eventId, error: message };
      }
    });

    const results = await Promise.all(promises);

    for (const result of results) {
      if (result.success) {
        embeddings.push(...result.embeds);
      } else {
        failed.push({ eventId: result.eventId, error: result.error });
      }
    }
  }

  return {
    embeddings,
    failed,
    processingTimeMs: Date.now() - startTime,
  };
}

/**
 * Create a placeholder embedding for events that cannot be processed.
 * This ensures 100% coverage even for failed events.
 */
export function createPlaceholderEmbedding(
  eventId: string,
  reason: string
): GeneratedEmbedding {
  // Create zero vector as placeholder
  const zeroVector = new Array(EMBEDDING_CONFIG.dimensions).fill(0);

  return {
    eventId,
    view: 'content',
    vector: zeroVector,
    embeddedText: `[PLACEHOLDER: ${reason}]`,
    model: 'placeholder',
    dimensions: EMBEDDING_CONFIG.dimensions,
    generatedAt: Date.now(),
  };
}

// Export config for testing
export { EMBEDDING_CONFIG };
