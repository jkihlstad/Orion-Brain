export type ApiWorkerEnv = {
  // Auth
  CLERK_JWT_ISSUER?: string;
  CLERK_JWT_AUDIENCE?: string;

  // Services
  OPENROUTER_API_KEY: string;

  LANCEDB_API_URL: string;
  LANCEDB_API_KEY?: string;

  NEO4J_QUERY_API_URL: string;
  NEO4J_USER: string;
  NEO4J_PASSWORD: string;

  // KV for dedupe/limits
  BRAIN_KV: KVNamespace;
};

export type ConsumerWorkerEnv = ApiWorkerEnv & {
  BRAIN_JOBS: Queue;
  CONVEX_BRAIN_API_URL: string;
  CONVEX_BRAIN_API_KEY: string;

  // thresholds
  UNKNOWN_SPEAKER_PROMPT_THRESHOLD?: string;
};

export type SweeperWorkerEnv = ConsumerWorkerEnv;
