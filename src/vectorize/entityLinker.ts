/**
 * Entity Linker for CFD → Neo4j Graph
 *
 * Creates entity nodes and relationships in Neo4j based on
 * CFD entityRefs extracted during vectorization.
 *
 * @version 1.0.0
 */

import type { Env } from '../env';
import type { CanonicalFeatureDocument, EntityRef } from './cfd';

// =============================================================================
// TYPES
// =============================================================================

/**
 * Result of entity linking operation.
 */
export interface EntityLinkingResult {
  /** Event ID */
  eventId: string;

  /** Whether linking was successful */
  success: boolean;

  /** Number of entities created/updated */
  entitiesProcessed: number;

  /** Number of relationships created */
  relationshipsCreated: number;

  /** Errors encountered */
  errors: string[];

  /** Processing time in ms */
  processingTimeMs: number;
}

/**
 * Entity node labels in Neo4j (extended from existing schema).
 */
export const ENTITY_NODE_LABELS: Record<string, string> = {
  merchant: 'Merchant',
  contact: 'Contact',
  task: 'Task',
  project: 'Project',
  calendar: 'Calendar',
  calendarEvent: 'CalendarEvent',
  thread: 'EmailThread',
  message: 'Message',
  account: 'Account',
  business: 'Business',
  offering: 'Offering',
  budget: 'Budget',
  goal: 'Goal',
  transaction: 'Transaction',
  domain: 'Domain',
  tag: 'Tag',
  place: 'Place',
  searchSession: 'SearchSession',
  proofClaim: 'ProofClaim',
  inquiry: 'Inquiry',
  note: 'Note',
  memo: 'Memo',
  photo: 'Photo',
  document: 'Document',
  post: 'Post',
  user: 'User',
  notification: 'Notification',
  voicemail: 'Voicemail',
  call: 'Call',
  recurring: 'RecurringEvent',
  subscription: 'Subscription',
  report: 'Report',
  subtask: 'Subtask',
  consentScope: 'ConsentScope',
  category: 'Category',
  institution: 'FinancialInstitution',
  entity: 'Entity', // Generic fallback
};

// =============================================================================
// CYPHER GENERATION
// =============================================================================

/**
 * Build Cypher statement to upsert an entity node.
 */
function buildEntityUpsertCypher(
  entityRef: EntityRef,
  userId: string,
  eventId: string
): { statement: string; parameters: Record<string, unknown> } {
  const label = ENTITY_NODE_LABELS[entityRef.type] || 'Entity';
  const idProperty = `${entityRef.type}Id`;

  return {
    statement: `
      MERGE (n:${label} {${idProperty}: $entityId})
      ON CREATE SET
        n.userId = $userId,
        n.createdFromEventId = $eventId,
        n.sourcePath = $sourcePath,
        n.createdAt = $timestamp,
        n.updatedAt = $timestamp,
        n.schemaVersion = 1
      ON MATCH SET
        n.updatedAt = $timestamp,
        n.lastEventId = $eventId
      RETURN n
    `,
    parameters: {
      entityId: entityRef.id,
      userId,
      eventId,
      sourcePath: entityRef.sourcePath,
      timestamp: Date.now(),
    },
  };
}

/**
 * Build Cypher statement to create relationship from Event to Entity.
 */
function buildEventEntityRelationshipCypher(
  entityRef: EntityRef,
  eventId: string
): { statement: string; parameters: Record<string, unknown> } {
  const label = ENTITY_NODE_LABELS[entityRef.type] || 'Entity';
  const idProperty = `${entityRef.type}Id`;

  // Relationship type based on entity type
  const relType = getRelationshipType(entityRef.type);

  return {
    statement: `
      MATCH (e:Event {eventId: $eventId})
      MATCH (n:${label} {${idProperty}: $entityId})
      MERGE (e)-[r:${relType}]->(n)
      ON CREATE SET
        r.sourcePath = $sourcePath,
        r.linkedAt = $timestamp
      RETURN r
    `,
    parameters: {
      eventId,
      entityId: entityRef.id,
      sourcePath: entityRef.sourcePath,
      timestamp: Date.now(),
    },
  };
}

/**
 * Get relationship type based on entity type.
 */
function getRelationshipType(entityType: string): string {
  const relationshipMap: Record<string, string> = {
    merchant: 'INVOLVES_MERCHANT',
    contact: 'INVOLVES_CONTACT',
    task: 'RELATES_TO_TASK',
    project: 'RELATES_TO_PROJECT',
    calendar: 'USES_CALENDAR',
    calendarEvent: 'REFERENCES_CALENDAR_EVENT',
    thread: 'IN_THREAD',
    message: 'REFERENCES_MESSAGE',
    account: 'USES_ACCOUNT',
    business: 'INVOLVES_BUSINESS',
    offering: 'REFERENCES_OFFERING',
    budget: 'AFFECTS_BUDGET',
    goal: 'RELATES_TO_GOAL',
    transaction: 'LINKED_TO_TRANSACTION',
    domain: 'INVOLVES_DOMAIN',
    tag: 'HAS_TAG',
    place: 'AT_PLACE',
    searchSession: 'IN_SEARCH_SESSION',
    proofClaim: 'REFERENCES_PROOF',
    inquiry: 'RELATED_TO_INQUIRY',
    note: 'REFERENCES_NOTE',
    memo: 'REFERENCES_MEMO',
    photo: 'INCLUDES_PHOTO',
    document: 'INCLUDES_DOCUMENT',
    post: 'REFERENCES_POST',
    user: 'INVOLVES_USER',
    notification: 'TRIGGERED_NOTIFICATION',
    voicemail: 'HAS_VOICEMAIL',
    call: 'PART_OF_CALL',
    recurring: 'PART_OF_RECURRING',
    subscription: 'FOR_SUBSCRIPTION',
    report: 'IN_REPORT',
    subtask: 'HAS_SUBTASK',
    consentScope: 'HAS_CONSENT_SCOPE',
    category: 'IN_CATEGORY',
    institution: 'AT_INSTITUTION',
  };

  return relationshipMap[entityType] || 'REFERENCES';
}

// =============================================================================
// ENTITY LINKER
// =============================================================================

/**
 * Entity Linker class for Neo4j integration.
 */
export class EntityLinker {
  private env: Env;

  constructor(env: Env) {
    this.env = env;
  }

  /**
   * Link entities from CFD to Neo4j graph.
   */
  async linkEntities(cfd: CanonicalFeatureDocument): Promise<EntityLinkingResult> {
    const startTime = Date.now();
    const errors: string[] = [];
    let entitiesProcessed = 0;
    let relationshipsCreated = 0;

    if (cfd.entityRefs.length === 0) {
      return {
        eventId: cfd.eventId,
        success: true,
        entitiesProcessed: 0,
        relationshipsCreated: 0,
        errors: [],
        processingTimeMs: Date.now() - startTime,
      };
    }

    try {
      // Build all Cypher statements
      const statements: Array<{ statement: string; parameters: Record<string, unknown> }> = [];

      // First, create all entity nodes
      for (const entityRef of cfd.entityRefs) {
        statements.push(buildEntityUpsertCypher(entityRef, cfd.userId, cfd.eventId));
      }

      // Then, create relationships from Event to entities
      for (const entityRef of cfd.entityRefs) {
        statements.push(buildEventEntityRelationshipCypher(entityRef, cfd.eventId));
      }

      // Execute via Neo4j HTTP API
      const results = await this.executeNeo4jStatements(statements);

      entitiesProcessed = cfd.entityRefs.length;
      relationshipsCreated = cfd.entityRefs.length;

      // Check for execution errors
      for (const result of results) {
        if (result.error) {
          errors.push(result.error);
        }
      }

      console.log(
        `[EntityLinker] Linked ${entitiesProcessed} entities for event ${cfd.eventId}`
      );

      return {
        eventId: cfd.eventId,
        success: errors.length === 0,
        entitiesProcessed,
        relationshipsCreated,
        errors,
        processingTimeMs: Date.now() - startTime,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      errors.push(message);

      console.error(`[EntityLinker] Failed for event ${cfd.eventId}:`, error);

      return {
        eventId: cfd.eventId,
        success: false,
        entitiesProcessed,
        relationshipsCreated,
        errors,
        processingTimeMs: Date.now() - startTime,
      };
    }
  }

  /**
   * Execute Cypher statements via Neo4j HTTP API.
   */
  private async executeNeo4jStatements(
    statements: Array<{ statement: string; parameters: Record<string, unknown> }>
  ): Promise<Array<{ success: boolean; error?: string }>> {
    const neo4jUrl = this.env.NEO4J_HTTP_URL;
    const neo4jUser = this.env.NEO4J_USER;
    const neo4jPass = this.env.NEO4J_PASS;

    if (!neo4jUrl) {
      return statements.map(() => ({ success: false, error: 'NEO4J_HTTP_URL not configured' }));
    }

    const auth = btoa(`${neo4jUser}:${neo4jPass}`);

    try {
      const response = await fetch(`${neo4jUrl}/db/neo4j/tx/commit`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Basic ${auth}`,
        },
        body: JSON.stringify({
          statements: statements.map((s) => ({
            statement: s.statement,
            parameters: s.parameters,
          })),
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        return statements.map(() => ({
          success: false,
          error: `Neo4j HTTP error: ${response.status} - ${errorText}`,
        }));
      }

      const data = (await response.json()) as {
        results: Array<unknown>;
        errors: Array<{ code: string; message: string }>;
      };

      if (data.errors && data.errors.length > 0) {
        return statements.map((_, i) => {
          const errorMsg = data.errors[i]?.message;
          if (errorMsg) {
            return { success: false, error: errorMsg };
          }
          return { success: true };
        });
      }

      return statements.map(() => ({ success: true }));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Network error';
      return statements.map(() => ({ success: false, error: message }));
    }
  }
}

/**
 * Create an EntityLinker instance.
 */
export function createEntityLinker(env: Env): EntityLinker {
  return new EntityLinker(env);
}
