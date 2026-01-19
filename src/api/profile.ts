/**
 * Neural Intelligence Platform - Profile API
 *
 * REST endpoints for profile management:
 * - GET /api/profile/:userId - returns computed profile
 * - POST /api/profile/recompute/:userId - triggers recomputation
 * - POST /api/profile/submit - submit questionnaire answers
 *
 * @version 1.0.0
 */

import { Router, Request, Response } from 'express';
import { z } from 'zod';

import { clerkAuth, type AuthContext } from '../middleware/clerkAuth';
import { serverAuth, type ServerAuthContext } from '../middleware/serverAuth';

import type {
  ProfileSnapshot,
  QuestionnaireAnswers,
  ProfileSubmissionEvent,
  ProfileEventType,
} from '../types/profile';

import {
  synthesizeProfile,
  recomputeProfile,
  type AccumulatedAnswers,
} from '../pipeline/profile/profileSynthesis';

import {
  readProfileSnapshotFromConvex,
  readQuestionnaireAnswersFromConvex,
} from '../pipeline/profile/convexSync';

import { readProfileGraph } from '../graph/profile';

// =============================================================================
// TYPE DEFINITIONS
// =============================================================================

/**
 * Extended request with auth context
 */
type AuthenticatedRequest = Request & {
  auth?: AuthContext;
  serverAuth?: ServerAuthContext;
  requestId?: string;
};

/**
 * Helper to extract userId from authenticated request
 * Handles the type compatibility between Express Request and middleware types
 */
function getAuthUserId(req: AuthenticatedRequest): string {
  if (!req.auth) {
    throw new Error('User not authenticated');
  }
  return req.auth.userId;
}

/**
 * API Error response
 */
interface ApiErrorResponse {
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
    requestId?: string;
  };
}

// =============================================================================
// REQUEST SCHEMAS
// =============================================================================

/**
 * Schema for questionnaire answer submission
 */
const questionnaireSubmissionSchemaInternal = z.object({
  moduleId: z.string().min(1),
  moduleVersion: z.string().min(1),
  answers: z.record(
    z.string(),
    z.object({
      type: z.string(),
      value: z.unknown(),
      metadata: z.record(z.string(), z.unknown()).optional(),
    })
  ),
  scopesGranted: z.record(z.string(), z.boolean()),
  isUpdate: z.boolean().optional(),
});

/**
 * Schema for recompute request
 */
const recomputeRequestSchemaInternal = z.object({
  forceRefresh: z.boolean().optional(),
  enableLanceDB: z.boolean().optional(),
  enableNeo4j: z.boolean().optional(),
  enableConvex: z.boolean().optional(),
});

// =============================================================================
// RESPONSE TYPES
// =============================================================================

/**
 * Profile response
 */
interface ProfileResponse {
  success: boolean;
  profile?: ProfileSnapshot;
  graph?: {
    valuesCount: number;
    preferencesCount: number;
    rulesCount: number;
    appPreferencesCount: number;
  };
  meta?: {
    source: 'convex' | 'neo4j' | 'computed';
    timestamp: number;
  };
}

/**
 * Recompute response
 */
interface RecomputeResponse {
  success: boolean;
  profile?: ProfileSnapshot;
  lancedbDocIds?: string[];
  neo4jNodesCreated?: number;
  neo4jRelationshipsCreated?: number;
  errors: string[];
  warnings: string[];
  processingTimeMs: number;
}

/**
 * Submit response
 */
interface SubmitResponse {
  success: boolean;
  profile?: ProfileSnapshot;
  errors: string[];
  warnings: string[];
  processingTimeMs: number;
}

// =============================================================================
// ROUTE HANDLERS
// =============================================================================

/**
 * GET /api/profile/:userId
 * Returns the computed profile for a user
 */
async function handleGetProfile(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  try {
    const userIdParam = req.params.userId;
    const userId = typeof userIdParam === 'string' ? userIdParam : userIdParam?.[0];

    if (!userId) {
      res.status(400).json({
        error: {
          code: 'INVALID_REQUEST',
          message: 'userId is required',
          requestId: req.requestId,
        },
      } as ApiErrorResponse);
      return;
    }

    // Verify access (user can only access their own profile unless admin)
    const requestingUserId = getAuthUserId(req);
    const isAdmin = req.serverAuth?.service === 'admin-service';

    if (userId !== requestingUserId && !isAdmin) {
      res.status(403).json({
        error: {
          code: 'FORBIDDEN',
          message: 'Cannot access another user\'s profile',
          requestId: req.requestId,
        },
      } as ApiErrorResponse);
      return;
    }

    // Try to get profile from Convex first
    let profile = await readProfileSnapshotFromConvex(userId);
    let source: 'convex' | 'neo4j' | 'computed' = 'convex';

    // If not in Convex, try to read from Neo4j graph
    if (!profile) {
      const graphData = await readProfileGraph(userId);
      if (graphData.profile) {
        source = 'neo4j';
        // Convert graph data to profile snapshot format
        profile = graphDataToProfileSnapshot(userId, graphData);
      }
    }

    if (!profile) {
      res.status(404).json({
        error: {
          code: 'NOT_FOUND',
          message: 'Profile not found for user',
          requestId: req.requestId,
        },
      } as ApiErrorResponse);
      return;
    }

    // Get graph stats
    const graphData = await readProfileGraph(userId);
    const graphStats = {
      valuesCount: graphData.values.length,
      preferencesCount: graphData.preferences.length,
      rulesCount: graphData.notificationRules.length,
      appPreferencesCount: graphData.appPreferences.length,
    };

    const response: ProfileResponse = {
      success: true,
      profile,
      graph: graphStats,
      meta: {
        source,
        timestamp: Date.now(),
      },
    };

    res.json(response);
  } catch (error) {
    console.error('[ProfileAPI] Get profile error:', error);
    res.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to get profile',
        requestId: req.requestId,
      },
    } as ApiErrorResponse);
  }
}

/**
 * POST /api/profile/recompute/:userId
 * Triggers profile recomputation from stored questionnaire answers
 */
async function handleRecomputeProfile(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  try {
    const userIdParam = req.params.userId;
    const userId = typeof userIdParam === 'string' ? userIdParam : userIdParam?.[0];

    if (!userId) {
      res.status(400).json({
        error: {
          code: 'INVALID_REQUEST',
          message: 'userId is required',
          requestId: req.requestId,
        },
      } as ApiErrorResponse);
      return;
    }

    // Verify access
    const requestingUserId = getAuthUserId(req);
    const isAdmin = req.serverAuth?.service === 'admin-service';

    if (userId !== requestingUserId && !isAdmin) {
      res.status(403).json({
        error: {
          code: 'FORBIDDEN',
          message: 'Cannot recompute another user\'s profile',
          requestId: req.requestId,
        },
      } as ApiErrorResponse);
      return;
    }

    // Parse and validate request body
    const parseResult = recomputeRequestSchemaInternal.safeParse(req.body);
    if (!parseResult.success) {
      res.status(400).json({
        error: {
          code: 'INVALID_REQUEST',
          message: 'Invalid request body',
          details: parseResult.error.flatten(),
          requestId: req.requestId,
        },
      } as ApiErrorResponse);
      return;
    }

    const options = parseResult.data;

    // Fetch stored questionnaire answers from Convex
    const storedAnswers = await readQuestionnaireAnswersFromConvex(userId);

    if (!storedAnswers) {
      res.status(404).json({
        error: {
          code: 'NOT_FOUND',
          message: 'No questionnaire answers found for user',
          requestId: req.requestId,
        },
      } as ApiErrorResponse);
      return;
    }

    // Convert to AccumulatedAnswers format
    const accumulatedAnswers = convertStoredAnswers(storedAnswers);

    // Recompute profile
    const result = await recomputeProfile(userId, accumulatedAnswers, {
      enableLanceDB: options.enableLanceDB ?? true,
      enableNeo4j: options.enableNeo4j ?? true,
      enableConvex: options.enableConvex ?? true,
    });

    const response: RecomputeResponse = {
      success: result.success,
      errors: result.errors,
      warnings: result.warnings,
      processingTimeMs: result.processingTimeMs,
    };
    if (result.profile !== undefined) {
      response.profile = result.profile;
    }
    if (result.lancedbResult?.docIds !== undefined) {
      response.lancedbDocIds = result.lancedbResult.docIds;
    }
    if (result.neo4jResult?.nodesCreated !== undefined) {
      response.neo4jNodesCreated = result.neo4jResult.nodesCreated;
    }
    if (result.neo4jResult?.relationshipsCreated !== undefined) {
      response.neo4jRelationshipsCreated = result.neo4jResult.relationshipsCreated;
    }

    const statusCode = result.success ? 200 : 500;
    res.status(statusCode).json(response);
  } catch (error) {
    console.error('[ProfileAPI] Recompute error:', error);
    res.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to recompute profile',
        requestId: req.requestId,
      },
    } as ApiErrorResponse);
  }
}

/**
 * POST /api/profile/submit
 * Submit questionnaire answers and trigger profile synthesis
 */
async function handleSubmitQuestionnaire(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  try {
    const userId = getAuthUserId(req);

    // Parse and validate request body
    const parseResult = questionnaireSubmissionSchemaInternal.safeParse(req.body);
    if (!parseResult.success) {
      res.status(400).json({
        error: {
          code: 'INVALID_REQUEST',
          message: 'Invalid questionnaire submission',
          details: parseResult.error.flatten(),
          requestId: req.requestId,
        },
      } as ApiErrorResponse);
      return;
    }

    const submission = parseResult.data;

    // Build questionnaire answers - convert to expected format
    const answersFormatted: Record<string, { type: string; value: unknown }> = {};
    for (const [key, val] of Object.entries(submission.answers)) {
      answersFormatted[key] = { type: val.type, value: val.value };
    }
    const questionnaireAnswers: QuestionnaireAnswers = {
      moduleId: submission.moduleId,
      moduleVersion: submission.moduleVersion,
      answers: answersFormatted,
      scopesGranted: submission.scopesGranted,
    };

    // Determine event type
    const eventType: ProfileEventType = submission.isUpdate
      ? submission.moduleId === 'avatar_core'
        ? 'consent.avatar_core_updated'
        : 'onboarding.module_updated'
      : submission.moduleId === 'avatar_core'
        ? 'consent.avatar_core_submitted'
        : 'onboarding.module_submitted';

    // Build submission event
    const event: ProfileSubmissionEvent = {
      eventType,
      userId,
      timestamp: Date.now(),
      answers: questionnaireAnswers,
      isUpdate: submission.isUpdate ?? false,
    };

    // Get existing answers from Convex
    const storedAnswers = await readQuestionnaireAnswersFromConvex(userId);
    const existingAnswers = storedAnswers
      ? convertStoredAnswers(storedAnswers)
      : {};

    // Synthesize profile
    const result = await synthesizeProfile(event, existingAnswers);

    const response: SubmitResponse = {
      success: result.success,
      errors: result.errors,
      warnings: result.warnings,
      processingTimeMs: result.processingTimeMs,
    };
    if (result.profile !== undefined) {
      response.profile = result.profile;
    }

    const statusCode = result.success ? 200 : 500;
    res.status(statusCode).json(response);
  } catch (error) {
    console.error('[ProfileAPI] Submit error:', error);
    res.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to process questionnaire submission',
        requestId: req.requestId,
      },
    } as ApiErrorResponse);
  }
}

/**
 * GET /api/profile/:userId/graph
 * Returns the profile graph data for a user
 */
async function handleGetProfileGraph(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  try {
    const userIdParam = req.params.userId;
    const userId = typeof userIdParam === 'string' ? userIdParam : userIdParam?.[0];

    if (!userId) {
      res.status(400).json({
        error: {
          code: 'INVALID_REQUEST',
          message: 'userId is required',
          requestId: req.requestId,
        },
      } as ApiErrorResponse);
      return;
    }

    // Verify access
    const requestingUserId = getAuthUserId(req);
    const isAdmin = req.serverAuth?.service === 'admin-service';

    if (userId !== requestingUserId && !isAdmin) {
      res.status(403).json({
        error: {
          code: 'FORBIDDEN',
          message: 'Cannot access another user\'s profile graph',
          requestId: req.requestId,
        },
      } as ApiErrorResponse);
      return;
    }

    const graphData = await readProfileGraph(userId);

    if (!graphData.profile) {
      res.status(404).json({
        error: {
          code: 'NOT_FOUND',
          message: 'Profile graph not found for user',
          requestId: req.requestId,
        },
      } as ApiErrorResponse);
      return;
    }

    res.json({
      success: true,
      data: graphData,
      meta: {
        timestamp: Date.now(),
      },
    });
  } catch (error) {
    console.error('[ProfileAPI] Get graph error:', error);
    res.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to get profile graph',
        requestId: req.requestId,
      },
    } as ApiErrorResponse);
  }
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Converts graph data to ProfileSnapshot format
 */
function graphDataToProfileSnapshot(
  userId: string,
  graphData: {
    profile: Record<string, unknown> | null;
    values: Array<{ category: string; importance: number; description?: string }>;
    preferences: Array<{ type: string; value: unknown; sourceModule?: string }>;
    notificationRules: Array<{
      ruleId: string;
      ruleType: string;
      config: Record<string, unknown>;
      active: boolean;
    }>;
    appPreferences: Array<{
      appId: string;
      preferences: Record<string, unknown>;
      enabled: boolean;
    }>;
  }
): ProfileSnapshot | null {
  if (!graphData.profile) {
    return null;
  }

  const profile = graphData.profile;

  // Extract quiet hours from notification rules
  const quietHoursRule = graphData.notificationRules.find(
    (r) => r.ruleType === 'quiet_hours' && r.active
  );
  const quietHours = quietHoursRule
    ? {
        start: String(quietHoursRule.config.start || '22:00'),
        end: String(quietHoursRule.config.end || '08:00'),
      }
    : null;

  // Extract interrupt events from notification rules
  const interruptRule = graphData.notificationRules.find(
    (r) => r.ruleType === 'interrupt' && r.active
  );
  const interruptFor = interruptRule
    ? (interruptRule.config.events as string[]) || ['urgent', 'emergency']
    : ['urgent', 'emergency'];

  // Build apps from app preferences
  // Using explicit type to satisfy AppNotificationRules expectations
  const apps: Record<string, { enabled: boolean; rules?: unknown[] }> = {};
  for (const appPref of graphData.appPreferences) {
    apps[appPref.appId] = {
      enabled: appPref.enabled,
      ...(appPref.preferences as { rules?: unknown[] }),
    };
  }

  // Extract preferences
  const getPreference = (type: string, defaultValue: unknown): unknown => {
    const pref = graphData.preferences.find((p) => p.type === type);
    return pref ? pref.value : defaultValue;
  };

  return {
    profileVersion: String(profile.profileVersion || '1.0.0'),
    clerkUserId: userId,
    displayName: String(profile.displayName || 'User'),
    timezone: String(profile.timezone || 'UTC'),
    personaSummary: {
      tone: String(getPreference('tone', 'professional')),
      detailLevel: Number(getPreference('detailLevel', 3)),
      coachingIntensity: String(getPreference('coachingIntensity', 'moderate')),
      topPriorities: graphData.values.map((v) => v.category),
      do: profile.doList ? JSON.parse(String(profile.doList)) : [],
      dont: profile.dontList ? JSON.parse(String(profile.dontList)) : [],
    },
    notificationRules: {
      global: {
        mode: String(getPreference('notificationMode', 'all')),
        quietHours,
        interruptFor,
      },
      apps,
    },
    llmPolicy: {
      globalSystemStyle: {
        responseFormat: String(getPreference('responseFormat', 'balanced')) as
          | 'concise'
          | 'detailed'
          | 'balanced',
        formalityLevel: Number(getPreference('formalityLevel', 3)),
      },
      appOverrides: {},
    },
    synthesizedAt: Number(profile.synthesizedAt) || Date.now(),
  };
}

/**
 * Converts stored answers to AccumulatedAnswers format
 */
function convertStoredAnswers(
  storedAnswers: Record<string, Record<string, unknown>>
): AccumulatedAnswers {
  const accumulated: AccumulatedAnswers = {};

  for (const [moduleId, moduleData] of Object.entries(storedAnswers)) {
    const answers: Record<string, { type: string; value: unknown }> = {};

    // Convert each answer to the expected format
    for (const [questionId, value] of Object.entries(moduleData)) {
      if (questionId !== 'moduleVersion' && questionId !== 'scopesGranted') {
        answers[questionId] = {
          type: typeof value,
          value,
        };
      }
    }

    const questionnaire: QuestionnaireAnswers = {
      moduleId,
      moduleVersion: String(moduleData.moduleVersion || '1.0.0'),
      answers,
      scopesGranted:
        (moduleData.scopesGranted as Record<string, boolean>) || {},
    };

    // Map to appropriate key
    switch (moduleId) {
      case 'avatar_core':
        accumulated.avatarCore = questionnaire;
        break;
      case 'email_module':
        accumulated.emailModule = questionnaire;
        break;
      case 'calendar_module':
        accumulated.calendarModule = questionnaire;
        break;
      case 'tasks_module':
        accumulated.tasksModule = questionnaire;
        break;
      case 'finance_module':
        accumulated.financeModule = questionnaire;
        break;
      default:
        accumulated[moduleId] = questionnaire;
    }
  }

  return accumulated;
}

// =============================================================================
// ROUTER CREATION
// =============================================================================

/**
 * Creates the profile API router
 */
export function createProfileRouter(): Router {
  const router = Router();

  // ==========================================================================
  // User routes (Clerk JWT auth)
  // ==========================================================================
  const userRouter = Router();
  userRouter.use(
    clerkAuth({
      skipPaths: [],
    }) as express.RequestHandler
  );

  // Get user's own profile
  userRouter.get('/:userId', handleGetProfile as express.RequestHandler);

  // Get user's profile graph
  userRouter.get('/:userId/graph', handleGetProfileGraph as express.RequestHandler);

  // Submit questionnaire answers
  userRouter.post('/submit', handleSubmitQuestionnaire as express.RequestHandler);

  // Recompute profile
  userRouter.post(
    '/recompute/:userId',
    handleRecomputeProfile as express.RequestHandler
  );

  router.use(userRouter);

  // ==========================================================================
  // Internal routes (server-to-server auth)
  // ==========================================================================
  const internalRouter = Router();
  internalRouter.use(
    serverAuth({
      config: {
        allowedServices: ['convex-webhook', 'admin-service'],
      },
    })
  );

  // Internal recompute (from webhooks)
  internalRouter.post(
    '/internal/recompute/:userId',
    handleRecomputeProfile as express.RequestHandler
  );

  router.use(internalRouter);

  return router;
}

// =============================================================================
// EXPORTS
// =============================================================================

// Import express types for router
import type * as express from 'express';

// Export schemas with the original names
export const questionnaireSubmissionSchema = questionnaireSubmissionSchemaInternal;
export const recomputeRequestSchema = recomputeRequestSchemaInternal;

export {
  // Route handlers (for testing)
  handleGetProfile,
  handleRecomputeProfile,
  handleSubmitQuestionnaire,
  handleGetProfileGraph,

  // Types
  type ProfileResponse,
  type RecomputeResponse,
  type SubmitResponse,

  // Helper functions
  graphDataToProfileSnapshot,
  convertStoredAnswers,
};
