import type { Env } from "../env";
import type { RawEvent } from "../types/rawEvent";
import type { CleanedEvent } from "../types/cleanedEvent";
import type { Neo4jStatement, Neo4jCommitResponse } from "../neo4j/http";
import { cleanRawEvent } from "./clean";
import { buildMaterializeStatements } from "../neo4j/cypher";
import { neo4jCommit } from "../neo4j/http";

/**
 * Result of processing a single raw event.
 */
export interface ProcessResult {
  /** The cleaned/normalized event */
  cleaned: CleanedEvent;

  /** The Neo4j statements that were (or would be) executed */
  statements: Neo4jStatement[];

  /** Neo4j response (null if dryRun is true) */
  neo4jResponse: Neo4jCommitResponse | null;
}

/**
 * Process a single raw event through the cleaning and materialization pipeline.
 *
 * @param env - Environment bindings
 * @param rawEvent - The raw event to process
 * @param dryRun - If true, skip Neo4j commit and just return what would be executed
 * @returns The processing result with cleaned event and Neo4j details
 */
export async function processOneRawEvent(
  env: Env,
  rawEvent: RawEvent,
  dryRun: boolean = false
): Promise<ProcessResult> {
  // Step 1: Clean/normalize the raw event
  const cleaned = cleanRawEvent(rawEvent);

  // Step 2: Build Neo4j statements
  const statements = buildMaterializeStatements(cleaned);

  // Step 3: Execute against Neo4j (unless dry run)
  let neo4jResponse: Neo4jCommitResponse | null = null;

  if (!dryRun && statements.length > 0) {
    neo4jResponse = await neo4jCommit(env, statements);
  }

  return {
    cleaned,
    statements,
    neo4jResponse,
  };
}
