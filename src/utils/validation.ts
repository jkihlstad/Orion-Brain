/**
 * Neural Intelligence Platform - Validation Utilities
 *
 * Request validation helpers using Zod schemas.
 *
 * @version 1.0.0
 * @author Sub-Agent 3: Orchestration + API Engineer
 */

import { z } from 'zod';
import { ValidationError } from './errors';

// =============================================================================
// COMMON SCHEMAS
// =============================================================================

/**
 * Event type schema
 */
export const EventTypeSchema = z.enum([
  'audio_segment',
  'text_event',
  'browser_session',
  'image_frame',
  'video_segment',
]);

/**
 * Privacy scope schema
 */
export const PrivacyScopeSchema = z.enum(['private', 'social', 'public']);

/**
 * Source app schema
 */
export const SourceAppSchema = z.enum([
  'ios_browser',
  'ios_native',
  'web_extension',
  'api_import',
]);

/**
 * Date range schema
 */
export const DateRangeSchema = z.object({
  start: z.number().int().positive(),
  end: z.number().int().positive(),
}).refine(
  (data: { start: number; end: number }) => data.end > data.start,
  { message: 'end must be greater than start' }
);

/**
 * Pagination schema
 */
export const PaginationSchema = z.object({
  limit: z.number().int().min(1).max(100).default(20),
  offset: z.number().int().min(0).default(0),
  cursor: z.string().optional(),
});

// =============================================================================
// API REQUEST SCHEMAS
// =============================================================================

/**
 * Search filters schema
 */
export const SearchFiltersSchema = z.object({
  eventTypes: z.array(EventTypeSchema).optional(),
  privacyScopes: z.array(PrivacyScopeSchema).optional(),
  timestampStart: z.number().int().positive().optional(),
  timestampEnd: z.number().int().positive().optional(),
  contactId: z.string().optional(),
  clusterId: z.string().optional(),
  sourceApps: z.array(SourceAppSchema).optional(),
}).optional();

/**
 * Search request schema
 */
export const SearchRequestSchema = z.object({
  query: z.string().min(1).max(1000),
  filters: SearchFiltersSchema,
  limit: z.number().int().min(1).max(100).default(20),
});

/**
 * Multimodal search request schema
 */
export const MultimodalSearchRequestSchema = z.object({
  query: z.string().min(1).max(1000),
  modalities: z.array(EventTypeSchema).optional(),
  filters: SearchFiltersSchema,
  limit: z.number().int().min(1).max(100).default(20),
});

/**
 * Insights focus areas schema
 */
export const InsightFocusAreaSchema = z.enum([
  'productivity',
  'relationships',
  'topics',
  'sentiment',
  'action_items',
  'meetings',
]);

/**
 * Insights request schema
 */
export const InsightsRequestSchema = z.object({
  timeRange: DateRangeSchema.optional(),
  focusAreas: z.array(InsightFocusAreaSchema).optional(),
});

/**
 * Jobs events request schema
 */
export const JobsEventsRequestSchema = z.object({
  eventIds: z.array(z.string().min(1)).min(1).max(1000),
});

/**
 * Cluster label request schema
 */
export const ClusterLabelRequestSchema = z.object({
  clusterId: z.string().min(1),
  contactId: z.string().min(1),
});

// =============================================================================
// VALIDATION HELPERS
// =============================================================================

/**
 * Validate data against a Zod schema
 *
 * @example
 * ```typescript
 * const data = validate(SearchRequestSchema, req.body);
 * ```
 */
export function validate<T>(
  schema: z.ZodSchema<T>,
  data: unknown,
  fieldName?: string
): T {
  const result = schema.safeParse(data);

  if (!result.success) {
    const firstError = result.error.issues[0]!;
    const field = fieldName || firstError.path.join('.');
    throw new ValidationError(firstError.message, field, {
      errors: result.error.issues,
    });
  }

  return result.data;
}

/**
 * Create a validation middleware for Express
 *
 * @example
 * ```typescript
 * router.post('/search',
 *   validateBody(SearchRequestSchema),
 *   handleSearch
 * );
 * ```
 */
export function validateBody<T>(schema: z.ZodSchema<T>) {
  return (req: { body: unknown }, _res: unknown, next: (error?: unknown) => void) => {
    try {
      req.body = validate(schema, req.body);
      next();
    } catch (error) {
      next(error);
    }
  };
}

/**
 * Create a validation middleware for query params
 */
export function validateQuery<T>(schema: z.ZodSchema<T>) {
  return (req: { query: unknown }, _res: unknown, next: (error?: unknown) => void) => {
    try {
      req.query = validate(schema, req.query);
      next();
    } catch (error) {
      next(error);
    }
  };
}

/**
 * Create a validation middleware for route params
 */
export function validateParams<T>(schema: z.ZodSchema<T>) {
  return (req: { params: unknown }, _res: unknown, next: (error?: unknown) => void) => {
    try {
      req.params = validate(schema, req.params);
      next();
    } catch (error) {
      next(error);
    }
  };
}

// =============================================================================
// CUSTOM VALIDATORS
// =============================================================================

/**
 * Validate UUID format
 */
export function isValidUUID(value: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(value);
}

/**
 * Validate Convex ID format
 */
export function isValidConvexId(value: string): boolean {
  // Convex IDs are base64url encoded
  const convexIdRegex = /^[a-zA-Z0-9_-]+$/;
  return convexIdRegex.test(value) && value.length > 0;
}

/**
 * Validate timestamp is within reasonable range
 */
export function isValidTimestamp(timestamp: number): boolean {
  const minTimestamp = new Date('2020-01-01').getTime();
  const maxTimestamp = Date.now() + 24 * 60 * 60 * 1000; // Max 24 hours in future
  return timestamp >= minTimestamp && timestamp <= maxTimestamp;
}

/**
 * Sanitize string for safe use
 */
export function sanitizeString(value: string): string {
  return value
    .trim()
    .replace(/[\x00-\x1F\x7F]/g, '') // Remove control characters
    .substring(0, 10000); // Limit length
}

// =============================================================================
// ZOD CUSTOM TYPES
// =============================================================================

/**
 * Custom Zod type for UUID
 */
export const UUIDSchema = z.string().refine(isValidUUID, {
  message: 'Invalid UUID format',
});

/**
 * Custom Zod type for Convex ID
 */
export const ConvexIdSchema = z.string().refine(isValidConvexId, {
  message: 'Invalid Convex ID format',
});

/**
 * Custom Zod type for timestamp
 */
export const TimestampSchema = z.number().int().refine(isValidTimestamp, {
  message: 'Invalid timestamp',
});

/**
 * Custom Zod type for sanitized string
 */
export const SanitizedStringSchema = z.string().transform(sanitizeString);
