/**
 * Neo4j Cypher Mapping
 *
 * Transforms CleanedEvent data into idempotent Cypher statements
 * for upserting nodes and relationships into Neo4j.
 */

import { CleanedEvent } from "../types/cleanedEvent";

/**
 * Escape a string value for Cypher
 */
function escapeCypherString(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

/**
 * Format a value for Cypher
 */
function formatCypherValue(value: string | number | boolean | null): string {
  if (value === null) {
    return "null";
  }
  if (typeof value === "string") {
    return `'${escapeCypherString(value)}'`;
  }
  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }
  return String(value);
}

/**
 * Format properties object for Cypher SET clause
 */
function formatPropsForSet(
  props: Record<string, string | number | boolean | null>,
  varName: string
): string {
  const setParts: string[] = [];

  for (const [key, value] of Object.entries(props)) {
    if (value !== null && value !== undefined) {
      setParts.push(`${varName}.${key} = ${formatCypherValue(value)}`);
    }
  }

  return setParts.join(", ");
}

/**
 * Generate Cypher statement to MERGE a User node
 */
function generateUserMerge(userId: string, traceId?: string, eventId?: string): string {
  const setClauses = [
    `u.lastSeen = timestamp()`,
  ];

  if (traceId) {
    setClauses.push(`u.lastTraceId = '${escapeCypherString(traceId)}'`);
  }
  if (eventId) {
    setClauses.push(`u.lastEventId = '${escapeCypherString(eventId)}'`);
  }

  return `MERGE (u:User {id: '${escapeCypherString(userId)}'})
ON CREATE SET u.createdAt = timestamp(), ${setClauses.join(", ")}
ON MATCH SET ${setClauses.join(", ")}`;
}

/**
 * Generate Cypher statement to MERGE an entity node
 */
function generateEntityMerge(
  entity: { kind: string; id: string; props: Record<string, string | number | boolean | null> },
  traceId?: string,
  sourceEventId?: string
): string {
  const label = entity.kind;
  const id = entity.id;

  const createProps = {
    ...entity.props,
    createdAt: Date.now(),
    sourceTraceId: traceId || null,
    sourceEventId: sourceEventId || null,
  };

  const updateProps = {
    ...entity.props,
    updatedAt: Date.now(),
    lastTraceId: traceId || null,
    lastEventId: sourceEventId || null,
  };

  const createSetStr = formatPropsForSet(createProps, "n");
  const updateSetStr = formatPropsForSet(updateProps, "n");

  return `MERGE (n:${label} {id: '${escapeCypherString(id)}'})
ON CREATE SET ${createSetStr || "n.createdAt = timestamp()"}
ON MATCH SET ${updateSetStr || "n.updatedAt = timestamp()"}`;
}

/**
 * Generate Cypher statement to MERGE an edge/relationship
 */
function generateEdgeMerge(
  edge: {
    from: { kind: string; id: string };
    rel: string;
    to: { kind: string; id: string };
    props?: Record<string, string | number | boolean | null>;
  },
  traceId?: string,
  sourceEventId?: string
): string {
  const fromLabel = edge.from.kind;
  const fromId = edge.from.id;
  const toLabel = edge.to.kind;
  const toId = edge.to.id;
  const relType = edge.rel;

  const relProps = {
    ...(edge.props || {}),
    sourceTraceId: traceId || null,
    sourceEventId: sourceEventId || null,
  };

  const setStr = formatPropsForSet(relProps, "r");
  const setClause = setStr ? `SET ${setStr}` : "";

  return `MATCH (a:${fromLabel} {id: '${escapeCypherString(fromId)}'})
MATCH (b:${toLabel} {id: '${escapeCypherString(toId)}'})
MERGE (a)-[r:${relType}]->(b)
${setClause}`.trim();
}

/**
 * Generate all Cypher statements for a CleanedEvent
 *
 * The statements are ordered to ensure nodes exist before edges are created:
 * 1. MERGE User node
 * 2. MERGE all entity nodes
 * 3. MERGE all edges
 *
 * All statements are idempotent - safe to run multiple times.
 *
 * @param cleanedEvent - The cleaned event to transform
 * @returns Array of Cypher statements
 */
export function generateCypher(cleanedEvent: CleanedEvent): string[] {
  const statements: string[] = [];
  const { traceId, sourceEventId, clerkUserId, entities, edges } = cleanedEvent;

  // 1. MERGE the User node first
  statements.push(generateUserMerge(clerkUserId, traceId, sourceEventId));

  // 2. MERGE all entity nodes
  for (const entity of entities) {
    const entityParam = {
      kind: entity.label,
      id: entity.id,
      props: entity.properties as Record<string, string | number | boolean | null>,
    };
    statements.push(generateEntityMerge(entityParam, traceId, sourceEventId));
  }

  // 3. MERGE all edges
  // Note: We need to ensure the User node is available for edges that reference it
  for (const edge of edges) {
    const edgeParam = {
      from: { kind: edge.fromLabel, id: edge.fromId },
      rel: edge.type,
      to: { kind: edge.toLabel, id: edge.toId },
      props: edge.properties as Record<string, string | number | boolean | null>,
    };
    statements.push(generateEdgeMerge(edgeParam, traceId, sourceEventId));
  }

  return statements;
}

/**
 * Generate a single combined Cypher statement for a CleanedEvent
 * Useful for transactional execution
 */
export function generateCombinedCypher(cleanedEvent: CleanedEvent): string {
  const statements = generateCypher(cleanedEvent);
  return statements.join("\n\n");
}

/**
 * Generate Cypher for multiple cleaned events
 */
export function generateBatchCypher(cleanedEvents: CleanedEvent[]): string[] {
  const allStatements: string[] = [];

  for (const event of cleanedEvents) {
    allStatements.push(...generateCypher(event));
  }

  return allStatements;
}

/**
 * Wrap Cypher statements in a transaction
 */
export function wrapInTransaction(statements: string[]): string {
  return `:begin
${statements.join(";\n")}
:commit`;
}
