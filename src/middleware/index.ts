/**
 * Neural Intelligence Platform - Middleware Module Index
 *
 * Exports all middleware for easy importing.
 *
 * @version 1.0.0
 * @author Sub-Agent 3: Orchestration + API Engineer
 */

// Clerk JWT Auth
export {
  clerkAuth,
  requirePermissions,
  requireOrg,
  requireOrgRole,
  getUserId,
  getUserIdOptional,
  isAuthenticated,
  createMockAuth,
  AuthError,
} from './clerkAuth';

export type {
  ClerkJWTPayload,
  AuthContext,
  ClerkAuthMiddlewareOptions,
} from './clerkAuth';

// Server-to-Server Auth
export {
  serverAuth,
  apiKeyAuth,
  eitherAuth,
  generateServerAuthHeaders,
  generateServerSignature,
  isServerAuthenticated,
  getServiceName,
  createMockServerAuth,
  ServerAuthError,
} from './serverAuth';

export type {
  ServerAuthContext,
  ServerAuthMiddlewareOptions,
} from './serverAuth';
