/**
 * Canonical Feature Document (CFD) Builder
 *
 * Transforms raw events into a normalized document format for vectorization.
 * Uses embedding-policy.json from suite-contracts to determine:
 * - Which fields to embed
 * - Which fields to redact
 * - Entity references for graph linking
 *
 * @version 1.0.0
 */

import type { RawEvent } from '../types/rawEvent';

// =============================================================================
// TYPES
// =============================================================================

/**
 * Modality types for different content kinds.
 */
export type Modality = 'text' | 'structured' | 'audio' | 'video' | 'image';

/**
 * Entity reference extracted from event for graph linking.
 */
export interface EntityRef {
  /** Entity type (e.g., 'merchant', 'contact', 'task') */
  type: string;
  /** Entity identifier */
  id: string;
  /** Original field path where this was found */
  sourcePath: string;
}

/**
 * Facets are normalized structured features.
 */
export interface Facets {
  /** Numeric amounts (e.g., transaction amounts, durations) */
  amounts?: Record<string, number>;
  /** Categorical values (e.g., transaction type, priority) */
  categories?: Record<string, string>;
  /** Temporal values as ISO strings */
  timestamps?: Record<string, string>;
  /** Location-related facets */
  locations?: Record<string, string>;
  /** Count facets */
  counts?: Record<string, number>;
}

/**
 * Canonical Feature Document - the normalized representation of any event.
 */
export interface CanonicalFeatureDocument {
  /** Original event ID */
  eventId: string;

  /** Event type from registry */
  eventType: string;

  /** Event timestamp in milliseconds */
  timestampMs: number;

  /** User ID (Clerk) */
  userId: string;

  /** Privacy scope */
  privacyScope: 'private' | 'social' | 'public';

  /** Consent version */
  consentVersion: string;

  /** Source app */
  sourceApp: string;

  /** Domain (derived from eventType) */
  domain: string;

  /** Entity references for graph linking */
  entityRefs: EntityRef[];

  /** Primary modality hint */
  modality: Modality;

  /** Text summary for embedding (ALWAYS present, may be empty) */
  textSummary: string;

  /** Extracted keywords */
  keywords: string[];

  /** Normalized structured facets */
  facets: Facets;

  /** References to external data (R2 keys, blob refs) */
  sourceRefs: string[];

  /** Idempotency/dedup key */
  dedupeKey: string;

  /** Trace ID for debugging */
  traceId: string;

  /** CFD generation timestamp */
  generatedAt: number;

  /** Schema version of CFD */
  schemaVersion: string;
}

/**
 * Embedding policy for a single event type.
 */
export interface EmbeddingPolicy {
  embedTextFields: string[];
  embedStructuredFields: string[];
  redactFields: string[];
  entityRefPaths: string[];
  modalityHint: Modality;
  enabled: boolean;
  notes?: string;
}

/**
 * Full embedding policy configuration.
 */
export interface EmbeddingPolicyConfig {
  version: string;
  globalRedactKeys: string[];
  defaultPolicy: EmbeddingPolicy;
  policies: Record<string, EmbeddingPolicy>;
}

// =============================================================================
// CFD BUILDER
// =============================================================================

const CFD_SCHEMA_VERSION = '1.0.0';

/**
 * Get value from nested path in object.
 * Supports dot notation: "payload.merchant.name"
 */
function getNestedValue(obj: unknown, path: string): unknown {
  if (!obj || typeof obj !== 'object') return undefined;

  const parts = path.split('.');
  let current: unknown = obj;

  for (const part of parts) {
    if (current === null || current === undefined) return undefined;
    if (typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[part];
  }

  return current;
}

/**
 * Extract text value from path, handling various types.
 */
function extractTextValue(obj: unknown, path: string): string {
  const value = getNestedValue(obj, path);

  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return String(value);
  if (typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) {
    return value
      .filter(v => typeof v === 'string' || typeof v === 'number')
      .join(', ');
  }

  return '';
}

/**
 * Extract keywords from text using simple tokenization.
 */
function extractKeywords(text: string): string[] {
  if (!text) return [];

  // Tokenize and filter
  const words = text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(word => word.length > 2 && word.length < 30);

  // Remove common stop words
  const stopWords = new Set([
    'the', 'and', 'for', 'are', 'but', 'not', 'you', 'all', 'can',
    'had', 'her', 'was', 'one', 'our', 'out', 'has', 'have', 'been',
    'will', 'your', 'from', 'they', 'been', 'have', 'were', 'said',
    'each', 'which', 'their', 'there', 'what', 'about', 'would', 'this',
    'with', 'that', 'into', 'than', 'them', 'then', 'some', 'could'
  ]);

  const filtered = words.filter(w => !stopWords.has(w));

  // Dedupe and return top keywords
  return [...new Set(filtered)].slice(0, 20);
}

/**
 * Build text summary from configured fields.
 */
function buildTextSummary(
  event: RawEvent,
  policy: EmbeddingPolicy
): string {
  const parts: string[] = [];

  for (const path of policy.embedTextFields) {
    const value = extractTextValue(event, path);
    if (value) {
      parts.push(value);
    }
  }

  // For structured-only events, create deterministic text from structured fields
  if (parts.length === 0 && policy.modalityHint === 'structured') {
    const structuredParts: string[] = [];
    for (const path of policy.embedStructuredFields) {
      const value = getNestedValue(event, path);
      if (value !== null && value !== undefined) {
        const fieldName = path.split('.').pop() || path;
        structuredParts.push(`${fieldName}: ${JSON.stringify(value)}`);
      }
    }
    return structuredParts.join('; ');
  }

  return parts.join(' | ');
}

/**
 * Extract entity references from configured paths.
 */
function extractEntityRefs(
  event: RawEvent,
  policy: EmbeddingPolicy
): EntityRef[] {
  const refs: EntityRef[] = [];

  for (const path of policy.entityRefPaths) {
    const value = getNestedValue(event, path);
    if (!value) continue;

    // Infer entity type from path
    const fieldName = path.split('.').pop() || path;
    const entityType = inferEntityType(fieldName);

    if (Array.isArray(value)) {
      for (const item of value) {
        if (typeof item === 'string') {
          refs.push({ type: entityType, id: item, sourcePath: path });
        }
      }
    } else if (typeof value === 'string') {
      refs.push({ type: entityType, id: value, sourcePath: path });
    }
  }

  return refs;
}

/**
 * Infer entity type from field name.
 */
function inferEntityType(fieldName: string): string {
  const mappings: Record<string, string> = {
    merchantId: 'merchant',
    contactId: 'contact',
    taskId: 'task',
    projectId: 'project',
    calendarId: 'calendar',
    eventId: 'calendarEvent',
    threadId: 'thread',
    messageId: 'message',
    accountId: 'account',
    businessId: 'business',
    offeringId: 'offering',
    budgetId: 'budget',
    goalId: 'goal',
    transactionId: 'transaction',
    host: 'domain',
    urlHost: 'domain',
    targetHost: 'domain',
    sourceHost: 'domain',
    fromDomain: 'domain',
    toDomains: 'domain',
    tags: 'tag',
    placeId: 'place',
    searchSessionId: 'searchSession',
    claimId: 'proofClaim',
    inquiryId: 'inquiry',
    noteId: 'note',
    memoId: 'memo',
    photoId: 'photo',
    documentId: 'document',
    postId: 'post',
    fromUserId: 'user',
    ownerId: 'user',
    verifierId: 'user',
    notificationId: 'notification',
    voicemailId: 'voicemail',
    callId: 'call',
    recurringId: 'recurring',
    subscriptionId: 'subscription',
    reportId: 'report',
    subtaskId: 'subtask',
    scope: 'consentScope',
    categoryId: 'category',
    institutionId: 'institution',
  };

  return mappings[fieldName] || 'entity';
}

/**
 * Extract facets from event payload.
 */
function extractFacets(event: RawEvent, _policy: EmbeddingPolicy): Facets {
  const facets: Facets = {};
  const payload = event.payload as Record<string, unknown> | undefined;

  if (!payload) return facets;

  // Extract amounts (numeric fields with specific naming patterns)
  const amountFields = ['amount', 'balance', 'price', 'value', 'cost', 'total'];
  const amounts: Record<string, number> = {};
  for (const field of amountFields) {
    if (typeof payload[field] === 'number') {
      amounts[field] = payload[field] as number;
    }
  }
  if (Object.keys(amounts).length > 0) {
    facets.amounts = amounts;
  }

  // Extract categories
  const categoryFields = ['category', 'subcategory', 'type', 'status', 'priority', 'mealType', 'postType'];
  const categories: Record<string, string> = {};
  for (const field of categoryFields) {
    if (typeof payload[field] === 'string') {
      categories[field] = payload[field] as string;
    }
  }
  if (Object.keys(categories).length > 0) {
    facets.categories = categories;
  }

  // Extract timestamps
  const timeFields = ['startTime', 'endTime', 'dueDate', 'completedAt', 'createdAt', 'updatedAt'];
  const timestamps: Record<string, string> = {};
  for (const field of timeFields) {
    const val = payload[field];
    if (typeof val === 'string' || typeof val === 'number') {
      timestamps[field] = typeof val === 'number'
        ? new Date(val).toISOString()
        : val;
    }
  }
  if (Object.keys(timestamps).length > 0) {
    facets.timestamps = timestamps;
  }

  // Extract counts
  const countFields = ['count', 'attendeeCount', 'recipientCount', 'attachmentCount', 'pageCount', 'wordCount'];
  const counts: Record<string, number> = {};
  for (const field of countFields) {
    if (typeof payload[field] === 'number') {
      counts[field] = payload[field] as number;
    }
  }
  if (Object.keys(counts).length > 0) {
    facets.counts = counts;
  }

  return facets;
}

/**
 * Extract source references (blob refs, R2 keys).
 */
function extractSourceRefs(event: RawEvent): string[] {
  const refs: string[] = [];

  if (event.blobRefs && Array.isArray(event.blobRefs)) {
    for (const ref of event.blobRefs) {
      if (typeof ref === 'string') {
        refs.push(ref);
      } else if (ref && typeof ref === 'object' && 'r2Key' in ref) {
        refs.push((ref as { r2Key: string }).r2Key);
      }
    }
  }

  return refs;
}

/**
 * Generate dedup key for idempotency.
 */
function generateDedupeKey(event: RawEvent): string {
  // Combine userId + eventType + eventId for uniqueness
  return `${event.clerkUserId}:${event.eventType}:${event.eventId}`;
}

/**
 * Extract domain from eventType.
 */
function extractDomain(eventType: string): string {
  const parts = eventType.split('.');
  return parts[0] || 'unknown';
}

/**
 * Build a Canonical Feature Document from a raw event.
 *
 * @param event - Raw event from Convex
 * @param policyConfig - Embedding policy configuration
 * @returns Canonical Feature Document ready for vectorization
 */
export function buildCFD(
  event: RawEvent,
  policyConfig: EmbeddingPolicyConfig
): CanonicalFeatureDocument {
  // Get policy for this event type, falling back to default
  const policy = policyConfig.policies[event.eventType] || policyConfig.defaultPolicy;

  // Build text summary
  const textSummary = buildTextSummary(event, policy);

  // Extract keywords
  const keywords = extractKeywords(textSummary);

  // Extract entity refs
  const entityRefs = extractEntityRefs(event, policy);

  // Extract facets
  const facets = extractFacets(event, policy);

  // Extract source refs
  const sourceRefs = extractSourceRefs(event);

  // Build CFD
  const cfd: CanonicalFeatureDocument = {
    eventId: event.eventId,
    eventType: event.eventType,
    timestampMs: event.timestampMs,
    userId: event.clerkUserId,
    privacyScope: event.privacyScope as 'private' | 'social' | 'public',
    consentVersion: event.consentVersion,
    sourceApp: event.sourceApp,
    domain: extractDomain(event.eventType),
    entityRefs,
    modality: policy.modalityHint,
    textSummary,
    keywords,
    facets,
    sourceRefs,
    dedupeKey: generateDedupeKey(event),
    traceId: event.traceId,
    generatedAt: Date.now(),
    schemaVersion: CFD_SCHEMA_VERSION,
  };

  return cfd;
}

/**
 * Check if an event should be vectorized based on policy.
 */
export function shouldVectorize(
  eventType: string,
  policyConfig: EmbeddingPolicyConfig
): boolean {
  const policy = policyConfig.policies[eventType];

  // If explicit policy exists, use its enabled flag
  if (policy) {
    return policy.enabled;
  }

  // Fall back to default policy
  return policyConfig.defaultPolicy.enabled;
}

/**
 * Get embedding policy for an event type.
 */
export function getPolicy(
  eventType: string,
  policyConfig: EmbeddingPolicyConfig
): EmbeddingPolicy {
  return policyConfig.policies[eventType] || policyConfig.defaultPolicy;
}
