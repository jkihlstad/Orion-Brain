/**
 * Neural Intelligence Platform - LanceDB Adapter
 *
 * Provides connection management, CRUD operations, and vector search
 * functionality for all LanceDB tables.
 *
 * @version 1.0.0
 * @author Sub-Agent 1: Data + Storage Engineer
 */

// TODO: Install LanceDB SDK: npm install vectordb (or @lancedb/lancedb for newer versions)
// import * as lancedb from 'vectordb';
// import { Table, Connection } from 'vectordb';

import type {
  BaseMetadata,
  ConnectionStatus,
  VectorSearchParams,
  SearchFilters,
  BatchOperationResult,
} from '../types/common';
import { SCHEMA_VERSION } from '../types/common';

import type {
  LanceDBTableName,
  AudioSegmentRow,
  AudioSegmentInput,
  TextEventRow,
  TextEventInput,
  BrowserSessionRow,
  BrowserSessionInput,
  ImageFrameRow,
  ImageFrameInput,
  VideoSegmentRow,
  VideoSegmentInput,
  LanceDBRow,
  LanceDBSearchResult,
  TableRowTypes,
} from '../schemas/lancedb-tables';
import { LANCEDB_TABLES } from '../schemas/lancedb-tables';

// Re-export for external use
export { LANCEDB_TABLES } from '../schemas/lancedb-tables';

// =============================================================================
// CONFIGURATION
// =============================================================================

/**
 * LanceDB connection configuration.
 */
export interface LanceDBConfig {
  /** Database URI (local path or S3 URI) */
  uri: string;

  /** AWS region (for S3 storage) */
  awsRegion?: string;

  /** API key (for LanceDB Cloud) */
  apiKey?: string;

  /** Connection timeout in milliseconds */
  connectionTimeout?: number;

  /** Enable read-only mode */
  readOnly?: boolean;
}

/**
 * Default configuration values.
 */
const DEFAULT_CONFIG: Partial<LanceDBConfig> = {
  connectionTimeout: 30000,
  readOnly: false,
};

// =============================================================================
// MOCK TYPES (Replace with actual SDK types)
// =============================================================================

// TODO: Remove these mock types when installing the actual SDK

interface MockTable<T> {
  name: string;
  add(data: T[]): Promise<void>;
  search(vector: number[]): MockSearchBuilder<T>;
  update(where: string, values: Partial<T>): Promise<number>;
  delete(where: string): Promise<number>;
  countRows(): Promise<number>;
}

interface MockSearchBuilder<T> {
  limit(n: number): MockSearchBuilder<T>;
  where(filter: string): MockSearchBuilder<T>;
  select(columns: string[]): MockSearchBuilder<T>;
  execute(): Promise<Array<T & { _distance: number }>>;
}

interface MockConnection {
  uri: string;
  tableNames(): Promise<string[]>;
  openTable<T>(name: string): Promise<MockTable<T>>;
  createTable<T>(name: string, data: T[]): Promise<MockTable<T>>;
  dropTable(name: string): Promise<void>;
}

// =============================================================================
// LANCEDB ADAPTER CLASS
// =============================================================================

/**
 * LanceDB Adapter for the Neural Intelligence Platform.
 *
 * Provides:
 * - Connection management with automatic reconnection
 * - Type-safe CRUD operations for all table types
 * - Vector similarity search with filtering
 * - Batch operations for backfill scenarios
 */
export class LanceDBAdapter {
  private config: LanceDBConfig;
  private connection: MockConnection | null = null;
  private tables: Map<string, MockTable<unknown>> = new Map();
  private connectionStatus: ConnectionStatus = { connected: false };

  constructor(config: LanceDBConfig) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  // ===========================================================================
  // CONNECTION MANAGEMENT
  // ===========================================================================

  /**
   * Establishes connection to LanceDB.
   */
  async connect(): Promise<void> {
    try {
      // TODO: Replace with actual SDK connection
      // this.connection = await lancedb.connect(this.config.uri, {
      //   awsRegion: this.config.awsRegion,
      //   apiKey: this.config.apiKey,
      // });

      // Mock connection for development
      const createMockSearchBuilder = () => {
        const builder: Record<string, unknown> = {
          execute: async () => [],
          limit: () => builder,
          where: () => builder,
          select: () => builder,
        };
        return builder;
      };

      this.connection = {
        uri: this.config.uri,
        tableNames: async () => [],
        openTable: async <T>(name: string) =>
          ({
            name,
            add: async () => {},
            search: () => createMockSearchBuilder(),
            update: async () => 0,
            delete: async () => 0,
            countRows: async () => 0,
          }) as unknown as MockTable<T>,
        createTable: async <T>(name: string) =>
          ({
            name,
            add: async () => {},
            search: () => createMockSearchBuilder(),
            update: async () => 0,
            delete: async () => 0,
            countRows: async () => 0,
          }) as unknown as MockTable<T>,
        dropTable: async () => {},
      };

      this.connectionStatus = {
        connected: true,
        lastConnectedAt: Date.now(),
        metadata: { uri: this.config.uri },
      };

      console.log(`[LanceDB] Connected to ${this.config.uri}`);
    } catch (error) {
      this.connectionStatus = {
        connected: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
      throw new Error(`[LanceDB] Connection failed: ${this.connectionStatus.error}`);
    }
  }

  /**
   * Closes the LanceDB connection.
   */
  async disconnect(): Promise<void> {
    this.connection = null;
    this.tables.clear();
    this.connectionStatus = { connected: false };
    console.log('[LanceDB] Disconnected');
  }

  /**
   * Returns the current connection status.
   */
  getConnectionStatus(): ConnectionStatus {
    return { ...this.connectionStatus };
  }

  /**
   * Ensures connection is active, reconnects if necessary.
   */
  private async ensureConnection(): Promise<MockConnection> {
    if (!this.connection) {
      await this.connect();
    }
    if (!this.connection) {
      throw new Error('[LanceDB] Failed to establish connection');
    }
    return this.connection;
  }

  // ===========================================================================
  // TABLE INITIALIZATION
  // ===========================================================================

  /**
   * Initializes all required tables.
   */
  async initializeTables(): Promise<void> {
    const connection = await this.ensureConnection();
    const existingTables = await connection.tableNames();

    for (const tableName of Object.values(LANCEDB_TABLES)) {
      if (!existingTables.includes(tableName)) {
        await this.createTable(tableName);
      } else {
        await this.openTable(tableName);
      }
    }

    console.log('[LanceDB] All tables initialized');
  }

  /**
   * Creates a new table with the appropriate schema.
   */
  private async createTable(tableName: LanceDBTableName): Promise<void> {
    const connection = await this.ensureConnection();

    // TODO: Replace with actual SDK table creation with schema
    // The actual implementation would use Arrow schemas or similar

    const emptyRow = this.createEmptyRow(tableName);
    const table = await connection.createTable(tableName, [emptyRow]);

    // Remove the empty initialization row
    await table.delete('id = "__init__"');

    this.tables.set(tableName, table as MockTable<unknown>);
    console.log(`[LanceDB] Created table: ${tableName}`);
  }

  /**
   * Opens an existing table.
   */
  private async openTable(tableName: LanceDBTableName): Promise<void> {
    const connection = await this.ensureConnection();
    const table = await connection.openTable(tableName);
    this.tables.set(tableName, table as MockTable<unknown>);
    console.log(`[LanceDB] Opened table: ${tableName}`);
  }

  /**
   * Gets a table reference, opening it if necessary.
   */
  private async getTable<T extends LanceDBTableName>(
    tableName: T
  ): Promise<MockTable<TableRowTypes[T]>> {
    if (!this.tables.has(tableName)) {
      await this.openTable(tableName);
    }
    return this.tables.get(tableName) as MockTable<TableRowTypes[T]>;
  }

  /**
   * Creates an empty row for table initialization.
   */
  private createEmptyRow(tableName: LanceDBTableName): LanceDBRow {
    const baseMetadata: BaseMetadata = {
      userId: '__init__',
      sourceApp: 'ios_browser',
      eventType: 'text_event',
      privacyScope: 'private',
      timestamp: 0,
      contactId: null,
      clusterId: null,
      eventId: '__init__',
      schemaVersion: SCHEMA_VERSION,
    };

    switch (tableName) {
      case LANCEDB_TABLES.AUDIO_SEGMENTS:
        return {
          ...baseMetadata,
          id: '__init__',
          eventType: 'audio_segment',
          textVector: new Array(1536).fill(0),
          speakerVector: new Array(256).fill(0),
          transcript: '',
          startTime: 0,
          endTime: 0,
          duration: 0,
          transcriptionConfidence: 0,
          language: 'en',
          isUserSpeaker: false,
          parentEventId: null,
          segmentIndex: 0,
        } as AudioSegmentRow;

      case LANCEDB_TABLES.TEXT_EVENTS:
        return {
          ...baseMetadata,
          id: '__init__',
          textVector: new Array(1536).fill(0),
          content: '',
          contentType: '',
          charCount: 0,
          wordCount: 0,
          language: 'en',
          sentiment: null,
          sourceUrl: null,
          pageTitle: null,
          entitiesJson: null,
        } as TextEventRow;

      case LANCEDB_TABLES.BROWSER_SESSIONS:
        return {
          ...baseMetadata,
          id: '__init__',
          eventType: 'browser_session',
          sessionVector: new Array(1536).fill(0),
          sessionStart: 0,
          sessionEnd: 0,
          duration: 0,
          pageViewCount: 0,
          interactionCount: 0,
          domainsVisitedJson: '[]',
          primaryTopic: null,
          summary: null,
          deviceType: 'mobile',
          userAgent: '',
          geoLocation: null,
        } as BrowserSessionRow;

      case LANCEDB_TABLES.IMAGE_FRAMES:
        return {
          ...baseMetadata,
          id: '__init__',
          eventType: 'image_frame',
          clipVector: new Array(768).fill(0),
          width: 0,
          height: 0,
          format: '',
          fileSizeBytes: 0,
          storageUrl: '',
          thumbnailUrl: null,
          caption: null,
          detectedObjectsJson: null,
          ocrText: null,
          nsfwScore: null,
          dominantColorsJson: null,
          sourceUrl: null,
          isScreenshot: false,
        } as ImageFrameRow;

      case LANCEDB_TABLES.VIDEO_SEGMENTS:
        return {
          ...baseMetadata,
          id: '__init__',
          eventType: 'video_segment',
          clipVector: new Array(768).fill(0),
          startTime: 0,
          endTime: 0,
          duration: 0,
          width: 0,
          height: 0,
          fps: 0,
          codec: '',
          storageUrl: '',
          thumbnailUrl: null,
          parentEventId: null,
          segmentIndex: 0,
          sceneDescription: null,
          detectedObjectsJson: null,
          transcript: null,
          motionIntensity: null,
          keyFrameTimestampsJson: null,
        } as VideoSegmentRow;
    }
  }

  // ===========================================================================
  // INSERT OPERATIONS
  // ===========================================================================

  /**
   * Generates a unique row ID.
   */
  private generateRowId(): string {
    return `${Date.now()}-${Math.random().toString(36).substring(2, 15)}`;
  }

  /**
   * Inserts an audio segment.
   */
  async insertAudioSegment(input: AudioSegmentInput): Promise<string> {
    const table = await this.getTable(LANCEDB_TABLES.AUDIO_SEGMENTS);
    const id = this.generateRowId();
    const row: AudioSegmentRow = {
      ...input,
      id,
      schemaVersion: SCHEMA_VERSION,
    };
    await table.add([row]);
    return id;
  }

  /**
   * Inserts multiple audio segments.
   */
  async insertAudioSegmentBatch(
    inputs: AudioSegmentInput[]
  ): Promise<BatchOperationResult> {
    const table = await this.getTable(LANCEDB_TABLES.AUDIO_SEGMENTS);
    const rows: AudioSegmentRow[] = inputs.map((input) => ({
      ...input,
      id: this.generateRowId(),
      schemaVersion: SCHEMA_VERSION,
    }));

    try {
      await table.add(rows);
      return { successCount: rows.length, failureCount: 0, errors: [] };
    } catch (error) {
      return {
        successCount: 0,
        failureCount: rows.length,
        errors: [{ index: 0, error: error instanceof Error ? error.message : 'Unknown error' }],
      };
    }
  }

  /**
   * Inserts a text event.
   */
  async insertTextEvent(input: TextEventInput): Promise<string> {
    const table = await this.getTable(LANCEDB_TABLES.TEXT_EVENTS);
    const id = this.generateRowId();
    const row: TextEventRow = {
      ...input,
      id,
      schemaVersion: SCHEMA_VERSION,
    };
    await table.add([row]);
    return id;
  }

  /**
   * Inserts multiple text events.
   */
  async insertTextEventBatch(inputs: TextEventInput[]): Promise<BatchOperationResult> {
    const table = await this.getTable(LANCEDB_TABLES.TEXT_EVENTS);
    const rows: TextEventRow[] = inputs.map((input) => ({
      ...input,
      id: this.generateRowId(),
      schemaVersion: SCHEMA_VERSION,
    }));

    try {
      await table.add(rows);
      return { successCount: rows.length, failureCount: 0, errors: [] };
    } catch (error) {
      return {
        successCount: 0,
        failureCount: rows.length,
        errors: [{ index: 0, error: error instanceof Error ? error.message : 'Unknown error' }],
      };
    }
  }

  /**
   * Inserts a browser session.
   */
  async insertBrowserSession(input: BrowserSessionInput): Promise<string> {
    const table = await this.getTable(LANCEDB_TABLES.BROWSER_SESSIONS);
    const id = this.generateRowId();
    const row: BrowserSessionRow = {
      ...input,
      id,
      schemaVersion: SCHEMA_VERSION,
    };
    await table.add([row]);
    return id;
  }

  /**
   * Inserts an image frame.
   */
  async insertImageFrame(input: ImageFrameInput): Promise<string> {
    const table = await this.getTable(LANCEDB_TABLES.IMAGE_FRAMES);
    const id = this.generateRowId();
    const row: ImageFrameRow = {
      ...input,
      id,
      schemaVersion: SCHEMA_VERSION,
    };
    await table.add([row]);
    return id;
  }

  /**
   * Inserts multiple image frames.
   */
  async insertImageFrameBatch(inputs: ImageFrameInput[]): Promise<BatchOperationResult> {
    const table = await this.getTable(LANCEDB_TABLES.IMAGE_FRAMES);
    const rows: ImageFrameRow[] = inputs.map((input) => ({
      ...input,
      id: this.generateRowId(),
      schemaVersion: SCHEMA_VERSION,
    }));

    try {
      await table.add(rows);
      return { successCount: rows.length, failureCount: 0, errors: [] };
    } catch (error) {
      return {
        successCount: 0,
        failureCount: rows.length,
        errors: [{ index: 0, error: error instanceof Error ? error.message : 'Unknown error' }],
      };
    }
  }

  /**
   * Inserts a video segment.
   */
  async insertVideoSegment(input: VideoSegmentInput): Promise<string> {
    const table = await this.getTable(LANCEDB_TABLES.VIDEO_SEGMENTS);
    const id = this.generateRowId();
    const row: VideoSegmentRow = {
      ...input,
      id,
      schemaVersion: SCHEMA_VERSION,
    };
    await table.add([row]);
    return id;
  }

  /**
   * Inserts multiple video segments.
   */
  async insertVideoSegmentBatch(inputs: VideoSegmentInput[]): Promise<BatchOperationResult> {
    const table = await this.getTable(LANCEDB_TABLES.VIDEO_SEGMENTS);
    const rows: VideoSegmentRow[] = inputs.map((input) => ({
      ...input,
      id: this.generateRowId(),
      schemaVersion: SCHEMA_VERSION,
    }));

    try {
      await table.add(rows);
      return { successCount: rows.length, failureCount: 0, errors: [] };
    } catch (error) {
      return {
        successCount: 0,
        failureCount: rows.length,
        errors: [{ index: 0, error: error instanceof Error ? error.message : 'Unknown error' }],
      };
    }
  }

  // ===========================================================================
  // SEARCH OPERATIONS
  // ===========================================================================

  /**
   * Builds a filter string from search filters.
   */
  private buildFilterString(filters: SearchFilters): string {
    const conditions: string[] = [];

    if (filters.userId) {
      conditions.push(`userId = '${filters.userId}'`);
    }

    if (filters.eventTypes && filters.eventTypes.length > 0) {
      const types = filters.eventTypes.map((t) => `'${t}'`).join(', ');
      conditions.push(`eventType IN (${types})`);
    }

    if (filters.privacyScopes && filters.privacyScopes.length > 0) {
      const scopes = filters.privacyScopes.map((s) => `'${s}'`).join(', ');
      conditions.push(`privacyScope IN (${scopes})`);
    }

    if (filters.timestampStart !== undefined) {
      conditions.push(`timestamp >= ${filters.timestampStart}`);
    }

    if (filters.timestampEnd !== undefined) {
      conditions.push(`timestamp < ${filters.timestampEnd}`);
    }

    if (filters.contactId) {
      conditions.push(`contactId = '${filters.contactId}'`);
    }

    if (filters.clusterId) {
      conditions.push(`clusterId = '${filters.clusterId}'`);
    }

    if (filters.sourceApps && filters.sourceApps.length > 0) {
      const apps = filters.sourceApps.map((a) => `'${a}'`).join(', ');
      conditions.push(`sourceApp IN (${apps})`);
    }

    return conditions.length > 0 ? conditions.join(' AND ') : '';
  }

  /**
   * Searches audio segments by text embedding.
   */
  async searchAudioByText(
    params: VectorSearchParams
  ): Promise<LanceDBSearchResult<AudioSegmentRow>[]> {
    const table = await this.getTable(LANCEDB_TABLES.AUDIO_SEGMENTS);
    const filterStr = params.filters ? this.buildFilterString(params.filters) : '';

    // TODO: Replace with actual SDK search
    // The actual implementation would specify which vector column to search
    let searchBuilder = table.search(params.queryVector).limit(params.topK);

    if (filterStr) {
      searchBuilder = searchBuilder.where(filterStr);
    }

    const results = await searchBuilder.execute();

    return results
      .filter((r) => !params.minSimilarity || 1 / (1 + r._distance) >= params.minSimilarity)
      .map((r) => ({
        row: r as unknown as AudioSegmentRow,
        similarity: 1 / (1 + r._distance),
        distance: r._distance,
      }));
  }

  /**
   * Searches audio segments by speaker embedding.
   */
  async searchAudioBySpeaker(
    params: VectorSearchParams
  ): Promise<LanceDBSearchResult<AudioSegmentRow>[]> {
    const table = await this.getTable(LANCEDB_TABLES.AUDIO_SEGMENTS);
    const filterStr = params.filters ? this.buildFilterString(params.filters) : '';

    // TODO: Specify speakerVector column in actual implementation
    let searchBuilder = table.search(params.queryVector).limit(params.topK);

    if (filterStr) {
      searchBuilder = searchBuilder.where(filterStr);
    }

    const results = await searchBuilder.execute();

    return results
      .filter((r) => !params.minSimilarity || 1 / (1 + r._distance) >= params.minSimilarity)
      .map((r) => ({
        row: r as unknown as AudioSegmentRow,
        similarity: 1 / (1 + r._distance),
        distance: r._distance,
      }));
  }

  /**
   * Searches text events.
   */
  async searchTextEvents(
    params: VectorSearchParams
  ): Promise<LanceDBSearchResult<TextEventRow>[]> {
    const table = await this.getTable(LANCEDB_TABLES.TEXT_EVENTS);
    const filterStr = params.filters ? this.buildFilterString(params.filters) : '';

    let searchBuilder = table.search(params.queryVector).limit(params.topK);

    if (filterStr) {
      searchBuilder = searchBuilder.where(filterStr);
    }

    const results = await searchBuilder.execute();

    return results
      .filter((r) => !params.minSimilarity || 1 / (1 + r._distance) >= params.minSimilarity)
      .map((r) => ({
        row: r as unknown as TextEventRow,
        similarity: 1 / (1 + r._distance),
        distance: r._distance,
      }));
  }

  /**
   * Searches browser sessions.
   */
  async searchBrowserSessions(
    params: VectorSearchParams
  ): Promise<LanceDBSearchResult<BrowserSessionRow>[]> {
    const table = await this.getTable(LANCEDB_TABLES.BROWSER_SESSIONS);
    const filterStr = params.filters ? this.buildFilterString(params.filters) : '';

    let searchBuilder = table.search(params.queryVector).limit(params.topK);

    if (filterStr) {
      searchBuilder = searchBuilder.where(filterStr);
    }

    const results = await searchBuilder.execute();

    return results
      .filter((r) => !params.minSimilarity || 1 / (1 + r._distance) >= params.minSimilarity)
      .map((r) => ({
        row: r as unknown as BrowserSessionRow,
        similarity: 1 / (1 + r._distance),
        distance: r._distance,
      }));
  }

  /**
   * Searches image frames.
   */
  async searchImageFrames(
    params: VectorSearchParams
  ): Promise<LanceDBSearchResult<ImageFrameRow>[]> {
    const table = await this.getTable(LANCEDB_TABLES.IMAGE_FRAMES);
    const filterStr = params.filters ? this.buildFilterString(params.filters) : '';

    let searchBuilder = table.search(params.queryVector).limit(params.topK);

    if (filterStr) {
      searchBuilder = searchBuilder.where(filterStr);
    }

    const results = await searchBuilder.execute();

    return results
      .filter((r) => !params.minSimilarity || 1 / (1 + r._distance) >= params.minSimilarity)
      .map((r) => ({
        row: r as unknown as ImageFrameRow,
        similarity: 1 / (1 + r._distance),
        distance: r._distance,
      }));
  }

  /**
   * Searches video segments.
   */
  async searchVideoSegments(
    params: VectorSearchParams
  ): Promise<LanceDBSearchResult<VideoSegmentRow>[]> {
    const table = await this.getTable(LANCEDB_TABLES.VIDEO_SEGMENTS);
    const filterStr = params.filters ? this.buildFilterString(params.filters) : '';

    let searchBuilder = table.search(params.queryVector).limit(params.topK);

    if (filterStr) {
      searchBuilder = searchBuilder.where(filterStr);
    }

    const results = await searchBuilder.execute();

    return results
      .filter((r) => !params.minSimilarity || 1 / (1 + r._distance) >= params.minSimilarity)
      .map((r) => ({
        row: r as unknown as VideoSegmentRow,
        similarity: 1 / (1 + r._distance),
        distance: r._distance,
      }));
  }

  // ===========================================================================
  // UPDATE OPERATIONS
  // ===========================================================================

  /**
   * Updates contact ID for all rows with a specific cluster ID.
   * Used during backfill when a cluster is labeled as a contact.
   */
  async updateContactIdByCluster(
    clusterId: string,
    contactId: string
  ): Promise<BatchOperationResult> {
    const results: BatchOperationResult = {
      successCount: 0,
      failureCount: 0,
      errors: [],
    };

    const tables = [
      LANCEDB_TABLES.AUDIO_SEGMENTS,
      LANCEDB_TABLES.TEXT_EVENTS,
      LANCEDB_TABLES.BROWSER_SESSIONS,
      LANCEDB_TABLES.IMAGE_FRAMES,
      LANCEDB_TABLES.VIDEO_SEGMENTS,
    ];

    for (const tableName of tables) {
      try {
        const table = await this.getTable(tableName as LanceDBTableName);
        const updatedCount = await table.update(`clusterId = '${clusterId}'`, {
          contactId,
        } as Partial<unknown>);
        results.successCount += updatedCount;
      } catch (error) {
        results.failureCount++;
        results.errors.push({
          index: tables.indexOf(tableName),
          error: `Failed to update ${tableName}: ${error instanceof Error ? error.message : 'Unknown error'}`,
        });
      }
    }

    return results;
  }

  /**
   * Updates cluster ID for rows.
   * Used when reassigning segments to a different cluster.
   */
  async updateClusterId(
    tableName: LanceDBTableName,
    rowIds: string[],
    newClusterId: string
  ): Promise<BatchOperationResult> {
    const table = await this.getTable(tableName);
    const results: BatchOperationResult = {
      successCount: 0,
      failureCount: 0,
      errors: [],
    };

    for (let i = 0; i < rowIds.length; i++) {
      try {
        await table.update(`id = '${rowIds[i]}'`, { clusterId: newClusterId } as Partial<unknown>);
        results.successCount++;
      } catch (error) {
        results.failureCount++;
        results.errors.push({
          index: i,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    return results;
  }

  /**
   * Updates privacy scope for rows.
   */
  async updatePrivacyScope(
    tableName: LanceDBTableName,
    rowIds: string[],
    privacyScope: 'private' | 'social' | 'public'
  ): Promise<BatchOperationResult> {
    const table = await this.getTable(tableName);
    const results: BatchOperationResult = {
      successCount: 0,
      failureCount: 0,
      errors: [],
    };

    for (let i = 0; i < rowIds.length; i++) {
      try {
        await table.update(`id = '${rowIds[i]}'`, { privacyScope } as Partial<unknown>);
        results.successCount++;
      } catch (error) {
        results.failureCount++;
        results.errors.push({
          index: i,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    return results;
  }

  // ===========================================================================
  // DELETE OPERATIONS
  // ===========================================================================

  /**
   * Deletes rows by ID.
   */
  async deleteRows(tableName: LanceDBTableName, rowIds: string[]): Promise<number> {
    const table = await this.getTable(tableName);
    const idsStr = rowIds.map((id) => `'${id}'`).join(', ');
    return table.delete(`id IN (${idsStr})`);
  }

  /**
   * Deletes all rows for a user.
   */
  async deleteUserData(userId: string): Promise<BatchOperationResult> {
    const results: BatchOperationResult = {
      successCount: 0,
      failureCount: 0,
      errors: [],
    };

    const tables = Object.values(LANCEDB_TABLES);

    for (const tableName of tables) {
      try {
        const table = await this.getTable(tableName as LanceDBTableName);
        const deletedCount = await table.delete(`userId = '${userId}'`);
        results.successCount += deletedCount;
      } catch (error) {
        results.failureCount++;
        results.errors.push({
          index: tables.indexOf(tableName),
          error: `Failed to delete from ${tableName}: ${error instanceof Error ? error.message : 'Unknown error'}`,
        });
      }
    }

    return results;
  }

  // ===========================================================================
  // UTILITY METHODS
  // ===========================================================================

  /**
   * Gets row count for a table.
   */
  async getRowCount(tableName: LanceDBTableName): Promise<number> {
    const table = await this.getTable(tableName);
    return table.countRows();
  }

  /**
   * Gets row counts for all tables.
   */
  async getAllRowCounts(): Promise<Record<LanceDBTableName, number>> {
    const counts: Partial<Record<LanceDBTableName, number>> = {};

    for (const tableName of Object.values(LANCEDB_TABLES)) {
      counts[tableName] = await this.getRowCount(tableName);
    }

    return counts as Record<LanceDBTableName, number>;
  }

  /**
   * Checks if tables exist and are healthy.
   */
  async healthCheck(): Promise<{
    healthy: boolean;
    tables: Record<LanceDBTableName, boolean>;
    error?: string;
  }> {
    try {
      const connection = await this.ensureConnection();
      const existingTables = await connection.tableNames();

      const tableStatus: Partial<Record<LanceDBTableName, boolean>> = {};
      let allHealthy = true;

      for (const tableName of Object.values(LANCEDB_TABLES)) {
        const exists = existingTables.includes(tableName);
        tableStatus[tableName] = exists;
        if (!exists) {
          allHealthy = false;
        }
      }

      return {
        healthy: allHealthy,
        tables: tableStatus as Record<LanceDBTableName, boolean>,
      };
    } catch (error) {
      return {
        healthy: false,
        tables: Object.values(LANCEDB_TABLES).reduce(
          (acc, name) => ({ ...acc, [name]: false }),
          {} as Record<LanceDBTableName, boolean>
        ),
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }
}

// =============================================================================
// FACTORY FUNCTION
// =============================================================================

/**
 * Creates and initializes a LanceDB adapter.
 */
export async function createLanceDBAdapter(config: LanceDBConfig): Promise<LanceDBAdapter> {
  const adapter = new LanceDBAdapter(config);
  await adapter.connect();
  await adapter.initializeTables();
  return adapter;
}

