/**
 * Neural Intelligence Platform - Neo4j Driver Wrapper
 *
 * Provides a wrapper around the Neo4j JavaScript driver with:
 * - Connection management and pooling
 * - Transaction support
 * - Health checks
 * - Query execution with parameters
 * - Automatic retry logic
 *
 * @version 1.0.0
 */

import type { CypherParams } from './cypher';
import type { GraphOperation } from './mappingEngine';

// =============================================================================
// TYPE DEFINITIONS
// =============================================================================

/**
 * Neo4j connection configuration.
 */
export interface Neo4jConfig {
  /** Neo4j URI (bolt:// or neo4j://) */
  uri: string;

  /** Username for authentication */
  username: string;

  /** Password for authentication */
  password: string;

  /** Database name (default: neo4j) */
  database?: string;

  /** Maximum connection pool size */
  maxConnectionPoolSize?: number;

  /** Connection acquisition timeout in milliseconds */
  connectionAcquisitionTimeout?: number;

  /** Enable encryption */
  encrypted?: boolean;

  /** Maximum transaction retry attempts */
  maxTransactionRetry?: number;

  /** Transaction retry delay in milliseconds */
  transactionRetryDelay?: number;
}

/**
 * Result of executing a query.
 */
export interface QueryResult<T = Record<string, unknown>> {
  /** Records returned by the query */
  records: T[];

  /** Query summary information */
  summary: QuerySummary;
}

/**
 * Summary of a query execution.
 */
export interface QuerySummary {
  /** Number of nodes created */
  nodesCreated: number;

  /** Number of nodes deleted */
  nodesDeleted: number;

  /** Number of relationships created */
  relationshipsCreated: number;

  /** Number of relationships deleted */
  relationshipsDeleted: number;

  /** Number of properties set */
  propertiesSet: number;

  /** Query execution time in milliseconds */
  executionTimeMs: number;
}

/**
 * Health check result.
 */
export interface HealthCheckResult {
  /** Whether the database is healthy */
  healthy: boolean;

  /** Response time in milliseconds */
  responseTimeMs: number;

  /** Error message if unhealthy */
  error?: string;

  /** Database version */
  version?: string;
}

/**
 * Transaction context for executing multiple queries.
 */
export interface TransactionContext {
  /** Execute a query within the transaction */
  run<T = Record<string, unknown>>(
    cypher: string,
    params?: CypherParams
  ): Promise<QueryResult<T>>;

  /** Execute a graph operation within the transaction */
  executeOperation(operation: GraphOperation): Promise<QueryResult>;
}

/**
 * Result of executing multiple operations.
 */
export interface BatchExecutionResult {
  /** Whether all operations succeeded */
  success: boolean;

  /** Number of successful operations */
  successCount: number;

  /** Number of failed operations */
  failedCount: number;

  /** Aggregate summary of all operations */
  summary: QuerySummary;

  /** Errors encountered */
  errors: string[];
}

// =============================================================================
// MOCK DRIVER TYPES (Replace with actual Neo4j driver when installed)
// =============================================================================

interface MockDriver {
  session(config?: { database?: string }): MockSession;
  close(): Promise<void>;
  verifyConnectivity(): Promise<void>;
  getServerInfo(): Promise<{ version: string }>;
}

interface MockSession {
  run(query: string, params?: Record<string, unknown>): Promise<MockResult>;
  close(): Promise<void>;
  beginTransaction(): MockTransaction;
  executeRead<T>(work: (tx: MockTransaction) => Promise<T>): Promise<T>;
  executeWrite<T>(work: (tx: MockTransaction) => Promise<T>): Promise<T>;
}

interface MockTransaction {
  run(query: string, params?: Record<string, unknown>): Promise<MockResult>;
  commit(): Promise<void>;
  rollback(): Promise<void>;
}

interface MockResult {
  records: MockRecord[];
  summary: {
    counters: {
      updates: () => {
        nodesCreated: () => number;
        nodesDeleted: () => number;
        relationshipsCreated: () => number;
        relationshipsDeleted: () => number;
        propertiesSet: () => number;
      };
    };
    resultAvailableAfter: { toNumber: () => number };
    resultConsumedAfter: { toNumber: () => number };
  };
}

interface MockRecord {
  get(key: string): unknown;
  toObject(): Record<string, unknown>;
  keys: string[];
}

// =============================================================================
// DEFAULT CONFIGURATION
// =============================================================================

const DEFAULT_CONFIG: Partial<Neo4jConfig> = {
  database: 'neo4j',
  maxConnectionPoolSize: 50,
  connectionAcquisitionTimeout: 30000,
  encrypted: true,
  maxTransactionRetry: 3,
  transactionRetryDelay: 1000,
};

// =============================================================================
// NEO4J CLIENT CLASS
// =============================================================================

/**
 * Neo4j client wrapper with connection management and query execution.
 */
export class Neo4jClient {
  private config: Required<Neo4jConfig>;
  private driver: MockDriver | null = null;
  private connected: boolean = false;
  private lastConnectedAt: number | null = null;

  constructor(config: Neo4jConfig) {
    this.config = {
      ...DEFAULT_CONFIG,
      ...config,
    } as Required<Neo4jConfig>;
  }

  // ===========================================================================
  // CONNECTION MANAGEMENT
  // ===========================================================================

  /**
   * Connects to the Neo4j database.
   */
  async connect(): Promise<void> {
    if (this.connected && this.driver) {
      return;
    }

    try {
      // TODO: Replace with actual Neo4j driver when installed
      // import neo4j from 'neo4j-driver';
      // this.driver = neo4j.driver(
      //   this.config.uri,
      //   neo4j.auth.basic(this.config.username, this.config.password),
      //   {
      //     maxConnectionPoolSize: this.config.maxConnectionPoolSize,
      //     connectionAcquisitionTimeout: this.config.connectionAcquisitionTimeout,
      //     encrypted: this.config.encrypted,
      //   }
      // );

      // Mock driver for development
      this.driver = this.createMockDriver();
      await this.driver.verifyConnectivity();

      this.connected = true;
      this.lastConnectedAt = Date.now();

      console.log(`[Neo4j] Connected to ${this.config.uri}`);
    } catch (error) {
      this.connected = false;
      throw new Error(
        `[Neo4j] Connection failed: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`
      );
    }
  }

  /**
   * Disconnects from the Neo4j database.
   */
  async disconnect(): Promise<void> {
    if (this.driver) {
      await this.driver.close();
      this.driver = null;
    }
    this.connected = false;
    console.log('[Neo4j] Disconnected');
  }

  /**
   * Returns whether the client is connected.
   */
  isConnected(): boolean {
    return this.connected && this.driver !== null;
  }

  /**
   * Gets connection status information.
   */
  getConnectionStatus(): {
    connected: boolean;
    lastConnectedAt: number | null;
    uri: string;
    database: string;
  } {
    return {
      connected: this.connected,
      lastConnectedAt: this.lastConnectedAt,
      uri: this.config.uri,
      database: this.config.database,
    };
  }

  /**
   * Ensures the client is connected before executing operations.
   */
  private ensureConnected(): void {
    if (!this.connected || !this.driver) {
      throw new Error('[Neo4j] Not connected. Call connect() first.');
    }
  }

  /**
   * Gets a session from the driver.
   */
  private getSession(): MockSession {
    this.ensureConnected();
    return this.driver!.session({ database: this.config.database });
  }

  // ===========================================================================
  // QUERY EXECUTION
  // ===========================================================================

  /**
   * Executes a Cypher query with parameters.
   */
  async run<T = Record<string, unknown>>(
    cypher: string,
    params: CypherParams = {}
  ): Promise<QueryResult<T>> {
    const session = this.getSession();

    try {
      const startTime = Date.now();
      const result = await session.run(cypher, params);
      const executionTimeMs = Date.now() - startTime;

      const records = result.records.map((record) => record.toObject() as T);

      const counters = result.summary.counters.updates();
      const summary: QuerySummary = {
        nodesCreated: counters.nodesCreated(),
        nodesDeleted: counters.nodesDeleted(),
        relationshipsCreated: counters.relationshipsCreated(),
        relationshipsDeleted: counters.relationshipsDeleted(),
        propertiesSet: counters.propertiesSet(),
        executionTimeMs,
      };

      return { records, summary };
    } finally {
      await session.close();
    }
  }

  /**
   * Executes a graph operation.
   */
  async executeOperation(operation: GraphOperation): Promise<QueryResult> {
    return this.run(operation.cypher, operation.params);
  }

  /**
   * Executes multiple graph operations in sequence.
   */
  async executeOperations(
    operations: GraphOperation[]
  ): Promise<BatchExecutionResult> {
    const errors: string[] = [];
    let successCount = 0;
    let failedCount = 0;

    const aggregateSummary: QuerySummary = {
      nodesCreated: 0,
      nodesDeleted: 0,
      relationshipsCreated: 0,
      relationshipsDeleted: 0,
      propertiesSet: 0,
      executionTimeMs: 0,
    };

    for (const operation of operations) {
      try {
        const result = await this.executeOperation(operation);
        successCount++;

        aggregateSummary.nodesCreated += result.summary.nodesCreated;
        aggregateSummary.nodesDeleted += result.summary.nodesDeleted;
        aggregateSummary.relationshipsCreated +=
          result.summary.relationshipsCreated;
        aggregateSummary.relationshipsDeleted +=
          result.summary.relationshipsDeleted;
        aggregateSummary.propertiesSet += result.summary.propertiesSet;
        aggregateSummary.executionTimeMs += result.summary.executionTimeMs;
      } catch (error) {
        failedCount++;
        errors.push(
          `Operation ${operation.label || 'unknown'}: ${
            error instanceof Error ? error.message : 'Unknown error'
          }`
        );
      }
    }

    return {
      success: failedCount === 0,
      successCount,
      failedCount,
      summary: aggregateSummary,
      errors,
    };
  }

  // ===========================================================================
  // TRANSACTION SUPPORT
  // ===========================================================================

  /**
   * Executes multiple operations in a transaction.
   * All operations succeed or all fail together.
   */
  async withTransaction<T>(
    work: (tx: TransactionContext) => Promise<T>
  ): Promise<T> {
    const session = this.getSession();

    try {
      return await session.executeWrite(async (tx) => {
        const context: TransactionContext = {
          run: async <R = Record<string, unknown>>(
            cypher: string,
            params?: CypherParams
          ): Promise<QueryResult<R>> => {
            const startTime = Date.now();
            const result = await tx.run(cypher, params);
            const executionTimeMs = Date.now() - startTime;

            const records = result.records.map(
              (record) => record.toObject() as R
            );
            const counters = result.summary.counters.updates();

            return {
              records,
              summary: {
                nodesCreated: counters.nodesCreated(),
                nodesDeleted: counters.nodesDeleted(),
                relationshipsCreated: counters.relationshipsCreated(),
                relationshipsDeleted: counters.relationshipsDeleted(),
                propertiesSet: counters.propertiesSet(),
                executionTimeMs,
              },
            };
          },
          executeOperation: async (
            operation: GraphOperation
          ): Promise<QueryResult> => {
            return context.run(operation.cypher, operation.params);
          },
        };

        return await work(context);
      });
    } finally {
      await session.close();
    }
  }

  /**
   * Executes operations in a transaction with automatic retry.
   */
  async withRetry<T>(
    work: (tx: TransactionContext) => Promise<T>,
    maxRetries?: number
  ): Promise<T> {
    const retries = maxRetries ?? this.config.maxTransactionRetry;
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < retries; attempt++) {
      try {
        return await this.withTransaction(work);
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        // Don't retry on certain errors
        if (this.isNonRetryableError(lastError)) {
          throw lastError;
        }

        // Wait before retrying
        if (attempt < retries - 1) {
          await this.delay(this.config.transactionRetryDelay * (attempt + 1));
        }
      }
    }

    throw lastError || new Error('Transaction failed after all retries');
  }

  /**
   * Executes all operations in a single transaction.
   */
  async executeOperationsInTransaction(
    operations: GraphOperation[]
  ): Promise<BatchExecutionResult> {
    return this.withTransaction(async (tx) => {
      const errors: string[] = [];
      let successCount = 0;
      let failedCount = 0;

      const aggregateSummary: QuerySummary = {
        nodesCreated: 0,
        nodesDeleted: 0,
        relationshipsCreated: 0,
        relationshipsDeleted: 0,
        propertiesSet: 0,
        executionTimeMs: 0,
      };

      for (const operation of operations) {
        try {
          const result = await tx.executeOperation(operation);
          successCount++;

          aggregateSummary.nodesCreated += result.summary.nodesCreated;
          aggregateSummary.nodesDeleted += result.summary.nodesDeleted;
          aggregateSummary.relationshipsCreated +=
            result.summary.relationshipsCreated;
          aggregateSummary.relationshipsDeleted +=
            result.summary.relationshipsDeleted;
          aggregateSummary.propertiesSet += result.summary.propertiesSet;
          aggregateSummary.executionTimeMs += result.summary.executionTimeMs;
        } catch (error) {
          failedCount++;
          errors.push(
            `Operation ${operation.label || 'unknown'}: ${
              error instanceof Error ? error.message : 'Unknown error'
            }`
          );
          // In a transaction, we might want to throw immediately
          throw error;
        }
      }

      return {
        success: failedCount === 0,
        successCount,
        failedCount,
        summary: aggregateSummary,
        errors,
      };
    });
  }

  // ===========================================================================
  // HEALTH CHECK
  // ===========================================================================

  /**
   * Performs a health check on the database.
   */
  async healthCheck(): Promise<HealthCheckResult> {
    const startTime = Date.now();

    try {
      this.ensureConnected();

      // Simple query to verify database is responsive
      await this.run('RETURN 1 as healthCheck');

      // Get server version
      let version: string | undefined;
      try {
        const serverInfo = await this.driver!.getServerInfo();
        version = serverInfo.version;
      } catch {
        // Version info might not be available
      }

      const result: HealthCheckResult = {
        healthy: true,
        responseTimeMs: Date.now() - startTime,
      };
      if (version !== undefined) {
        result.version = version;
      }
      return result;
    } catch (error) {
      return {
        healthy: false,
        responseTimeMs: Date.now() - startTime,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  // ===========================================================================
  // HELPER METHODS
  // ===========================================================================

  /**
   * Checks if an error is non-retryable.
   */
  private isNonRetryableError(error: Error): boolean {
    const nonRetryablePatterns = [
      'Syntax error',
      'Invalid input',
      'Unknown function',
      'Type mismatch',
      'Invalid property',
      'Authentication failure',
    ];

    return nonRetryablePatterns.some((pattern) =>
      error.message.includes(pattern)
    );
  }

  /**
   * Delays execution for a specified time.
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Creates a mock driver for development.
   */
  private createMockDriver(): MockDriver {
    const createMockRecord = (data: Record<string, unknown>): MockRecord => ({
      get: (key: string) => data[key],
      toObject: () => data,
      keys: Object.keys(data),
    });

    const createMockResult = (
      records: Record<string, unknown>[] = []
    ): MockResult => ({
      records: records.map(createMockRecord),
      summary: {
        counters: {
          updates: () => ({
            nodesCreated: () => 0,
            nodesDeleted: () => 0,
            relationshipsCreated: () => 0,
            relationshipsDeleted: () => 0,
            propertiesSet: () => 0,
          }),
        },
        resultAvailableAfter: { toNumber: () => 0 },
        resultConsumedAfter: { toNumber: () => 0 },
      },
    });

    const createMockTransaction = (): MockTransaction => ({
      run: async () => createMockResult(),
      commit: async () => {},
      rollback: async () => {},
    });

    return {
      session: () => ({
        run: async () => createMockResult(),
        close: async () => {},
        beginTransaction: createMockTransaction,
        executeRead: async (work) => work(createMockTransaction()),
        executeWrite: async (work) => work(createMockTransaction()),
      }),
      close: async () => {},
      verifyConnectivity: async () => {},
      getServerInfo: async () => ({ version: '5.0.0-mock' }),
    };
  }
}

// =============================================================================
// FACTORY FUNCTION
// =============================================================================

/**
 * Creates and connects a Neo4j client.
 */
export async function createNeo4jClient(
  config: Neo4jConfig
): Promise<Neo4jClient> {
  const client = new Neo4jClient(config);
  await client.connect();
  return client;
}

// =============================================================================
// SINGLETON INSTANCE
// =============================================================================

let defaultClient: Neo4jClient | null = null;

/**
 * Gets the default Neo4j client instance.
 * Creates a new client if one doesn't exist.
 */
export function getDefaultClient(): Neo4jClient | null {
  return defaultClient;
}

/**
 * Sets the default Neo4j client instance.
 */
export function setDefaultClient(client: Neo4jClient): void {
  defaultClient = client;
}

/**
 * Initializes the default Neo4j client from environment variables.
 */
export async function initializeDefaultClient(): Promise<Neo4jClient> {
  const config: Neo4jConfig = {
    uri: process.env.NEO4J_URI || 'bolt://localhost:7687',
    username: process.env.NEO4J_USERNAME || 'neo4j',
    password: process.env.NEO4J_PASSWORD || 'password',
    database: process.env.NEO4J_DATABASE || 'neo4j',
  };

  const client = await createNeo4jClient(config);
  setDefaultClient(client);
  return client;
}
