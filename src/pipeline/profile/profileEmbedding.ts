/**
 * Neural Intelligence Platform - Profile Embedding Module
 *
 * Handles embedding user profiles to LanceDB for semantic search.
 * Converts structured questionnaire answers to natural language text
 * and stores embeddings with module-specific documents.
 *
 * @version 1.0.0
 */

import { LanceDBAdapter, type LanceDBConfig } from '../../adapters/lancedb';
import type { TextEventInput } from '../../schemas/lancedb-tables';
import { EMBEDDING_DIMENSIONS } from '../../types/common';

// =============================================================================
// TYPE DEFINITIONS
// =============================================================================

/**
 * Result of profile embedding operation.
 */
export interface ProfileEmbeddingResult {
  /** Whether embedding succeeded */
  success: boolean;

  /** Generated document IDs */
  docIds: string[];

  /** Module-specific document IDs */
  moduleDocIds?: Record<string, string>;

  /** Error message if failed */
  error?: string;

  /** Processing time in milliseconds */
  processingTimeMs?: number;
}

/**
 * Profile document for embedding.
 */
export interface ProfileDocument {
  /** Document type (e.g., 'profile.avatar_core') */
  docType: string;

  /** Module ID this document is from */
  moduleId: string;

  /** Natural language text content */
  content: string;

  /** Document metadata */
  metadata: Record<string, unknown>;
}

/**
 * Configuration for profile embedding.
 */
export interface ProfileEmbeddingConfig {
  /** LanceDB configuration */
  lancedbConfig?: LanceDBConfig;

  /** Maximum content length per document */
  maxContentLength?: number;

  /** Whether to create separate documents per module */
  separateModuleDocuments?: boolean;
}

// =============================================================================
// DEFAULT CONFIGURATION
// =============================================================================

const DEFAULT_CONFIG: Required<ProfileEmbeddingConfig> = {
  lancedbConfig: {
    uri: process.env.LANCEDB_URI || './data/lancedb',
  },
  maxContentLength: 8000,
  separateModuleDocuments: true,
};

// =============================================================================
// SINGLETON ADAPTER
// =============================================================================

let lancedbAdapter: LanceDBAdapter | null = null;

/**
 * Gets or creates the LanceDB adapter instance.
 */
async function getLanceDBAdapter(config?: LanceDBConfig): Promise<LanceDBAdapter> {
  if (!lancedbAdapter) {
    lancedbAdapter = new LanceDBAdapter(config || DEFAULT_CONFIG.lancedbConfig);
    await lancedbAdapter.connect();
  }
  return lancedbAdapter;
}

// =============================================================================
// MAIN EMBEDDING FUNCTION
// =============================================================================

/**
 * Embeds user profile documents to LanceDB.
 *
 * @param userId - User ID
 * @param canonicalizedAnswers - Canonicalized questionnaire answers by module
 * @param config - Embedding configuration
 * @returns ProfileEmbeddingResult
 */
export async function embedProfileToLanceDB(
  userId: string,
  canonicalizedAnswers: Record<string, Record<string, unknown>>,
  config: ProfileEmbeddingConfig = {}
): Promise<ProfileEmbeddingResult> {
  const startTime = Date.now();
  const mergedConfig = { ...DEFAULT_CONFIG, ...config };

  try {
    // Step 1: Convert answers to profile documents
    const documents = createProfileDocuments(canonicalizedAnswers, mergedConfig);

    // Step 2: Generate text content for each document
    const textDocuments = documents.map((doc) => ({
      ...doc,
      content: canonicalizeProfileToText(doc.moduleId, doc.metadata),
    }));

    // Step 3: Get LanceDB adapter
    const adapter = await getLanceDBAdapter(mergedConfig.lancedbConfig);

    // Step 4: Generate embeddings and store documents
    const docIds: string[] = [];
    const moduleDocIds: Record<string, string> = {};

    for (const doc of textDocuments) {
      // Generate embedding vector (mock for now - replace with actual embedding)
      const vector = await generateTextEmbedding(doc.content);

      // Create text event input for LanceDB
      const textInput: TextEventInput = {
        userId,
        sourceApp: 'api_import',
        eventType: 'text_event',
        privacyScope: 'private',
        timestamp: Date.now(),
        contactId: null,
        clusterId: null,
        eventId: `profile_${userId}_${doc.moduleId}_${Date.now()}`,
        textVector: vector,
        content: doc.content,
        contentType: doc.docType,
        charCount: doc.content.length,
        wordCount: doc.content.split(/\s+/).length,
        language: 'en',
        sentiment: null,
        sourceUrl: null,
        pageTitle: `Profile: ${doc.moduleId}`,
        entitiesJson: null,
      };

      // Insert into LanceDB
      const docId = await adapter.insertTextEvent(textInput);
      docIds.push(docId);
      moduleDocIds[doc.moduleId] = docId;
    }

    return {
      success: true,
      docIds,
      moduleDocIds,
      processingTimeMs: Date.now() - startTime,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return {
      success: false,
      docIds: [],
      error: message,
      processingTimeMs: Date.now() - startTime,
    };
  }
}

// =============================================================================
// DOCUMENT CREATION
// =============================================================================

/**
 * Creates profile documents from canonicalized answers.
 */
function createProfileDocuments(
  canonicalizedAnswers: Record<string, Record<string, unknown>>,
  config: Required<ProfileEmbeddingConfig>
): ProfileDocument[] {
  const documents: ProfileDocument[] = [];

  if (config.separateModuleDocuments) {
    // Create separate document for each module
    for (const [moduleId, answers] of Object.entries(canonicalizedAnswers)) {
      documents.push({
        docType: `profile.${moduleId}`,
        moduleId,
        content: '', // Will be filled by canonicalizeProfileToText
        metadata: answers,
      });
    }
  } else {
    // Create single combined document
    documents.push({
      docType: 'profile.combined',
      moduleId: 'combined',
      content: '',
      metadata: canonicalizedAnswers,
    });
  }

  return documents;
}

// =============================================================================
// TEXT CANONICALIZATION
// =============================================================================

/**
 * Converts structured profile answers to natural language text.
 *
 * @param moduleId - Module identifier
 * @param answers - Structured answers object
 * @returns Natural language text representation
 */
export function canonicalizeProfileToText(
  moduleId: string,
  answers: Record<string, unknown>
): string {
  const sections: string[] = [];

  // Add module header
  sections.push(`User Profile - ${formatModuleName(moduleId)}`);
  sections.push('');

  // Process answers based on module type
  switch (moduleId) {
    case 'avatarCore':
    case 'avatar_core':
      sections.push(canonicalizeAvatarCore(answers));
      break;
    case 'emailModule':
    case 'email_module':
      sections.push(canonicalizeEmailModule(answers));
      break;
    case 'calendarModule':
    case 'calendar_module':
      sections.push(canonicalizeCalendarModule(answers));
      break;
    case 'tasksModule':
    case 'tasks_module':
      sections.push(canonicalizeTasksModule(answers));
      break;
    case 'financeModule':
    case 'finance_module':
      sections.push(canonicalizeFinanceModule(answers));
      break;
    case 'combined':
      sections.push(canonicalizeCombined(answers as Record<string, Record<string, unknown>>));
      break;
    default:
      sections.push(canonicalizeGenericModule(moduleId, answers));
  }

  return sections.join('\n').trim();
}

/**
 * Canonicalizes avatar_core answers to text.
 */
function canonicalizeAvatarCore(answers: Record<string, unknown>): string {
  const lines: string[] = [];

  // Communication preferences
  if (answers.communication_tone) {
    lines.push(`Preferred communication tone: ${answers.communication_tone}`);
  }

  if (answers.detail_level !== undefined) {
    const level = Number(answers.detail_level);
    const levelDesc =
      level <= 2 ? 'brief' : level >= 4 ? 'comprehensive' : 'moderate';
    lines.push(`Preferred detail level: ${levelDesc} (${level}/5)`);
  }

  if (answers.coaching_intensity) {
    lines.push(`Coaching intensity preference: ${answers.coaching_intensity}`);
  }

  // Priorities
  if (Array.isArray(answers.top_priorities) && answers.top_priorities.length > 0) {
    lines.push('');
    lines.push('Top priorities:');
    for (const priority of answers.top_priorities) {
      lines.push(`- ${priority}`);
    }
  }

  // Do's and Don'ts
  if (Array.isArray(answers.assistant_do) && answers.assistant_do.length > 0) {
    lines.push('');
    lines.push('Things the assistant should do:');
    for (const item of answers.assistant_do) {
      lines.push(`- ${item}`);
    }
  }

  if (Array.isArray(answers.assistant_dont) && answers.assistant_dont.length > 0) {
    lines.push('');
    lines.push('Things the assistant should NOT do:');
    for (const item of answers.assistant_dont) {
      lines.push(`- ${item}`);
    }
  }

  // Response preferences
  if (answers.response_format) {
    lines.push('');
    lines.push(`Response format preference: ${answers.response_format}`);
  }

  if (answers.include_reasoning !== undefined) {
    lines.push(
      `Include reasoning in responses: ${answers.include_reasoning ? 'Yes' : 'No'}`
    );
  }

  if (answers.use_technical_terms !== undefined) {
    lines.push(
      `Use technical terminology: ${answers.use_technical_terms ? 'Yes' : 'No'}`
    );
  }

  // Notification preferences
  if (answers.notification_mode) {
    lines.push('');
    lines.push(`Notification mode: ${answers.notification_mode}`);
  }

  if (answers.quiet_hours_enabled) {
    lines.push(
      `Quiet hours: ${answers.quiet_hours_start || '22:00'} - ${
        answers.quiet_hours_end || '08:00'
      }`
    );
  }

  // Personal info
  if (answers.display_name) {
    lines.push('');
    lines.push(`Display name: ${answers.display_name}`);
  }

  if (answers.timezone) {
    lines.push(`Timezone: ${answers.timezone}`);
  }

  return lines.join('\n');
}

/**
 * Canonicalizes email module answers to text.
 */
function canonicalizeEmailModule(answers: Record<string, unknown>): string {
  const lines: string[] = [];

  lines.push('Email Preferences:');

  if (answers.email_notifications_enabled !== undefined) {
    lines.push(
      `Email notifications: ${answers.email_notifications_enabled ? 'Enabled' : 'Disabled'}`
    );
  }

  if (answers.email_notification_mode) {
    lines.push(`Email notification mode: ${answers.email_notification_mode}`);
  }

  if (answers.email_response_format) {
    lines.push(`Email response format: ${answers.email_response_format}`);
  }

  if (answers.email_formality_level !== undefined) {
    lines.push(`Email formality level: ${answers.email_formality_level}/5`);
  }

  if (
    Array.isArray(answers.email_interrupt_for) &&
    answers.email_interrupt_for.length > 0
  ) {
    lines.push(`Interrupt for: ${answers.email_interrupt_for.join(', ')}`);
  }

  if (answers.email_auto_categorize !== undefined) {
    lines.push(
      `Auto-categorize emails: ${answers.email_auto_categorize ? 'Yes' : 'No'}`
    );
  }

  if (answers.email_summary_frequency) {
    lines.push(`Email summary frequency: ${answers.email_summary_frequency}`);
  }

  return lines.join('\n');
}

/**
 * Canonicalizes calendar module answers to text.
 */
function canonicalizeCalendarModule(answers: Record<string, unknown>): string {
  const lines: string[] = [];

  lines.push('Calendar Preferences:');

  if (answers.calendar_notifications_enabled !== undefined) {
    lines.push(
      `Calendar notifications: ${
        answers.calendar_notifications_enabled ? 'Enabled' : 'Disabled'
      }`
    );
  }

  if (answers.calendar_reminder_default !== undefined) {
    lines.push(`Default reminder: ${answers.calendar_reminder_default} minutes before`);
  }

  if (answers.calendar_working_hours_start && answers.calendar_working_hours_end) {
    lines.push(
      `Working hours: ${answers.calendar_working_hours_start} - ${answers.calendar_working_hours_end}`
    );
  }

  if (answers.calendar_buffer_time !== undefined) {
    lines.push(`Buffer time between meetings: ${answers.calendar_buffer_time} minutes`);
  }

  if (answers.calendar_auto_schedule !== undefined) {
    lines.push(
      `Auto-schedule meetings: ${answers.calendar_auto_schedule ? 'Yes' : 'No'}`
    );
  }

  return lines.join('\n');
}

/**
 * Canonicalizes tasks module answers to text.
 */
function canonicalizeTasksModule(answers: Record<string, unknown>): string {
  const lines: string[] = [];

  lines.push('Tasks Preferences:');

  if (answers.tasks_notifications_enabled !== undefined) {
    lines.push(
      `Task notifications: ${answers.tasks_notifications_enabled ? 'Enabled' : 'Disabled'}`
    );
  }

  if (answers.tasks_default_priority) {
    lines.push(`Default task priority: ${answers.tasks_default_priority}`);
  }

  if (answers.tasks_daily_review_time) {
    lines.push(`Daily review time: ${answers.tasks_daily_review_time}`);
  }

  if (answers.tasks_auto_prioritize !== undefined) {
    lines.push(
      `Auto-prioritize tasks: ${answers.tasks_auto_prioritize ? 'Yes' : 'No'}`
    );
  }

  if (answers.tasks_deadline_warning !== undefined) {
    lines.push(`Deadline warning: ${answers.tasks_deadline_warning} hours before`);
  }

  return lines.join('\n');
}

/**
 * Canonicalizes finance module answers to text.
 */
function canonicalizeFinanceModule(answers: Record<string, unknown>): string {
  const lines: string[] = [];

  lines.push('Finance Preferences:');

  if (answers.finance_notifications_enabled !== undefined) {
    lines.push(
      `Finance notifications: ${
        answers.finance_notifications_enabled ? 'Enabled' : 'Disabled'
      }`
    );
  }

  if (answers.finance_budget_alerts !== undefined) {
    lines.push(`Budget alerts: ${answers.finance_budget_alerts ? 'Enabled' : 'Disabled'}`);
  }

  if (answers.finance_large_transaction_threshold !== undefined) {
    lines.push(
      `Large transaction threshold: $${answers.finance_large_transaction_threshold}`
    );
  }

  if (answers.finance_weekly_summary !== undefined) {
    lines.push(
      `Weekly spending summary: ${answers.finance_weekly_summary ? 'Yes' : 'No'}`
    );
  }

  if (answers.finance_auto_categorize !== undefined) {
    lines.push(
      `Auto-categorize transactions: ${answers.finance_auto_categorize ? 'Yes' : 'No'}`
    );
  }

  return lines.join('\n');
}

/**
 * Canonicalizes combined profile answers to text.
 */
function canonicalizeCombined(
  answers: Record<string, Record<string, unknown>>
): string {
  const sections: string[] = [];

  for (const [moduleId, moduleAnswers] of Object.entries(answers)) {
    sections.push(canonicalizeProfileToText(moduleId, moduleAnswers));
    sections.push('');
  }

  return sections.join('\n').trim();
}

/**
 * Canonicalizes generic module answers to text.
 */
function canonicalizeGenericModule(
  moduleId: string,
  answers: Record<string, unknown>
): string {
  const lines: string[] = [];

  lines.push(`${formatModuleName(moduleId)} Preferences:`);

  for (const [key, value] of Object.entries(answers)) {
    if (value !== undefined && value !== null) {
      const formattedKey = key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
      if (Array.isArray(value)) {
        lines.push(`${formattedKey}: ${value.join(', ')}`);
      } else if (typeof value === 'boolean') {
        lines.push(`${formattedKey}: ${value ? 'Yes' : 'No'}`);
      } else {
        lines.push(`${formattedKey}: ${value}`);
      }
    }
  }

  return lines.join('\n');
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Formats a module ID into a display name.
 */
function formatModuleName(moduleId: string): string {
  return moduleId
    .replace(/_/g, ' ')
    .replace(/([A-Z])/g, ' $1')
    .trim()
    .split(' ')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

/**
 * Generates text embedding vector.
 * This is a placeholder - replace with actual embedding generation.
 */
async function generateTextEmbedding(text: string): Promise<number[]> {
  // TODO: Replace with actual embedding generation via OpenRouter or similar
  // For now, return a deterministic mock vector based on text hash

  const hash = simpleHash(text);
  const vector = new Array(EMBEDDING_DIMENSIONS.TEXT).fill(0);

  // Generate pseudo-random but deterministic values
  for (let i = 0; i < vector.length; i++) {
    vector[i] = Math.sin(hash * (i + 1)) * 0.5;
  }

  // Normalize the vector
  const magnitude = Math.sqrt(vector.reduce((sum, v) => sum + v * v, 0));
  return vector.map((v) => v / magnitude);
}

/**
 * Simple string hash function.
 */
function simpleHash(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash;
  }
  return Math.abs(hash);
}

// =============================================================================
// CLEANUP
// =============================================================================

/**
 * Closes the LanceDB adapter connection.
 */
export async function closeLanceDBAdapter(): Promise<void> {
  if (lancedbAdapter) {
    await lancedbAdapter.disconnect();
    lancedbAdapter = null;
  }
}

// =============================================================================
// EXPORTS
// =============================================================================

export {
  getLanceDBAdapter,
  createProfileDocuments,
  generateTextEmbedding,
};
