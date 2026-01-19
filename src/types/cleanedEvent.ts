/**
 * Reference to an entity extracted from a raw event.
 * Used for creating nodes in the knowledge graph.
 */
export interface CleanedEntityRef {
  /** Neo4j label for this entity (e.g., "Transaction", "Page", "CalendarEvent") */
  label: string;

  /** Unique identifier for this entity */
  id: string;

  /** Additional properties to store on the node */
  properties: Record<string, unknown>;
}

/**
 * Reference to an edge/relationship between entities.
 * Used for creating relationships in the knowledge graph.
 */
export interface CleanedEdgeRef {
  /** Relationship type (e.g., "VIEWED", "CREATED", "PARTICIPATED_IN") */
  type: string;

  /** ID of the source entity */
  fromId: string;

  /** Label of the source entity */
  fromLabel: string;

  /** ID of the target entity */
  toId: string;

  /** Label of the target entity */
  toLabel: string;

  /** Additional properties to store on the relationship */
  properties: Record<string, unknown>;
}

/**
 * Normalized event after cleaning/transformation.
 * Contains structured entities and relationships ready for graph materialization.
 */
export interface CleanedEvent {
  /** Original event ID from the raw event */
  sourceEventId: string;

  /** Original trace ID for correlation */
  traceId: string;

  /** Clerk user ID of the event owner */
  clerkUserId: string;

  /** Original event type */
  eventType: string;

  /** Unix timestamp in milliseconds when the event occurred */
  timestampMs: number;

  /** Entities extracted from the event */
  entities: CleanedEntityRef[];

  /** Relationships/edges between entities */
  edges: CleanedEdgeRef[];
}
