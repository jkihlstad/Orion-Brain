import type { Env } from "../env";

/**
 * A single Cypher statement to execute.
 */
export interface Neo4jStatement {
  statement: string;
  parameters?: Record<string, unknown>;
}

/**
 * Response structure from Neo4j HTTP API.
 */
export interface Neo4jCommitResponse {
  results: Array<{
    columns: string[];
    data: Array<{
      row: unknown[];
      meta: unknown[];
    }>;
  }>;
  errors: Array<{
    code: string;
    message: string;
  }>;
}

/**
 * Execute Cypher statements against Neo4j using the HTTP API.
 * Uses the transactional endpoint with auto-commit.
 *
 * @param env - Environment bindings with Neo4j credentials
 * @param statements - Array of Cypher statements to execute
 * @returns The Neo4j commit response
 */
export async function neo4jCommit(
  env: Env,
  statements: Neo4jStatement[]
): Promise<Neo4jCommitResponse> {
  const url = `${env.NEO4J_HTTP_URL}/db/neo4j/tx/commit`;

  // Create Basic auth header
  const credentials = btoa(`${env.NEO4J_USER}:${env.NEO4J_PASS}`);

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Basic ${credentials}`,
      Accept: "application/json",
    },
    body: JSON.stringify({
      statements,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Neo4j HTTP error: ${response.status} ${response.statusText} - ${errorText}`
    );
  }

  const data = (await response.json()) as Neo4jCommitResponse;

  // Check for Neo4j-level errors
  if (data.errors && data.errors.length > 0) {
    const errorMessages = data.errors
      .map((e) => `${e.code}: ${e.message}`)
      .join("; ");
    throw new Error(`Neo4j query errors: ${errorMessages}`);
  }

  return data;
}
