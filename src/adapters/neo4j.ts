/**
 * Neural Intelligence Platform - Neo4j Adapter
 *
 * Provides connection management, node/relationship CRUD operations,
 * and graph traversal queries for the Neo4j database.
 *
 * @version 1.0.0
 * @author Sub-Agent 1: Data + Storage Engineer
 */

// TODO: Install Neo4j driver: npm install neo4j-driver
// import neo4j, { Driver, Session, Result, Record } from 'neo4j-driver';

import type { ConnectionStatus, PaginatedResponse } from '../types/common';

import {
  NEO4J_SCHEMA_VERSION,
  UserNode,
  EventNode,
  SpeakerClusterNode,
  ContactNode,
  SessionNode,
  UrlNode,
  ResolvesToRelProps,
  SCHEMA_CREATION_QUERIES,
  CYPHER_QUERIES,
} from '../schemas/neo4j-graph';

// =============================================================================
// CONFIGURATION
// =============================================================================

/**
 * Neo4j connection configuration.
 */
export interface Neo4jConfig {
  /** Neo4j URI (bolt:// or neo4j://) */
  uri: string;

  /** Username */
  username: string;

  /** Password */
  password: string;

  /** Database name (default: neo4j) */
  database?: string;

  /** Connection pool size */
  maxConnectionPoolSize?: number;

  /** Connection acquisition timeout in milliseconds */
  connectionAcquisitionTimeout?: number;

  /** Enable encryption */
  encrypted?: boolean;
}

/**
 * Default configuration values.
 */
const DEFAULT_CONFIG: Partial<Neo4jConfig> = {
  database: 'neo4j',
  maxConnectionPoolSize: 50,
  connectionAcquisitionTimeout: 30000,
  encrypted: true,
};

// =============================================================================
// MOCK TYPES (Replace with actual Neo4j driver types)
// =============================================================================

// TODO: Remove these mock types when installing the actual driver

interface MockDriver {
  session(config?: { database?: string }): MockSession;
  close(): Promise<void>;
  verifyConnectivity(): Promise<void>;
}

interface MockSession {
  run(query: string, params?: Record<string, unknown>): Promise<MockResult>;
  close(): Promise<void>;
  beginTransaction(): MockTransaction;
}

interface MockTransaction {
  run(query: string, params?: Record<string, unknown>): Promise<MockResult>;
  commit(): Promise<void>;
  rollback(): Promise<void>;
}

interface MockResult {
  records: MockRecord[];
  summary: { counters: { updates: () => { nodesCreated: number; relationshipsCreated: number } } };
}

interface MockRecord {
  get(key: string): unknown;
  toObject(): Record<string, unknown>;
}

// =============================================================================
// NEO4J ADAPTER CLASS
// =============================================================================

/**
 * Neo4j Adapter for the Neural Intelligence Platform.
 *
 * Provides:
 * - Connection management with driver pooling
 * - Node upsert operations for all node types
 * - Relationship creation and management
 * - Graph traversal queries
 * - Transaction support
 */
export class Neo4jAdapter {
  private config: Neo4jConfig;
  private driver: MockDriver | null = null;
  private connectionStatus: ConnectionStatus = { connected: false };

  constructor(config: Neo4jConfig) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  // ===========================================================================
  // CONNECTION MANAGEMENT
  // ===========================================================================

  /**
   * Establishes connection to Neo4j.
   */
  async connect(): Promise<void> {
    try {
      // TODO: Replace with actual Neo4j driver connection
      // this.driver = neo4j.driver(
      //   this.config.uri,
      //   neo4j.auth.basic(this.config.username, this.config.password),
      //   {
      //     maxConnectionPoolSize: this.config.maxConnectionPoolSize,
      //     connectionAcquisitionTimeout: this.config.connectionAcquisitionTimeout,
      //     encrypted: this.config.encrypted,
      //   }
      // );
      // await this.driver.verifyConnectivity();

      // Mock driver for development
      this.driver = {
        session: () => ({
          run: async () => ({
            records: [],
            summary: { counters: { updates: () => ({ nodesCreated: 0, relationshipsCreated: 0 }) } },
          }),
          close: async () => {},
          beginTransaction: () => ({
            run: async () => ({
              records: [],
              summary: { counters: { updates: () => ({ nodesCreated: 0, relationshipsCreated: 0 }) } },
            }),
            commit: async () => {},
            rollback: async () => {},
          }),
        }),
        close: async () => {},
        verifyConnectivity: async () => {},
      };

      this.connectionStatus = {
        connected: true,
        lastConnectedAt: Date.now(),
        metadata: { uri: this.config.uri, database: this.config.database },
      };

      console.log(`[Neo4j] Connected to ${this.config.uri}`);
    } catch (error) {
      this.connectionStatus = {
        connected: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
      throw new Error(`[Neo4j] Connection failed: ${this.connectionStatus.error}`);
    }
  }

  /**
   * Closes the Neo4j connection.
   */
  async disconnect(): Promise<void> {
    if (this.driver) {
      await this.driver.close();
      this.driver = null;
    }
    this.connectionStatus = { connected: false };
    console.log('[Neo4j] Disconnected');
  }

  /**
   * Returns the current connection status.
   */
  getConnectionStatus(): ConnectionStatus {
    return { ...this.connectionStatus };
  }

  /**
   * Gets a session from the driver.
   */
  private getSession(): MockSession {
    if (!this.driver) {
      throw new Error('[Neo4j] Not connected');
    }
    const sessionConfig: { database?: string } = {};
    if (this.config.database !== undefined) {
      sessionConfig.database = this.config.database;
    }
    return this.driver.session(sessionConfig);
  }

  /**
   * Executes a query and returns results.
   */
  private async runQuery<T>(
    query: string,
    params: Record<string, unknown> = {}
  ): Promise<T[]> {
    const session = this.getSession();
    try {
      const result = await session.run(query, params);
      return result.records.map((record) => record.toObject() as T);
    } finally {
      await session.close();
    }
  }

  /**
   * Executes a query and returns the first result.
   */
  private async runQuerySingle<T>(
    query: string,
    params: Record<string, unknown> = {}
  ): Promise<T | null> {
    const results = await this.runQuery<T>(query, params);
    return results.length > 0 ? (results[0] ?? null) : null;
  }

  // ===========================================================================
  // SCHEMA INITIALIZATION
  // ===========================================================================

  /**
   * Initializes database schema (constraints and indexes).
   */
  async initializeSchema(): Promise<void> {
    const session = this.getSession();

    try {
      // Create constraints
      for (const constraint of SCHEMA_CREATION_QUERIES.constraints) {
        try {
          await session.run(constraint);
        } catch (error) {
          // Constraints may already exist, ignore "already exists" errors
          console.log(`[Neo4j] Constraint may already exist: ${error}`);
        }
      }

      // Create indexes
      for (const index of SCHEMA_CREATION_QUERIES.indexes) {
        try {
          await session.run(index);
        } catch (error) {
          // Indexes may already exist
          console.log(`[Neo4j] Index may already exist: ${error}`);
        }
      }

      console.log('[Neo4j] Schema initialized');
    } finally {
      await session.close();
    }
  }

  // ===========================================================================
  // NODE UPSERT OPERATIONS
  // ===========================================================================

  /**
   * Upserts a User node.
   */
  async upsertUser(user: Omit<UserNode, 'schemaVersion'>): Promise<UserNode> {
    const result = await this.runQuerySingle<{ u: UserNode }>(CYPHER_QUERIES.upsertUser, {
      ...user,
      schemaVersion: NEO4J_SCHEMA_VERSION,
    });
    return result?.u ?? ({ ...user, schemaVersion: NEO4J_SCHEMA_VERSION } as UserNode);
  }

  /**
   * Upserts an Event node.
   */
  async upsertEvent(event: Omit<EventNode, 'schemaVersion'>): Promise<EventNode> {
    const result = await this.runQuerySingle<{ e: EventNode }>(CYPHER_QUERIES.upsertEvent, {
      ...event,
      schemaVersion: NEO4J_SCHEMA_VERSION,
    });
    return result?.e ?? ({ ...event, schemaVersion: NEO4J_SCHEMA_VERSION } as EventNode);
  }

  /**
   * Upserts a SpeakerCluster node.
   */
  async upsertSpeakerCluster(
    cluster: Omit<SpeakerClusterNode, 'schemaVersion'>
  ): Promise<SpeakerClusterNode> {
    const result = await this.runQuerySingle<{ sc: SpeakerClusterNode }>(
      CYPHER_QUERIES.upsertSpeakerCluster,
      {
        ...cluster,
        schemaVersion: NEO4J_SCHEMA_VERSION,
      }
    );
    return result?.sc ?? ({ ...cluster, schemaVersion: NEO4J_SCHEMA_VERSION } as SpeakerClusterNode);
  }

  /**
   * Upserts a Contact node.
   */
  async upsertContact(contact: Omit<ContactNode, 'schemaVersion'>): Promise<ContactNode> {
    const result = await this.runQuerySingle<{ c: ContactNode }>(CYPHER_QUERIES.upsertContact, {
      ...contact,
      schemaVersion: NEO4J_SCHEMA_VERSION,
    });
    return result?.c ?? ({ ...contact, schemaVersion: NEO4J_SCHEMA_VERSION } as ContactNode);
  }

  /**
   * Upserts a Session node.
   */
  async upsertSession(session: Omit<SessionNode, 'schemaVersion'>): Promise<SessionNode> {
    const result = await this.runQuerySingle<{ s: SessionNode }>(CYPHER_QUERIES.upsertSession, {
      ...session,
      schemaVersion: NEO4J_SCHEMA_VERSION,
    });
    return result?.s ?? ({ ...session, schemaVersion: NEO4J_SCHEMA_VERSION } as SessionNode);
  }

  /**
   * Upserts a Url node.
   */
  async upsertUrl(url: Omit<UrlNode, 'schemaVersion' | 'visitCount'>): Promise<UrlNode> {
    const result = await this.runQuerySingle<{ u: UrlNode }>(CYPHER_QUERIES.upsertUrl, {
      ...url,
      schemaVersion: NEO4J_SCHEMA_VERSION,
    });
    return result?.u ?? ({ ...url, schemaVersion: NEO4J_SCHEMA_VERSION, visitCount: 1 } as UrlNode);
  }

  // ===========================================================================
  // RELATIONSHIP CREATION
  // ===========================================================================

  /**
   * Creates User -[:GENERATED]-> Event relationship.
   */
  async createUserGeneratedEvent(
    userId: string,
    eventId: string,
    timestamp: number
  ): Promise<void> {
    await this.runQuery(CYPHER_QUERIES.createUserGeneratedEvent, {
      userId,
      eventId,
      timestamp,
    });
  }

  /**
   * Creates User -[:HAS_SPEAKER_CLUSTER]-> SpeakerCluster relationship.
   */
  async createUserHasSpeakerCluster(
    userId: string,
    clusterId: string,
    createdAt: number,
    creationMethod: 'auto_clustering' | 'manual_split' | 'manual_merge'
  ): Promise<void> {
    await this.runQuery(CYPHER_QUERIES.createUserHasSpeakerCluster, {
      userId,
      clusterId,
      createdAt,
      creationMethod,
    });
  }

  /**
   * Creates SpeakerCluster -[:RESOLVES_TO]-> Contact relationship.
   */
  async createClusterResolvesToContact(
    clusterId: string,
    contactId: string,
    props: ResolvesToRelProps
  ): Promise<void> {
    await this.runQuery(CYPHER_QUERIES.createClusterResolvesToContact, {
      clusterId,
      contactId,
      resolvedAt: props.resolvedAt,
      confidence: props.confidence,
      resolutionMethod: props.resolutionMethod,
    });
  }

  /**
   * Creates User -[:HAS_SESSION]-> Session relationship.
   */
  async createUserHasSession(
    userId: string,
    sessionId: string,
    startTime: number
  ): Promise<void> {
    await this.runQuery(CYPHER_QUERIES.createUserHasSession, {
      userId,
      sessionId,
      startTime,
    });
  }

  /**
   * Creates Session -[:VIEWED]-> Url relationship.
   */
  async createSessionViewedUrl(
    sessionId: string,
    normalizedUrl: string,
    viewedAt: number,
    duration: number,
    scrollDepth: number | null,
    interactionCount: number
  ): Promise<void> {
    await this.runQuery(CYPHER_QUERIES.createSessionViewedUrl, {
      sessionId,
      normalizedUrl,
      viewedAt,
      duration,
      scrollDepth,
      interactionCount,
    });
  }

  /**
   * Creates Event -[:IN_SESSION]-> Session relationship.
   */
  async createEventInSession(
    eventId: string,
    sessionId: string,
    timestamp: number,
    sequenceNumber: number
  ): Promise<void> {
    await this.runQuery(CYPHER_QUERIES.createEventInSession, {
      eventId,
      sessionId,
      timestamp,
      sequenceNumber,
    });
  }

  /**
   * Creates Event -[:MENTIONS_SPEAKER]-> SpeakerCluster relationship.
   */
  async createEventMentionsSpeaker(
    eventId: string,
    clusterId: string,
    timestamp: number,
    speakerDuration: number,
    confidence: number
  ): Promise<void> {
    await this.runQuery(CYPHER_QUERIES.createEventMentionsSpeaker, {
      eventId,
      clusterId,
      timestamp,
      speakerDuration,
      confidence,
    });
  }

  // ===========================================================================
  // QUERY METHODS
  // ===========================================================================

  /**
   * Gets all speaker clusters for a user.
   */
  async getClustersByUser(
    userId: string,
    options: { limit?: number; offset?: number } = {}
  ): Promise<
    PaginatedResponse<{ cluster: SpeakerClusterNode; contact: ContactNode | null }>
  > {
    const { limit = 50, offset = 0 } = options;

    const results = await this.runQuery<{ sc: SpeakerClusterNode; c: ContactNode | null }>(
      CYPHER_QUERIES.getClustersByUser,
      { userId, limit, offset }
    );

    return {
      items: results.map((r) => ({ cluster: r.sc, contact: r.c })),
      hasMore: results.length === limit,
    };
  }

  /**
   * Gets all events that mention a speaker cluster.
   */
  async getEventsByCluster(
    clusterId: string,
    options: { limit?: number; offset?: number } = {}
  ): Promise<PaginatedResponse<EventNode>> {
    const { limit = 50, offset = 0 } = options;

    const results = await this.runQuery<{ e: EventNode }>(CYPHER_QUERIES.getEventsByCluster, {
      clusterId,
      limit,
      offset,
    });

    return {
      items: results.map((r) => r.e),
      hasMore: results.length === limit,
    };
  }

  /**
   * Resolves a cluster to its contact (if labeled).
   */
  async resolveClusterToContact(
    clusterId: string
  ): Promise<{ cluster: SpeakerClusterNode; contact: ContactNode | null } | null> {
    const result = await this.runQuerySingle<{
      sc: SpeakerClusterNode;
      c: ContactNode | null;
    }>(CYPHER_QUERIES.resolveClusterToContact, { clusterId });

    if (!result) return null;
    return { cluster: result.sc, contact: result.c };
  }

  /**
   * Gets session history for a user within a time range.
   */
  async getSessionHistory(
    userId: string,
    startTime: number,
    endTime: number,
    options: { limit?: number; offset?: number } = {}
  ): Promise<
    PaginatedResponse<{
      session: SessionNode;
      urls: Array<{ url: UrlNode; viewedAt: number; duration: number }>;
    }>
  > {
    const { limit = 50, offset = 0 } = options;

    const results = await this.runQuery<{
      s: SessionNode;
      urls: Array<{ url: UrlNode; viewed: { viewedAt: number; duration: number } }>;
    }>(CYPHER_QUERIES.getSessionHistory, {
      userId,
      startTime,
      endTime,
      limit,
      offset,
    });

    return {
      items: results.map((r) => ({
        session: r.s,
        urls: r.urls.map((u) => ({
          url: u.url,
          viewedAt: u.viewed.viewedAt,
          duration: u.viewed.duration,
        })),
      })),
      hasMore: results.length === limit,
    };
  }

  /**
   * Gets all events in a session.
   */
  async getEventsBySession(sessionId: string): Promise<EventNode[]> {
    const results = await this.runQuery<{ e: EventNode }>(CYPHER_QUERIES.getEventsBySession, {
      sessionId,
    });
    return results.map((r) => r.e);
  }

  /**
   * Gets interaction timeline for a contact.
   */
  async getContactInteractionTimeline(
    contactId: string,
    options: { limit?: number; offset?: number } = {}
  ): Promise<PaginatedResponse<{ event: EventNode; cluster: SpeakerClusterNode }>> {
    const { limit = 50, offset = 0 } = options;

    const results = await this.runQuery<{ e: EventNode; sc: SpeakerClusterNode }>(
      CYPHER_QUERIES.getContactInteractionTimeline,
      { contactId, limit, offset }
    );

    return {
      items: results.map((r) => ({ event: r.e, cluster: r.sc })),
      hasMore: results.length === limit,
    };
  }

  /**
   * Gets event timeline for a user.
   */
  async getUserEventTimeline(
    userId: string,
    startTime: number,
    endTime: number,
    options: { limit?: number; offset?: number; eventTypes?: string[] } = {}
  ): Promise<PaginatedResponse<EventNode>> {
    const { limit = 50, offset = 0, eventTypes = null } = options;

    const results = await this.runQuery<{ e: EventNode }>(CYPHER_QUERIES.getUserEventTimeline, {
      userId,
      startTime,
      endTime,
      eventTypes,
      limit,
      offset,
    });

    return {
      items: results.map((r) => r.e),
      hasMore: results.length === limit,
    };
  }

  // ===========================================================================
  // AGGREGATION METHODS
  // ===========================================================================

  /**
   * Gets cluster statistics for a user.
   */
  async getClusterStats(userId: string): Promise<{
    totalClusters: number;
    totalSegments: number;
    totalDuration: number;
    userVoiceClusters: number;
  }> {
    const result = await this.runQuerySingle<{
      totalClusters: number;
      totalSegments: number;
      totalDuration: number;
      userVoiceClusters: number;
    }>(CYPHER_QUERIES.getClusterStats, { userId });

    return (
      result ?? {
        totalClusters: 0,
        totalSegments: 0,
        totalDuration: 0,
        userVoiceClusters: 0,
      }
    );
  }

  /**
   * Gets session statistics for a user within a time range.
   */
  async getSessionStats(
    userId: string,
    startTime: number,
    endTime: number
  ): Promise<{
    totalSessions: number;
    totalDuration: number;
    totalEvents: number;
    totalUrls: number;
  }> {
    const result = await this.runQuerySingle<{
      totalSessions: number;
      totalDuration: number;
      totalEvents: number;
      totalUrls: number;
    }>(CYPHER_QUERIES.getSessionStats, { userId, startTime, endTime });

    return (
      result ?? {
        totalSessions: 0,
        totalDuration: 0,
        totalEvents: 0,
        totalUrls: 0,
      }
    );
  }

  // ===========================================================================
  // RELATIONSHIP REMOVAL
  // ===========================================================================

  /**
   * Removes the RESOLVES_TO relationship between a cluster and contact.
   */
  async removeClusterContactResolution(clusterId: string): Promise<{
    cluster: SpeakerClusterNode;
    contact: ContactNode;
  } | null> {
    const result = await this.runQuerySingle<{
      sc: SpeakerClusterNode;
      c: ContactNode;
    }>(CYPHER_QUERIES.removeClusterContactResolution, { clusterId });

    if (!result) return null;
    return { cluster: result.sc, contact: result.c };
  }

  // ===========================================================================
  // DATA DELETION
  // ===========================================================================

  /**
   * Deletes all data for a user (GDPR compliance).
   */
  async deleteUserData(userId: string): Promise<void> {
    await this.runQuery(CYPHER_QUERIES.deleteUserData, { userId });
    console.log(`[Neo4j] Deleted all data for user: ${userId}`);
  }

  // ===========================================================================
  // TRANSACTION SUPPORT
  // ===========================================================================

  /**
   * Executes multiple operations in a transaction.
   */
  async withTransaction<T>(
    operations: (tx: TransactionContext) => Promise<T>
  ): Promise<T> {
    const session = this.getSession();
    const tx = session.beginTransaction();

    try {
      const context: TransactionContext = {
        run: async (query: string, params?: Record<string, unknown>) => {
          const result = await tx.run(query, params);
          return result.records.map((r) => r.toObject());
        },
      };

      const result = await operations(context);
      await tx.commit();
      return result;
    } catch (error) {
      await tx.rollback();
      throw error;
    } finally {
      await session.close();
    }
  }

  // ===========================================================================
  // HEALTH CHECK
  // ===========================================================================

  /**
   * Checks database connectivity and health.
   */
  async healthCheck(): Promise<{
    healthy: boolean;
    nodeCount?: number;
    relationshipCount?: number;
    error?: string;
  }> {
    try {
      const result = await this.runQuerySingle<{
        nodeCount: number;
        relationshipCount: number;
      }>(`
        CALL db.stats.retrieve('GRAPH COUNTS') YIELD data
        RETURN data.nodeCount as nodeCount, data.relCount as relationshipCount
      `);

      return {
        healthy: true,
        nodeCount: result?.nodeCount ?? 0,
        relationshipCount: result?.relationshipCount ?? 0,
      };
    } catch (error) {
      // Try simpler health check if stats not available
      try {
        await this.runQuery('RETURN 1');
        return { healthy: true };
      } catch (innerError) {
        return {
          healthy: false,
          error: innerError instanceof Error ? innerError.message : 'Unknown error',
        };
      }
    }
  }
}

// =============================================================================
// TRANSACTION CONTEXT
// =============================================================================

/**
 * Context for transaction operations.
 */
export interface TransactionContext {
  run(query: string, params?: Record<string, unknown>): Promise<Record<string, unknown>[]>;
}

// =============================================================================
// FACTORY FUNCTION
// =============================================================================

/**
 * Creates and initializes a Neo4j adapter.
 */
export async function createNeo4jAdapter(config: Neo4jConfig): Promise<Neo4jAdapter> {
  const adapter = new Neo4jAdapter(config);
  await adapter.connect();
  await adapter.initializeSchema();
  return adapter;
}

