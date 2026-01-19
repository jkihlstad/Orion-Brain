/**
 * Neural Intelligence Platform - Convex Profile Sync
 *
 * Handles synchronization of profile snapshots to Convex for client access.
 * Uses HTTP API to call Convex mutations for profile storage.
 *
 * @version 1.0.0
 */

import type { ProfileSnapshot, AppNotificationRules } from '../../types/profile';

// =============================================================================
// TYPE DEFINITIONS
// =============================================================================

/**
 * Result of Convex sync operation.
 */
export interface ConvexSyncResult {
  /** Whether sync succeeded */
  success: boolean;

  /** Convex document ID if created/updated */
  documentId?: string;

  /** Error message if failed */
  error?: string;

  /** Processing time in milliseconds */
  processingTimeMs?: number;
}

/**
 * Configuration for Convex sync operations.
 */
export interface ConvexSyncConfig {
  /** Convex deployment URL */
  deploymentUrl?: string;

  /** Convex HTTP Actions URL */
  actionsUrl?: string;

  /** Admin key for server-to-server auth */
  adminKey?: string;

  /** Request timeout in milliseconds */
  timeoutMs?: number;

  /** Number of retry attempts */
  maxRetries?: number;
}

/**
 * Convex mutation request payload.
 */
interface ConvexMutationPayload {
  /** Path to the mutation function */
  path: string;

  /** Arguments to pass to the mutation */
  args: Record<string, unknown>;

  /** Format for the response */
  format?: 'json';
}

/**
 * Convex mutation response.
 */
interface ConvexMutationResponse {
  /** Mutation result value */
  value?: unknown;

  /** Error status */
  status?: 'error';

  /** Error message */
  errorMessage?: string;

  /** Error data */
  errorData?: unknown;
}

// =============================================================================
// DEFAULT CONFIGURATION
// =============================================================================

const DEFAULT_CONFIG: Required<ConvexSyncConfig> = {
  deploymentUrl: process.env.CONVEX_URL || '',
  actionsUrl: process.env.CONVEX_HTTP_ACTIONS_URL || '',
  adminKey: process.env.CONVEX_ADMIN_KEY || '',
  timeoutMs: 30000,
  maxRetries: 3,
};

// =============================================================================
// MAIN SYNC FUNCTION
// =============================================================================

/**
 * Writes a profile snapshot to Convex.
 *
 * @param userId - User ID
 * @param profile - Profile snapshot to sync
 * @param config - Sync configuration
 * @returns ConvexSyncResult
 */
export async function writeProfileSnapshotToConvex(
  userId: string,
  profile: ProfileSnapshot,
  config: ConvexSyncConfig = {}
): Promise<ConvexSyncResult> {
  const startTime = Date.now();
  const mergedConfig = { ...DEFAULT_CONFIG, ...config };

  // Validate configuration
  if (!mergedConfig.deploymentUrl && !mergedConfig.actionsUrl) {
    return {
      success: false,
      error: 'Convex deployment URL not configured',
      processingTimeMs: Date.now() - startTime,
    };
  }

  try {
    // Prepare mutation payload
    const mutationPayload: ConvexMutationPayload = {
      path: 'profiles:upsertProfile',
      args: {
        userId,
        profile: serializeProfileForConvex(profile),
      },
      format: 'json',
    };

    // Execute mutation with retry
    const response = await executeConvexMutation(mutationPayload, mergedConfig);

    if (response.status === 'error') {
      return {
        success: false,
        error: response.errorMessage || 'Convex mutation failed',
        processingTimeMs: Date.now() - startTime,
      };
    }

    // Extract document ID from response
    const documentId =
      response.value && typeof response.value === 'object'
        ? (response.value as Record<string, unknown>).documentId as string
        : undefined;

    const result: ConvexSyncResult = {
      success: true,
      processingTimeMs: Date.now() - startTime,
    };
    if (documentId !== undefined) {
      result.documentId = documentId;
    }
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return {
      success: false,
      error: message,
      processingTimeMs: Date.now() - startTime,
    };
  }
}

// =============================================================================
// READ OPERATIONS
// =============================================================================

/**
 * Reads a profile snapshot from Convex.
 *
 * @param userId - User ID
 * @param config - Sync configuration
 * @returns ProfileSnapshot or null if not found
 */
export async function readProfileSnapshotFromConvex(
  userId: string,
  config: ConvexSyncConfig = {}
): Promise<ProfileSnapshot | null> {
  const mergedConfig = { ...DEFAULT_CONFIG, ...config };

  if (!mergedConfig.deploymentUrl && !mergedConfig.actionsUrl) {
    console.warn('[ConvexSync] Convex deployment URL not configured');
    return null;
  }

  try {
    const queryPayload: ConvexMutationPayload = {
      path: 'profiles:getProfile',
      args: { userId },
      format: 'json',
    };

    const response = await executeConvexMutation(queryPayload, mergedConfig);

    if (response.status === 'error' || !response.value) {
      return null;
    }

    return deserializeProfileFromConvex(response.value as Record<string, unknown>);
  } catch (error) {
    console.error('[ConvexSync] Read error:', error);
    return null;
  }
}

/**
 * Reads all questionnaire answers for a user from Convex.
 *
 * @param userId - User ID
 * @param config - Sync configuration
 * @returns Record of module answers or null
 */
export async function readQuestionnaireAnswersFromConvex(
  userId: string,
  config: ConvexSyncConfig = {}
): Promise<Record<string, Record<string, unknown>> | null> {
  const mergedConfig = { ...DEFAULT_CONFIG, ...config };

  if (!mergedConfig.deploymentUrl && !mergedConfig.actionsUrl) {
    console.warn('[ConvexSync] Convex deployment URL not configured');
    return null;
  }

  try {
    const queryPayload: ConvexMutationPayload = {
      path: 'profiles:getQuestionnaireAnswers',
      args: { userId },
      format: 'json',
    };

    const response = await executeConvexMutation(queryPayload, mergedConfig);

    if (response.status === 'error' || !response.value) {
      return null;
    }

    return response.value as Record<string, Record<string, unknown>>;
  } catch (error) {
    console.error('[ConvexSync] Read answers error:', error);
    return null;
  }
}

// =============================================================================
// DELETE OPERATIONS
// =============================================================================

/**
 * Deletes a profile snapshot from Convex.
 *
 * @param userId - User ID
 * @param config - Sync configuration
 * @returns Whether deletion succeeded
 */
export async function deleteProfileSnapshotFromConvex(
  userId: string,
  config: ConvexSyncConfig = {}
): Promise<boolean> {
  const mergedConfig = { ...DEFAULT_CONFIG, ...config };

  if (!mergedConfig.deploymentUrl && !mergedConfig.actionsUrl) {
    console.warn('[ConvexSync] Convex deployment URL not configured');
    return false;
  }

  try {
    const mutationPayload: ConvexMutationPayload = {
      path: 'profiles:deleteProfile',
      args: { userId },
      format: 'json',
    };

    const response = await executeConvexMutation(mutationPayload, mergedConfig);

    return response.status !== 'error';
  } catch (error) {
    console.error('[ConvexSync] Delete error:', error);
    return false;
  }
}

// =============================================================================
// HTTP EXECUTION
// =============================================================================

/**
 * Executes a Convex mutation via HTTP API.
 */
async function executeConvexMutation(
  payload: ConvexMutationPayload,
  config: Required<ConvexSyncConfig>
): Promise<ConvexMutationResponse> {
  const url = config.actionsUrl || `${config.deploymentUrl}/api/mutation`;

  let lastError: Error | null = null;

  for (let attempt = 0; attempt < config.maxRetries; attempt++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), config.timeoutMs);

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(config.adminKey ? { Authorization: `Bearer ${config.adminKey}` } : {}),
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Convex HTTP error ${response.status}: ${errorText}`);
      }

      const result = (await response.json()) as ConvexMutationResponse;
      return result;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      // Don't retry on non-retryable errors
      if (isNonRetryableError(lastError)) {
        throw lastError;
      }

      // Wait before retrying
      if (attempt < config.maxRetries - 1) {
        await delay(Math.pow(2, attempt) * 1000); // Exponential backoff
      }
    }
  }

  throw lastError || new Error('Convex mutation failed after all retries');
}

/**
 * Checks if an error is non-retryable.
 */
function isNonRetryableError(error: Error): boolean {
  const nonRetryablePatterns = [
    'Invalid argument',
    'Authentication failed',
    'Authorization failed',
    'Not found',
    '401',
    '403',
    '404',
  ];

  return nonRetryablePatterns.some((pattern) =>
    error.message.toLowerCase().includes(pattern.toLowerCase())
  );
}

/**
 * Delays execution for a specified time.
 */
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// =============================================================================
// SERIALIZATION
// =============================================================================

/**
 * Serializes a ProfileSnapshot for Convex storage.
 */
function serializeProfileForConvex(
  profile: ProfileSnapshot
): Record<string, unknown> {
  return {
    profileVersion: profile.profileVersion,
    clerkUserId: profile.clerkUserId,
    displayName: profile.displayName,
    timezone: profile.timezone,
    personaSummary: {
      tone: profile.personaSummary.tone,
      detailLevel: profile.personaSummary.detailLevel,
      coachingIntensity: profile.personaSummary.coachingIntensity,
      topPriorities: profile.personaSummary.topPriorities,
      do: profile.personaSummary.do,
      dont: profile.personaSummary.dont,
    },
    notificationRules: {
      global: {
        mode: profile.notificationRules.global.mode,
        quietHours: profile.notificationRules.global.quietHours,
        interruptFor: profile.notificationRules.global.interruptFor,
      },
      apps: profile.notificationRules.apps,
    },
    llmPolicy: {
      globalSystemStyle: profile.llmPolicy.globalSystemStyle,
      appOverrides: profile.llmPolicy.appOverrides,
    },
    vectorMemoryRefs: profile.vectorMemoryRefs,
    synthesizedAt: profile.synthesizedAt || Date.now(),
    sourceEventIds: profile.sourceEventIds || [],
  };
}

/**
 * Deserializes a ProfileSnapshot from Convex storage.
 */
function deserializeProfileFromConvex(
  data: Record<string, unknown>
): ProfileSnapshot {
  const personaSummary = data.personaSummary as Record<string, unknown> || {};
  const notificationRules = data.notificationRules as Record<string, unknown> || {};
  const globalNotif = notificationRules.global as Record<string, unknown> || {};
  const llmPolicy = data.llmPolicy as Record<string, unknown> || {};

  return {
    profileVersion: String(data.profileVersion || '1.0.0'),
    clerkUserId: String(data.clerkUserId || ''),
    displayName: String(data.displayName || 'User'),
    timezone: String(data.timezone || 'UTC'),
    personaSummary: {
      tone: String(personaSummary.tone || 'professional'),
      detailLevel: Number(personaSummary.detailLevel || 3),
      coachingIntensity: String(personaSummary.coachingIntensity || 'moderate'),
      topPriorities: Array.isArray(personaSummary.topPriorities)
        ? personaSummary.topPriorities.map(String)
        : [],
      do: Array.isArray(personaSummary.do)
        ? personaSummary.do.map(String)
        : [],
      dont: Array.isArray(personaSummary.dont)
        ? personaSummary.dont.map(String)
        : [],
    },
    notificationRules: {
      global: {
        mode: String(globalNotif.mode || 'all'),
        quietHours: globalNotif.quietHours as { start: string; end: string } | null || null,
        interruptFor: Array.isArray(globalNotif.interruptFor)
          ? globalNotif.interruptFor.map(String)
          : ['urgent', 'emergency'],
      },
      apps: (notificationRules.apps as Record<string, AppNotificationRules>) || {},
    },
    llmPolicy: {
      globalSystemStyle: (llmPolicy.globalSystemStyle as Record<string, unknown>) || {
        responseFormat: 'balanced',
        includeReasoning: true,
        formalityLevel: 3,
        maxResponseLength: 'medium',
        useTechnicalTerms: false,
      },
      appOverrides: (llmPolicy.appOverrides as Record<string, Record<string, unknown>>) || {},
    },
    vectorMemoryRefs: (data.vectorMemoryRefs as ProfileSnapshot['vectorMemoryRefs']) || {
      personaEmbeddingId: null,
      preferencesEmbeddingId: null,
    },
    synthesizedAt: Number(data.synthesizedAt) || Date.now(),
    sourceEventIds: Array.isArray(data.sourceEventIds)
      ? data.sourceEventIds.map(String)
      : [],
  };
}

// =============================================================================
// EXPORTS
// =============================================================================

export {
  type ConvexMutationPayload,
  type ConvexMutationResponse,
  serializeProfileForConvex,
  deserializeProfileFromConvex,
  executeConvexMutation,
};
