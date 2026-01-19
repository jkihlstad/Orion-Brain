/**
 * Neural Intelligence Platform - Profile Type Definitions
 *
 * Types for user profile synthesis including persona summaries,
 * notification rules, LLM policies, and questionnaire answers.
 *
 * @version 1.0.0
 */

// =============================================================================
// PROFILE SNAPSHOT TYPES
// =============================================================================

/**
 * Complete profile snapshot representing the user's preferences and settings.
 */
export interface ProfileSnapshot {
  /** Profile schema version for migrations */
  profileVersion: string;

  /** Clerk user ID */
  clerkUserId: string;

  /** User's display name */
  displayName: string;

  /** User's preferred timezone (IANA format) */
  timezone: string;

  /** Computed persona summary from avatar_core */
  personaSummary: PersonaSummary;

  /** Notification preferences and rules */
  notificationRules: NotificationRules;

  /** LLM behavior configuration */
  llmPolicy: LLMPolicy;

  /** References to vector memory storage */
  vectorMemoryRefs?: VectorMemoryRefs;

  /** Timestamp when profile was last synthesized */
  synthesizedAt?: number;

  /** Source event IDs that contributed to this profile */
  sourceEventIds?: string[];
}

// =============================================================================
// PERSONA SUMMARY TYPES
// =============================================================================

/**
 * Persona summary derived from avatar_core questionnaire answers.
 * Defines the user's preferred interaction style and priorities.
 */
export interface PersonaSummary {
  /** Communication tone preference (e.g., 'professional', 'casual', 'friendly') */
  tone: string;

  /** Detail level preference (1-5, where 1=brief, 5=comprehensive) */
  detailLevel: number;

  /** Coaching intensity preference (e.g., 'light', 'moderate', 'intensive') */
  coachingIntensity: string;

  /** User's top priority areas */
  topPriorities: string[];

  /** Things the assistant should do */
  do: string[];

  /** Things the assistant should not do */
  dont: string[];
}

// =============================================================================
// NOTIFICATION RULES TYPES
// =============================================================================

/**
 * Notification configuration and rules.
 */
export interface NotificationRules {
  /** Global notification settings */
  global: GlobalNotificationSettings;

  /** Per-app notification overrides */
  apps: Record<string, AppNotificationRules>;
}

/**
 * Global notification settings applied across all apps.
 */
export interface GlobalNotificationSettings {
  /** Notification mode (e.g., 'all', 'important', 'silent', 'scheduled') */
  mode: string;

  /** Quiet hours configuration */
  quietHours: QuietHours | null;

  /** Event types that can always interrupt (bypass quiet hours) */
  interruptFor: string[];
}

/**
 * Quiet hours configuration.
 */
export interface QuietHours {
  /** Start time in HH:MM format (24-hour) */
  start: string;

  /** End time in HH:MM format (24-hour) */
  end: string;
}

/**
 * Per-app notification rules and overrides.
 */
export interface AppNotificationRules {
  /** Whether notifications are enabled for this app */
  enabled?: boolean;

  /** Override notification mode for this app */
  mode?: string;

  /** App-specific quiet hours override */
  quietHours?: QuietHours | null;

  /** App-specific interrupt events */
  interruptFor?: string[];

  /** Additional app-specific settings */
  [key: string]: unknown;
}

// =============================================================================
// LLM POLICY TYPES
// =============================================================================

/**
 * LLM behavior configuration for system prompts and responses.
 */
export interface LLMPolicy {
  /** Global system style configuration */
  globalSystemStyle: LLMStyleConfig;

  /** Per-app LLM behavior overrides */
  appOverrides: Record<string, LLMStyleConfig>;
}

/**
 * LLM style configuration options.
 */
export interface LLMStyleConfig {
  /** Response format preference */
  responseFormat?: 'concise' | 'detailed' | 'balanced';

  /** Whether to include reasoning/explanations */
  includeReasoning?: boolean;

  /** Formality level (1-5) */
  formalityLevel?: number;

  /** Preferred response length */
  maxResponseLength?: 'short' | 'medium' | 'long';

  /** Whether to use technical terminology */
  useTechnicalTerms?: boolean;

  /** Additional style parameters */
  [key: string]: unknown;
}

// =============================================================================
// VECTOR MEMORY TYPES
// =============================================================================

/**
 * References to vector memory storage for profile documents.
 */
export interface VectorMemoryRefs {
  /** LanceDB profile document reference */
  lancedb?: LanceDBProfileRef;

  /** Additional vector storage references */
  [key: string]: unknown;
}

/**
 * LanceDB profile document reference.
 */
export interface LanceDBProfileRef {
  /** Profile document ID in LanceDB */
  profileDocId: string;

  /** Module-specific document IDs */
  moduleDocIds?: Record<string, string>;

  /** Last updated timestamp */
  updatedAt?: number;
}

// =============================================================================
// QUESTIONNAIRE ANSWER TYPES
// =============================================================================

/**
 * Questionnaire submission containing module answers.
 */
export interface QuestionnaireAnswers {
  /** Module identifier (e.g., 'avatar_core', 'email_module') */
  moduleId: string;

  /** Module version */
  moduleVersion: string;

  /** Answer values keyed by question ID */
  answers: Record<string, QuestionAnswer>;

  /** Scopes/permissions granted by the user */
  scopesGranted: Record<string, boolean>;
}

/**
 * Individual question answer.
 */
export interface QuestionAnswer {
  /** Answer type (e.g., 'text', 'number', 'select', 'multi_select', 'boolean') */
  type: string;

  /** Answer value */
  value: unknown;

  /** Optional metadata about the answer */
  metadata?: Record<string, unknown>;
}

// =============================================================================
// PROFILE EVENT TYPES
// =============================================================================

/**
 * Event types for profile-related actions.
 */
export type ProfileEventType =
  | 'consent.avatar_core_submitted'
  | 'consent.avatar_core_updated'
  | 'onboarding.module_submitted'
  | 'onboarding.module_updated';

/**
 * Profile submission event payload.
 */
export interface ProfileSubmissionEvent {
  /** Event type */
  eventType: ProfileEventType;

  /** User ID */
  userId: string;

  /** Timestamp of submission */
  timestamp: number;

  /** Questionnaire answers */
  answers: QuestionnaireAnswers;

  /** Whether this is an update to existing answers */
  isUpdate: boolean;

  /** Previous version ID if this is an update */
  previousVersionId?: string;
}

// =============================================================================
// SYNTHESIS RESULT TYPES
// =============================================================================

/**
 * Result of profile synthesis operation.
 */
export interface ProfileSynthesisResult {
  /** Whether synthesis succeeded */
  success: boolean;

  /** Synthesized profile snapshot */
  profile?: ProfileSnapshot;

  /** LanceDB embedding result */
  lancedbResult?: {
    success: boolean;
    docIds: string[];
    error?: string;
  };

  /** Neo4j graph result */
  neo4jResult?: {
    success: boolean;
    nodesCreated: number;
    relationshipsCreated: number;
    error?: string;
  };

  /** Convex sync result */
  convexResult?: {
    success: boolean;
    documentId?: string;
    error?: string;
  };

  /** Errors encountered during synthesis */
  errors: string[];

  /** Warnings encountered during synthesis */
  warnings: string[];

  /** Processing time in milliseconds */
  processingTimeMs: number;
}

// =============================================================================
// PROFILE GRAPH TYPES
// =============================================================================

/**
 * Value node in the profile graph.
 */
export interface ProfileValue {
  /** Value category (e.g., 'business', 'family', 'health') */
  category: string;

  /** Importance level (1-5) */
  importance: number;

  /** Optional description */
  description?: string;
}

/**
 * Preference node in the profile graph.
 */
export interface ProfilePreference {
  /** Preference type (e.g., 'notificationStyle', 'tone', 'detailLevel') */
  type: string;

  /** Preference value */
  value: unknown;

  /** Source module that set this preference */
  sourceModule?: string;
}

/**
 * Notification rule node in the profile graph.
 */
export interface ProfileNotificationRule {
  /** Rule ID */
  ruleId: string;

  /** Rule type (e.g., 'quiet_hours', 'interrupt', 'app_override') */
  ruleType: string;

  /** Rule configuration */
  config: Record<string, unknown>;

  /** Whether rule is active */
  active: boolean;
}

/**
 * App preference node in the profile graph.
 */
export interface ProfileAppPreference {
  /** App identifier */
  appId: string;

  /** App-specific preferences */
  preferences: Record<string, unknown>;

  /** Whether app is enabled */
  enabled: boolean;
}

// =============================================================================
// CONSTANTS
// =============================================================================

/**
 * Current profile schema version.
 */
export const PROFILE_SCHEMA_VERSION = '1.0.0';

/**
 * Default persona summary for new users.
 */
export const DEFAULT_PERSONA_SUMMARY: PersonaSummary = {
  tone: 'professional',
  detailLevel: 3,
  coachingIntensity: 'moderate',
  topPriorities: [],
  do: [],
  dont: [],
};

/**
 * Default notification rules for new users.
 */
export const DEFAULT_NOTIFICATION_RULES: NotificationRules = {
  global: {
    mode: 'all',
    quietHours: null,
    interruptFor: ['urgent', 'emergency'],
  },
  apps: {},
};

/**
 * Default LLM policy for new users.
 */
export const DEFAULT_LLM_POLICY: LLMPolicy = {
  globalSystemStyle: {
    responseFormat: 'balanced',
    includeReasoning: true,
    formalityLevel: 3,
    maxResponseLength: 'medium',
    useTechnicalTerms: false,
  },
  appOverrides: {},
};

/**
 * Module IDs for questionnaire modules.
 */
export const MODULE_IDS = {
  AVATAR_CORE: 'avatar_core',
  EMAIL_MODULE: 'email_module',
  CALENDAR_MODULE: 'calendar_module',
  TASKS_MODULE: 'tasks_module',
  FINANCE_MODULE: 'finance_module',
} as const;

export type ModuleId = (typeof MODULE_IDS)[keyof typeof MODULE_IDS];
