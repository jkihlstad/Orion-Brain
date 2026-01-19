/**
 * Environment bindings for the Brain Platform Cloudflare Worker.
 * These are configured via wrangler.toml [vars] and secrets.
 */
export interface Env {
  // Development mode settings
  BRAIN_DEV_ENABLED: string;
  BRAIN_DEV_KEY: string;

  // Convex integration
  CONVEX_INGEST_BASE_URL: string;
  CONVEX_GATEWAY_SHARED_SECRET: string;

  // Neo4j connection
  NEO4J_HTTP_URL: string;
  NEO4J_USER: string;
  NEO4J_PASS: string;

  // OpenRouter for embeddings
  OPENROUTER_API_KEY: string;
  OPENROUTER_BASE_URL?: string;

  // LanceDB connection (optional, for marketplace)
  LANCEDB_URI?: string;

  // Gateway internal key for authenticated internal requests
  GATEWAY_INTERNAL_KEY?: string;
}
