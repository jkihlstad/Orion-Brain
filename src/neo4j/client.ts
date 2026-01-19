/**
 * Neo4j HTTP Client
 *
 * Executes Cypher statements against Neo4j using the HTTP transactional endpoint.
 * Supports both individual statement execution and batch transactions.
 */

/**
 * Neo4j client configuration
 */
export interface Neo4jConfig {
  /** Neo4j HTTP endpoint URL */
  url: string;
  /** Neo4j username */
  user: string;
  /** Neo4j password */
  password: string;
  /** Database name (default: neo4j) */
  database?: string;
}

/**
 * Statement to execute
 */
export interface CypherStatement {
  statement: string;
  parameters?: Record<string, unknown>;
}

/**
 * Result from a Cypher statement execution
 */
export interface CypherResult {
  columns: string[];
  data: Array<{
    row: unknown[];
    meta: unknown[];
  }>;
}

/**
 * Response from Neo4j transactional endpoint
 */
interface Neo4jResponse {
  results: CypherResult[];
  errors: Array<{
    code: string;
    message: string;
  }>;
  commit?: string;
}

/**
 * Get Neo4j configuration from environment variables
 */
export function getNeo4jConfig(): Neo4jConfig {
  const url = process.env.NEO4J_URL;
  const user = process.env.NEO4J_USER;
  const password = process.env.NEO4J_PASS || process.env.NEO4J_PASSWORD;

  if (!url) {
    throw new Error("NEO4J_URL environment variable is required");
  }
  if (!user) {
    throw new Error("NEO4J_USER environment variable is required");
  }
  if (!password) {
    throw new Error("NEO4J_PASS or NEO4J_PASSWORD environment variable is required");
  }

  return {
    url,
    user,
    password,
    database: process.env.NEO4J_DATABASE || "neo4j",
  };
}

/**
 * Create Basic Auth header value
 */
function createAuthHeader(user: string, password: string): string {
  const credentials = Buffer.from(`${user}:${password}`).toString("base64");
  return `Basic ${credentials}`;
}

/**
 * Neo4j HTTP Client class
 */
export class Neo4jClient {
  private config: Neo4jConfig;
  private authHeader: string;

  constructor(config?: Neo4jConfig) {
    this.config = config || getNeo4jConfig();
    this.authHeader = createAuthHeader(this.config.user, this.config.password);
  }

  /**
   * Get the transaction endpoint URL
   */
  private getTransactionUrl(): string {
    const baseUrl = this.config.url.replace(/\/$/, "");
    const db = this.config.database || "neo4j";
    return `${baseUrl}/db/${db}/tx/commit`;
  }

  /**
   * Execute Cypher statements in a single transaction
   *
   * @param statements - Array of Cypher statement strings or statement objects
   * @returns Array of results, one per statement
   */
  async executeCypher(
    statements: (string | CypherStatement)[]
  ): Promise<CypherResult[]> {
    const formattedStatements: CypherStatement[] = statements.map((stmt) => {
      if (typeof stmt === "string") {
        return { statement: stmt };
      }
      return stmt;
    });

    const body = {
      statements: formattedStatements,
    };

    const response = await fetch(this.getTransactionUrl(), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json",
        "Authorization": this.authHeader,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `Neo4j request failed: ${response.status} ${response.statusText} - ${errorText}`
      );
    }

    const data: Neo4jResponse = await response.json();

    if (data.errors && data.errors.length > 0) {
      const errorMessages = data.errors
        .map((e) => `${e.code}: ${e.message}`)
        .join("; ");
      throw new Error(`Neo4j errors: ${errorMessages}`);
    }

    return data.results;
  }

  /**
   * Execute a single Cypher statement
   */
  async executeOne(
    statement: string,
    parameters?: Record<string, unknown>
  ): Promise<CypherResult> {
    const cypherStatement: CypherStatement = { statement };
    if (parameters !== undefined) {
      cypherStatement.parameters = parameters;
    }
    const results = await this.executeCypher([cypherStatement]);
    return results[0]!;
  }

  /**
   * Execute Cypher statements and return summary statistics
   */
  async executeWithStats(
    statements: (string | CypherStatement)[]
  ): Promise<{
    results: CypherResult[];
    statementCount: number;
    success: boolean;
  }> {
    const results = await this.executeCypher(statements);
    return {
      results,
      statementCount: statements.length,
      success: true,
    };
  }

  /**
   * Test the connection to Neo4j
   */
  async testConnection(): Promise<boolean> {
    try {
      await this.executeOne("RETURN 1 as test");
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get database information
   */
  async getDatabaseInfo(): Promise<Record<string, unknown>> {
    const result = await this.executeOne("CALL dbms.components()");
    if (result.data.length > 0) {
      const row = result.data[0]!.row;
      return {
        name: row[0],
        versions: row[1],
        edition: row[2],
      };
    }
    return {};
  }
}

/**
 * Singleton instance for convenience
 */
let defaultClient: Neo4jClient | null = null;

/**
 * Get the default Neo4j client instance
 */
export function getDefaultClient(): Neo4jClient {
  if (!defaultClient) {
    defaultClient = new Neo4jClient();
  }
  return defaultClient;
}

/**
 * Execute Cypher statements using the default client
 */
export async function executeCypher(
  statements: (string | CypherStatement)[]
): Promise<CypherResult[]> {
  return getDefaultClient().executeCypher(statements);
}
