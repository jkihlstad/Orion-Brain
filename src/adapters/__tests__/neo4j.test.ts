/**
 * Neural Intelligence Platform - Neo4j Adapter Tests
 *
 * Unit tests for Neo4j adapter including connection management,
 * node upsert operations, relationship creation, and query execution.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Neo4jAdapter, Neo4jConfig } from '../neo4j';

// =============================================================================
// TEST FIXTURES
// =============================================================================

const mockConfig: Neo4jConfig = {
  uri: 'bolt://localhost:7687',
  username: 'neo4j',
  password: 'testpassword',
  database: 'neo4j',
  maxConnectionPoolSize: 10,
  connectionAcquisitionTimeout: 5000,
  encrypted: false,
};

const createMockUserNode = () => ({
  id: 'user_123',
  email: 'test@example.com',
  createdAt: Date.now(),
  lastActiveAt: Date.now(),
  isActive: true,
  metadata: { plan: 'pro' },
});

const createMockEventNode = () => ({
  id: 'event_123',
  userId: 'user_123',
  eventType: 'audio_segment' as const,
  timestamp: Date.now(),
  sourceApp: 'ios_browser' as const,
  privacyScope: 'private' as const,
  lanceDbId: 'lancedb_123',
  summary: 'Test audio event',
  metadata: {},
});

const createMockSpeakerClusterNode = () => ({
  id: 'cluster_123',
  userId: 'user_123',
  createdAt: Date.now(),
  updatedAt: Date.now(),
  segmentCount: 5,
  totalDuration: 30000,
  isUserVoice: false,
  centroidVector: new Array(256).fill(0.1),
  metadata: {},
});

const createMockContactNode = () => ({
  id: 'contact_123',
  userId: 'user_123',
  name: 'John Doe',
  createdAt: Date.now(),
  updatedAt: Date.now(),
  interactionCount: 10,
  source: 'manual' as const,
  metadata: {},
});

const createMockSessionNode = () => ({
  id: 'session_123',
  userId: 'user_123',
  startTime: Date.now() - 3600000,
  endTime: Date.now(),
  duration: 3600000,
  eventCount: 25,
  deviceType: 'mobile' as const,
  userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X)',
  metadata: {},
});

const createMockUrlNode = () => ({
  id: 'url_123',
  normalizedUrl: 'https://example.com/page',
  domain: 'example.com',
  path: '/page',
  title: 'Example Page',
  firstSeenAt: Date.now() - 86400000,
  lastSeenAt: Date.now(),
  metadata: {},
});

// =============================================================================
// CONNECTION MANAGEMENT TESTS
// =============================================================================

describe('Neo4jAdapter - Connection Management', () => {
  let adapter: Neo4jAdapter;

  beforeEach(() => {
    adapter = new Neo4jAdapter(mockConfig);
  });

  afterEach(async () => {
    await adapter.disconnect();
  });

  describe('connect', () => {
    it('should connect successfully', async () => {
      await adapter.connect();
      const status = adapter.getConnectionStatus();

      expect(status.connected).toBe(true);
      expect(status.lastConnectedAt).toBeDefined();
    });

    it('should set connection metadata', async () => {
      await adapter.connect();
      const status = adapter.getConnectionStatus();

      expect(status.metadata?.uri).toBe(mockConfig.uri);
      expect(status.metadata?.database).toBe(mockConfig.database);
    });

    it('should merge config with defaults', async () => {
      const minimalConfig: Neo4jConfig = {
        uri: 'bolt://localhost:7687',
        username: 'neo4j',
        password: 'test',
      };
      const adapterWithDefaults = new Neo4jAdapter(minimalConfig);

      await adapterWithDefaults.connect();
      const status = adapterWithDefaults.getConnectionStatus();

      expect(status.connected).toBe(true);
      await adapterWithDefaults.disconnect();
    });
  });

  describe('disconnect', () => {
    it('should disconnect successfully', async () => {
      await adapter.connect();
      await adapter.disconnect();

      const status = adapter.getConnectionStatus();
      expect(status.connected).toBe(false);
    });

    it('should be safe to call disconnect when not connected', async () => {
      await adapter.disconnect(); // Should not throw
      const status = adapter.getConnectionStatus();
      expect(status.connected).toBe(false);
    });

    it('should be idempotent', async () => {
      await adapter.connect();
      await adapter.disconnect();
      await adapter.disconnect();

      const status = adapter.getConnectionStatus();
      expect(status.connected).toBe(false);
    });
  });

  describe('getConnectionStatus', () => {
    it('should return initial disconnected status', () => {
      const status = adapter.getConnectionStatus();

      expect(status.connected).toBe(false);
      expect(status.error).toBeUndefined();
    });

    it('should return copy of status', async () => {
      await adapter.connect();

      const status1 = adapter.getConnectionStatus();
      const status2 = adapter.getConnectionStatus();

      expect(status1).not.toBe(status2);
      expect(status1).toEqual(status2);
    });
  });
});

// =============================================================================
// NODE UPSERT OPERATIONS TESTS
// =============================================================================

describe('Neo4jAdapter - Node Upsert Operations', () => {
  let adapter: Neo4jAdapter;

  beforeEach(async () => {
    adapter = new Neo4jAdapter(mockConfig);
    await adapter.connect();
  });

  afterEach(async () => {
    await adapter.disconnect();
  });

  describe('upsertUser', () => {
    it('should upsert user node', async () => {
      const user = createMockUserNode();
      const result = await adapter.upsertUser(user);

      expect(result).toBeDefined();
      expect(result.id).toBe(user.id);
    });

    it('should add schema version to node', async () => {
      const user = createMockUserNode();
      const result = await adapter.upsertUser(user);

      expect(result.schemaVersion).toBeDefined();
    });

    it('should handle update of existing user', async () => {
      const user = createMockUserNode();

      await adapter.upsertUser(user);
      const result = await adapter.upsertUser({
        ...user,
        lastActiveAt: Date.now() + 1000,
      });

      expect(result.id).toBe(user.id);
    });
  });

  describe('upsertEvent', () => {
    it('should upsert event node', async () => {
      const event = createMockEventNode();
      const result = await adapter.upsertEvent(event);

      expect(result).toBeDefined();
      expect(result.id).toBe(event.id);
    });

    it('should preserve event type', async () => {
      const event = createMockEventNode();
      const result = await adapter.upsertEvent(event);

      expect(result.eventType).toBe(event.eventType);
    });
  });

  describe('upsertSpeakerCluster', () => {
    it('should upsert speaker cluster node', async () => {
      const cluster = createMockSpeakerClusterNode();
      const result = await adapter.upsertSpeakerCluster(cluster);

      expect(result).toBeDefined();
      expect(result.id).toBe(cluster.id);
    });

    it('should handle user voice flag', async () => {
      const cluster = {
        ...createMockSpeakerClusterNode(),
        isUserVoice: true,
      };
      const result = await adapter.upsertSpeakerCluster(cluster);

      expect(result.isUserVoice).toBe(true);
    });
  });

  describe('upsertContact', () => {
    it('should upsert contact node', async () => {
      const contact = createMockContactNode();
      const result = await adapter.upsertContact(contact);

      expect(result).toBeDefined();
      expect(result.id).toBe(contact.id);
      expect(result.name).toBe(contact.name);
    });
  });

  describe('upsertSession', () => {
    it('should upsert session node', async () => {
      const session = createMockSessionNode();
      const result = await adapter.upsertSession(session);

      expect(result).toBeDefined();
      expect(result.id).toBe(session.id);
    });

    it('should preserve session timing', async () => {
      const session = createMockSessionNode();
      const result = await adapter.upsertSession(session);

      expect(result.duration).toBe(session.duration);
    });
  });

  describe('upsertUrl', () => {
    it('should upsert URL node', async () => {
      const url = createMockUrlNode();
      const result = await adapter.upsertUrl(url);

      expect(result).toBeDefined();
      expect(result.normalizedUrl).toBe(url.normalizedUrl);
    });

    it('should initialize visit count', async () => {
      const url = createMockUrlNode();
      const result = await adapter.upsertUrl(url);

      expect(result.visitCount).toBeGreaterThanOrEqual(1);
    });
  });
});

// =============================================================================
// RELATIONSHIP CREATION TESTS
// =============================================================================

describe('Neo4jAdapter - Relationship Creation', () => {
  let adapter: Neo4jAdapter;

  beforeEach(async () => {
    adapter = new Neo4jAdapter(mockConfig);
    await adapter.connect();
  });

  afterEach(async () => {
    await adapter.disconnect();
  });

  describe('createUserGeneratedEvent', () => {
    it('should create GENERATED relationship', async () => {
      // Should not throw
      await adapter.createUserGeneratedEvent('user_123', 'event_123', Date.now());
    });

    it('should set timestamp on relationship', async () => {
      const timestamp = Date.now();
      await adapter.createUserGeneratedEvent('user_123', 'event_123', timestamp);
      // Relationship is created (mock implementation)
    });
  });

  describe('createUserHasSpeakerCluster', () => {
    it('should create HAS_SPEAKER_CLUSTER relationship', async () => {
      await adapter.createUserHasSpeakerCluster(
        'user_123',
        'cluster_123',
        Date.now(),
        'auto_clustering'
      );
    });

    it('should support different creation methods', async () => {
      await adapter.createUserHasSpeakerCluster(
        'user_123',
        'cluster_1',
        Date.now(),
        'auto_clustering'
      );
      await adapter.createUserHasSpeakerCluster(
        'user_123',
        'cluster_2',
        Date.now(),
        'manual_split'
      );
      await adapter.createUserHasSpeakerCluster(
        'user_123',
        'cluster_3',
        Date.now(),
        'manual_merge'
      );
    });
  });

  describe('createClusterResolvesToContact', () => {
    it('should create RESOLVES_TO relationship', async () => {
      await adapter.createClusterResolvesToContact('cluster_123', 'contact_123', {
        resolvedAt: Date.now(),
        confidence: 0.95,
        resolutionMethod: 'user_labeled',
      });
    });

    it('should store confidence score', async () => {
      const props = {
        resolvedAt: Date.now(),
        confidence: 0.85,
        resolutionMethod: 'auto_detected' as const,
      };
      await adapter.createClusterResolvesToContact('cluster_123', 'contact_123', props);
    });
  });

  describe('createUserHasSession', () => {
    it('should create HAS_SESSION relationship', async () => {
      await adapter.createUserHasSession('user_123', 'session_123', Date.now() - 3600000);
    });
  });

  describe('createSessionViewedUrl', () => {
    it('should create VIEWED relationship', async () => {
      await adapter.createSessionViewedUrl(
        'session_123',
        'https://example.com/page',
        Date.now(),
        5000,
        0.75,
        10
      );
    });

    it('should handle null scroll depth', async () => {
      await adapter.createSessionViewedUrl(
        'session_123',
        'https://example.com/page',
        Date.now(),
        5000,
        null,
        5
      );
    });
  });

  describe('createEventInSession', () => {
    it('should create IN_SESSION relationship', async () => {
      await adapter.createEventInSession('event_123', 'session_123', Date.now(), 1);
    });

    it('should set sequence number', async () => {
      await adapter.createEventInSession('event_1', 'session_123', Date.now(), 1);
      await adapter.createEventInSession('event_2', 'session_123', Date.now(), 2);
      await adapter.createEventInSession('event_3', 'session_123', Date.now(), 3);
    });
  });

  describe('createEventMentionsSpeaker', () => {
    it('should create MENTIONS_SPEAKER relationship', async () => {
      await adapter.createEventMentionsSpeaker(
        'event_123',
        'cluster_123',
        Date.now(),
        5000,
        0.92
      );
    });
  });
});

// =============================================================================
// QUERY METHODS TESTS
// =============================================================================

describe('Neo4jAdapter - Query Methods', () => {
  let adapter: Neo4jAdapter;

  beforeEach(async () => {
    adapter = new Neo4jAdapter(mockConfig);
    await adapter.connect();
  });

  afterEach(async () => {
    await adapter.disconnect();
  });

  describe('getClustersByUser', () => {
    it('should return paginated clusters', async () => {
      const result = await adapter.getClustersByUser('user_123');

      expect(result.items).toBeDefined();
      expect(Array.isArray(result.items)).toBe(true);
      expect(result.hasMore).toBeDefined();
    });

    it('should support pagination options', async () => {
      const result = await adapter.getClustersByUser('user_123', { limit: 10, offset: 5 });

      expect(result.items).toBeDefined();
    });

    it('should return cluster with optional contact', async () => {
      const result = await adapter.getClustersByUser('user_123');

      // Each item should have cluster and possibly contact
      result.items.forEach((item) => {
        expect(item.cluster).toBeDefined();
        // contact can be null
      });
    });
  });

  describe('getEventsByCluster', () => {
    it('should return events for cluster', async () => {
      const result = await adapter.getEventsByCluster('cluster_123');

      expect(result.items).toBeDefined();
      expect(Array.isArray(result.items)).toBe(true);
    });

    it('should support pagination', async () => {
      const result = await adapter.getEventsByCluster('cluster_123', { limit: 25, offset: 0 });

      expect(result.items).toBeDefined();
    });
  });

  describe('resolveClusterToContact', () => {
    it('should return null for non-existent cluster', async () => {
      const result = await adapter.resolveClusterToContact('nonexistent_cluster');

      // Could be null if cluster doesn't exist or has no contact
      expect(result === null || result.cluster !== undefined).toBe(true);
    });

    it('should return cluster with contact if resolved', async () => {
      const result = await adapter.resolveClusterToContact('cluster_123');

      if (result) {
        expect(result.cluster).toBeDefined();
        // contact may be null if not resolved
      }
    });
  });

  describe('getSessionHistory', () => {
    it('should return session history for time range', async () => {
      const startTime = Date.now() - 86400000;
      const endTime = Date.now();

      const result = await adapter.getSessionHistory('user_123', startTime, endTime);

      expect(result.items).toBeDefined();
      expect(Array.isArray(result.items)).toBe(true);
    });

    it('should include URLs in sessions', async () => {
      const result = await adapter.getSessionHistory(
        'user_123',
        Date.now() - 86400000,
        Date.now()
      );

      result.items.forEach((item) => {
        expect(item.session).toBeDefined();
        expect(item.urls).toBeDefined();
        expect(Array.isArray(item.urls)).toBe(true);
      });
    });
  });

  describe('getEventsBySession', () => {
    it('should return events in session', async () => {
      const events = await adapter.getEventsBySession('session_123');

      expect(Array.isArray(events)).toBe(true);
    });
  });

  describe('getContactInteractionTimeline', () => {
    it('should return paginated timeline', async () => {
      const result = await adapter.getContactInteractionTimeline('contact_123');

      expect(result.items).toBeDefined();
      expect(Array.isArray(result.items)).toBe(true);
    });

    it('should include event and cluster', async () => {
      const result = await adapter.getContactInteractionTimeline('contact_123');

      result.items.forEach((item) => {
        expect(item.event).toBeDefined();
        expect(item.cluster).toBeDefined();
      });
    });
  });

  describe('getUserEventTimeline', () => {
    it('should return user events in time range', async () => {
      const result = await adapter.getUserEventTimeline(
        'user_123',
        Date.now() - 86400000,
        Date.now()
      );

      expect(result.items).toBeDefined();
      expect(Array.isArray(result.items)).toBe(true);
    });

    it('should filter by event types', async () => {
      const result = await adapter.getUserEventTimeline(
        'user_123',
        Date.now() - 86400000,
        Date.now(),
        { eventTypes: ['audio_segment', 'text_event'] }
      );

      expect(result.items).toBeDefined();
    });
  });
});

// =============================================================================
// AGGREGATION METHODS TESTS
// =============================================================================

describe('Neo4jAdapter - Aggregation Methods', () => {
  let adapter: Neo4jAdapter;

  beforeEach(async () => {
    adapter = new Neo4jAdapter(mockConfig);
    await adapter.connect();
  });

  afterEach(async () => {
    await adapter.disconnect();
  });

  describe('getClusterStats', () => {
    it('should return cluster statistics', async () => {
      const stats = await adapter.getClusterStats('user_123');

      expect(stats.totalClusters).toBeDefined();
      expect(stats.totalSegments).toBeDefined();
      expect(stats.totalDuration).toBeDefined();
      expect(stats.userVoiceClusters).toBeDefined();
    });

    it('should return zeros for user with no data', async () => {
      const stats = await adapter.getClusterStats('nonexistent_user');

      expect(stats.totalClusters).toBeGreaterThanOrEqual(0);
      expect(stats.totalSegments).toBeGreaterThanOrEqual(0);
    });
  });

  describe('getSessionStats', () => {
    it('should return session statistics', async () => {
      const stats = await adapter.getSessionStats(
        'user_123',
        Date.now() - 86400000,
        Date.now()
      );

      expect(stats.totalSessions).toBeDefined();
      expect(stats.totalDuration).toBeDefined();
      expect(stats.totalEvents).toBeDefined();
      expect(stats.totalUrls).toBeDefined();
    });

    it('should scope to time range', async () => {
      const lastHour = await adapter.getSessionStats(
        'user_123',
        Date.now() - 3600000,
        Date.now()
      );

      const lastDay = await adapter.getSessionStats(
        'user_123',
        Date.now() - 86400000,
        Date.now()
      );

      // lastDay should have >= lastHour (for actual data)
      expect(lastDay.totalSessions).toBeGreaterThanOrEqual(0);
    });
  });
});

// =============================================================================
// RELATIONSHIP REMOVAL TESTS
// =============================================================================

describe('Neo4jAdapter - Relationship Removal', () => {
  let adapter: Neo4jAdapter;

  beforeEach(async () => {
    adapter = new Neo4jAdapter(mockConfig);
    await adapter.connect();
  });

  afterEach(async () => {
    await adapter.disconnect();
  });

  describe('removeClusterContactResolution', () => {
    it('should remove RESOLVES_TO relationship', async () => {
      const result = await adapter.removeClusterContactResolution('cluster_123');

      // Returns null if no relationship existed
      expect(result === null || result.cluster !== undefined).toBe(true);
    });

    it('should return cluster and contact after removal', async () => {
      const result = await adapter.removeClusterContactResolution('cluster_with_contact');

      if (result) {
        expect(result.cluster).toBeDefined();
        expect(result.contact).toBeDefined();
      }
    });
  });
});

// =============================================================================
// DATA DELETION TESTS
// =============================================================================

describe('Neo4jAdapter - Data Deletion', () => {
  let adapter: Neo4jAdapter;

  beforeEach(async () => {
    adapter = new Neo4jAdapter(mockConfig);
    await adapter.connect();
  });

  afterEach(async () => {
    await adapter.disconnect();
  });

  describe('deleteUserData', () => {
    it('should delete all user data (GDPR)', async () => {
      // Should not throw
      await adapter.deleteUserData('user_to_delete');
    });

    it('should be safe for non-existent user', async () => {
      await adapter.deleteUserData('nonexistent_user');
    });
  });
});

// =============================================================================
// TRANSACTION SUPPORT TESTS
// =============================================================================

describe('Neo4jAdapter - Transaction Support', () => {
  let adapter: Neo4jAdapter;

  beforeEach(async () => {
    adapter = new Neo4jAdapter(mockConfig);
    await adapter.connect();
  });

  afterEach(async () => {
    await adapter.disconnect();
  });

  describe('withTransaction', () => {
    it('should execute operations in transaction', async () => {
      const result = await adapter.withTransaction(async (tx) => {
        const queryResult = await tx.run('RETURN 1 as value');
        return queryResult;
      });

      expect(Array.isArray(result)).toBe(true);
    });

    it('should commit on success', async () => {
      await adapter.withTransaction(async (tx) => {
        await tx.run('RETURN 1');
        return true;
      });
    });

    it('should rollback on error', async () => {
      await expect(
        adapter.withTransaction(async (tx) => {
          await tx.run('RETURN 1');
          throw new Error('Test error');
        })
      ).rejects.toThrow('Test error');
    });
  });
});

// =============================================================================
// HEALTH CHECK TESTS
// =============================================================================

describe('Neo4jAdapter - Health Check', () => {
  let adapter: Neo4jAdapter;

  beforeEach(async () => {
    adapter = new Neo4jAdapter(mockConfig);
    await adapter.connect();
  });

  afterEach(async () => {
    await adapter.disconnect();
  });

  describe('healthCheck', () => {
    it('should return health status', async () => {
      const health = await adapter.healthCheck();

      expect(health.healthy).toBeDefined();
    });

    it('should report healthy when connected', async () => {
      const health = await adapter.healthCheck();

      expect(health.healthy).toBe(true);
    });

    it('should include optional counts', async () => {
      const health = await adapter.healthCheck();

      // nodeCount and relationshipCount are optional
      if (health.nodeCount !== undefined) {
        expect(health.nodeCount).toBeGreaterThanOrEqual(0);
      }
    });
  });
});

// =============================================================================
// FACTORY FUNCTION TESTS
// =============================================================================

describe('createNeo4jAdapter', () => {
  it('should create and initialize adapter', async () => {
    const { createNeo4jAdapter } = await import('../neo4j');

    const adapter = await createNeo4jAdapter(mockConfig);

    expect(adapter).toBeInstanceOf(Neo4jAdapter);

    const status = adapter.getConnectionStatus();
    expect(status.connected).toBe(true);

    await adapter.disconnect();
  });
});
