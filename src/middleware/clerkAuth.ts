/**
 * Neural Intelligence Platform - Clerk JWT Verification Middleware
 *
 * This middleware handles authentication for dashboard/user-facing endpoints
 * by verifying Clerk JWTs and extracting user context.
 *
 * @version 1.0.0
 * @author Sub-Agent 3: Orchestration + API Engineer
 */

// Note: These types are used for documentation and future Express/jose integration
// When implementing, add express and jose as dependencies
type Request = {
  path: string;
  headers: { authorization?: string };
  auth?: AuthContext;
};
type Response = {
  status: (code: number) => { json: (body: unknown) => void };
};
type NextFunction = () => void;

// jose types for JWT verification (stub for now)
declare namespace jose {
  interface JWTVerifyResult {
    payload: unknown;
  }
  type JWTVerifyGetKey = unknown;
  function createRemoteJWKSet(url: URL): JWTVerifyGetKey;
  function jwtVerify(
    token: string,
    key: JWTVerifyGetKey | CryptoKey,
    options?: { issuer?: string; audience?: string | string[]; clockTolerance?: number }
  ): Promise<JWTVerifyResult>;
  function importSPKI(pem: string, alg: string): Promise<CryptoKey>;
  namespace errors {
    class JWTExpired extends Error {}
    class JWTClaimValidationFailed extends Error {}
    class JWSSignatureVerificationFailed extends Error {}
  }
}

// =============================================================================
// TYPES
// =============================================================================

/**
 * Clerk JWT payload structure
 */
export interface ClerkJWTPayload {
  // Standard JWT claims
  sub: string; // User ID
  iss: string; // Issuer (Clerk)
  aud: string | string[]; // Audience
  exp: number; // Expiration time
  iat: number; // Issued at
  nbf?: number; // Not before

  // Clerk-specific claims
  sid?: string; // Session ID
  org_id?: string; // Organization ID
  org_role?: string; // Organization role
  org_slug?: string; // Organization slug
  org_permissions?: string[]; // Organization permissions
  azp?: string; // Authorized party (client ID)

  // Custom claims (from Clerk session)
  metadata?: {
    publicMetadata?: Record<string, unknown>;
    privateMetadata?: Record<string, unknown>;
  };
}

/**
 * Auth context attached to authenticated requests
 */
export interface AuthContext {
  userId: string;
  sessionId?: string;
  orgId?: string;
  orgRole?: string;
  permissions: string[];
  isInternal: false;
  raw: ClerkJWTPayload;
}

/**
 * Extend Express Request to include auth
 */
declare global {
  namespace Express {
    interface Request {
      auth?: AuthContext;
    }
  }
}

// =============================================================================
// CONFIGURATION
// =============================================================================

interface ClerkAuthConfig {
  // Clerk public key for JWT verification
  // Can be JWKS URL or PEM-encoded public key
  publicKeySource: 'jwks' | 'pem';
  jwksUrl?: string;
  publicKey?: string;

  // Expected issuer (your Clerk frontend API URL)
  issuer: string;

  // Expected audience (optional)
  audience?: string | string[];

  // Clock tolerance for exp/nbf validation (seconds)
  clockTolerance: number;

  // Whether to require organization membership
  requireOrg: boolean;

  // Allowed origins for the azp claim
  allowedParties?: string[];
}

const defaultConfig: ClerkAuthConfig = {
  publicKeySource: 'jwks',
  jwksUrl: process.env.CLERK_JWKS_URL || 'https://your-clerk-frontend.clerk.accounts.dev/.well-known/jwks.json',
  issuer: process.env.CLERK_ISSUER || 'https://your-clerk-frontend.clerk.accounts.dev',
  clockTolerance: 5,
  requireOrg: false,
};

// =============================================================================
// JWKS KEY FETCHING
// =============================================================================

let jwksClient: jose.JWTVerifyGetKey | null = null;
let jwksClientExpiry = 0;
const JWKS_CACHE_TTL = 60 * 60 * 1000; // 1 hour

/**
 * Get or create JWKS client with caching
 */
async function getJWKSClient(jwksUrl: string): Promise<jose.JWTVerifyGetKey> {
  const now = Date.now();

  if (jwksClient && now < jwksClientExpiry) {
    return jwksClient;
  }

  jwksClient = jose.createRemoteJWKSet(new URL(jwksUrl));
  jwksClientExpiry = now + JWKS_CACHE_TTL;

  return jwksClient;
}

// =============================================================================
// JWT VERIFICATION
// =============================================================================

/**
 * Verify a Clerk JWT token
 */
async function verifyClerkToken(
  token: string,
  config: ClerkAuthConfig
): Promise<ClerkJWTPayload> {
  try {
    let verifyResult: jose.JWTVerifyResult;

    if (config.publicKeySource === 'jwks' && config.jwksUrl) {
      // Verify using JWKS
      const jwks = await getJWKSClient(config.jwksUrl);
      const verifyOptions: { issuer?: string; audience?: string | string[]; clockTolerance?: number } = {
        issuer: config.issuer,
        clockTolerance: config.clockTolerance,
      };
      if (config.audience !== undefined) {
        verifyOptions.audience = config.audience;
      }
      verifyResult = await jose.jwtVerify(token, jwks, verifyOptions);
    } else if (config.publicKeySource === 'pem' && config.publicKey) {
      // Verify using PEM public key
      const publicKey = await jose.importSPKI(config.publicKey, 'RS256');
      const verifyOptions: { issuer?: string; audience?: string | string[]; clockTolerance?: number } = {
        issuer: config.issuer,
        clockTolerance: config.clockTolerance,
      };
      if (config.audience !== undefined) {
        verifyOptions.audience = config.audience;
      }
      verifyResult = await jose.jwtVerify(token, publicKey, verifyOptions);
    } else {
      throw new Error('Invalid auth configuration: missing public key source');
    }

    const payload = verifyResult.payload as unknown as ClerkJWTPayload;

    // Validate authorized party if configured
    if (config.allowedParties && config.allowedParties.length > 0) {
      if (!payload.azp || !config.allowedParties.includes(payload.azp)) {
        throw new Error('Token azp (authorized party) is not allowed');
      }
    }

    return payload;
  } catch (error) {
    if (error instanceof jose.errors.JWTExpired) {
      throw new AuthError('TOKEN_EXPIRED', 'Token has expired');
    }
    if (error instanceof jose.errors.JWTClaimValidationFailed) {
      throw new AuthError('INVALID_CLAIMS', `Token claim validation failed: ${error.message}`);
    }
    if (error instanceof jose.errors.JWSSignatureVerificationFailed) {
      throw new AuthError('INVALID_SIGNATURE', 'Token signature verification failed');
    }

    throw new AuthError('VERIFICATION_FAILED', `Token verification failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

// =============================================================================
// ERROR HANDLING
// =============================================================================

export class AuthError extends Error {
  constructor(
    public code: string,
    message: string
  ) {
    super(message);
    this.name = 'AuthError';
  }
}

/**
 * Extract bearer token from Authorization header
 */
function extractBearerToken(authHeader: string | undefined): string | null {
  if (!authHeader) return null;

  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0]!.toLowerCase() !== 'bearer') {
    return null;
  }

  return parts[1] ?? null;
}

// =============================================================================
// MIDDLEWARE FACTORY
// =============================================================================

export interface ClerkAuthMiddlewareOptions {
  // Override default config
  config?: Partial<ClerkAuthConfig>;

  // Skip auth for certain paths
  skipPaths?: string[];

  // Custom error handler
  onError?: (error: AuthError, req: Request, res: Response) => void;

  // Custom success handler
  onSuccess?: (auth: AuthContext, req: Request, res: Response) => void;
}

/**
 * Create Clerk JWT authentication middleware
 *
 * @example
 * ```typescript
 * import { clerkAuth } from './middleware/clerkAuth';
 *
 * // Basic usage
 * app.use('/api', clerkAuth());
 *
 * // With options
 * app.use('/api', clerkAuth({
 *   skipPaths: ['/api/health'],
 *   config: { requireOrg: true }
 * }));
 * ```
 */
export function clerkAuth(options: ClerkAuthMiddlewareOptions = {}) {
  const config: ClerkAuthConfig = {
    ...defaultConfig,
    ...options.config,
  };

  return async (req: Request, res: Response, next: NextFunction) => {
    // Check if path should skip auth
    if (options.skipPaths?.some((path) => req.path.startsWith(path))) {
      return next();
    }

    try {
      // Extract token from header
      const token = extractBearerToken(req.headers.authorization);

      if (!token) {
        throw new AuthError('NO_TOKEN', 'No authorization token provided');
      }

      // Verify token
      const payload = await verifyClerkToken(token, config);

      // Validate organization requirement
      if (config.requireOrg && !payload.org_id) {
        throw new AuthError('ORG_REQUIRED', 'Organization membership required');
      }

      // Build auth context - only add optional properties if they have values
      const auth: AuthContext = {
        userId: payload.sub,
        permissions: payload.org_permissions || [],
        isInternal: false,
        raw: payload,
        ...(payload.sid !== undefined && { sessionId: payload.sid }),
        ...(payload.org_id !== undefined && { orgId: payload.org_id }),
        ...(payload.org_role !== undefined && { orgRole: payload.org_role }),
      };

      // Attach to request
      req.auth = auth;

      // Call success handler if provided
      if (options.onSuccess) {
        options.onSuccess(auth, req, res);
      }

      next();
    } catch (error) {
      if (error instanceof AuthError) {
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
        // Unexpected error
        console.error('[ClerkAuth] Unexpected error:', error);
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
// HELPER MIDDLEWARE
// =============================================================================

/**
 * Require specific permissions
 *
 * @example
 * ```typescript
 * app.post('/api/admin',
 *   clerkAuth(),
 *   requirePermissions(['admin:write']),
 *   adminHandler
 * );
 * ```
 */
export function requirePermissions(requiredPermissions: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.auth) {
      return res.status(401).json({
        error: {
          code: 'NOT_AUTHENTICATED',
          message: 'Authentication required',
        },
      });
    }

    const hasPermissions = requiredPermissions.every((perm) =>
      req.auth!.permissions.includes(perm)
    );

    if (!hasPermissions) {
      return res.status(403).json({
        error: {
          code: 'INSUFFICIENT_PERMISSIONS',
          message: 'Missing required permissions',
          required: requiredPermissions,
        },
      });
    }

    next();
  };
}

/**
 * Require organization membership
 *
 * @example
 * ```typescript
 * app.get('/api/org/data',
 *   clerkAuth(),
 *   requireOrg(),
 *   orgDataHandler
 * );
 * ```
 */
export function requireOrg() {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.auth) {
      return res.status(401).json({
        error: {
          code: 'NOT_AUTHENTICATED',
          message: 'Authentication required',
        },
      });
    }

    if (!req.auth.orgId) {
      return res.status(403).json({
        error: {
          code: 'ORG_REQUIRED',
          message: 'Organization membership required',
        },
      });
    }

    next();
  };
}

/**
 * Require specific organization role
 *
 * @example
 * ```typescript
 * app.delete('/api/org/settings',
 *   clerkAuth(),
 *   requireOrgRole(['admin', 'owner']),
 *   deleteSettingsHandler
 * );
 * ```
 */
export function requireOrgRole(allowedRoles: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.auth) {
      return res.status(401).json({
        error: {
          code: 'NOT_AUTHENTICATED',
          message: 'Authentication required',
        },
      });
    }

    if (!req.auth.orgRole || !allowedRoles.includes(req.auth.orgRole)) {
      return res.status(403).json({
        error: {
          code: 'INSUFFICIENT_ROLE',
          message: 'Insufficient organization role',
          required: allowedRoles,
        },
      });
    }

    next();
  };
}

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

/**
 * Get user ID from request (throws if not authenticated)
 */
export function getUserId(req: { auth?: AuthContext }): string {
  if (!req.auth) {
    throw new AuthError('NOT_AUTHENTICATED', 'User not authenticated');
  }
  return req.auth.userId;
}

/**
 * Get user ID from request (returns null if not authenticated)
 */
export function getUserIdOptional(req: { auth?: AuthContext }): string | null {
  return req.auth?.userId || null;
}

/**
 * Check if request is authenticated
 */
export function isAuthenticated(req: { auth?: AuthContext }): boolean {
  return !!req.auth;
}

// =============================================================================
// TESTING UTILITIES
// =============================================================================

/**
 * Create a mock auth context for testing
 *
 * @example
 * ```typescript
 * // In tests
 * req.auth = createMockAuth({ userId: 'test-user' });
 * ```
 */
export function createMockAuth(overrides: Partial<AuthContext> = {}): AuthContext {
  const base: AuthContext = {
    userId: 'test-user-id',
    sessionId: 'test-session-id',
    permissions: [],
    isInternal: false,
    raw: {
      sub: 'test-user-id',
      iss: 'https://test.clerk.accounts.dev',
      aud: 'test-audience',
      exp: Date.now() / 1000 + 3600,
      iat: Date.now() / 1000,
      sid: 'test-session-id',
    },
  };
  return { ...base, ...overrides };
}
