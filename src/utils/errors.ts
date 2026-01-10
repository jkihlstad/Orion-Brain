/**
 * Neural Intelligence Platform - Error Utilities
 *
 * Standardized error handling across the platform.
 *
 * @version 1.0.0
 * @author Sub-Agent 3: Orchestration + API Engineer
 */

// =============================================================================
// BASE ERROR CLASS
// =============================================================================

export class BrainError extends Error {
  public readonly code: string;
  public readonly statusCode: number;
  public readonly details?: Record<string, unknown>;
  public readonly timestamp: number;

  constructor(
    code: string,
    message: string,
    statusCode: number = 500,
    details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'BrainError';
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
    this.timestamp = Date.now();

    // Ensure proper prototype chain
    Object.setPrototypeOf(this, BrainError.prototype);
  }

  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      statusCode: this.statusCode,
      details: this.details,
      timestamp: this.timestamp,
    };
  }
}

// =============================================================================
// SPECIFIC ERROR TYPES
// =============================================================================

/**
 * Authentication/Authorization errors
 */
export class AuthenticationError extends BrainError {
  constructor(message: string, details?: Record<string, unknown>) {
    super('AUTHENTICATION_ERROR', message, 401, details);
    this.name = 'AuthenticationError';
  }
}

export class AuthorizationError extends BrainError {
  constructor(message: string, details?: Record<string, unknown>) {
    super('AUTHORIZATION_ERROR', message, 403, details);
    this.name = 'AuthorizationError';
  }
}

/**
 * Validation errors
 */
export class ValidationError extends BrainError {
  public readonly field?: string;

  constructor(message: string, field?: string, details?: Record<string, unknown>) {
    super('VALIDATION_ERROR', message, 400, { ...details, field });
    this.name = 'ValidationError';
    this.field = field;
  }
}

/**
 * Not found errors
 */
export class NotFoundError extends BrainError {
  public readonly resource: string;
  public readonly resourceId?: string;

  constructor(resource: string, resourceId?: string) {
    const message = resourceId
      ? `${resource} with ID '${resourceId}' not found`
      : `${resource} not found`;
    super('NOT_FOUND', message, 404, { resource, resourceId });
    this.name = 'NotFoundError';
    this.resource = resource;
    this.resourceId = resourceId;
  }
}

/**
 * Conflict errors (e.g., duplicate resources)
 */
export class ConflictError extends BrainError {
  constructor(message: string, details?: Record<string, unknown>) {
    super('CONFLICT', message, 409, details);
    this.name = 'ConflictError';
  }
}

/**
 * Rate limiting errors
 */
export class RateLimitError extends BrainError {
  public readonly retryAfter?: number;

  constructor(message: string = 'Too many requests', retryAfter?: number) {
    super('RATE_LIMITED', message, 429, { retryAfter });
    this.name = 'RateLimitError';
    this.retryAfter = retryAfter;
  }
}

/**
 * External service errors
 */
export class ExternalServiceError extends BrainError {
  public readonly service: string;
  public readonly originalError?: Error;

  constructor(
    service: string,
    message: string,
    originalError?: Error,
    details?: Record<string, unknown>
  ) {
    super('EXTERNAL_SERVICE_ERROR', `${service}: ${message}`, 502, {
      ...details,
      service,
      originalMessage: originalError?.message,
    });
    this.name = 'ExternalServiceError';
    this.service = service;
    this.originalError = originalError;
  }
}

/**
 * Processing errors
 */
export class ProcessingError extends BrainError {
  public readonly eventId?: string;
  public readonly stage?: string;

  constructor(
    message: string,
    eventId?: string,
    stage?: string,
    details?: Record<string, unknown>
  ) {
    super('PROCESSING_ERROR', message, 500, { ...details, eventId, stage });
    this.name = 'ProcessingError';
    this.eventId = eventId;
    this.stage = stage;
  }
}

/**
 * Timeout errors
 */
export class TimeoutError extends BrainError {
  public readonly operation: string;
  public readonly timeoutMs: number;

  constructor(operation: string, timeoutMs: number) {
    super('TIMEOUT', `Operation '${operation}' timed out after ${timeoutMs}ms`, 504, {
      operation,
      timeoutMs,
    });
    this.name = 'TimeoutError';
    this.operation = operation;
    this.timeoutMs = timeoutMs;
  }
}

// =============================================================================
// ERROR UTILITIES
// =============================================================================

/**
 * Check if an error is a BrainError
 */
export function isBrainError(error: unknown): error is BrainError {
  return error instanceof BrainError;
}

/**
 * Wrap unknown errors in BrainError
 */
export function wrapError(error: unknown): BrainError {
  if (isBrainError(error)) {
    return error;
  }

  if (error instanceof Error) {
    return new BrainError('INTERNAL_ERROR', error.message, 500, {
      originalName: error.name,
      stack: error.stack,
    });
  }

  return new BrainError('INTERNAL_ERROR', String(error), 500);
}

/**
 * Create an error handler for async route handlers
 */
export function asyncHandler<T>(
  fn: (req: T, res: unknown, next: unknown) => Promise<unknown>
): (req: T, res: unknown, next: (error?: unknown) => void) => void {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

/**
 * Retry an async operation with exponential backoff
 */
export async function withRetry<T>(
  operation: () => Promise<T>,
  options: {
    maxRetries?: number;
    initialDelayMs?: number;
    maxDelayMs?: number;
    retryOn?: (error: unknown) => boolean;
  } = {}
): Promise<T> {
  const {
    maxRetries = 3,
    initialDelayMs = 100,
    maxDelayMs = 10000,
    retryOn = () => true,
  } = options;

  let lastError: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;

      if (attempt === maxRetries || !retryOn(error)) {
        throw error;
      }

      const delay = Math.min(
        initialDelayMs * Math.pow(2, attempt),
        maxDelayMs
      );

      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}

/**
 * Timeout wrapper for async operations
 */
export async function withTimeout<T>(
  operation: () => Promise<T>,
  timeoutMs: number,
  operationName: string = 'operation'
): Promise<T> {
  let timeoutId: NodeJS.Timeout;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new TimeoutError(operationName, timeoutMs));
    }, timeoutMs);
  });

  try {
    return await Promise.race([operation(), timeoutPromise]);
  } finally {
    clearTimeout(timeoutId!);
  }
}
