/**
 * Default Configuration for Neural Intelligence Platform
 *
 * All configuration values should be overridden via environment variables
 * in production. This file provides sensible defaults for development.
 */

import { BrainConfig } from '../src/types';

export const defaultConfig: BrainConfig = {
  convex: {
    url: process.env.CONVEX_URL || 'https://your-deployment.convex.cloud',
    deployKey: process.env.CONVEX_DEPLOY_KEY || '',
  },

  openrouter: {
    apiKey: process.env.OPENROUTER_API_KEY || '',
    baseUrl: process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1',
    models: {
      textEmbedding: 'openai/text-embedding-3-small',
      clipEmbedding: 'openai/gpt-4o-mini', // Using vision model for CLIP-like embeddings
      transcription: 'openai/whisper-large-v3',
      chat: 'openai/gpt-4o-mini',
    },
  },

  lancedb: {
    path: process.env.LANCEDB_PATH || './data/lancedb',
  },

  neo4j: {
    uri: process.env.NEO4J_URI || 'bolt://localhost:7687',
    username: process.env.NEO4J_USERNAME || 'neo4j',
    password: process.env.NEO4J_PASSWORD || '',
  },

  clerk: {
    secretKey: process.env.CLERK_SECRET_KEY || '',
    publishableKey: process.env.CLERK_PUBLISHABLE_KEY || '',
  },

  worker: {
    batchSize: parseInt(process.env.WORKER_BATCH_SIZE || '10', 10),
    pollInterval: parseInt(process.env.WORKER_POLL_INTERVAL || '5000', 10), // 5 seconds
    leaseTimeout: parseInt(process.env.WORKER_LEASE_TIMEOUT || '300000', 10), // 5 minutes
    maxRetries: parseInt(process.env.WORKER_MAX_RETRIES || '3', 10),
  },

  thresholds: {
    speakerClusterSimilarity: parseFloat(
      process.env.SPEAKER_CLUSTER_SIMILARITY || '0.85'
    ),
    unknownSpeakerPromptCount: parseInt(
      process.env.UNKNOWN_SPEAKER_PROMPT_COUNT || '5',
      10
    ),
    maxFramesPerVideo: parseInt(process.env.MAX_FRAMES_PER_VIDEO || '30', 10),
    frameIntervalSeconds: parseFloat(process.env.FRAME_INTERVAL_SECONDS || '2'),
  },
};

/**
 * Load and validate configuration.
 */
export function loadConfig(): BrainConfig {
  const config = { ...defaultConfig };

  // Validate required fields
  const requiredEnvVars = [
    'CONVEX_URL',
    'CONVEX_DEPLOY_KEY',
    'OPENROUTER_API_KEY',
    'NEO4J_PASSWORD',
    'CLERK_SECRET_KEY',
  ];

  const missing = requiredEnvVars.filter((key) => !process.env[key]);

  if (missing.length > 0 && process.env.NODE_ENV === 'production') {
    throw new Error(
      `Missing required environment variables: ${missing.join(', ')}`
    );
  }

  return config;
}

/**
 * Environment type helpers.
 */
export function isDevelopment(): boolean {
  return process.env.NODE_ENV !== 'production';
}

export function isProduction(): boolean {
  return process.env.NODE_ENV === 'production';
}

export function isTest(): boolean {
  return process.env.NODE_ENV === 'test';
}
