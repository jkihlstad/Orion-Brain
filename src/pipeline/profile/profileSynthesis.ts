/**
 * Neural Intelligence Platform - Profile Synthesis Pipeline
 *
 * Main orchestration for synthesizing user profiles from questionnaire submissions.
 * Takes questionnaire answers and produces a complete ProfileSnapshot, then:
 * - Embeds profile to LanceDB for semantic search
 * - Writes profile graph to Neo4j for relationship queries
 * - Syncs profile snapshot to Convex for client access
 *
 * @version 1.0.0
 */

import type {
  ProfileSnapshot,
  PersonaSummary,
  NotificationRules,
  LLMPolicy,
  QuestionnaireAnswers,
  ProfileSubmissionEvent,
  ProfileSynthesisResult,
  QuestionAnswer,
  GlobalNotificationSettings,
  AppNotificationRules,
  LLMStyleConfig,
  LanceDBProfileRef,
} from '../../types/profile';

import {
  PROFILE_SCHEMA_VERSION,
  DEFAULT_PERSONA_SUMMARY,
  DEFAULT_NOTIFICATION_RULES,
  DEFAULT_LLM_POLICY,
  MODULE_IDS,
} from '../../types/profile';

import { embedProfileToLanceDB, type ProfileEmbeddingResult } from './profileEmbedding';
import { writeProfileSnapshotToConvex, type ConvexSyncResult } from './convexSync';
import { writeProfileGraphToNeo4j, type Neo4jProfileResult } from '../../graph/profile';

// =============================================================================
// TYPE DEFINITIONS
// =============================================================================

/**
 * Configuration for profile synthesis.
 */
export interface ProfileSynthesisConfig {
  /** Whether to embed profile to LanceDB */
  enableLanceDB?: boolean;

  /** Whether to write profile graph to Neo4j */
  enableNeo4j?: boolean;

  /** Whether to sync profile to Convex */
  enableConvex?: boolean;

  /** Maximum retry attempts for external operations */
  maxRetries?: number;

  /** Whether to continue on partial failures */
  continueOnError?: boolean;
}

/**
 * Accumulated questionnaire answers from multiple modules.
 */
export interface AccumulatedAnswers {
  /** Avatar core answers */
  avatarCore?: QuestionnaireAnswers;

  /** Email module answers */
  emailModule?: QuestionnaireAnswers;

  /** Calendar module answers */
  calendarModule?: QuestionnaireAnswers;

  /** Tasks module answers */
  tasksModule?: QuestionnaireAnswers;

  /** Finance module answers */
  financeModule?: QuestionnaireAnswers;

  /** Additional module answers */
  [key: string]: QuestionnaireAnswers | undefined;
}

// =============================================================================
// DEFAULT CONFIGURATION
// =============================================================================

const DEFAULT_CONFIG: Required<ProfileSynthesisConfig> = {
  enableLanceDB: true,
  enableNeo4j: true,
  enableConvex: true,
  maxRetries: 3,
  continueOnError: true,
};

// =============================================================================
// MAIN SYNTHESIS FUNCTION
// =============================================================================

/**
 * Synthesizes a complete user profile from questionnaire submission events.
 *
 * @param event - Profile submission event containing questionnaire answers
 * @param existingAnswers - Previously submitted answers from other modules
 * @param config - Synthesis configuration options
 * @returns ProfileSynthesisResult with the synthesized profile and operation results
 */
export async function synthesizeProfile(
  event: ProfileSubmissionEvent,
  existingAnswers: AccumulatedAnswers = {},
  config: ProfileSynthesisConfig = {}
): Promise<ProfileSynthesisResult> {
  const startTime = Date.now();
  const errors: string[] = [];
  const warnings: string[] = [];

  const mergedConfig = { ...DEFAULT_CONFIG, ...config };

  try {
    // Step 1: Merge new answers with existing answers
    const allAnswers = mergeAnswers(existingAnswers, event.answers);

    // Step 2: Extract and canonicalize answers
    const canonicalizedAnswers = canonicalizeAnswers(allAnswers);

    // Step 3: Compute PersonaSummary from avatar_core answers
    const personaSummary = computePersonaSummary(allAnswers.avatarCore);

    // Step 4: Compute NotificationRules from all module answers
    const notificationRules = computeNotificationRules(allAnswers);

    // Step 5: Compute LLMPolicy from preferences
    const llmPolicy = computeLLMPolicy(allAnswers);

    // Step 6: Build the profile snapshot
    const profile: ProfileSnapshot = {
      profileVersion: PROFILE_SCHEMA_VERSION,
      clerkUserId: event.userId,
      displayName: extractDisplayName(allAnswers),
      timezone: extractTimezone(allAnswers),
      personaSummary,
      notificationRules,
      llmPolicy,
      synthesizedAt: Date.now(),
      sourceEventIds: [event.answers.moduleId],
    };

    // Step 7: Embed profile to LanceDB
    let lancedbResult: ProfileEmbeddingResult | undefined;
    if (mergedConfig.enableLanceDB) {
      try {
        lancedbResult = await embedProfileToLanceDB(event.userId, canonicalizedAnswers);
        if (!lancedbResult.success) {
          errors.push(`LanceDB embedding failed: ${lancedbResult.error}`);
        } else {
          // Add vector memory refs to profile
          const lancedbRef: LanceDBProfileRef = {
            profileDocId: lancedbResult.docIds[0] || '',
            updatedAt: Date.now(),
          };
          if (lancedbResult.moduleDocIds !== undefined) {
            lancedbRef.moduleDocIds = lancedbResult.moduleDocIds;
          }
          profile.vectorMemoryRefs = {
            lancedb: lancedbRef,
          };
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        errors.push(`LanceDB embedding error: ${message}`);
        if (!mergedConfig.continueOnError) {
          throw error;
        }
      }
    }

    // Step 8: Write profile graph to Neo4j
    let neo4jResult: Neo4jProfileResult | undefined;
    if (mergedConfig.enableNeo4j) {
      try {
        neo4jResult = await writeProfileGraphToNeo4j(event.userId, profile);
        if (!neo4jResult.success) {
          errors.push(`Neo4j write failed: ${neo4jResult.error}`);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        errors.push(`Neo4j write error: ${message}`);
        if (!mergedConfig.continueOnError) {
          throw error;
        }
      }
    }

    // Step 9: Sync profile to Convex
    let convexResult: ConvexSyncResult | undefined;
    if (mergedConfig.enableConvex) {
      try {
        convexResult = await writeProfileSnapshotToConvex(event.userId, profile);
        if (!convexResult.success) {
          errors.push(`Convex sync failed: ${convexResult.error}`);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        errors.push(`Convex sync error: ${message}`);
        if (!mergedConfig.continueOnError) {
          throw error;
        }
      }
    }

    const result: ProfileSynthesisResult = {
      success: errors.length === 0,
      profile,
      errors,
      warnings,
      processingTimeMs: Date.now() - startTime,
    };

    if (lancedbResult) {
      const lancedbOutput: { success: boolean; docIds: string[]; error?: string } = {
        success: lancedbResult.success,
        docIds: lancedbResult.docIds,
      };
      if (lancedbResult.error !== undefined) {
        lancedbOutput.error = lancedbResult.error;
      }
      result.lancedbResult = lancedbOutput;
    }

    if (neo4jResult) {
      const neo4jOutput: { success: boolean; nodesCreated: number; relationshipsCreated: number; error?: string } = {
        success: neo4jResult.success,
        nodesCreated: neo4jResult.nodesCreated,
        relationshipsCreated: neo4jResult.relationshipsCreated,
      };
      if (neo4jResult.error !== undefined) {
        neo4jOutput.error = neo4jResult.error;
      }
      result.neo4jResult = neo4jOutput;
    }

    if (convexResult) {
      const convexOutput: { success: boolean; documentId?: string; error?: string } = {
        success: convexResult.success,
      };
      if (convexResult.documentId !== undefined) {
        convexOutput.documentId = convexResult.documentId;
      }
      if (convexResult.error !== undefined) {
        convexOutput.error = convexResult.error;
      }
      result.convexResult = convexOutput;
    }

    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    errors.push(`Profile synthesis failed: ${message}`);

    return {
      success: false,
      errors,
      warnings,
      processingTimeMs: Date.now() - startTime,
    };
  }
}

// =============================================================================
// ANSWER MERGING AND CANONICALIZATION
// =============================================================================

/**
 * Merges new questionnaire answers with existing answers.
 */
function mergeAnswers(
  existing: AccumulatedAnswers,
  newAnswers: QuestionnaireAnswers
): AccumulatedAnswers {
  const moduleId = newAnswers.moduleId;
  const merged = { ...existing };

  switch (moduleId) {
    case MODULE_IDS.AVATAR_CORE:
      merged.avatarCore = newAnswers;
      break;
    case MODULE_IDS.EMAIL_MODULE:
      merged.emailModule = newAnswers;
      break;
    case MODULE_IDS.CALENDAR_MODULE:
      merged.calendarModule = newAnswers;
      break;
    case MODULE_IDS.TASKS_MODULE:
      merged.tasksModule = newAnswers;
      break;
    case MODULE_IDS.FINANCE_MODULE:
      merged.financeModule = newAnswers;
      break;
    default:
      merged[moduleId] = newAnswers;
  }

  return merged;
}

/**
 * Canonicalizes answers into a structured format for processing.
 */
function canonicalizeAnswers(
  answers: AccumulatedAnswers
): Record<string, Record<string, unknown>> {
  const canonicalized: Record<string, Record<string, unknown>> = {};

  for (const [moduleKey, moduleAnswers] of Object.entries(answers)) {
    if (moduleAnswers) {
      canonicalized[moduleKey] = {};
      for (const [questionId, answer] of Object.entries(moduleAnswers.answers)) {
        canonicalized[moduleKey][questionId] = answer.value;
      }
    }
  }

  return canonicalized;
}

// =============================================================================
// PERSONA SUMMARY COMPUTATION
// =============================================================================

/**
 * Computes PersonaSummary from avatar_core questionnaire answers.
 */
function computePersonaSummary(avatarCore?: QuestionnaireAnswers): PersonaSummary {
  if (!avatarCore) {
    return { ...DEFAULT_PERSONA_SUMMARY };
  }

  const answers = avatarCore.answers;

  return {
    tone: extractStringAnswer(answers, 'communication_tone', 'professional'),
    detailLevel: extractNumberAnswer(answers, 'detail_level', 3),
    coachingIntensity: extractStringAnswer(answers, 'coaching_intensity', 'moderate'),
    topPriorities: extractArrayAnswer(answers, 'top_priorities', []),
    do: extractArrayAnswer(answers, 'assistant_do', []),
    dont: extractArrayAnswer(answers, 'assistant_dont', []),
  };
}

// =============================================================================
// NOTIFICATION RULES COMPUTATION
// =============================================================================

/**
 * Computes NotificationRules from all module answers.
 */
function computeNotificationRules(answers: AccumulatedAnswers): NotificationRules {
  const globalSettings = computeGlobalNotificationSettings(answers.avatarCore);
  const appRules = computeAppNotificationRules(answers);

  return {
    global: globalSettings,
    apps: appRules,
  };
}

/**
 * Computes global notification settings from avatar_core answers.
 */
function computeGlobalNotificationSettings(
  avatarCore?: QuestionnaireAnswers
): GlobalNotificationSettings {
  if (!avatarCore) {
    return { ...DEFAULT_NOTIFICATION_RULES.global };
  }

  const answers = avatarCore.answers;

  // Extract quiet hours if configured
  let quietHours = null;
  const quietHoursEnabled = extractBooleanAnswer(answers, 'quiet_hours_enabled', false);
  if (quietHoursEnabled) {
    const start = extractStringAnswer(answers, 'quiet_hours_start', '22:00');
    const end = extractStringAnswer(answers, 'quiet_hours_end', '08:00');
    quietHours = { start, end };
  }

  return {
    mode: extractStringAnswer(answers, 'notification_mode', 'all'),
    quietHours,
    interruptFor: extractArrayAnswer(answers, 'interrupt_for', ['urgent', 'emergency']),
  };
}

/**
 * Computes per-app notification rules from module answers.
 */
function computeAppNotificationRules(
  answers: AccumulatedAnswers
): Record<string, AppNotificationRules> {
  const appRules: Record<string, AppNotificationRules> = {};

  // Email module notifications
  if (answers.emailModule) {
    appRules.email = extractAppNotificationRules(answers.emailModule, 'email');
  }

  // Calendar module notifications
  if (answers.calendarModule) {
    appRules.calendar = extractAppNotificationRules(answers.calendarModule, 'calendar');
  }

  // Tasks module notifications
  if (answers.tasksModule) {
    appRules.tasks = extractAppNotificationRules(answers.tasksModule, 'tasks');
  }

  // Finance module notifications
  if (answers.financeModule) {
    appRules.finance = extractAppNotificationRules(answers.financeModule, 'finance');
  }

  return appRules;
}

/**
 * Extracts app-specific notification rules from module answers.
 */
function extractAppNotificationRules(
  moduleAnswers: QuestionnaireAnswers,
  appPrefix: string
): AppNotificationRules {
  const answers = moduleAnswers.answers;

  const rules: AppNotificationRules = {
    enabled: extractBooleanAnswer(answers, `${appPrefix}_notifications_enabled`, true),
  };

  const mode = extractStringAnswer(answers, `${appPrefix}_notification_mode`, undefined);
  if (mode !== undefined) {
    rules.mode = mode;
  }

  const interruptFor = extractArrayAnswer<string>(answers, `${appPrefix}_interrupt_for`, undefined);
  if (interruptFor !== undefined) {
    rules.interruptFor = interruptFor;
  }

  return rules;
}

// =============================================================================
// LLM POLICY COMPUTATION
// =============================================================================

/**
 * Computes LLMPolicy from preferences in all module answers.
 */
function computeLLMPolicy(answers: AccumulatedAnswers): LLMPolicy {
  const globalStyle = computeGlobalLLMStyle(answers.avatarCore);
  const appOverrides = computeAppLLMOverrides(answers);

  return {
    globalSystemStyle: globalStyle,
    appOverrides,
  };
}

/**
 * Computes global LLM style from avatar_core answers.
 */
function computeGlobalLLMStyle(avatarCore?: QuestionnaireAnswers): LLMStyleConfig {
  if (!avatarCore) {
    return { ...DEFAULT_LLM_POLICY.globalSystemStyle };
  }

  const answers = avatarCore.answers;

  return {
    responseFormat: extractStringAnswer(answers, 'response_format', 'balanced') as
      | 'concise'
      | 'detailed'
      | 'balanced',
    includeReasoning: extractBooleanAnswer(answers, 'include_reasoning', true),
    formalityLevel: extractNumberAnswer(answers, 'formality_level', 3),
    maxResponseLength: extractStringAnswer(answers, 'response_length', 'medium') as
      | 'short'
      | 'medium'
      | 'long',
    useTechnicalTerms: extractBooleanAnswer(answers, 'use_technical_terms', false),
  };
}

/**
 * Computes per-app LLM style overrides from module answers.
 */
function computeAppLLMOverrides(
  answers: AccumulatedAnswers
): Record<string, LLMStyleConfig> {
  const overrides: Record<string, LLMStyleConfig> = {};

  // Email module LLM style
  if (answers.emailModule) {
    const emailStyle = extractAppLLMStyle(answers.emailModule, 'email');
    if (Object.keys(emailStyle).length > 0) {
      overrides.email = emailStyle;
    }
  }

  // Calendar module LLM style
  if (answers.calendarModule) {
    const calendarStyle = extractAppLLMStyle(answers.calendarModule, 'calendar');
    if (Object.keys(calendarStyle).length > 0) {
      overrides.calendar = calendarStyle;
    }
  }

  // Tasks module LLM style
  if (answers.tasksModule) {
    const tasksStyle = extractAppLLMStyle(answers.tasksModule, 'tasks');
    if (Object.keys(tasksStyle).length > 0) {
      overrides.tasks = tasksStyle;
    }
  }

  // Finance module LLM style
  if (answers.financeModule) {
    const financeStyle = extractAppLLMStyle(answers.financeModule, 'finance');
    if (Object.keys(financeStyle).length > 0) {
      overrides.finance = financeStyle;
    }
  }

  return overrides;
}

/**
 * Extracts app-specific LLM style from module answers.
 */
function extractAppLLMStyle(
  moduleAnswers: QuestionnaireAnswers,
  appPrefix: string
): LLMStyleConfig {
  const answers = moduleAnswers.answers;
  const style: LLMStyleConfig = {};

  const responseFormat = extractStringAnswer(
    answers,
    `${appPrefix}_response_format`,
    undefined
  );
  if (responseFormat) {
    style.responseFormat = responseFormat as 'concise' | 'detailed' | 'balanced';
  }

  const formalityLevel = extractNumberAnswer(
    answers,
    `${appPrefix}_formality_level`,
    undefined
  );
  if (formalityLevel !== undefined) {
    style.formalityLevel = formalityLevel;
  }

  return style;
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Extracts display name from answers.
 */
function extractDisplayName(answers: AccumulatedAnswers): string {
  if (answers.avatarCore) {
    const displayName = extractStringAnswer(
      answers.avatarCore.answers,
      'display_name',
      undefined
    );
    if (displayName) {
      return displayName;
    }
  }
  return 'User';
}

/**
 * Extracts timezone from answers.
 */
function extractTimezone(answers: AccumulatedAnswers): string {
  if (answers.avatarCore) {
    const timezone = extractStringAnswer(
      answers.avatarCore.answers,
      'timezone',
      undefined
    );
    if (timezone) {
      return timezone;
    }
  }
  return 'UTC';
}

/**
 * Extracts a string answer value.
 */
function extractStringAnswer(
  answers: Record<string, QuestionAnswer>,
  questionId: string,
  defaultValue: string
): string;
function extractStringAnswer(
  answers: Record<string, QuestionAnswer>,
  questionId: string,
  defaultValue: undefined
): string | undefined;
function extractStringAnswer(
  answers: Record<string, QuestionAnswer>,
  questionId: string,
  defaultValue: string | undefined
): string | undefined {
  const answer = answers[questionId];
  if (answer && typeof answer.value === 'string') {
    return answer.value;
  }
  return defaultValue;
}

/**
 * Extracts a number answer value.
 */
function extractNumberAnswer(
  answers: Record<string, QuestionAnswer>,
  questionId: string,
  defaultValue: number
): number;
function extractNumberAnswer(
  answers: Record<string, QuestionAnswer>,
  questionId: string,
  defaultValue: undefined
): number | undefined;
function extractNumberAnswer(
  answers: Record<string, QuestionAnswer>,
  questionId: string,
  defaultValue: number | undefined
): number | undefined {
  const answer = answers[questionId];
  if (answer && typeof answer.value === 'number') {
    return answer.value;
  }
  return defaultValue;
}

/**
 * Extracts a boolean answer value.
 */
function extractBooleanAnswer(
  answers: Record<string, QuestionAnswer>,
  questionId: string,
  defaultValue: boolean
): boolean {
  const answer = answers[questionId];
  if (answer && typeof answer.value === 'boolean') {
    return answer.value;
  }
  return defaultValue;
}

/**
 * Extracts an array answer value.
 */
function extractArrayAnswer<T>(
  answers: Record<string, QuestionAnswer>,
  questionId: string,
  defaultValue: T[]
): T[];
function extractArrayAnswer<T>(
  answers: Record<string, QuestionAnswer>,
  questionId: string,
  defaultValue: undefined
): T[] | undefined;
function extractArrayAnswer<T>(
  answers: Record<string, QuestionAnswer>,
  questionId: string,
  defaultValue: T[] | undefined
): T[] | undefined {
  const answer = answers[questionId];
  if (answer && Array.isArray(answer.value)) {
    return answer.value as T[];
  }
  return defaultValue;
}

// =============================================================================
// RECOMPUTATION FUNCTION
// =============================================================================

/**
 * Recomputes a user's profile from all accumulated answers.
 * Used when profile needs to be rebuilt from stored questionnaire data.
 *
 * @param userId - User ID to recompute profile for
 * @param allAnswers - All accumulated questionnaire answers
 * @param config - Synthesis configuration
 * @returns ProfileSynthesisResult
 */
export async function recomputeProfile(
  userId: string,
  allAnswers: AccumulatedAnswers,
  config: ProfileSynthesisConfig = {}
): Promise<ProfileSynthesisResult> {
  // Create a synthetic event for recomputation
  const syntheticEvent: ProfileSubmissionEvent = {
    eventType: 'consent.avatar_core_updated',
    userId,
    timestamp: Date.now(),
    answers: allAnswers.avatarCore || {
      moduleId: MODULE_IDS.AVATAR_CORE,
      moduleVersion: '1.0.0',
      answers: {},
      scopesGranted: {},
    },
    isUpdate: true,
  };

  // Remove avatar_core from accumulated answers since it's in the event
  const otherAnswers = { ...allAnswers };
  delete otherAnswers.avatarCore;

  return synthesizeProfile(syntheticEvent, otherAnswers, config);
}

// =============================================================================
// EXPORTS
// =============================================================================

export {
  mergeAnswers,
  canonicalizeAnswers,
  computePersonaSummary,
  computeNotificationRules,
  computeLLMPolicy,
};
