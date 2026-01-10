/**
 * Neural Intelligence Platform - Neo4j Graph Model
 *
 * Type definitions and Cypher queries for the Neo4j graph database.
 * Defines nodes, relationships, and graph traversal patterns.
 *
 * @version 1.0.0
 * @author Sub-Agent 1: Data + Storage Engineer
 */

import { PrivacyScope, EventType, SourceApp } from '../types/common';

// =============================================================================
// SCHEMA VERSION
// =============================================================================

export const NEO4J_SCHEMA_VERSION = 1;

// =============================================================================
// NODE LABELS
// =============================================================================

/**
 * Node labels used in the graph.
 */
export const NODE_LABELS = {
  USER: 'User',
  EVENT: 'Event',
  SPEAKER_CLUSTER: 'SpeakerCluster',
  CONTACT: 'Contact',
  SESSION: 'Session',
  URL: 'Url',
} as const;

export type NodeLabel = (typeof NODE_LABELS)[keyof typeof NODE_LABELS];

// =============================================================================
// RELATIONSHIP TYPES
// =============================================================================

/**
 * Relationship types used in the graph.
 */
export const RELATIONSHIP_TYPES = {
  GENERATED: 'GENERATED',
  HAS_SPEAKER_CLUSTER: 'HAS_SPEAKER_CLUSTER',
  RESOLVES_TO: 'RESOLVES_TO',
  HAS_SESSION: 'HAS_SESSION',
  VIEWED: 'VIEWED',
  IN_SESSION: 'IN_SESSION',
  MENTIONS_SPEAKER: 'MENTIONS_SPEAKER',
} as const;

export type RelationshipType =
  (typeof RELATIONSHIP_TYPES)[keyof typeof RELATIONSHIP_TYPES];

// =============================================================================
// NODE TYPE DEFINITIONS
// =============================================================================

/**
 * User node - represents a platform user.
 */
export interface UserNode {
  /** Unique user identifier (matches Convex userId) */
  userId: string;

  /** User email */
  email: string;

  /** User display name */
  displayName: string | null;

  /** Account creation timestamp */
  createdAt: number;

  /** Last activity timestamp */
  lastActiveAt: number;

  /** User preferences (JSON stringified) */
  preferencesJson: string | null;

  /** Account status */
  status: 'active' | 'suspended' | 'deleted';

  /** Schema version */
  schemaVersion: number;
}

/**
 * Event node - represents any captured event.
 */
export interface EventNode {
  /** Unique event identifier (matches Convex eventId) */
  eventId: string;

  /** User who generated this event */
  userId: string;

  /** Type of event */
  eventType: EventType;

  /** Source application */
  sourceApp: SourceApp;

  /** Privacy scope */
  privacyScope: PrivacyScope;

  /** Event timestamp */
  timestamp: number;

  /** LanceDB table where vector is stored */
  lancedbTable: string;

  /** LanceDB row ID for vector lookup */
  lancedbRowId: string;

  /** Brief description/summary of event */
  summary: string | null;

  /** Schema version */
  schemaVersion: number;
}

/**
 * SpeakerCluster node - represents a group of audio segments from same speaker.
 */
export interface SpeakerClusterNode {
  /** Unique cluster identifier */
  clusterId: string;

  /** User who owns this cluster */
  userId: string;

  /** Centroid of speaker embeddings (JSON stringified array) */
  centroidVectorJson: string;

  /** Number of audio segments in cluster */
  segmentCount: number;

  /** Total duration of audio in cluster (seconds) */
  totalDuration: number;

  /** First occurrence timestamp */
  firstSeen: number;

  /** Last occurrence timestamp */
  lastSeen: number;

  /** User-assigned label (before contact resolution) */
  label: string | null;

  /** Cluster quality score (0-1) */
  qualityScore: number;

  /** Is this the user's own voice */
  isUserVoice: boolean;

  /** Schema version */
  schemaVersion: number;
}

/**
 * Contact node - represents a resolved identity.
 */
export interface ContactNode {
  /** Unique contact identifier */
  contactId: string;

  /** User who owns this contact */
  userId: string;

  /** Contact display name */
  displayName: string;

  /** Contact email (if known) */
  email: string | null;

  /** Contact phone (if known) */
  phone: string | null;

  /** Profile photo URL */
  photoUrl: string | null;

  /** Relationship type to user */
  relationship: string | null;

  /** Contact notes */
  notes: string | null;

  /** External IDs (JSON stringified map) */
  externalIdsJson: string | null;

  /** First interaction timestamp */
  firstInteraction: number;

  /** Last interaction timestamp */
  lastInteraction: number;

  /** Total interaction count */
  interactionCount: number;

  /** Is this a verified contact */
  isVerified: boolean;

  /** Schema version */
  schemaVersion: number;
}

/**
 * Session node - represents a browser session.
 */
export interface SessionNode {
  /** Unique session identifier */
  sessionId: string;

  /** User who owns this session */
  userId: string;

  /** Session start timestamp */
  startTime: number;

  /** Session end timestamp */
  endTime: number;

  /** Session duration in seconds */
  duration: number;

  /** Device type */
  deviceType: 'mobile' | 'tablet' | 'desktop';

  /** Number of events in session */
  eventCount: number;

  /** Number of URLs visited */
  urlCount: number;

  /** Primary activity/topic */
  primaryTopic: string | null;

  /** Session summary */
  summary: string | null;

  /** LanceDB row ID for session vector */
  lancedbRowId: string | null;

  /** Schema version */
  schemaVersion: number;
}

/**
 * Url node - represents a unique URL visited.
 */
export interface UrlNode {
  /** Normalized URL (without query params, fragments) */
  normalizedUrl: string;

  /** Full original URL */
  originalUrl: string;

  /** URL domain */
  domain: string;

  /** URL path */
  path: string;

  /** Page title */
  title: string | null;

  /** Page description */
  description: string | null;

  /** Page favicon URL */
  faviconUrl: string | null;

  /** Content category */
  category: string | null;

  /** First visit timestamp */
  firstVisit: number;

  /** Last visit timestamp */
  lastVisit: number;

  /** Total visit count */
  visitCount: number;

  /** Schema version */
  schemaVersion: number;
}

// =============================================================================
// RELATIONSHIP PROPERTY TYPES
// =============================================================================

/**
 * Properties for GENERATED relationship.
 */
export interface GeneratedRelProps {
  /** When the event was generated */
  timestamp: number;
}

/**
 * Properties for HAS_SPEAKER_CLUSTER relationship.
 */
export interface HasSpeakerClusterRelProps {
  /** When the cluster was created */
  createdAt: number;

  /** How the cluster was created */
  creationMethod: 'auto_clustering' | 'manual_split' | 'manual_merge';
}

/**
 * Properties for RESOLVES_TO relationship.
 */
export interface ResolvesToRelProps {
  /** When the resolution was made */
  resolvedAt: number;

  /** Confidence score of resolution (0-1) */
  confidence: number;

  /** How the resolution was made */
  resolutionMethod: 'user_manual' | 'auto_suggested' | 'import';
}

/**
 * Properties for HAS_SESSION relationship.
 */
export interface HasSessionRelProps {
  /** Session start time */
  startTime: number;
}

/**
 * Properties for VIEWED relationship.
 */
export interface ViewedRelProps {
  /** When the URL was viewed */
  viewedAt: number;

  /** Duration on page (seconds) */
  duration: number;

  /** Scroll depth (0-1) */
  scrollDepth: number | null;

  /** Interaction count on page */
  interactionCount: number;
}

/**
 * Properties for IN_SESSION relationship.
 */
export interface InSessionRelProps {
  /** Event timestamp */
  timestamp: number;

  /** Event sequence number in session */
  sequenceNumber: number;
}

/**
 * Properties for MENTIONS_SPEAKER relationship.
 */
export interface MentionsSpeakerRelProps {
  /** When the mention occurred */
  timestamp: number;

  /** Duration of speaker in event (seconds) */
  speakerDuration: number;

  /** Confidence of speaker identification (0-1) */
  confidence: number;
}

// =============================================================================
// CYPHER SCHEMA CREATION QUERIES
// =============================================================================

/**
 * Cypher queries to create constraints and indexes.
 */
export const SCHEMA_CREATION_QUERIES = {
  // Constraints (unique identifiers)
  constraints: [
    `CREATE CONSTRAINT user_id_unique IF NOT EXISTS
     FOR (u:User) REQUIRE u.userId IS UNIQUE`,

    `CREATE CONSTRAINT event_id_unique IF NOT EXISTS
     FOR (e:Event) REQUIRE e.eventId IS UNIQUE`,

    `CREATE CONSTRAINT cluster_id_unique IF NOT EXISTS
     FOR (sc:SpeakerCluster) REQUIRE sc.clusterId IS UNIQUE`,

    `CREATE CONSTRAINT contact_id_unique IF NOT EXISTS
     FOR (c:Contact) REQUIRE c.contactId IS UNIQUE`,

    `CREATE CONSTRAINT session_id_unique IF NOT EXISTS
     FOR (s:Session) REQUIRE s.sessionId IS UNIQUE`,

    `CREATE CONSTRAINT url_normalized_unique IF NOT EXISTS
     FOR (u:Url) REQUIRE u.normalizedUrl IS UNIQUE`,
  ],

  // Indexes for common queries
  indexes: [
    // User indexes
    `CREATE INDEX user_email IF NOT EXISTS FOR (u:User) ON (u.email)`,
    `CREATE INDEX user_status IF NOT EXISTS FOR (u:User) ON (u.status)`,

    // Event indexes
    `CREATE INDEX event_user_id IF NOT EXISTS FOR (e:Event) ON (e.userId)`,
    `CREATE INDEX event_type IF NOT EXISTS FOR (e:Event) ON (e.eventType)`,
    `CREATE INDEX event_timestamp IF NOT EXISTS FOR (e:Event) ON (e.timestamp)`,
    `CREATE INDEX event_privacy IF NOT EXISTS FOR (e:Event) ON (e.privacyScope)`,

    // SpeakerCluster indexes
    `CREATE INDEX cluster_user_id IF NOT EXISTS FOR (sc:SpeakerCluster) ON (sc.userId)`,
    `CREATE INDEX cluster_is_user_voice IF NOT EXISTS FOR (sc:SpeakerCluster) ON (sc.isUserVoice)`,

    // Contact indexes
    `CREATE INDEX contact_user_id IF NOT EXISTS FOR (c:Contact) ON (c.userId)`,
    `CREATE INDEX contact_display_name IF NOT EXISTS FOR (c:Contact) ON (c.displayName)`,

    // Session indexes
    `CREATE INDEX session_user_id IF NOT EXISTS FOR (s:Session) ON (s.userId)`,
    `CREATE INDEX session_start_time IF NOT EXISTS FOR (s:Session) ON (s.startTime)`,

    // Url indexes
    `CREATE INDEX url_domain IF NOT EXISTS FOR (u:Url) ON (u.domain)`,
    `CREATE INDEX url_category IF NOT EXISTS FOR (u:Url) ON (u.category)`,

    // Composite indexes for common query patterns
    `CREATE INDEX event_user_timestamp IF NOT EXISTS FOR (e:Event) ON (e.userId, e.timestamp)`,
    `CREATE INDEX event_user_type IF NOT EXISTS FOR (e:Event) ON (e.userId, e.eventType)`,
  ],
} as const;

// =============================================================================
// CYPHER QUERY TEMPLATES
// =============================================================================

/**
 * Parameterized Cypher query templates for common operations.
 */
export const CYPHER_QUERIES = {
  // ==========================================================================
  // NODE UPSERT QUERIES
  // ==========================================================================

  upsertUser: `
    MERGE (u:User {userId: $userId})
    ON CREATE SET
      u.email = $email,
      u.displayName = $displayName,
      u.createdAt = $createdAt,
      u.lastActiveAt = $lastActiveAt,
      u.preferencesJson = $preferencesJson,
      u.status = $status,
      u.schemaVersion = $schemaVersion
    ON MATCH SET
      u.email = $email,
      u.displayName = $displayName,
      u.lastActiveAt = $lastActiveAt,
      u.preferencesJson = $preferencesJson,
      u.status = $status,
      u.schemaVersion = $schemaVersion
    RETURN u
  `,

  upsertEvent: `
    MERGE (e:Event {eventId: $eventId})
    ON CREATE SET
      e.userId = $userId,
      e.eventType = $eventType,
      e.sourceApp = $sourceApp,
      e.privacyScope = $privacyScope,
      e.timestamp = $timestamp,
      e.lancedbTable = $lancedbTable,
      e.lancedbRowId = $lancedbRowId,
      e.summary = $summary,
      e.schemaVersion = $schemaVersion
    ON MATCH SET
      e.privacyScope = $privacyScope,
      e.summary = $summary,
      e.schemaVersion = $schemaVersion
    RETURN e
  `,

  upsertSpeakerCluster: `
    MERGE (sc:SpeakerCluster {clusterId: $clusterId})
    ON CREATE SET
      sc.userId = $userId,
      sc.centroidVectorJson = $centroidVectorJson,
      sc.segmentCount = $segmentCount,
      sc.totalDuration = $totalDuration,
      sc.firstSeen = $firstSeen,
      sc.lastSeen = $lastSeen,
      sc.label = $label,
      sc.qualityScore = $qualityScore,
      sc.isUserVoice = $isUserVoice,
      sc.schemaVersion = $schemaVersion
    ON MATCH SET
      sc.centroidVectorJson = $centroidVectorJson,
      sc.segmentCount = $segmentCount,
      sc.totalDuration = $totalDuration,
      sc.lastSeen = $lastSeen,
      sc.label = $label,
      sc.qualityScore = $qualityScore,
      sc.schemaVersion = $schemaVersion
    RETURN sc
  `,

  upsertContact: `
    MERGE (c:Contact {contactId: $contactId})
    ON CREATE SET
      c.userId = $userId,
      c.displayName = $displayName,
      c.email = $email,
      c.phone = $phone,
      c.photoUrl = $photoUrl,
      c.relationship = $relationship,
      c.notes = $notes,
      c.externalIdsJson = $externalIdsJson,
      c.firstInteraction = $firstInteraction,
      c.lastInteraction = $lastInteraction,
      c.interactionCount = $interactionCount,
      c.isVerified = $isVerified,
      c.schemaVersion = $schemaVersion
    ON MATCH SET
      c.displayName = $displayName,
      c.email = $email,
      c.phone = $phone,
      c.photoUrl = $photoUrl,
      c.relationship = $relationship,
      c.notes = $notes,
      c.externalIdsJson = $externalIdsJson,
      c.lastInteraction = $lastInteraction,
      c.interactionCount = $interactionCount,
      c.isVerified = $isVerified,
      c.schemaVersion = $schemaVersion
    RETURN c
  `,

  upsertSession: `
    MERGE (s:Session {sessionId: $sessionId})
    ON CREATE SET
      s.userId = $userId,
      s.startTime = $startTime,
      s.endTime = $endTime,
      s.duration = $duration,
      s.deviceType = $deviceType,
      s.eventCount = $eventCount,
      s.urlCount = $urlCount,
      s.primaryTopic = $primaryTopic,
      s.summary = $summary,
      s.lancedbRowId = $lancedbRowId,
      s.schemaVersion = $schemaVersion
    ON MATCH SET
      s.endTime = $endTime,
      s.duration = $duration,
      s.eventCount = $eventCount,
      s.urlCount = $urlCount,
      s.primaryTopic = $primaryTopic,
      s.summary = $summary,
      s.lancedbRowId = $lancedbRowId,
      s.schemaVersion = $schemaVersion
    RETURN s
  `,

  upsertUrl: `
    MERGE (u:Url {normalizedUrl: $normalizedUrl})
    ON CREATE SET
      u.originalUrl = $originalUrl,
      u.domain = $domain,
      u.path = $path,
      u.title = $title,
      u.description = $description,
      u.faviconUrl = $faviconUrl,
      u.category = $category,
      u.firstVisit = $firstVisit,
      u.lastVisit = $lastVisit,
      u.visitCount = 1,
      u.schemaVersion = $schemaVersion
    ON MATCH SET
      u.title = COALESCE($title, u.title),
      u.description = COALESCE($description, u.description),
      u.faviconUrl = COALESCE($faviconUrl, u.faviconUrl),
      u.category = COALESCE($category, u.category),
      u.lastVisit = $lastVisit,
      u.visitCount = u.visitCount + 1,
      u.schemaVersion = $schemaVersion
    RETURN u
  `,

  // ==========================================================================
  // RELATIONSHIP CREATION QUERIES
  // ==========================================================================

  createUserGeneratedEvent: `
    MATCH (u:User {userId: $userId})
    MATCH (e:Event {eventId: $eventId})
    MERGE (u)-[r:GENERATED]->(e)
    ON CREATE SET r.timestamp = $timestamp
    RETURN r
  `,

  createUserHasSpeakerCluster: `
    MATCH (u:User {userId: $userId})
    MATCH (sc:SpeakerCluster {clusterId: $clusterId})
    MERGE (u)-[r:HAS_SPEAKER_CLUSTER]->(sc)
    ON CREATE SET
      r.createdAt = $createdAt,
      r.creationMethod = $creationMethod
    RETURN r
  `,

  createClusterResolvesToContact: `
    MATCH (sc:SpeakerCluster {clusterId: $clusterId})
    MATCH (c:Contact {contactId: $contactId})
    MERGE (sc)-[r:RESOLVES_TO]->(c)
    ON CREATE SET
      r.resolvedAt = $resolvedAt,
      r.confidence = $confidence,
      r.resolutionMethod = $resolutionMethod
    ON MATCH SET
      r.resolvedAt = $resolvedAt,
      r.confidence = $confidence,
      r.resolutionMethod = $resolutionMethod
    RETURN r
  `,

  createUserHasSession: `
    MATCH (u:User {userId: $userId})
    MATCH (s:Session {sessionId: $sessionId})
    MERGE (u)-[r:HAS_SESSION]->(s)
    ON CREATE SET r.startTime = $startTime
    RETURN r
  `,

  createSessionViewedUrl: `
    MATCH (s:Session {sessionId: $sessionId})
    MATCH (u:Url {normalizedUrl: $normalizedUrl})
    MERGE (s)-[r:VIEWED]->(u)
    ON CREATE SET
      r.viewedAt = $viewedAt,
      r.duration = $duration,
      r.scrollDepth = $scrollDepth,
      r.interactionCount = $interactionCount
    ON MATCH SET
      r.duration = r.duration + $duration,
      r.scrollDepth = CASE WHEN $scrollDepth > r.scrollDepth THEN $scrollDepth ELSE r.scrollDepth END,
      r.interactionCount = r.interactionCount + $interactionCount
    RETURN r
  `,

  createEventInSession: `
    MATCH (e:Event {eventId: $eventId})
    MATCH (s:Session {sessionId: $sessionId})
    MERGE (e)-[r:IN_SESSION]->(s)
    ON CREATE SET
      r.timestamp = $timestamp,
      r.sequenceNumber = $sequenceNumber
    RETURN r
  `,

  createEventMentionsSpeaker: `
    MATCH (e:Event {eventId: $eventId})
    MATCH (sc:SpeakerCluster {clusterId: $clusterId})
    MERGE (e)-[r:MENTIONS_SPEAKER]->(sc)
    ON CREATE SET
      r.timestamp = $timestamp,
      r.speakerDuration = $speakerDuration,
      r.confidence = $confidence
    RETURN r
  `,

  // ==========================================================================
  // QUERY OPERATIONS
  // ==========================================================================

  getClustersByUser: `
    MATCH (u:User {userId: $userId})-[:HAS_SPEAKER_CLUSTER]->(sc:SpeakerCluster)
    OPTIONAL MATCH (sc)-[:RESOLVES_TO]->(c:Contact)
    RETURN sc, c
    ORDER BY sc.lastSeen DESC
    SKIP $offset
    LIMIT $limit
  `,

  getEventsByCluster: `
    MATCH (e:Event)-[r:MENTIONS_SPEAKER]->(sc:SpeakerCluster {clusterId: $clusterId})
    RETURN e, r
    ORDER BY e.timestamp DESC
    SKIP $offset
    LIMIT $limit
  `,

  resolveClusterToContact: `
    MATCH (sc:SpeakerCluster {clusterId: $clusterId})
    OPTIONAL MATCH (sc)-[:RESOLVES_TO]->(c:Contact)
    RETURN sc, c
  `,

  getSessionHistory: `
    MATCH (u:User {userId: $userId})-[:HAS_SESSION]->(s:Session)
    WHERE s.startTime >= $startTime AND s.startTime <= $endTime
    OPTIONAL MATCH (s)-[v:VIEWED]->(url:Url)
    RETURN s, collect({url: url, viewed: v}) as urls
    ORDER BY s.startTime DESC
    SKIP $offset
    LIMIT $limit
  `,

  getEventsBySession: `
    MATCH (e:Event)-[:IN_SESSION]->(s:Session {sessionId: $sessionId})
    RETURN e
    ORDER BY e.timestamp ASC
  `,

  getContactInteractionTimeline: `
    MATCH (c:Contact {contactId: $contactId})<-[:RESOLVES_TO]-(sc:SpeakerCluster)
    MATCH (e:Event)-[:MENTIONS_SPEAKER]->(sc)
    RETURN e, sc
    ORDER BY e.timestamp DESC
    SKIP $offset
    LIMIT $limit
  `,

  getUserEventTimeline: `
    MATCH (u:User {userId: $userId})-[:GENERATED]->(e:Event)
    WHERE e.timestamp >= $startTime AND e.timestamp <= $endTime
    AND ($eventTypes IS NULL OR e.eventType IN $eventTypes)
    RETURN e
    ORDER BY e.timestamp DESC
    SKIP $offset
    LIMIT $limit
  `,

  // ==========================================================================
  // AGGREGATION QUERIES
  // ==========================================================================

  getClusterStats: `
    MATCH (u:User {userId: $userId})-[:HAS_SPEAKER_CLUSTER]->(sc:SpeakerCluster)
    RETURN
      count(sc) as totalClusters,
      sum(sc.segmentCount) as totalSegments,
      sum(sc.totalDuration) as totalDuration,
      count(CASE WHEN sc.isUserVoice THEN 1 END) as userVoiceClusters
  `,

  getSessionStats: `
    MATCH (u:User {userId: $userId})-[:HAS_SESSION]->(s:Session)
    WHERE s.startTime >= $startTime AND s.startTime <= $endTime
    RETURN
      count(s) as totalSessions,
      sum(s.duration) as totalDuration,
      sum(s.eventCount) as totalEvents,
      sum(s.urlCount) as totalUrls
  `,

  // ==========================================================================
  // CLEANUP QUERIES
  // ==========================================================================

  deleteUserData: `
    MATCH (u:User {userId: $userId})
    OPTIONAL MATCH (u)-[:GENERATED]->(e:Event)
    OPTIONAL MATCH (u)-[:HAS_SPEAKER_CLUSTER]->(sc:SpeakerCluster)
    OPTIONAL MATCH (u)-[:HAS_SESSION]->(s:Session)
    OPTIONAL MATCH (sc)-[:RESOLVES_TO]->(c:Contact)
    DETACH DELETE e, sc, s, c
    WITH u
    DETACH DELETE u
  `,

  removeClusterContactResolution: `
    MATCH (sc:SpeakerCluster {clusterId: $clusterId})-[r:RESOLVES_TO]->(c:Contact)
    DELETE r
    RETURN sc, c
  `,
} as const;

// =============================================================================
// TYPE EXPORTS FOR QUERIES
// =============================================================================

export type CypherQueryName = keyof typeof CYPHER_QUERIES;
