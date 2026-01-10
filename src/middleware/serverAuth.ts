/**
 * Neural Intelligence Platform - Server-to-Server Authentication Middleware
 *
 * This middleware handles authentication for internal service endpoints
 * (e.g., Convex webhooks, background job triggers).
 *
 * @version 1.0.0
 * @author Sub-Agent 3: Orchestration + API Engineer
 */

import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';

// =============================================================================
// TYPES
// =============================================================================

/**
 * Server auth context for internal requests
 */
export interface ServerAuthContext {
  service: string;
  isInternal: true;
  timestamp: number;
  requestId?: string;
}

/**
 * Extend Express Request to include server auth
 */
declare global {
  namespace Express {
    interface Request {
      serverAuth?: ServerAuthContext;
    }
  }
}

/**
 * Server auth payload structure
 */
interface ServerAuthPayload {
  service: string;
  timestamp: number;
  nonce: string;
}

// =============================================================================
// CONFIGURATION
// =============================================================================

interface ServerAuthConfig {
  // Shared secret for HMAC signing
  sharedSecret: string;

  // Maximum age of request (prevent replay attacks)
  maxAgeMs: number;

  // Header names
  headers: {
    signature: string;
    timestamp: string;
    service: string;
    nonce: string;
  };

  // Allowed services (empty = all services)
  allowedServices: string[];
}

const defaultConfig: ServerAuthConfig = {
  sharedSecret: process.env.SERVER_AUTH_SECRET || '',
  maxAgeMs: 5 * 60 * 1000, // 5 minutes
  headers: {
    signature: 'x-server-signature',
    timestamp: 'x-server-timestamp',
    service: 'x-server-service',
    nonce: 'x-server-nonce',
  },
  allowedServices: [],
};

// =============================================================================
// NONCE STORE (For Replay Attack Prevention)
// =============================================================================

/**
 * Simple in-memory nonce store with TTL
 * In production, use Redis or similar distributed cache
 */
class NonceStore {
  private nonces: Map<string, number> = new Map();
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor(private ttlMs: number) {
    // Start periodic cleanup
    this.cleanupInterval = setInterval(() => this.cleanup(), ttlMs);
  }

  /**
   * Check if nonce has been used and mark it as used
   * Returns true if nonce is valid (not previously used)
   */
  checkAndMark(nonce: string): boolean {
    if (this.nonces.has(nonce)) {
      return false; // Nonce already used
    }

    this.nonces.set(nonce, Date.now());
    return true;
  }

  /**
   * Clean up expired nonces
   */
  private cleanup(): void {
    const now = Date.now();
    for (const [nonce, timestamp] of this.nonces.entries()) {
      if (now - timestamp > this.ttlMs) {
        this.nonces.delete(nonce);
      }
    }
  }

  /**
   * Stop cleanup interval
   */
  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }
}

const nonceStore = new NonceStore(defaultConfig.maxAgeMs * 2);

// =============================================================================
// SIGNATURE GENERATION & VERIFICATION
// =============================================================================

/**
 * Generate HMAC signature for server-to-server auth
 */
export function generateServerSignature(
  payload: ServerAuthPayload,
  secret: string
): string {
  const data = `${payload.service}:${payload.timestamp}:${payload.nonce}`;
  return crypto.createHmac('sha256', secret).update(data).digest('hex');
}

/**
 * Verify HMAC signature
 */
function verifySignature(
  payload: ServerAuthPayload,
  signature: string,
  secret: string
): boolean {
  const expectedSignature = generateServerSignature(payload, secret);

  // Use timing-safe comparison to prevent timing attacks
  try {
    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expectedSignature)
    );
  } catch {
    return false;
  }
}

// =============================================================================
// ERROR HANDLING
// =============================================================================

export class ServerAuthError extends Error {
  constructor(
    public code: string,
    message: string
  ) {
    super(message);
    this.name = 'ServerAuthError';
  }
}

// =============================================================================
// MIDDLEWARE FACTORY
// =============================================================================

export interface ServerAuthMiddlewareOptions {
  // Override default config
  config?: Partial<ServerAuthConfig>;

  // Skip auth for certain paths
  skipPaths?: string[];

  // Custom error handler
  onError?: (error: ServerAuthError, req: Request, res: Response) => void;
}

/**
 * Create server-to-server authentication middleware
 *
 * @example
 * ```typescript
 * import { serverAuth } from './middleware/serverAuth';
 *
 * // Protect internal routes
 * app.use('/v1/brain/jobs', serverAuth());
 *
 * // With allowed services restriction
 * app.use('/v1/brain/jobs', serverAuth({
 *   config: {
 *     allowedServices: ['convex-webhook', 'cron-service']
 *   }
 * }));
 * ```
 */
export function serverAuth(options: ServerAuthMiddlewareOptions = {}) {
  const config: ServerAuthConfig = {
    ...defaultConfig,
    ...options.config,
  };

  // Validate configuration
  if (!config.sharedSecret) {
    console.warn(
      '[ServerAuth] WARNING: No shared secret configured. Set SERVER_AUTH_SECRET environment variable.'
    );
  }

  return async (req: Request, res: Response, next: NextFunction) => {
    // Check if path should skip auth
    if (options.skipPaths?.some((path) => req.path.startsWith(path))) {
      return next();
    }

    try {
      // Extract headers
      const signature = req.headers[config.headers.signature] as string | undefined;
      const timestampStr = req.headers[config.headers.timestamp] as string | undefined;
      const service = req.headers[config.headers.service] as string | undefined;
      const nonce = req.headers[config.headers.nonce] as string | undefined;

      // Validate required headers
      if (!signature) {
        throw new ServerAuthError('MISSING_SIGNATURE', 'Missing signature header');
      }
      if (!timestampStr) {
        throw new ServerAuthError('MISSING_TIMESTAMP', 'Missing timestamp header');
      }
      if (!service) {
        throw new ServerAuthError('MISSING_SERVICE', 'Missing service header');
      }
      if (!nonce) {
        throw new ServerAuthError('MISSING_NONCE', 'Missing nonce header');
      }

      // Parse timestamp
      const timestamp = parseInt(timestampStr, 10);
      if (isNaN(timestamp)) {
        throw new ServerAuthError('INVALID_TIMESTAMP', 'Invalid timestamp format');
      }

      // Check timestamp freshness
      const now = Date.now();
      const age = Math.abs(now - timestamp);
      if (age > config.maxAgeMs) {
        throw new ServerAuthError(
          'EXPIRED_REQUEST',
          `Request too old: ${age}ms (max: ${config.maxAgeMs}ms)`
        );
      }

      // Check nonce for replay attack prevention
      if (!nonceStore.checkAndMark(nonce)) {
        throw new ServerAuthError('REPLAY_DETECTED', 'Request nonce already used');
      }

      // Check allowed services
      if (config.allowedServices.length > 0 && !config.allowedServices.includes(service)) {
        throw new ServerAuthError(
          'SERVICE_NOT_ALLOWED',
          `Service '${service}' is not allowed`
        );
      }

      // Verify signature
      const payload: ServerAuthPayload = { service, timestamp, nonce };
      if (!verifySignature(payload, signature, config.sharedSecret)) {
        throw new ServerAuthError('INVALID_SIGNATURE', 'Signature verification failed');
      }

      // Build auth context
      const serverAuthContext: ServerAuthContext = {
        service,
        isInternal: true,
        timestamp,
        requestId: req.headers['x-request-id'] as string | undefined,
      };

      // Attach to request
      req.serverAuth = serverAuthContext;

      next();
    } catch (error) {
      if (error instanceof ServerAuthError) {
        if (options.onError) {
          options.onError(error, req, res);
        } else {
          res.status(401).json({
            error: {
              code: error.code,
              message: error.message,
            },
          });
        }
      } else {
        console.error('[ServerAuth] Unexpected error:', error);
        res.status(500).json({
          error: {
            code: 'INTERNAL_ERROR',
            message: 'Authentication failed due to internal error',
          },
        });
      }
    }
  };
}

// =============================================================================
// ALTERNATIVE: API KEY AUTH
// =============================================================================

/**
 * Simple API key authentication (alternative to HMAC)
 * Use this for simpler setups where replay protection is less critical
 */
export function apiKeyAuth(options: {
  apiKey?: string;
  header?: string;
  allowedKeys?: string[];
} = {}) {
  const apiKey = options.apiKey || process.env.SERVER_API_KEY;
  const header = options.header || 'x-api-key';
  const allowedKeys = options.allowedKeys || (apiKey ? [apiKey] : []);

  if (allowedKeys.length === 0) {
    console.warn('[ApiKeyAuth] WARNING: No API keys configured');
  }

  return (req: Request, res: Response, next: NextFunction) => {
    const providedKey = req.headers[header] as string | undefined;

    if (!providedKey) {
      return res.status(401).json({
        error: {
          code: 'MISSING_API_KEY',
          message: 'API key required',
        },
      });
    }

    // Timing-safe comparison
    const isValid = allowedKeys.some((key) => {
      try {
        return crypto.timingSafeEqual(Buffer.from(providedKey), Buffer.from(key));
      } catch {
        return false;
      }
    });

    if (!isValid) {
      return res.status(401).json({
        error: {
          code: 'INVALID_API_KEY',
          message: 'Invalid API key',
        },
      });
    }

    // Attach minimal auth context
    req.serverAuth = {
      service: 'api-key-auth',
      isInternal: true,
      timestamp: Date.now(),
    };

    next();
  };
}

// =============================================================================
// HELPER FUNCTIONS FOR CLIENTS
// =============================================================================

/**
 * Generate authentication headers for server-to-server requests
 *
 * @example
 * ```typescript
 * const headers = generateServerAuthHeaders('convex-webhook');
 * await fetch('http://brain/v1/brain/jobs/events', {
 *   method: 'POST',
 *   headers: {
 *     'Content-Type': 'application/json',
 *     ...headers,
 *   },
 *   body: JSON.stringify({ eventIds: ['event1', 'event2'] }),
 * });
 * ```
 */
export function generateServerAuthHeaders(
  service: string,
  secret?: string
): Record<string, string> {
  const sharedSecret = secret || process.env.SERVER_AUTH_SECRET || '';
  const timestamp = Date.now();
  const nonce = crypto.randomBytes(16).toString('hex');

  const payload: ServerAuthPayload = { service, timestamp, nonce };
  const signature = generateServerSignature(payload, sharedSecret);

  return {
    [defaultConfig.headers.service]: service,
    [defaultConfig.headers.timestamp]: timestamp.toString(),
    [defaultConfig.headers.nonce]: nonce,
    [defaultConfig.headers.signature]: signature,
  };
}

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

/**
 * Check if request has valid server auth
 */
export function isServerAuthenticated(req: Request): boolean {
  return !!req.serverAuth;
}

/**
 * Get service name from authenticated request
 */
export function getServiceName(req: Request): string | null {
  return req.serverAuth?.service || null;
}

// =============================================================================
// COMBINED AUTH MIDDLEWARE
// =============================================================================

/**
 * Allow either Clerk JWT or Server auth
 * Useful for endpoints that can be called by both dashboard and internal services
 *
 * @example
 * ```typescript
 * import { eitherAuth } from './middleware/serverAuth';
 * import { clerkAuth } from './middleware/clerkAuth';
 *
 * app.use('/v1/brain/search', eitherAuth());
 * ```
 */
export function eitherAuth(options: {
  clerkOptions?: Parameters<typeof import('./clerkAuth').clerkAuth>[0];
  serverOptions?: ServerAuthMiddlewareOptions;
} = {}) {
  return async (req: Request, res: Response, next: NextFunction) => {
    // Check for server auth headers first
    const hasServerHeaders =
      req.headers[defaultConfig.headers.signature] &&
      req.headers[defaultConfig.headers.service];

    if (hasServerHeaders) {
      // Try server auth
      const serverMiddleware = serverAuth(options.serverOptions);
      return serverMiddleware(req, res, next);
    }

    // Check for Clerk JWT
    const hasAuthHeader = req.headers.authorization?.startsWith('Bearer ');

    if (hasAuthHeader) {
      // Dynamically import to avoid circular dependencies
      const { clerkAuth } = await import('./clerkAuth');
      const clerkMiddleware = clerkAuth(options.clerkOptions);
      return clerkMiddleware(req, res, next);
    }

    // No auth provided
    res.status(401).json({
      error: {
        code: 'NO_AUTH',
        message: 'Authentication required (Clerk JWT or server signature)',
      },
    });
  };
}

// =============================================================================
// TESTING UTILITIES
// =============================================================================

/**
 * Create mock server auth context for testing
 */
export function createMockServerAuth(
  overrides: Partial<ServerAuthContext> = {}
): ServerAuthContext {
  return {
    service: 'test-service',
    isInternal: true,
    timestamp: Date.now(),
    requestId: 'test-request-id',
    ...overrides,
  };
}
