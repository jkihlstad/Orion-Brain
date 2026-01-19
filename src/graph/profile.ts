/**
 * Neural Intelligence Platform - Profile Graph Operations
 *
 * Neo4j graph operations for user profile data.
 * Creates and maintains profile-related nodes and relationships:
 * - (:User)-[:HAS_PROFILE]->(:Profile)
 * - (:Profile)-[:VALUES]->(:Value)
 * - (:Profile)-[:PREFERS]->(:Preference)
 * - (:Profile)-[:HAS_RULE]->(:NotificationRule)
 * - (:Profile)-[:HAS_APP_PREF]->(:AppPreference)
 *
 * @version 1.0.0
 */

import {
  Neo4jClient,
  getDefaultClient,
  type TransactionContext,
} from './neo4j';

import {
  generateNodeMerge,
  generateRelationshipMergeWithNodes,
  type CypherQuery,
} from './cypher';

import type {
  ProfileSnapshot,
  NotificationRules,
  ProfileValue,
  ProfilePreference,
  ProfileNotificationRule,
  ProfileAppPreference,
} from '../types/profile';

// =============================================================================
// TYPE DEFINITIONS
// =============================================================================

/**
 * Result of Neo4j profile write operation.
 */
export interface Neo4jProfileResult {
  /** Whether the operation succeeded */
  success: boolean;

  /** Number of nodes created */
  nodesCreated: number;

  /** Number of relationships created */
  relationshipsCreated: number;

  /** Error message if failed */
  error?: string;

  /** Processing time in milliseconds */
  processingTimeMs?: number;
}

/**
 * Profile graph data read from Neo4j.
 */
export interface ProfileGraphData {
  /** Profile node data */
  profile: Record<string, unknown> | null;

  /** Value nodes */
  values: ProfileValue[];

  /** Preference nodes */
  preferences: ProfilePreference[];

  /** Notification rule nodes */
  notificationRules: ProfileNotificationRule[];

  /** App preference nodes */
  appPreferences: ProfileAppPreference[];
}

/**
 * Configuration for profile graph operations.
 */
export interface ProfileGraphConfig {
  /** Neo4j client instance */
  neo4jClient?: Neo4jClient;

  /** Whether to use transactions */
  useTransactions?: boolean;
}

// =============================================================================
// NODE LABELS AND RELATIONSHIP TYPES
// =============================================================================

const NODE_LABELS = {
  USER: 'User',
  PROFILE: 'Profile',
  VALUE: 'Value',
  PREFERENCE: 'Preference',
  NOTIFICATION_RULE: 'NotificationRule',
  APP_PREFERENCE: 'AppPreference',
} as const;

const RELATIONSHIP_TYPES = {
  HAS_PROFILE: 'HAS_PROFILE',
  VALUES: 'VALUES',
  PREFERS: 'PREFERS',
  HAS_RULE: 'HAS_RULE',
  HAS_APP_PREF: 'HAS_APP_PREF',
} as const;

// =============================================================================
// MAIN WRITE FUNCTION
// =============================================================================

/**
 * Writes a user profile to Neo4j graph database.
 *
 * @param userId - User ID
 * @param profile - Profile snapshot to write
 * @param config - Configuration options
 * @returns Neo4jProfileResult
 */
export async function writeProfileGraphToNeo4j(
  userId: string,
  profile: ProfileSnapshot,
  config: ProfileGraphConfig = {}
): Promise<Neo4jProfileResult> {
  const startTime = Date.now();

  const client = config.neo4jClient || getDefaultClient();
  if (!client) {
    return {
      success: false,
      nodesCreated: 0,
      relationshipsCreated: 0,
      error: 'Neo4j client not configured',
      processingTimeMs: Date.now() - startTime,
    };
  }

  try {
    let result: Neo4jProfileResult;

    if (config.useTransactions !== false) {
      // Execute in transaction
      result = await client.withTransaction(async (tx) => {
        return writeProfileGraph(tx, userId, profile);
      });
    } else {
      // Execute operations individually (less safe but useful for debugging)
      result = await writeProfileGraphWithoutTransaction(client, userId, profile);
    }

    return {
      ...result,
      processingTimeMs: Date.now() - startTime,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return {
      success: false,
      nodesCreated: 0,
      relationshipsCreated: 0,
      error: message,
      processingTimeMs: Date.now() - startTime,
    };
  }
}

// =============================================================================
// TRANSACTION-BASED WRITE
// =============================================================================

/**
 * Writes profile graph within a transaction context.
 */
export async function writeProfileGraph(
  tx: TransactionContext,
  userId: string,
  profile: ProfileSnapshot
): Promise<Neo4jProfileResult> {
  let nodesCreated = 0;
  let relationshipsCreated = 0;

  // Step 1: Create/update User node
  const userQuery = generateNodeMerge(
    NODE_LABELS.USER,
    { id: userId },
    {
      clerkUserId: profile.clerkUserId,
      displayName: profile.displayName,
      timezone: profile.timezone,
      updatedAt: Date.now(),
    }
  );
  const userResult = await tx.run(userQuery.cypher, userQuery.params);
  nodesCreated += userResult.summary.nodesCreated;

  // Step 2: Create/update Profile node and relationship to User
  const profileQuery = generateRelationshipMergeWithNodes(
    RELATIONSHIP_TYPES.HAS_PROFILE,
    NODE_LABELS.USER,
    { id: userId },
    {},
    NODE_LABELS.PROFILE,
    { userId },
    {
      profileVersion: profile.profileVersion,
      displayName: profile.displayName,
      timezone: profile.timezone,
      tone: profile.personaSummary.tone,
      detailLevel: profile.personaSummary.detailLevel,
      coachingIntensity: profile.personaSummary.coachingIntensity,
      topPriorities: JSON.stringify(profile.personaSummary.topPriorities),
      doList: JSON.stringify(profile.personaSummary.do),
      dontList: JSON.stringify(profile.personaSummary.dont),
      notificationMode: profile.notificationRules.global.mode,
      quietHoursEnabled: profile.notificationRules.global.quietHours !== null,
      quietHoursStart: profile.notificationRules.global.quietHours?.start || null,
      quietHoursEnd: profile.notificationRules.global.quietHours?.end || null,
      interruptFor: JSON.stringify(profile.notificationRules.global.interruptFor),
      llmResponseFormat:
        profile.llmPolicy.globalSystemStyle.responseFormat || 'balanced',
      llmFormalityLevel: profile.llmPolicy.globalSystemStyle.formalityLevel || 3,
      synthesizedAt: profile.synthesizedAt || Date.now(),
      updatedAt: Date.now(),
    },
    {}
  );
  const profileResult = await tx.run(profileQuery.cypher, profileQuery.params);
  nodesCreated += profileResult.summary.nodesCreated;
  relationshipsCreated += profileResult.summary.relationshipsCreated;

  // Step 3: Create Value nodes from topPriorities
  for (const priority of profile.personaSummary.topPriorities) {
    const valueQuery = generateRelationshipMergeWithNodes(
      RELATIONSHIP_TYPES.VALUES,
      NODE_LABELS.PROFILE,
      { userId },
      {},
      NODE_LABELS.VALUE,
      { userId, category: priority },
      {
        importance: profile.personaSummary.topPriorities.indexOf(priority) + 1,
        createdAt: Date.now(),
      },
      {}
    );
    const valueResult = await tx.run(valueQuery.cypher, valueQuery.params);
    nodesCreated += valueResult.summary.nodesCreated;
    relationshipsCreated += valueResult.summary.relationshipsCreated;
  }

  // Step 4: Create Preference nodes for key preferences
  const preferences = extractPreferences(profile);
  for (const pref of preferences) {
    const prefQuery = generateRelationshipMergeWithNodes(
      RELATIONSHIP_TYPES.PREFERS,
      NODE_LABELS.PROFILE,
      { userId },
      {},
      NODE_LABELS.PREFERENCE,
      { userId, type: pref.type },
      {
        value: JSON.stringify(pref.value),
        sourceModule: pref.sourceModule || 'avatar_core',
        updatedAt: Date.now(),
      },
      {}
    );
    const prefResult = await tx.run(prefQuery.cypher, prefQuery.params);
    nodesCreated += prefResult.summary.nodesCreated;
    relationshipsCreated += prefResult.summary.relationshipsCreated;
  }

  // Step 5: Create NotificationRule nodes
  const rules = extractNotificationRules(userId, profile.notificationRules);
  for (const rule of rules) {
    const ruleQuery = generateRelationshipMergeWithNodes(
      RELATIONSHIP_TYPES.HAS_RULE,
      NODE_LABELS.PROFILE,
      { userId },
      {},
      NODE_LABELS.NOTIFICATION_RULE,
      { userId, ruleId: rule.ruleId },
      {
        ruleType: rule.ruleType,
        config: JSON.stringify(rule.config),
        active: rule.active,
        updatedAt: Date.now(),
      },
      {}
    );
    const ruleResult = await tx.run(ruleQuery.cypher, ruleQuery.params);
    nodesCreated += ruleResult.summary.nodesCreated;
    relationshipsCreated += ruleResult.summary.relationshipsCreated;
  }

  // Step 6: Create AppPreference nodes
  const appPrefs = extractAppPreferences(userId, profile.notificationRules.apps);
  for (const appPref of appPrefs) {
    const appPrefQuery = generateRelationshipMergeWithNodes(
      RELATIONSHIP_TYPES.HAS_APP_PREF,
      NODE_LABELS.PROFILE,
      { userId },
      {},
      NODE_LABELS.APP_PREFERENCE,
      { userId, appId: appPref.appId },
      {
        preferences: JSON.stringify(appPref.preferences),
        enabled: appPref.enabled,
        updatedAt: Date.now(),
      },
      {}
    );
    const appPrefResult = await tx.run(appPrefQuery.cypher, appPrefQuery.params);
    nodesCreated += appPrefResult.summary.nodesCreated;
    relationshipsCreated += appPrefResult.summary.relationshipsCreated;
  }

  return {
    success: true,
    nodesCreated,
    relationshipsCreated,
  };
}

// =============================================================================
// NON-TRANSACTION WRITE (for debugging)
// =============================================================================

/**
 * Writes profile graph without transaction (useful for debugging).
 */
async function writeProfileGraphWithoutTransaction(
  client: Neo4jClient,
  userId: string,
  profile: ProfileSnapshot
): Promise<Neo4jProfileResult> {
  let nodesCreated = 0;
  let relationshipsCreated = 0;

  // Execute each query individually
  const queries = generateAllProfileQueries(userId, profile);

  for (const query of queries) {
    const result = await client.run(query.cypher, query.params);
    nodesCreated += result.summary.nodesCreated;
    relationshipsCreated += result.summary.relationshipsCreated;
  }

  return {
    success: true,
    nodesCreated,
    relationshipsCreated,
  };
}

// =============================================================================
// QUERY GENERATION
// =============================================================================

/**
 * Generates all Cypher queries for a profile.
 */
function generateAllProfileQueries(
  userId: string,
  profile: ProfileSnapshot
): CypherQuery[] {
  const queries: CypherQuery[] = [];

  // User node
  queries.push(
    generateNodeMerge(
      NODE_LABELS.USER,
      { id: userId },
      {
        clerkUserId: profile.clerkUserId,
        displayName: profile.displayName,
        timezone: profile.timezone,
        updatedAt: Date.now(),
      }
    )
  );

  // Profile node and relationship
  queries.push(
    generateRelationshipMergeWithNodes(
      RELATIONSHIP_TYPES.HAS_PROFILE,
      NODE_LABELS.USER,
      { id: userId },
      {},
      NODE_LABELS.PROFILE,
      { userId },
      {
        profileVersion: profile.profileVersion,
        displayName: profile.displayName,
        timezone: profile.timezone,
        synthesizedAt: profile.synthesizedAt || Date.now(),
        updatedAt: Date.now(),
      },
      {}
    )
  );

  // Value nodes
  for (const priority of profile.personaSummary.topPriorities) {
    queries.push(
      generateRelationshipMergeWithNodes(
        RELATIONSHIP_TYPES.VALUES,
        NODE_LABELS.PROFILE,
        { userId },
        {},
        NODE_LABELS.VALUE,
        { userId, category: priority },
        {
          importance: profile.personaSummary.topPriorities.indexOf(priority) + 1,
          createdAt: Date.now(),
        },
        {}
      )
    );
  }

  // Preference nodes
  const preferences = extractPreferences(profile);
  for (const pref of preferences) {
    queries.push(
      generateRelationshipMergeWithNodes(
        RELATIONSHIP_TYPES.PREFERS,
        NODE_LABELS.PROFILE,
        { userId },
        {},
        NODE_LABELS.PREFERENCE,
        { userId, type: pref.type },
        {
          value: JSON.stringify(pref.value),
          sourceModule: pref.sourceModule || 'avatar_core',
          updatedAt: Date.now(),
        },
        {}
      )
    );
  }

  // NotificationRule nodes
  const rules = extractNotificationRules(userId, profile.notificationRules);
  for (const rule of rules) {
    queries.push(
      generateRelationshipMergeWithNodes(
        RELATIONSHIP_TYPES.HAS_RULE,
        NODE_LABELS.PROFILE,
        { userId },
        {},
        NODE_LABELS.NOTIFICATION_RULE,
        { userId, ruleId: rule.ruleId },
        {
          ruleType: rule.ruleType,
          config: JSON.stringify(rule.config),
          active: rule.active,
          updatedAt: Date.now(),
        },
        {}
      )
    );
  }

  // AppPreference nodes
  const appPrefs = extractAppPreferences(userId, profile.notificationRules.apps);
  for (const appPref of appPrefs) {
    queries.push(
      generateRelationshipMergeWithNodes(
        RELATIONSHIP_TYPES.HAS_APP_PREF,
        NODE_LABELS.PROFILE,
        { userId },
        {},
        NODE_LABELS.APP_PREFERENCE,
        { userId, appId: appPref.appId },
        {
          preferences: JSON.stringify(appPref.preferences),
          enabled: appPref.enabled,
          updatedAt: Date.now(),
        },
        {}
      )
    );
  }

  return queries;
}

// =============================================================================
// READ OPERATIONS
// =============================================================================

/**
 * Reads profile graph data from Neo4j.
 *
 * @param userId - User ID to read profile for
 * @param config - Configuration options
 * @returns ProfileGraphData
 */
export async function readProfileGraph(
  userId: string,
  config: ProfileGraphConfig = {}
): Promise<ProfileGraphData> {
  const client = config.neo4jClient || getDefaultClient();
  if (!client) {
    return {
      profile: null,
      values: [],
      preferences: [],
      notificationRules: [],
      appPreferences: [],
    };
  }

  try {
    // Query for profile and all related nodes
    const cypher = `
      MATCH (u:${NODE_LABELS.USER} {id: $userId})-[:${RELATIONSHIP_TYPES.HAS_PROFILE}]->(p:${NODE_LABELS.PROFILE})
      OPTIONAL MATCH (p)-[:${RELATIONSHIP_TYPES.VALUES}]->(v:${NODE_LABELS.VALUE})
      OPTIONAL MATCH (p)-[:${RELATIONSHIP_TYPES.PREFERS}]->(pref:${NODE_LABELS.PREFERENCE})
      OPTIONAL MATCH (p)-[:${RELATIONSHIP_TYPES.HAS_RULE}]->(r:${NODE_LABELS.NOTIFICATION_RULE})
      OPTIONAL MATCH (p)-[:${RELATIONSHIP_TYPES.HAS_APP_PREF}]->(ap:${NODE_LABELS.APP_PREFERENCE})
      RETURN p, collect(DISTINCT v) as values, collect(DISTINCT pref) as preferences,
             collect(DISTINCT r) as rules, collect(DISTINCT ap) as appPrefs
    `;

    const result = await client.run<{
      p: Record<string, unknown>;
      values: Array<{ properties: Record<string, unknown> }>;
      preferences: Array<{ properties: Record<string, unknown> }>;
      rules: Array<{ properties: Record<string, unknown> }>;
      appPrefs: Array<{ properties: Record<string, unknown> }>;
    }>(cypher, { userId });

    if (result.records.length === 0) {
      return {
        profile: null,
        values: [],
        preferences: [],
        notificationRules: [],
        appPreferences: [],
      };
    }

    const record = result.records[0]!;

    return {
      profile: record.p || null,
      values: (record.values || [])
        .filter((v): v is { properties: Record<string, unknown> } => v != null && v.properties != null)
        .map((v): ProfileValue => {
          const base: ProfileValue = {
            category: String(v.properties.category || ''),
            importance: Number(v.properties.importance || 0),
          };
          if (v.properties.description !== undefined) {
            base.description = v.properties.description as string;
          }
          return base;
        }),
      preferences: (record.preferences || [])
        .filter((p): p is { properties: Record<string, unknown> } => p != null && p.properties != null)
        .map((p): ProfilePreference => {
          const base: ProfilePreference = {
            type: String(p.properties.type || ''),
            value: p.properties.value
              ? JSON.parse(String(p.properties.value))
              : null,
          };
          if (p.properties.sourceModule !== undefined) {
            base.sourceModule = p.properties.sourceModule as string;
          }
          return base;
        }),
      notificationRules: (record.rules || [])
        .filter((r): r is { properties: Record<string, unknown> } => r != null && r.properties != null)
        .map((r): ProfileNotificationRule => ({
          ruleId: String(r.properties.ruleId || ''),
          ruleType: String(r.properties.ruleType || ''),
          config: r.properties.config
            ? JSON.parse(String(r.properties.config))
            : {},
          active: Boolean(r.properties.active),
        })),
      appPreferences: (record.appPrefs || [])
        .filter((ap): ap is { properties: Record<string, unknown> } => ap != null && ap.properties != null)
        .map((ap): ProfileAppPreference => ({
          appId: String(ap.properties.appId || ''),
          preferences: ap.properties.preferences
            ? JSON.parse(String(ap.properties.preferences))
            : {},
          enabled: Boolean(ap.properties.enabled),
        })),
    };
  } catch (error) {
    console.error('[ProfileGraph] Read error:', error);
    return {
      profile: null,
      values: [],
      preferences: [],
      notificationRules: [],
      appPreferences: [],
    };
  }
}

/**
 * Deletes a user's profile graph data.
 *
 * @param userId - User ID to delete profile for
 * @param config - Configuration options
 * @returns Whether deletion succeeded
 */
export async function deleteProfileGraph(
  userId: string,
  config: ProfileGraphConfig = {}
): Promise<boolean> {
  const client = config.neo4jClient || getDefaultClient();
  if (!client) {
    return false;
  }

  try {
    const cypher = `
      MATCH (p:${NODE_LABELS.PROFILE} {userId: $userId})
      OPTIONAL MATCH (p)-[r1:${RELATIONSHIP_TYPES.VALUES}]->(v:${NODE_LABELS.VALUE})
      OPTIONAL MATCH (p)-[r2:${RELATIONSHIP_TYPES.PREFERS}]->(pref:${NODE_LABELS.PREFERENCE})
      OPTIONAL MATCH (p)-[r3:${RELATIONSHIP_TYPES.HAS_RULE}]->(rule:${NODE_LABELS.NOTIFICATION_RULE})
      OPTIONAL MATCH (p)-[r4:${RELATIONSHIP_TYPES.HAS_APP_PREF}]->(ap:${NODE_LABELS.APP_PREFERENCE})
      DETACH DELETE v, pref, rule, ap, p
    `;

    await client.run(cypher, { userId });
    return true;
  } catch (error) {
    console.error('[ProfileGraph] Delete error:', error);
    return false;
  }
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Extracts preferences from profile for graph storage.
 */
function extractPreferences(profile: ProfileSnapshot): ProfilePreference[] {
  const preferences: ProfilePreference[] = [];

  // Persona preferences
  preferences.push({
    type: 'tone',
    value: profile.personaSummary.tone,
    sourceModule: 'avatar_core',
  });

  preferences.push({
    type: 'detailLevel',
    value: profile.personaSummary.detailLevel,
    sourceModule: 'avatar_core',
  });

  preferences.push({
    type: 'coachingIntensity',
    value: profile.personaSummary.coachingIntensity,
    sourceModule: 'avatar_core',
  });

  // LLM preferences
  if (profile.llmPolicy.globalSystemStyle.responseFormat) {
    preferences.push({
      type: 'responseFormat',
      value: profile.llmPolicy.globalSystemStyle.responseFormat,
      sourceModule: 'avatar_core',
    });
  }

  if (profile.llmPolicy.globalSystemStyle.formalityLevel !== undefined) {
    preferences.push({
      type: 'formalityLevel',
      value: profile.llmPolicy.globalSystemStyle.formalityLevel,
      sourceModule: 'avatar_core',
    });
  }

  // Notification preferences
  preferences.push({
    type: 'notificationMode',
    value: profile.notificationRules.global.mode,
    sourceModule: 'avatar_core',
  });

  return preferences;
}

/**
 * Extracts notification rules from NotificationRules object.
 */
function extractNotificationRules(
  userId: string,
  rules: NotificationRules
): ProfileNotificationRule[] {
  const extracted: ProfileNotificationRule[] = [];

  // Global mode rule
  extracted.push({
    ruleId: `${userId}_global_mode`,
    ruleType: 'global_mode',
    config: { mode: rules.global.mode },
    active: true,
  });

  // Quiet hours rule
  if (rules.global.quietHours) {
    extracted.push({
      ruleId: `${userId}_quiet_hours`,
      ruleType: 'quiet_hours',
      config: {
        start: rules.global.quietHours.start,
        end: rules.global.quietHours.end,
      },
      active: true,
    });
  }

  // Interrupt rules
  if (rules.global.interruptFor.length > 0) {
    extracted.push({
      ruleId: `${userId}_interrupt`,
      ruleType: 'interrupt',
      config: { events: rules.global.interruptFor },
      active: true,
    });
  }

  return extracted;
}

/**
 * Extracts app preferences from apps configuration.
 */
function extractAppPreferences(
  _userId: string,
  apps: Record<string, unknown>
): ProfileAppPreference[] {
  const extracted: ProfileAppPreference[] = [];

  for (const [appId, appConfig] of Object.entries(apps)) {
    if (appConfig && typeof appConfig === 'object') {
      const config = appConfig as Record<string, unknown>;
      extracted.push({
        appId,
        preferences: config,
        enabled: config.enabled !== false,
      });
    }
  }

  return extracted;
}

// =============================================================================
// EXPORTS
// =============================================================================

export {
  NODE_LABELS,
  RELATIONSHIP_TYPES,
  generateAllProfileQueries,
  extractPreferences,
  extractNotificationRules,
  extractAppPreferences,
};
