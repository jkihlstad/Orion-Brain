/**
 * Vector Storage for LanceDB
 *
 * Stores event embeddings in LanceDB vectors_events table.
 * Supports idempotent upserts keyed by eventId + embeddingView.
 *
 * @version 1.0.0
 */

import type { Env } from '../env';
import type { CanonicalFeatureDocument } from './cfd';
import type { GeneratedEmbedding, EmbeddingView } from './embed';

// =============================================================================
// TYPES
// =============================================================================

/**
 * Row in the vectors_events LanceDB table.
 */
export interface VectorEventRow {
  /** Unique row ID: eventId + '_' + embeddingView */
  id: string;

  /** Original event ID */
  eventId: string;

  /** User ID (Clerk) */
  userId: string;

  /** Event type */
  eventType: string;

  /** Event timestamp in ms */
  timestampMs: number;

  /** Embedding view type */
  embeddingView: EmbeddingView;

  /** The embedding vector */
  vector: number[];

  /** Text that was embedded */
  textSummary: string;

  /** Keywords as JSON string */
  keywordsJson: string;

  /** Facets as JSON string */
  facetsJson: string;

  /** Privacy scope */
  privacyScope: 'private' | 'social' | 'public';

  /** Source refs as JSON string */
  sourceRefsJson: string;

  /** Entity refs as JSON string */
  entityRefsJson: string;

  /** Domain (from eventType) */
  domain: string;

  /** Source app */
  sourceApp: string;

  /** Modality hint */
  modality: string;

  /** Row creation timestamp */
  createdAt: number;

  /** Last update timestamp */
  updatedAt: number;

  /** Schema version */
  schemaVersion: string;
}

/**
 * Search result from vector query.
 */
export interface VectorSearchResult {
  /** The matched row */
  row: VectorEventRow;

  /** Similarity score (0-1) */
  similarity: number;

  /** Distance metric */
  distance: number;
}

/**
 * Search filters.
 */
export interface VectorSearchFilters {
  /** Filter by user ID */
  userId?: string;

  /** Filter by event types */
  eventTypes?: string[];

  /** Filter by domains */
  domains?: string[];

  /** Filter by privacy scope */
  privacyScope?: 'private' | 'social' | 'public';

  /** Filter by time range (start) */
  timestampMsGte?: number;

  /** Filter by time range (end) */
  timestampMsLte?: number;

  /** Filter by embedding view */
  embeddingView?: EmbeddingView;
}

/**
 * Write result for batch operations.
 */
export interface VectorWriteResult {
  /** Number of rows written */
  written: number;

  /** Number of duplicates skipped */
  skipped: number;

  /** Any errors encountered */
  errors: Array<{ id: string; error: string }>;
}

// =============================================================================
// LANCEDB TABLE SCHEMA
// =============================================================================

export const VECTORS_EVENTS_TABLE = 'vectors_events';
export const VECTOR_DIMENSIONS = 1536;

/**
 * Schema definition for vectors_events table.
 */
export const VECTORS_EVENTS_SCHEMA = {
  tableName: VECTORS_EVENTS_TABLE,
  vectorColumn: 'vector',
  vectorDimensions: VECTOR_DIMENSIONS,
  indexableColumns: [
    'eventId',
    'userId',
    'eventType',
    'domain',
    'sourceApp',
    'privacyScope',
    'embeddingView',
    'timestampMs',
    'createdAt',
  ],
};

// =============================================================================
// STORAGE OPERATIONS
// =============================================================================

/**
 * Build row ID from eventId and view.
 */
function buildRowId(eventId: string, view: EmbeddingView): string {
  return `${eventId}_${view}`;
}

/**
 * Convert CFD + embedding to storage row.
 */
export function toVectorEventRow(
  cfd: CanonicalFeatureDocument,
  embedding: GeneratedEmbedding
): VectorEventRow {
  const now = Date.now();

  return {
    id: buildRowId(cfd.eventId, embedding.view),
    eventId: cfd.eventId,
    userId: cfd.userId,
    eventType: cfd.eventType,
    timestampMs: cfd.timestampMs,
    embeddingView: embedding.view,
    vector: embedding.vector,
    textSummary: embedding.embeddedText,
    keywordsJson: JSON.stringify(cfd.keywords),
    facetsJson: JSON.stringify(cfd.facets),
    privacyScope: cfd.privacyScope,
    sourceRefsJson: JSON.stringify(cfd.sourceRefs),
    entityRefsJson: JSON.stringify(cfd.entityRefs),
    domain: cfd.domain,
    sourceApp: cfd.sourceApp,
    modality: cfd.modality,
    createdAt: now,
    updatedAt: now,
    schemaVersion: cfd.schemaVersion,
  };
}

/**
 * Build SQL WHERE clause from filters.
 * Note: Reserved for future LanceDB SQL query implementation.
 */
function _buildFilterClause(filters: VectorSearchFilters): string {
  const conditions: string[] = [];

  if (filters.userId) {
    conditions.push(`userId = '${filters.userId}'`);
  }

  if (filters.eventTypes && filters.eventTypes.length > 0) {
    const types = filters.eventTypes.map(t => `'${t}'`).join(', ');
    conditions.push(`eventType IN (${types})`);
  }

  if (filters.domains && filters.domains.length > 0) {
    const domains = filters.domains.map(d => `'${d}'`).join(', ');
    conditions.push(`domain IN (${domains})`);
  }

  if (filters.privacyScope) {
    conditions.push(`privacyScope = '${filters.privacyScope}'`);
  }

  if (filters.timestampMsGte !== undefined) {
    conditions.push(`timestampMs >= ${filters.timestampMsGte}`);
  }

  if (filters.timestampMsLte !== undefined) {
    conditions.push(`timestampMs <= ${filters.timestampMsLte}`);
  }

  if (filters.embeddingView) {
    conditions.push(`embeddingView = '${filters.embeddingView}'`);
  }

  return conditions.length > 0 ? conditions.join(' AND ') : '';
}

// Export for future LanceDB SQL query implementation
export { _buildFilterClause as buildFilterClause };

/**
 * LanceDB Vector Storage Client.
 *
 * In production, this would use the actual LanceDB SDK.
 * Currently implements the interface for integration testing.
 */
export class VectorStorage {
  // In-memory storage for development/testing
  private rows: Map<string, VectorEventRow> = new Map();

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  constructor(_env: Env) {
    // LanceDB URI will be used from env in production
  }

  /**
   * Write a single vector row (idempotent upsert).
   */
  async writeRow(row: VectorEventRow): Promise<boolean> {
    // Check for existing row (idempotency)
    const existing = this.rows.get(row.id);
    if (existing) {
      // Update timestamp only
      existing.updatedAt = Date.now();
      console.log(`[VectorStorage] Updated existing row: ${row.id}`);
      return false; // Not a new write
    }

    // Insert new row
    this.rows.set(row.id, row);
    console.log(`[VectorStorage] Inserted new row: ${row.id}`);
    return true;
  }

  /**
   * Write multiple vector rows.
   */
  async writeRows(rows: VectorEventRow[]): Promise<VectorWriteResult> {
    const result: VectorWriteResult = {
      written: 0,
      skipped: 0,
      errors: [],
    };

    for (const row of rows) {
      try {
        const isNew = await this.writeRow(row);
        if (isNew) {
          result.written++;
        } else {
          result.skipped++;
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        result.errors.push({ id: row.id, error: message });
      }
    }

    return result;
  }

  /**
   * Search vectors by similarity.
   */
  async searchSimilar(
    queryVector: number[],
    filters: VectorSearchFilters,
    limit: number = 20
  ): Promise<VectorSearchResult[]> {
    // Get all rows that match filters
    const matchingRows: VectorEventRow[] = [];

    for (const row of this.rows.values()) {
      if (this.matchesFilters(row, filters)) {
        matchingRows.push(row);
      }
    }

    // Calculate similarity scores
    const scored = matchingRows.map(row => ({
      row,
      similarity: this.cosineSimilarity(queryVector, row.vector),
      distance: this.euclideanDistance(queryVector, row.vector),
    }));

    // Sort by similarity (descending) and take top N
    scored.sort((a, b) => b.similarity - a.similarity);
    return scored.slice(0, limit);
  }

  /**
   * Get row by ID.
   */
  async getById(id: string): Promise<VectorEventRow | null> {
    return this.rows.get(id) || null;
  }

  /**
   * Get rows by event ID (all views).
   */
  async getByEventId(eventId: string): Promise<VectorEventRow[]> {
    const results: VectorEventRow[] = [];

    for (const row of this.rows.values()) {
      if (row.eventId === eventId) {
        results.push(row);
      }
    }

    return results;
  }

  /**
   * Check if event has been vectorized.
   */
  async hasVector(eventId: string, view: EmbeddingView = 'content'): Promise<boolean> {
    const id = buildRowId(eventId, view);
    return this.rows.has(id);
  }

  /**
   * Get total row count.
   */
  async getRowCount(): Promise<number> {
    return this.rows.size;
  }

  /**
   * Get coverage statistics.
   */
  async getCoverageStats(): Promise<{
    totalRows: number;
    byEventType: Record<string, number>;
    byView: Record<string, number>;
    byDomain: Record<string, number>;
  }> {
    const byEventType: Record<string, number> = {};
    const byView: Record<string, number> = {};
    const byDomain: Record<string, number> = {};

    for (const row of this.rows.values()) {
      byEventType[row.eventType] = (byEventType[row.eventType] || 0) + 1;
      byView[row.embeddingView] = (byView[row.embeddingView] || 0) + 1;
      byDomain[row.domain] = (byDomain[row.domain] || 0) + 1;
    }

    return {
      totalRows: this.rows.size,
      byEventType,
      byView,
      byDomain,
    };
  }

  // ==========================================================================
  // PRIVATE HELPERS
  // ==========================================================================

  private matchesFilters(row: VectorEventRow, filters: VectorSearchFilters): boolean {
    if (filters.userId && row.userId !== filters.userId) return false;
    if (filters.eventTypes && !filters.eventTypes.includes(row.eventType)) return false;
    if (filters.domains && !filters.domains.includes(row.domain)) return false;
    if (filters.privacyScope && row.privacyScope !== filters.privacyScope) return false;
    if (filters.timestampMsGte !== undefined && row.timestampMs < filters.timestampMsGte) return false;
    if (filters.timestampMsLte !== undefined && row.timestampMs > filters.timestampMsLte) return false;
    if (filters.embeddingView && row.embeddingView !== filters.embeddingView) return false;
    return true;
  }

  private cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) return 0;

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i]! * b[i]!;
      normA += a[i]! * a[i]!;
      normB += b[i]! * b[i]!;
    }

    const denominator = Math.sqrt(normA) * Math.sqrt(normB);
    if (denominator === 0) return 0;

    return dotProduct / denominator;
  }

  private euclideanDistance(a: number[], b: number[]): number {
    if (a.length !== b.length) return Infinity;

    let sum = 0;
    for (let i = 0; i < a.length; i++) {
      const diff = a[i]! - b[i]!;
      sum += diff * diff;
    }

    return Math.sqrt(sum);
  }
}

/**
 * Create a VectorStorage instance.
 */
export function createVectorStorage(env: Env): VectorStorage {
  return new VectorStorage(env);
}
