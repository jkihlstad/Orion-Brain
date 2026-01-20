#!/usr/bin/env npx tsx
/**
 * Insert Generated Events into Convex
 *
 * Reads demo-events.json and batch inserts events into Convex via HTTP API.
 * Handles rate limiting with exponential backoff and provides progress feedback.
 *
 * Usage:
 *   npx tsx scripts/seed-demo/insertEventsToConvex.ts --file demo-events.json
 *   npm run seed:convex -- --file demo-events.json
 *
 * Environment Variables:
 *   CONVEX_INGEST_BASE_URL - Base URL for Convex HTTP API (e.g., https://curious-jay-926.convex.site)
 *   CONVEX_GATEWAY_SHARED_SECRET - Bearer token for authentication
 *
 * @version 1.0.0
 */

import * as fs from 'fs';
import * as path from 'path';

// =============================================================================
// TYPES
// =============================================================================

/**
 * Event structure from demo-events.json.
 */
interface DemoEvent {
  eventId: string;
  traceId: string;
  sourceApp: string;
  eventType: string;
  domain: string;
  timestampMs: number;
  receivedAtMs: number;
  clerkUserId: string;
  consentVersion: string;
  privacyScope: string;
  payload: Record<string, unknown>;
  payloadPreview: string;
  brainStatus: string;
  brainAttempts: number;
  idempotencyKey?: string;
  blobRefs?: string[];
  brainLeaseWorkerId?: string;
  brainLeaseExpiresAtMs?: number;
  brainError?: string;
}

/**
 * Convex insertBatch API response.
 */
interface InsertBatchResponse {
  success: boolean;
  // New response format
  totalIngested?: number;
  totalDuplicated?: number;
  totalFailed?: number;
  totalReceived?: number;
  results?: Array<{
    eventId: string;
    traceId: string;
    success: boolean;
    duplicate: boolean;
    error?: string;
  }>;
  // Legacy/error response format
  inserted?: number;
  duplicates?: number;
  errors?: Array<{
    eventId: string;
    error: string;
  }>;
  error?: {
    code: string;
    message: string;
  };
  requestId?: string;
  timestamp?: number;
}

/**
 * Result tracking for batch insertion.
 */
interface InsertionResult {
  eventId: string;
  success: boolean;
  error?: string;
  duplicate?: boolean;
}

/**
 * Summary statistics.
 */
interface InsertionSummary {
  totalEvents: number;
  totalInserted: number;
  totalDuplicates: number;
  totalFailed: number;
  failedEvents: Array<{ eventId: string; error: string }>;
  timeTakenMs: number;
  batches: number;
}

// =============================================================================
// CONFIGURATION
// =============================================================================

const BATCH_SIZE = 50;
const MAX_RETRIES = 5;
const INITIAL_RETRY_DELAY_MS = 1000;
const MAX_RETRY_DELAY_MS = 60000;

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

/**
 * Parses command line arguments.
 */
function parseArgs(): { filePath: string; dryRun: boolean; verbose: boolean } {
  const args = process.argv.slice(2);
  let filePath = '';
  let dryRun = false;
  let verbose = false;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--file' || arg === '-f') {
      filePath = args[++i] || '';
    } else if (arg === '--dry-run') {
      dryRun = true;
    } else if (arg === '--verbose' || arg === '-v') {
      verbose = true;
    } else if (arg === '--help' || arg === '-h') {
      printUsage();
      process.exit(0);
    } else if (!arg.startsWith('-') && !filePath) {
      // Positional argument for file path
      filePath = arg;
    }
  }

  if (!filePath) {
    console.error('Error: --file argument is required');
    printUsage();
    process.exit(1);
  }

  return { filePath, dryRun, verbose };
}

/**
 * Prints usage information.
 */
function printUsage(): void {
  console.log(`
Usage: npx tsx scripts/seed-demo/insertEventsToConvex.ts [options]

Options:
  --file, -f <path>    Path to demo-events.json file (required)
  --dry-run            Validate without inserting events
  --verbose, -v        Show detailed progress
  --help, -h           Show this help message

Environment Variables:
  CONVEX_INGEST_BASE_URL        Convex HTTP API base URL
  CONVEX_GATEWAY_SHARED_SECRET  Bearer token for authentication

Examples:
  npx tsx scripts/seed-demo/insertEventsToConvex.ts --file demo-events.json
  npx tsx scripts/seed-demo/insertEventsToConvex.ts -f ./output/demo-events.json --verbose
  npx tsx scripts/seed-demo/insertEventsToConvex.ts --file demo-events.json --dry-run
`);
}

/**
 * Loads and validates environment variables.
 */
function loadEnvConfig(): { baseUrl: string; authToken: string } {
  const baseUrl = process.env.CONVEX_INGEST_BASE_URL;
  const authToken = process.env.CONVEX_GATEWAY_SHARED_SECRET;

  if (!baseUrl) {
    console.error('Error: CONVEX_INGEST_BASE_URL environment variable is not set');
    console.error('Expected format: https://curious-jay-926.convex.site');
    process.exit(1);
  }

  if (!authToken) {
    console.error('Error: CONVEX_GATEWAY_SHARED_SECRET environment variable is not set');
    process.exit(1);
  }

  return { baseUrl: baseUrl.replace(/\/$/, ''), authToken };
}

/**
 * Reads and parses the events JSON file.
 */
function loadEventsFile(filePath: string): DemoEvent[] {
  const absolutePath = path.isAbsolute(filePath)
    ? filePath
    : path.resolve(process.cwd(), filePath);

  if (!fs.existsSync(absolutePath)) {
    console.error(`Error: File not found: ${absolutePath}`);
    process.exit(1);
  }

  try {
    const content = fs.readFileSync(absolutePath, 'utf-8');
    const data = JSON.parse(content);

    // Handle both array format and object with events property
    const events: DemoEvent[] = Array.isArray(data) ? data : data.events;

    if (!Array.isArray(events)) {
      console.error('Error: Invalid file format. Expected an array of events or { events: [...] }');
      process.exit(1);
    }

    return events;
  } catch (err) {
    console.error(`Error reading file: ${err instanceof Error ? err.message : err}`);
    process.exit(1);
  }
}

/**
 * Splits an array into chunks of specified size.
 */
function chunk<T>(array: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}

/**
 * Sleeps for the specified duration.
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Calculates exponential backoff delay with jitter.
 */
function getBackoffDelay(attempt: number): number {
  const baseDelay = INITIAL_RETRY_DELAY_MS * Math.pow(2, attempt);
  const jitter = Math.random() * 0.3 * baseDelay; // 0-30% jitter
  return Math.min(baseDelay + jitter, MAX_RETRY_DELAY_MS);
}

/**
 * Formats duration in human-readable format.
 */
function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  const minutes = Math.floor(ms / 60000);
  const seconds = ((ms % 60000) / 1000).toFixed(0);
  return `${minutes}m ${seconds}s`;
}

/**
 * Creates a simple progress bar.
 */
function createProgressBar(current: number, total: number, width: number = 30): string {
  const percentage = current / total;
  const filled = Math.round(width * percentage);
  const empty = width - filled;
  const bar = '='.repeat(filled) + '-'.repeat(empty);
  return `[${bar}] ${(percentage * 100).toFixed(1)}%`;
}

/**
 * Clears the current line and moves cursor to beginning.
 */
function clearLine(): void {
  process.stdout.write('\r\x1b[K');
}

/**
 * Strips extra fields from events, keeping only Convex-allowed fields.
 */
function sanitizeEventForConvex(event: DemoEvent): Record<string, unknown> {
  // Only include fields that Convex insertBatch accepts
  return {
    eventId: event.eventId,
    traceId: event.traceId,
    sourceApp: event.sourceApp,
    eventType: event.eventType,
    domain: event.domain,
    timestampMs: event.timestampMs,
    clerkUserId: event.clerkUserId,
    consentVersion: event.consentVersion,
    privacyScope: event.privacyScope,
    payload: event.payload,
    payloadPreview: event.payloadPreview,
    // Optional fields
    ...(event.blobRefs && { blobRefs: event.blobRefs }),
    ...(event.idempotencyKey && { idempotencyKey: event.idempotencyKey }),
  };
}

// =============================================================================
// HTTP CLIENT
// =============================================================================

/**
 * Sends a batch of events to the Convex insertBatch endpoint.
 */
async function insertBatch(
  baseUrl: string,
  authToken: string,
  events: DemoEvent[],
  verbose: boolean
): Promise<InsertBatchResponse> {
  const url = `${baseUrl}/insertBatch`;

  // Sanitize events to only include Convex-allowed fields
  const sanitizedEvents = events.map(sanitizeEventForConvex);

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${authToken}`,
    },
    body: JSON.stringify({ events: sanitizedEvents }),
  });

  // Handle rate limiting
  if (response.status === 429) {
    const retryAfter = response.headers.get('Retry-After');
    throw new RateLimitError(
      'Rate limited by server',
      retryAfter ? parseInt(retryAfter, 10) * 1000 : undefined
    );
  }

  // Handle other errors
  if (!response.ok) {
    const errorBody = await response.text();
    let errorMessage = `HTTP ${response.status}: ${response.statusText}`;
    try {
      const errorJson = JSON.parse(errorBody);
      if (errorJson.error?.message) {
        errorMessage = errorJson.error.message;
      }
    } catch {
      // Use default error message
    }
    throw new Error(errorMessage);
  }

  const result: InsertBatchResponse = await response.json();
  return result;
}

/**
 * Custom error class for rate limiting.
 */
class RateLimitError extends Error {
  retryAfterMs?: number;

  constructor(message: string, retryAfterMs?: number) {
    super(message);
    this.name = 'RateLimitError';
    this.retryAfterMs = retryAfterMs;
  }
}

/**
 * Inserts a batch with retry logic for rate limiting.
 */
async function insertBatchWithRetry(
  baseUrl: string,
  authToken: string,
  events: DemoEvent[],
  verbose: boolean
): Promise<InsertBatchResponse> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      return await insertBatch(baseUrl, authToken, events, verbose);
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));

      if (err instanceof RateLimitError) {
        const delay = err.retryAfterMs || getBackoffDelay(attempt);
        if (verbose) {
          console.log(`\n  Rate limited. Retrying in ${formatDuration(delay)}...`);
        }
        await sleep(delay);
      } else if (attempt < MAX_RETRIES - 1) {
        const delay = getBackoffDelay(attempt);
        if (verbose) {
          console.log(`\n  Error: ${lastError.message}. Retrying in ${formatDuration(delay)}...`);
        }
        await sleep(delay);
      }
    }
  }

  throw lastError || new Error('Max retries exceeded');
}

// =============================================================================
// MAIN LOGIC
// =============================================================================

/**
 * Main function to orchestrate the insertion process.
 */
async function main(): Promise<void> {
  const startTime = Date.now();

  // Parse arguments and load configuration
  const { filePath, dryRun, verbose } = parseArgs();
  const { baseUrl, authToken } = loadEnvConfig();

  console.log('========================================');
  console.log('  Convex Event Insertion Tool');
  console.log('========================================\n');

  // Load events
  console.log(`Loading events from: ${filePath}`);
  const events = loadEventsFile(filePath);
  console.log(`Found ${events.length} events to insert\n`);

  if (events.length === 0) {
    console.log('No events to insert. Exiting.');
    return;
  }

  // Dry run validation
  if (dryRun) {
    console.log('DRY RUN MODE - No events will be inserted\n');
    console.log('Event summary:');

    const bySourceApp: Record<string, number> = {};
    const byUser: Record<string, number> = {};

    for (const event of events) {
      bySourceApp[event.sourceApp] = (bySourceApp[event.sourceApp] || 0) + 1;
      byUser[event.clerkUserId] = (byUser[event.clerkUserId] || 0) + 1;
    }

    console.log('\nBy source app:');
    for (const [app, count] of Object.entries(bySourceApp).sort((a, b) => b[1] - a[1])) {
      console.log(`  ${app}: ${count}`);
    }

    console.log(`\nUnique users: ${Object.keys(byUser).length}`);
    console.log(`Total batches needed: ${Math.ceil(events.length / BATCH_SIZE)}`);
    console.log('\nDry run complete. Use without --dry-run to insert events.');
    return;
  }

  // Split into batches
  const batches = chunk(events, BATCH_SIZE);
  console.log(`Inserting ${events.length} events in ${batches.length} batches of up to ${BATCH_SIZE}\n`);
  console.log(`Target: ${baseUrl}/insertBatch\n`);

  // Track results
  const summary: InsertionSummary = {
    totalEvents: events.length,
    totalInserted: 0,
    totalDuplicates: 0,
    totalFailed: 0,
    failedEvents: [],
    timeTakenMs: 0,
    batches: batches.length,
  };

  // Process batches
  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i];
    const batchNum = i + 1;
    const processedSoFar = i * BATCH_SIZE;

    // Update progress
    clearLine();
    const progress = createProgressBar(processedSoFar, events.length);
    process.stdout.write(`${progress} Batch ${batchNum}/${batches.length} (${batch.length} events)`);

    try {
      const result = await insertBatchWithRetry(baseUrl, authToken, batch, verbose);

      if (result.success) {
        // Support both new and legacy response formats
        const inserted = result.totalIngested ?? result.inserted ?? 0;
        const duplicates = result.totalDuplicated ?? result.duplicates ?? 0;

        summary.totalInserted += inserted;
        summary.totalDuplicates += duplicates;

        // Check results array for failures (new format)
        if (result.results) {
          for (const r of result.results) {
            if (!r.success && r.error) {
              summary.failedEvents.push({ eventId: r.eventId, error: r.error });
              summary.totalFailed++;
            }
          }
        }

        // Legacy errors array
        if (result.errors && result.errors.length > 0) {
          for (const err of result.errors) {
            summary.failedEvents.push(err);
            summary.totalFailed++;
          }
        }

        if (verbose) {
          console.log(`\n  Batch ${batchNum}: ${inserted} inserted, ${duplicates} duplicates`);
        }
      } else {
        // Entire batch failed
        for (const event of batch) {
          summary.failedEvents.push({
            eventId: event.eventId,
            error: result.error?.message || 'Batch insertion failed',
          });
          summary.totalFailed++;
        }

        if (verbose) {
          console.log(`\n  Batch ${batchNum} FAILED: ${result.error?.message || 'Unknown error'}`);
        }
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);

      // Mark all events in batch as failed
      for (const event of batch) {
        summary.failedEvents.push({
          eventId: event.eventId,
          error: errorMessage,
        });
        summary.totalFailed++;
      }

      if (verbose) {
        console.log(`\n  Batch ${batchNum} ERROR: ${errorMessage}`);
      }
    }
  }

  // Final progress update
  clearLine();
  console.log(`${createProgressBar(events.length, events.length)} Complete!\n`);

  // Calculate time taken
  summary.timeTakenMs = Date.now() - startTime;

  // Print summary
  console.log('========================================');
  console.log('  Insertion Summary');
  console.log('========================================\n');

  console.log(`Total events:      ${summary.totalEvents}`);
  console.log(`Successfully inserted: ${summary.totalInserted}`);
  console.log(`Duplicates (skipped):  ${summary.totalDuplicates}`);
  console.log(`Failed:            ${summary.totalFailed}`);
  console.log(`Time taken:        ${formatDuration(summary.timeTakenMs)}`);
  console.log(`Batches processed: ${summary.batches}`);

  if (summary.totalInserted > 0) {
    const eventsPerSecond = (summary.totalInserted / (summary.timeTakenMs / 1000)).toFixed(1);
    console.log(`Insertion rate:    ${eventsPerSecond} events/second`);
  }

  // Log failed events if any
  if (summary.failedEvents.length > 0) {
    console.log('\n----------------------------------------');
    console.log('Failed Events:');
    console.log('----------------------------------------\n');

    // Show first 10 failures
    const toShow = summary.failedEvents.slice(0, 10);
    for (const failed of toShow) {
      console.log(`  ${failed.eventId}: ${failed.error}`);
    }

    if (summary.failedEvents.length > 10) {
      console.log(`  ... and ${summary.failedEvents.length - 10} more`);
    }

    // Write full failure log
    const failureLogPath = path.resolve(process.cwd(), 'insertion-failures.json');
    fs.writeFileSync(failureLogPath, JSON.stringify(summary.failedEvents, null, 2));
    console.log(`\nFull failure log written to: ${failureLogPath}`);
  }

  console.log('\n========================================');

  // Exit with error code if there were failures
  if (summary.totalFailed > 0) {
    process.exit(1);
  }
}

// =============================================================================
// ENTRY POINT
// =============================================================================

main().catch((err) => {
  console.error('\nFatal error:', err instanceof Error ? err.message : err);
  process.exit(1);
});
