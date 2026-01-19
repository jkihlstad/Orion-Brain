import type { CleanedEvent, CleanedEntityRef, CleanedEdgeRef } from "../types/cleanedEvent";
import type { Neo4jStatement } from "./http";

/**
 * Sanitize a string for use as a Neo4j label.
 * Labels must start with a letter and contain only alphanumeric characters and underscores.
 */
export function label(input: string): string {
  // Remove any non-alphanumeric characters except underscores
  let sanitized = input.replace(/[^a-zA-Z0-9_]/g, "");

  // Ensure it starts with a letter
  if (sanitized.length === 0 || !/^[a-zA-Z]/.test(sanitized)) {
    sanitized = "Node" + sanitized;
  }

  // Capitalize first letter for convention
  return sanitized.charAt(0).toUpperCase() + sanitized.slice(1);
}

/**
 * Build a MERGE statement for a User node.
 */
function buildUserMergeStatement(
  clerkUserId: string,
  traceId: string,
  sourceEventId: string
): Neo4jStatement {
  return {
    statement: `
      MERGE (u:User {clerkUserId: $clerkUserId})
      ON CREATE SET u.createdAtTraceId = $traceId, u.createdByEventId = $sourceEventId
      ON MATCH SET u.lastSeenTraceId = $traceId, u.lastSeenEventId = $sourceEventId
    `,
    parameters: {
      clerkUserId,
      traceId,
      sourceEventId,
    },
  };
}

/**
 * Build a MERGE statement for an entity node.
 */
function buildEntityMergeStatement(
  entity: CleanedEntityRef,
  traceId: string,
  clerkUserId: string,
  sourceEventId: string
): Neo4jStatement {
  const safeLabel = label(entity.label);

  // Build property assignments for ON CREATE
  const propertyKeys = Object.keys(entity.properties);
  const propertyAssignments = propertyKeys
    .map((key) => `n.${key} = $props.${key}`)
    .join(", ");

  const createSetClause = propertyAssignments
    ? `ON CREATE SET n.traceId = $traceId, n.userId = $clerkUserId, n.sourceEventId = $sourceEventId, ${propertyAssignments}`
    : `ON CREATE SET n.traceId = $traceId, n.userId = $clerkUserId, n.sourceEventId = $sourceEventId`;

  const matchSetClause = propertyAssignments
    ? `ON MATCH SET n.lastTraceId = $traceId, n.lastEventId = $sourceEventId, ${propertyAssignments}`
    : `ON MATCH SET n.lastTraceId = $traceId, n.lastEventId = $sourceEventId`;

  return {
    statement: `
      MERGE (n:${safeLabel} {id: $entityId})
      ${createSetClause}
      ${matchSetClause}
    `,
    parameters: {
      entityId: entity.id,
      traceId,
      clerkUserId,
      sourceEventId,
      props: entity.properties,
    },
  };
}

/**
 * Build a MERGE statement for an edge/relationship.
 * Uses sourceEventId as part of the key to make relationships idempotent.
 */
function buildEdgeMergeStatement(
  edge: CleanedEdgeRef,
  sourceEventId: string
): Neo4jStatement {
  const safeType = edge.type.toUpperCase().replace(/[^A-Z0-9_]/g, "_");
  const safeFromLabel = label(edge.fromLabel);
  const safeToLabel = label(edge.toLabel);

  // Build property assignments
  const propertyKeys = Object.keys(edge.properties);
  const propertyAssignments = propertyKeys
    .map((key) => `r.${key} = $props.${key}`)
    .join(", ");

  const setClause = propertyAssignments
    ? `ON CREATE SET r.sourceEventId = $sourceEventId, ${propertyAssignments}`
    : `ON CREATE SET r.sourceEventId = $sourceEventId`;

  return {
    statement: `
      MATCH (from:${safeFromLabel} {id: $fromId})
      MATCH (to:${safeToLabel} {id: $toId})
      MERGE (from)-[r:${safeType} {sourceEventId: $sourceEventId}]->(to)
      ${setClause}
    `,
    parameters: {
      fromId: edge.fromId,
      toId: edge.toId,
      sourceEventId,
      props: edge.properties,
    },
  };
}

/**
 * Build all Neo4j statements needed to materialize a cleaned event into the graph.
 *
 * @param cleanedEvent - The cleaned event with entities and edges
 * @returns Array of Neo4j statements to execute
 */
export function buildMaterializeStatements(
  cleanedEvent: CleanedEvent
): Neo4jStatement[] {
  const statements: Neo4jStatement[] = [];

  // First, ensure the User node exists
  statements.push(
    buildUserMergeStatement(
      cleanedEvent.clerkUserId,
      cleanedEvent.traceId,
      cleanedEvent.sourceEventId
    )
  );

  // MERGE all entity nodes (skip User since we handle it separately)
  for (const entity of cleanedEvent.entities) {
    if (entity.label !== "User") {
      statements.push(
        buildEntityMergeStatement(
          entity,
          cleanedEvent.traceId,
          cleanedEvent.clerkUserId,
          cleanedEvent.sourceEventId
        )
      );
    }
  }

  // MERGE all edges
  for (const edge of cleanedEvent.edges) {
    statements.push(buildEdgeMergeStatement(edge, cleanedEvent.sourceEventId));
  }

  return statements;
}
