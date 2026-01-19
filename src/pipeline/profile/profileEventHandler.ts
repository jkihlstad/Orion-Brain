/**
 * Neural Intelligence Platform - Profile Event Handler
 *
 * Handles profile-related events from the event pipeline:
 * - consent.avatar_core_submitted
 * - consent.avatar_core_updated
 * - *.onboarding_module_submitted
 * - *.onboarding_module_updated
 *
 * @version 1.0.0
 */

import type {
  ProfileSubmissionEvent,
  ProfileEventType,
  QuestionnaireAnswers,
  ProfileSynthesisResult,
} from '../../types/profile';

import { synthesizeProfile, type AccumulatedAnswers } from './profileSynthesis';
import { readQuestionnaireAnswersFromConvex } from './convexSync';

// =============================================================================
// TYPE DEFINITIONS
// =============================================================================

/**
 * Raw event from the pipeline queue.
 */
export interface PipelineEvent {
  /** Unique event identifier */
  eventId: string;

  /** Event type */
  eventType: string;

  /** User ID */
  userId: string;

  /** Event timestamp */
  timestamp: number;

  /** Event payload */
  payload: Record<string, unknown>;

  /** Trace ID for debugging */
  traceId?: string;
}

/**
 * Result of handling a profile event.
 */
export interface ProfileEventHandlerResult {
  /** Whether the event was handled */
  handled: boolean;

  /** Whether handling succeeded */
  success: boolean;

  /** Profile synthesis result if applicable */
  synthesisResult?: ProfileSynthesisResult;

  /** Error message if failed */
  error?: string;

  /** Processing time in milliseconds */
  processingTimeMs: number;
}

/**
 * Configuration for the profile event handler.
 */
export interface ProfileEventHandlerConfig {
  /** Whether to enable LanceDB embedding */
  enableLanceDB?: boolean;

  /** Whether to enable Neo4j graph writes */
  enableNeo4j?: boolean;

  /** Whether to enable Convex sync */
  enableConvex?: boolean;

  /** Whether to fetch existing answers from Convex */
  fetchExistingAnswers?: boolean;
}

// =============================================================================
// EVENT TYPE PATTERNS
// =============================================================================

/**
 * Profile event type patterns for matching.
 */
const PROFILE_EVENT_PATTERNS = {
  AVATAR_CORE_SUBMITTED: 'consent.avatar_core_submitted',
  AVATAR_CORE_UPDATED: 'consent.avatar_core_updated',
  MODULE_SUBMITTED_SUFFIX: '.onboarding_module_submitted',
  MODULE_UPDATED_SUFFIX: '.onboarding_module_updated',
} as const;

// =============================================================================
// EVENT MATCHING
// =============================================================================

/**
 * Checks if an event is a profile-related event.
 */
export function isProfileEvent(eventType: string): boolean {
  // Check exact matches
  if (
    eventType === PROFILE_EVENT_PATTERNS.AVATAR_CORE_SUBMITTED ||
    eventType === PROFILE_EVENT_PATTERNS.AVATAR_CORE_UPDATED
  ) {
    return true;
  }

  // Check suffix patterns
  if (
    eventType.endsWith(PROFILE_EVENT_PATTERNS.MODULE_SUBMITTED_SUFFIX) ||
    eventType.endsWith(PROFILE_EVENT_PATTERNS.MODULE_UPDATED_SUFFIX)
  ) {
    return true;
  }

  return false;
}

/**
 * Determines the profile event type from a raw event type string.
 */
export function getProfileEventType(eventType: string): ProfileEventType | null {
  if (eventType === PROFILE_EVENT_PATTERNS.AVATAR_CORE_SUBMITTED) {
    return 'consent.avatar_core_submitted';
  }

  if (eventType === PROFILE_EVENT_PATTERNS.AVATAR_CORE_UPDATED) {
    return 'consent.avatar_core_updated';
  }

  if (eventType.endsWith(PROFILE_EVENT_PATTERNS.MODULE_SUBMITTED_SUFFIX)) {
    return 'onboarding.module_submitted';
  }

  if (eventType.endsWith(PROFILE_EVENT_PATTERNS.MODULE_UPDATED_SUFFIX)) {
    return 'onboarding.module_updated';
  }

  return null;
}

/**
 * Extracts the module ID from an event type string.
 */
export function extractModuleIdFromEventType(eventType: string): string {
  if (
    eventType === PROFILE_EVENT_PATTERNS.AVATAR_CORE_SUBMITTED ||
    eventType === PROFILE_EVENT_PATTERNS.AVATAR_CORE_UPDATED
  ) {
    return 'avatar_core';
  }

  // Extract module prefix from pattern like "email.onboarding_module_submitted"
  const parts = eventType.split('.');
  if (parts.length >= 2) {
    return parts[0]!;
  }

  return 'unknown';
}

// =============================================================================
// EVENT CONVERSION
// =============================================================================

/**
 * Converts a pipeline event to a profile submission event.
 */
export function convertToProfileSubmissionEvent(
  event: PipelineEvent
): ProfileSubmissionEvent | null {
  const profileEventType = getProfileEventType(event.eventType);
  if (!profileEventType) {
    return null;
  }

  const moduleId = extractModuleIdFromEventType(event.eventType);
  const isUpdate =
    event.eventType.includes('_updated') ||
    profileEventType === 'consent.avatar_core_updated' ||
    profileEventType === 'onboarding.module_updated';

  // Extract questionnaire answers from payload
  const answers = extractQuestionnaireAnswers(event.payload, moduleId);

  const submissionEvent: ProfileSubmissionEvent = {
    eventType: profileEventType,
    userId: event.userId,
    timestamp: event.timestamp,
    answers,
    isUpdate,
  };

  const previousVersionId = event.payload.previousVersionId as string | undefined;
  if (previousVersionId !== undefined) {
    submissionEvent.previousVersionId = previousVersionId;
  }

  return submissionEvent;
}

/**
 * Extracts questionnaire answers from event payload.
 */
function extractQuestionnaireAnswers(
  payload: Record<string, unknown>,
  moduleId: string
): QuestionnaireAnswers {
  // Try to get answers from different payload structures
  const rawAnswers = (payload.answers as Record<string, unknown>) ||
    (payload.questionnaireAnswers as Record<string, unknown>) ||
    payload;

  const answers: Record<string, { type: string; value: unknown }> = {};

  for (const [key, value] of Object.entries(rawAnswers)) {
    // Skip metadata fields
    if (['moduleId', 'moduleVersion', 'scopesGranted', 'timestamp', 'userId'].includes(key)) {
      continue;
    }

    // Check if value is already in the expected format
    if (
      value &&
      typeof value === 'object' &&
      'type' in value &&
      'value' in value
    ) {
      answers[key] = value as { type: string; value: unknown };
    } else {
      // Convert to expected format
      answers[key] = {
        type: getValueType(value),
        value,
      };
    }
  }

  return {
    moduleId: (payload.moduleId as string) || moduleId,
    moduleVersion: (payload.moduleVersion as string) || '1.0.0',
    answers,
    scopesGranted: (payload.scopesGranted as Record<string, boolean>) || {},
  };
}

/**
 * Determines the type string for a value.
 */
function getValueType(value: unknown): string {
  if (value === null || value === undefined) {
    return 'null';
  }
  if (Array.isArray(value)) {
    return 'array';
  }
  return typeof value;
}

// =============================================================================
// MAIN HANDLER FUNCTION
// =============================================================================

/**
 * Handles a profile-related event from the pipeline.
 *
 * @param event - Pipeline event to handle
 * @param config - Handler configuration
 * @returns ProfileEventHandlerResult
 */
export async function handleProfileEvent(
  event: PipelineEvent,
  config: ProfileEventHandlerConfig = {}
): Promise<ProfileEventHandlerResult> {
  const startTime = Date.now();

  // Check if this is a profile event
  if (!isProfileEvent(event.eventType)) {
    return {
      handled: false,
      success: true,
      processingTimeMs: Date.now() - startTime,
    };
  }

  try {
    // Convert to profile submission event
    const submissionEvent = convertToProfileSubmissionEvent(event);
    if (!submissionEvent) {
      return {
        handled: false,
        success: true,
        error: 'Failed to convert pipeline event to profile submission event',
        processingTimeMs: Date.now() - startTime,
      };
    }

    // Fetch existing answers from Convex if enabled
    let existingAnswers: AccumulatedAnswers = {};
    if (config.fetchExistingAnswers !== false) {
      const storedAnswers = await readQuestionnaireAnswersFromConvex(event.userId);
      if (storedAnswers) {
        existingAnswers = convertStoredAnswersToAccumulated(storedAnswers);
      }
    }

    // Synthesize profile
    const synthesisResult = await synthesizeProfile(
      submissionEvent,
      existingAnswers,
      {
        enableLanceDB: config.enableLanceDB ?? true,
        enableNeo4j: config.enableNeo4j ?? true,
        enableConvex: config.enableConvex ?? true,
      }
    );

    const handlerResult: ProfileEventHandlerResult = {
      handled: true,
      success: synthesisResult.success,
      synthesisResult,
      processingTimeMs: Date.now() - startTime,
    };

    if (synthesisResult.errors.length > 0) {
      handlerResult.error = synthesisResult.errors.join('; ');
    }

    return handlerResult;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return {
      handled: true,
      success: false,
      error: message,
      processingTimeMs: Date.now() - startTime,
    };
  }
}

/**
 * Converts stored answers from Convex to AccumulatedAnswers format.
 */
function convertStoredAnswersToAccumulated(
  storedAnswers: Record<string, Record<string, unknown>>
): AccumulatedAnswers {
  const accumulated: AccumulatedAnswers = {};

  for (const [moduleId, moduleData] of Object.entries(storedAnswers)) {
    const answers: Record<string, { type: string; value: unknown }> = {};

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
      scopesGranted: (moduleData.scopesGranted as Record<string, boolean>) || {},
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
// BATCH HANDLER
// =============================================================================

/**
 * Handles a batch of profile events.
 *
 * @param events - Array of pipeline events
 * @param config - Handler configuration
 * @returns Array of handler results
 */
export async function handleProfileEventBatch(
  events: PipelineEvent[],
  config: ProfileEventHandlerConfig = {}
): Promise<ProfileEventHandlerResult[]> {
  const results: ProfileEventHandlerResult[] = [];

  for (const event of events) {
    const result = await handleProfileEvent(event, config);
    results.push(result);
  }

  return results;
}

// =============================================================================
// EXPORTS
// =============================================================================

export {
  PROFILE_EVENT_PATTERNS,
  extractQuestionnaireAnswers,
  convertStoredAnswersToAccumulated,
};
