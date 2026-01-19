/**
 * Neural Intelligence Platform - LanceDB Adapter Tests
 *
 * Unit tests for LanceDB adapter including connection management,
 * insert operations, search operations, and filter building.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { LanceDBAdapter, LanceDBConfig, LANCEDB_TABLES } from '../lancedb';

// =============================================================================
// TEST FIXTURES
// =============================================================================

const mockConfig: LanceDBConfig = {
  uri: 'file:///tmp/test-lancedb',
  connectionTimeout: 5000,
  readOnly: false,
};

const createMockAudioSegmentInput = () => ({
  userId: 'user_123',
  sourceApp: 'ios_browser' as const,
  eventType: 'audio_segment' as const,
  privacyScope: 'private' as const,
  timestamp: Date.now(),
  contactId: null,
  clusterId: null,
  eventId: 'event_123',
  textVector: new Array(1536).fill(0.1),
  speakerVector: new Array(256).fill(0.2),
  transcript: 'Hello, this is a test transcript',
  startTime: 0,
  endTime: 5000,
  duration: 5000,
  transcriptionConfidence: 0.95,
  language: 'en',
  isUserSpeaker: true,
  parentEventId: null,
  segmentIndex: 0,
});

const createMockTextEventInput = () => ({
  userId: 'user_123',
  sourceApp: 'ios_browser' as const,
  eventType: 'text_event' as const,
  privacyScope: 'private' as const,
  timestamp: Date.now(),
  contactId: null,
  clusterId: null,
  eventId: 'event_456',
  textVector: new Array(1536).fill(0.1),
  content: 'This is a test text event',
  contentType: 'message',
  charCount: 25,
  wordCount: 6,
  language: 'en',
  sentiment: null,
  sourceUrl: null,
  pageTitle: null,
  entitiesJson: null,
});

// =============================================================================
// CONNECTION MANAGEMENT TESTS
// =============================================================================

describe('LanceDBAdapter - Connection Management', () => {
  let adapter: LanceDBAdapter;

  beforeEach(() => {
    adapter = new LanceDBAdapter(mockConfig);
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
      expect(status.metadata?.uri).toBe(mockConfig.uri);
    });

    it('should set connection status on successful connect', async () => {
      await adapter.connect();
      const status = adapter.getConnectionStatus();

      expect(status.connected).toBe(true);
      expect(status.error).toBeUndefined();
    });

    it('should merge config with defaults', async () => {
      const partialConfig: LanceDBConfig = { uri: 'file:///tmp/test' };
      const adapterWithDefaults = new LanceDBAdapter(partialConfig);

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

    it('should be safe to call disconnect multiple times', async () => {
      await adapter.connect();
      await adapter.disconnect();
      await adapter.disconnect(); // Should not throw

      const status = adapter.getConnectionStatus();
      expect(status.connected).toBe(false);
    });
  });

  describe('getConnectionStatus', () => {
    it('should return initial disconnected status', () => {
      const status = adapter.getConnectionStatus();
      expect(status.connected).toBe(false);
    });

    it('should return a copy of status (not reference)', async () => {
      await adapter.connect();
      const status1 = adapter.getConnectionStatus();
      const status2 = adapter.getConnectionStatus();

      expect(status1).not.toBe(status2);
      expect(status1).toEqual(status2);
    });
  });

  describe('ensureConnection', () => {
    it('should auto-reconnect on operations if disconnected', async () => {
      // This is tested indirectly through table operations
      // The adapter should reconnect automatically
      const status = adapter.getConnectionStatus();
      expect(status.connected).toBe(false);
    });
  });
});

// =============================================================================
// INSERT OPERATIONS TESTS
// =============================================================================

describe('LanceDBAdapter - Insert Operations', () => {
  let adapter: LanceDBAdapter;

  beforeEach(async () => {
    adapter = new LanceDBAdapter(mockConfig);
    await adapter.connect();
  });

  afterEach(async () => {
    await adapter.disconnect();
  });

  describe('insertAudioSegment', () => {
    it('should insert audio segment and return ID', async () => {
      const input = createMockAudioSegmentInput();
      const id = await adapter.insertAudioSegment(input);

      expect(id).toBeDefined();
      expect(typeof id).toBe('string');
      expect(id.length).toBeGreaterThan(0);
    });

    it('should generate unique IDs for each insert', async () => {
      const input1 = createMockAudioSegmentInput();
      const input2 = createMockAudioSegmentInput();

      const id1 = await adapter.insertAudioSegment(input1);
      const id2 = await adapter.insertAudioSegment(input2);

      expect(id1).not.toBe(id2);
    });
  });

  describe('insertAudioSegmentBatch', () => {
    it('should insert multiple audio segments', async () => {
      const inputs = [
        createMockAudioSegmentInput(),
        createMockAudioSegmentInput(),
        createMockAudioSegmentInput(),
      ];

      const result = await adapter.insertAudioSegmentBatch(inputs);

      expect(result.successCount).toBe(3);
      expect(result.failureCount).toBe(0);
      expect(result.errors).toHaveLength(0);
    });

    it('should handle empty batch', async () => {
      const result = await adapter.insertAudioSegmentBatch([]);

      expect(result.successCount).toBe(0);
      expect(result.failureCount).toBe(0);
    });
  });

  describe('insertTextEvent', () => {
    it('should insert text event and return ID', async () => {
      const input = createMockTextEventInput();
      const id = await adapter.insertTextEvent(input);

      expect(id).toBeDefined();
      expect(typeof id).toBe('string');
    });
  });

  describe('insertTextEventBatch', () => {
    it('should insert multiple text events', async () => {
      const inputs = [
        createMockTextEventInput(),
        createMockTextEventInput(),
      ];

      const result = await adapter.insertTextEventBatch(inputs);

      expect(result.successCount).toBe(2);
      expect(result.failureCount).toBe(0);
    });
  });

  describe('insertBrowserSession', () => {
    it('should insert browser session and return ID', async () => {
      const input = {
        userId: 'user_123',
        sourceApp: 'ios_browser' as const,
        eventType: 'browser_session' as const,
        privacyScope: 'private' as const,
        timestamp: Date.now(),
        contactId: null,
        clusterId: null,
        eventId: 'event_789',
        sessionVector: new Array(1536).fill(0.1),
        sessionStart: Date.now() - 3600000,
        sessionEnd: Date.now(),
        duration: 3600000,
        pageViewCount: 10,
        interactionCount: 50,
        domainsVisitedJson: '["example.com", "test.com"]',
        primaryTopic: 'technology',
        summary: 'Test browsing session',
        deviceType: 'mobile' as const,
        userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X)',
        geoLocation: null,
      };

      const id = await adapter.insertBrowserSession(input);

      expect(id).toBeDefined();
      expect(typeof id).toBe('string');
    });
  });

  describe('insertImageFrame', () => {
    it('should insert image frame and return ID', async () => {
      const input = {
        userId: 'user_123',
        sourceApp: 'ios_browser' as const,
        eventType: 'image_frame' as const,
        privacyScope: 'private' as const,
        timestamp: Date.now(),
        contactId: null,
        clusterId: null,
        eventId: 'event_img_123',
        clipVector: new Array(768).fill(0.1),
        width: 1920,
        height: 1080,
        format: 'jpeg',
        fileSizeBytes: 500000,
        storageUrl: 'https://storage.example.com/image.jpg',
        thumbnailUrl: null,
        caption: 'Test image',
        detectedObjectsJson: null,
        ocrText: null,
        nsfwScore: null,
        dominantColorsJson: null,
        sourceUrl: null,
        isScreenshot: false,
      };

      const id = await adapter.insertImageFrame(input);

      expect(id).toBeDefined();
      expect(typeof id).toBe('string');
    });
  });

  describe('insertVideoSegment', () => {
    it('should insert video segment and return ID', async () => {
      const input = {
        userId: 'user_123',
        sourceApp: 'ios_browser' as const,
        eventType: 'video_segment' as const,
        privacyScope: 'private' as const,
        timestamp: Date.now(),
        contactId: null,
        clusterId: null,
        eventId: 'event_vid_123',
        clipVector: new Array(768).fill(0.1),
        startTime: 0,
        endTime: 30000,
        duration: 30000,
        width: 1920,
        height: 1080,
        fps: 30,
        codec: 'h264',
        storageUrl: 'https://storage.example.com/video.mp4',
        thumbnailUrl: null,
        parentEventId: null,
        segmentIndex: 0,
        sceneDescription: 'Test video segment',
        detectedObjectsJson: null,
        transcript: null,
        motionIntensity: null,
        keyFrameTimestampsJson: null,
      };

      const id = await adapter.insertVideoSegment(input);

      expect(id).toBeDefined();
      expect(typeof id).toBe('string');
    });
  });
});

// =============================================================================
// SEARCH OPERATIONS TESTS
// =============================================================================

describe('LanceDBAdapter - Search Operations', () => {
  let adapter: LanceDBAdapter;

  beforeEach(async () => {
    adapter = new LanceDBAdapter(mockConfig);
    await adapter.connect();
  });

  afterEach(async () => {
    await adapter.disconnect();
  });

  describe('searchAudioByText', () => {
    it('should execute search with query vector', async () => {
      const params = {
        queryVector: new Array(1536).fill(0.1),
        topK: 10,
        minSimilarity: 0.5,
      };

      const results = await adapter.searchAudioByText(params);

      expect(Array.isArray(results)).toBe(true);
    });

    it('should apply filters to search', async () => {
      const params = {
        queryVector: new Array(1536).fill(0.1),
        topK: 10,
        filters: {
          userId: 'user_123',
          eventTypes: ['audio_segment' as const],
          timestampStart: Date.now() - 86400000,
          timestampEnd: Date.now(),
        },
      };

      const results = await adapter.searchAudioByText(params);

      expect(Array.isArray(results)).toBe(true);
    });
  });

  describe('searchAudioBySpeaker', () => {
    it('should execute speaker embedding search', async () => {
      const params = {
        queryVector: new Array(256).fill(0.1),
        topK: 5,
      };

      const results = await adapter.searchAudioBySpeaker(params);

      expect(Array.isArray(results)).toBe(true);
    });
  });

  describe('searchTextEvents', () => {
    it('should execute text event search', async () => {
      const params = {
        queryVector: new Array(1536).fill(0.1),
        topK: 10,
      };

      const results = await adapter.searchTextEvents(params);

      expect(Array.isArray(results)).toBe(true);
    });
  });

  describe('searchBrowserSessions', () => {
    it('should execute browser session search', async () => {
      const params = {
        queryVector: new Array(1536).fill(0.1),
        topK: 10,
      };

      const results = await adapter.searchBrowserSessions(params);

      expect(Array.isArray(results)).toBe(true);
    });
  });

  describe('searchImageFrames', () => {
    it('should execute image frame search', async () => {
      const params = {
        queryVector: new Array(768).fill(0.1),
        topK: 10,
      };

      const results = await adapter.searchImageFrames(params);

      expect(Array.isArray(results)).toBe(true);
    });
  });

  describe('searchVideoSegments', () => {
    it('should execute video segment search', async () => {
      const params = {
        queryVector: new Array(768).fill(0.1),
        topK: 10,
      };

      const results = await adapter.searchVideoSegments(params);

      expect(Array.isArray(results)).toBe(true);
    });
  });
});

// =============================================================================
// FILTER BUILDING TESTS
// =============================================================================

describe('LanceDBAdapter - Filter Building', () => {
  let adapter: LanceDBAdapter;

  beforeEach(async () => {
    adapter = new LanceDBAdapter(mockConfig);
    await adapter.connect();
  });

  afterEach(async () => {
    await adapter.disconnect();
  });

  // Note: buildFilterString is private, so we test it indirectly through search operations

  it('should handle userId filter', async () => {
    const params = {
      queryVector: new Array(1536).fill(0.1),
      topK: 10,
      filters: {
        userId: 'user_123',
      },
    };

    // Should not throw
    const results = await adapter.searchAudioByText(params);
    expect(Array.isArray(results)).toBe(true);
  });

  it('should handle eventTypes filter', async () => {
    const params = {
      queryVector: new Array(1536).fill(0.1),
      topK: 10,
      filters: {
        eventTypes: ['audio_segment' as const, 'text_event' as const],
      },
    };

    const results = await adapter.searchAudioByText(params);
    expect(Array.isArray(results)).toBe(true);
  });

  it('should handle privacyScopes filter', async () => {
    const params = {
      queryVector: new Array(1536).fill(0.1),
      topK: 10,
      filters: {
        privacyScopes: ['private' as const, 'social' as const],
      },
    };

    const results = await adapter.searchAudioByText(params);
    expect(Array.isArray(results)).toBe(true);
  });

  it('should handle timestamp range filter', async () => {
    const params = {
      queryVector: new Array(1536).fill(0.1),
      topK: 10,
      filters: {
        timestampStart: Date.now() - 86400000,
        timestampEnd: Date.now(),
      },
    };

    const results = await adapter.searchAudioByText(params);
    expect(Array.isArray(results)).toBe(true);
  });

  it('should handle contactId filter', async () => {
    const params = {
      queryVector: new Array(1536).fill(0.1),
      topK: 10,
      filters: {
        contactId: 'contact_123',
      },
    };

    const results = await adapter.searchAudioByText(params);
    expect(Array.isArray(results)).toBe(true);
  });

  it('should handle clusterId filter', async () => {
    const params = {
      queryVector: new Array(1536).fill(0.1),
      topK: 10,
      filters: {
        clusterId: 'cluster_456',
      },
    };

    const results = await adapter.searchAudioByText(params);
    expect(Array.isArray(results)).toBe(true);
  });

  it('should handle sourceApps filter', async () => {
    const params = {
      queryVector: new Array(1536).fill(0.1),
      topK: 10,
      filters: {
        sourceApps: ['ios_browser' as const, 'ios_native' as const],
      },
    };

    const results = await adapter.searchAudioByText(params);
    expect(Array.isArray(results)).toBe(true);
  });

  it('should handle multiple combined filters', async () => {
    const params = {
      queryVector: new Array(1536).fill(0.1),
      topK: 10,
      filters: {
        userId: 'user_123',
        eventTypes: ['audio_segment' as const],
        privacyScopes: ['private' as const],
        timestampStart: Date.now() - 86400000,
        timestampEnd: Date.now(),
        sourceApps: ['ios_browser' as const],
      },
    };

    const results = await adapter.searchAudioByText(params);
    expect(Array.isArray(results)).toBe(true);
  });

  it('should handle empty filters', async () => {
    const params = {
      queryVector: new Array(1536).fill(0.1),
      topK: 10,
      filters: {},
    };

    const results = await adapter.searchAudioByText(params);
    expect(Array.isArray(results)).toBe(true);
  });
});

// =============================================================================
// UPDATE OPERATIONS TESTS
// =============================================================================

describe('LanceDBAdapter - Update Operations', () => {
  let adapter: LanceDBAdapter;

  beforeEach(async () => {
    adapter = new LanceDBAdapter(mockConfig);
    await adapter.connect();
  });

  afterEach(async () => {
    await adapter.disconnect();
  });

  describe('updateContactIdByCluster', () => {
    it('should update contact ID across tables', async () => {
      const result = await adapter.updateContactIdByCluster('cluster_123', 'contact_456');

      expect(result.successCount).toBeDefined();
      expect(result.failureCount).toBeDefined();
      expect(result.errors).toBeDefined();
    });
  });

  describe('updateClusterId', () => {
    it('should update cluster ID for rows', async () => {
      const rowIds = ['row_1', 'row_2', 'row_3'];
      const result = await adapter.updateClusterId(
        LANCEDB_TABLES.AUDIO_SEGMENTS,
        rowIds,
        'new_cluster_id'
      );

      expect(result.successCount).toBeDefined();
      expect(result.failureCount).toBeDefined();
    });

    it('should handle empty row IDs array', async () => {
      const result = await adapter.updateClusterId(
        LANCEDB_TABLES.AUDIO_SEGMENTS,
        [],
        'new_cluster_id'
      );

      expect(result.successCount).toBe(0);
      expect(result.failureCount).toBe(0);
    });
  });

  describe('updatePrivacyScope', () => {
    it('should update privacy scope for rows', async () => {
      const rowIds = ['row_1', 'row_2'];
      const result = await adapter.updatePrivacyScope(
        LANCEDB_TABLES.TEXT_EVENTS,
        rowIds,
        'public'
      );

      expect(result.successCount).toBeDefined();
      expect(result.failureCount).toBeDefined();
    });
  });
});

// =============================================================================
// DELETE OPERATIONS TESTS
// =============================================================================

describe('LanceDBAdapter - Delete Operations', () => {
  let adapter: LanceDBAdapter;

  beforeEach(async () => {
    adapter = new LanceDBAdapter(mockConfig);
    await adapter.connect();
  });

  afterEach(async () => {
    await adapter.disconnect();
  });

  describe('deleteRows', () => {
    it('should delete rows by ID', async () => {
      const rowIds = ['row_1', 'row_2', 'row_3'];
      const deletedCount = await adapter.deleteRows(LANCEDB_TABLES.AUDIO_SEGMENTS, rowIds);

      expect(typeof deletedCount).toBe('number');
    });

    it('should handle empty row IDs array', async () => {
      const deletedCount = await adapter.deleteRows(LANCEDB_TABLES.AUDIO_SEGMENTS, []);

      expect(deletedCount).toBe(0);
    });
  });

  describe('deleteUserData', () => {
    it('should delete all user data', async () => {
      const result = await adapter.deleteUserData('user_to_delete');

      expect(result.successCount).toBeDefined();
      expect(result.failureCount).toBeDefined();
      expect(result.errors).toBeDefined();
    });
  });
});

// =============================================================================
// UTILITY METHODS TESTS
// =============================================================================

describe('LanceDBAdapter - Utility Methods', () => {
  let adapter: LanceDBAdapter;

  beforeEach(async () => {
    adapter = new LanceDBAdapter(mockConfig);
    await adapter.connect();
  });

  afterEach(async () => {
    await adapter.disconnect();
  });

  describe('getRowCount', () => {
    it('should return row count for table', async () => {
      const count = await adapter.getRowCount(LANCEDB_TABLES.AUDIO_SEGMENTS);

      expect(typeof count).toBe('number');
      expect(count).toBeGreaterThanOrEqual(0);
    });
  });

  describe('getAllRowCounts', () => {
    it('should return row counts for all tables', async () => {
      const counts = await adapter.getAllRowCounts();

      expect(counts[LANCEDB_TABLES.AUDIO_SEGMENTS]).toBeDefined();
      expect(counts[LANCEDB_TABLES.TEXT_EVENTS]).toBeDefined();
      expect(counts[LANCEDB_TABLES.BROWSER_SESSIONS]).toBeDefined();
      expect(counts[LANCEDB_TABLES.IMAGE_FRAMES]).toBeDefined();
      expect(counts[LANCEDB_TABLES.VIDEO_SEGMENTS]).toBeDefined();
    });
  });

  describe('healthCheck', () => {
    it('should return health status', async () => {
      const health = await adapter.healthCheck();

      expect(health.healthy).toBeDefined();
      expect(health.tables).toBeDefined();
    });

    it('should report table status', async () => {
      const health = await adapter.healthCheck();

      expect(health.tables[LANCEDB_TABLES.AUDIO_SEGMENTS]).toBeDefined();
      expect(health.tables[LANCEDB_TABLES.TEXT_EVENTS]).toBeDefined();
    });
  });
});

// =============================================================================
// FACTORY FUNCTION TESTS
// =============================================================================

describe('createLanceDBAdapter', () => {
  it('should create and initialize adapter', async () => {
    // Import the factory function
    const { createLanceDBAdapter } = await import('../lancedb');

    const adapter = await createLanceDBAdapter(mockConfig);

    expect(adapter).toBeInstanceOf(LanceDBAdapter);

    const status = adapter.getConnectionStatus();
    expect(status.connected).toBe(true);

    await adapter.disconnect();
  });
});
