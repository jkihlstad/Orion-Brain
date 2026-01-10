# System #4 Implementation Strategies

## A. Idempotency Strategy

### Event Processing Idempotency

Every event is processed exactly once using the following mechanisms:

```
1. IDEMPOTENCY KEY
   - Key format: `{eventId}:{operation}:v{schemaVersion}`
   - Example: `evt_abc123:process:v1`
   - Stored in event metadata in Convex

2. PROCESSING STATES
   pending    -> Event created, not yet processed
   leased     -> Worker has claimed event (locked)
   processing -> Actively being processed
   completed  -> Successfully processed
   failed     -> Exhausted retries, moved to dead-letter

3. LEASE-BASED LOCKING
   - Worker leases events with timeout (default: 5 minutes)
   - Lease prevents double-processing
   - Expired leases allow retry by other workers
   - Lease renewal for long-running operations

4. DUPLICATE DETECTION
   Before insert:
   ```typescript
   const exists = await lancedb.search({
     filter: `eventId = '${eventId}'`,
     limit: 1
   });
   if (exists.length > 0) {
     // Skip - already processed
   }
   ```
```

### API Idempotency

```
1. REQUEST DEDUPLICATION
   - Client sends: X-Idempotency-Key header
   - Server caches: {key} -> {response, timestamp}
   - TTL: 24 hours
   - Same key returns cached response

2. IMPLEMENTATION
   ```typescript
   const cacheKey = `idempotency:${req.headers['x-idempotency-key']}`;
   const cached = await cache.get(cacheKey);
   if (cached) {
     return res.json(cached.response);
   }
   // Process request...
   await cache.set(cacheKey, { response, timestamp: Date.now() }, { ttl: 86400 });
   ```
```

---

## B. Retry Strategy

### Exponential Backoff with Jitter

```typescript
const RETRY_CONFIG = {
  maxRetries: 3,
  baseDelay: 1000,      // 1 second
  maxDelay: 30000,      // 30 seconds
  backoffMultiplier: 2,
  jitterFactor: 0.1,    // ±10%
};

function calculateDelay(attempt: number): number {
  const delay = Math.min(
    RETRY_CONFIG.baseDelay * Math.pow(RETRY_CONFIG.backoffMultiplier, attempt),
    RETRY_CONFIG.maxDelay
  );
  const jitter = delay * RETRY_CONFIG.jitterFactor * (Math.random() * 2 - 1);
  return Math.round(delay + jitter);
}

// Delays: ~1s, ~2s, ~4s (then fail)
```

### Retryable vs Non-Retryable Errors

```
RETRYABLE (will retry):
- TIMEOUT          - API timeout
- RATE_LIMITED     - 429 responses
- TRANSIENT        - 5xx server errors
- ECONNRESET       - Network issues
- LEASE_EXPIRED    - Lost lock (re-lease)

NON-RETRYABLE (immediate failure):
- EVENT_NOT_FOUND  - Invalid event ID
- INVALID_EVENT    - Malformed event data
- UNAUTHORIZED     - Auth failure
- EMBEDDING_FAILED - Model error (bad input)
```

### Dead-Letter Queue

```
After maxRetries:
1. Mark event as 'failed' in Convex
2. Record error message and retry count
3. Alert monitoring system
4. Event available for manual review/retry

Manual retry:
POST /v1/brain/jobs/events/retry
{ "eventIds": ["evt_failed_123"] }
```

---

## C. Privacy Enforcement Strategy

### Scope Definitions

```
PRIVATE (default):
  - Only visible to data owner (userId)
  - All queries MUST include userId filter
  - No cross-user data access

SOCIAL (future):
  - Visible to owner + connected users
  - Requires explicit opt-in per event
  - Connection graph stored in Neo4j

PUBLIC (future):
  - Visible to all authenticated users
  - Requires explicit consent
  - Still excludes sensitive content
```

### Enforcement Points

```
1. API LAYER (first line)
   - Extract userId from Clerk JWT
   - Inject userId into all queries
   - Never trust client-provided userId

2. LANCEDB QUERIES (data layer)
   - Every search includes userId filter
   - Filter format: `userId = '${userId}'`
   - Privacy scope filter: `privacyScope IN (${allowedScopes})`

3. NEO4J QUERIES (graph layer)
   - All traversals start from User node
   - Pattern: MATCH (u:User {userId: $userId})-[...]
   - No cross-user traversals allowed

4. CONVEX QUERIES (source layer)
   - Event reads scoped to userId
   - Mutation functions verify ownership
```

### Implementation Example

```typescript
// CORRECT - Always include userId
async function search(userId: string, query: string): SearchResult[] {
  const embedding = await generateEmbedding(query);

  return await lancedb.search({
    query: embedding,
    filter: `userId = '${userId}' AND privacyScope = 'private'`,
    limit: 10
  });
}

// WRONG - Never do this
async function searchUnsafe(query: string): SearchResult[] {
  // Missing userId filter - SECURITY VIOLATION
  return await lancedb.search({ query, limit: 10 });
}
```

### Data Isolation Guarantees

```
1. NO CROSS-USER QUERIES
   - Cannot search another user's data
   - Cannot see another user's contacts
   - Cannot access another user's sessions

2. NO DATA LEAKAGE
   - Embeddings don't contain raw PII
   - Search results sanitized before return
   - Internal IDs not exposed to client

3. AUDIT LOGGING
   - All data access logged with userId
   - Query patterns monitored for anomalies
   - Retention policy: 90 days
```

---

## D. Schema Versioning Strategy

### Version Tracking

```typescript
const SCHEMA_VERSIONS = {
  EVENT: 1,      // Convex event schema
  EMBEDDING: 1,  // LanceDB row schema
  PROMPT: 1,     // User prompt schema
  GRAPH: 1,      // Neo4j node/edge schema
};
```

### Migration Approach

```
1. ADDITIVE CHANGES (no migration needed)
   - Adding new optional fields
   - Adding new tables/nodes
   - Adding new relationships

2. BREAKING CHANGES (requires migration)
   - Changing field types
   - Renaming fields
   - Removing required fields

3. MIGRATION PROCESS
   a. Deploy new code with backward compatibility
   b. Run backfill job to update existing data
   c. Remove backward compatibility after complete
   d. Increment schema version
```

### Forward Compatibility

```typescript
// Reading data with version check
function readEvent(data: unknown): Event {
  const raw = data as Record<string, unknown>;
  const version = raw.schemaVersion as number || 1;

  if (version < CURRENT_VERSION) {
    return migrateEvent(raw, version);
  }

  return raw as Event;
}

// Migration handler
function migrateEvent(data: Record<string, unknown>, fromVersion: number): Event {
  let migrated = { ...data };

  if (fromVersion < 2) {
    // v1 -> v2 migration
    migrated.newField = migrated.oldField || 'default';
  }

  return migrated as Event;
}
```

---

## E. Speaker Labeling Flow

### Detection Phase (Worker)

```
1. Audio event processed
2. Speaker embeddings extracted per segment
3. Embeddings compared to existing clusters
   - If similarity > 0.85: assign to cluster
   - If similarity < 0.85: create new cluster

4. Check cluster occurrence count
   - If unlabeled AND occurrences >= 5:
     - Set needsLabeling = true
     - Create prompt in Convex

Convex Prompt Schema:
{
  type: 'speaker_label',
  userId: string,
  data: {
    clusterId: string,
    sampleSegmentIds: string[],
    sampleTranscriptions: string[],
    occurrenceCount: number,
    suggestedContacts: string[] // optional
  },
  priority: 'medium',
  status: 'pending'
}
```

### User Labels (Dashboard -> Convex)

```
Dashboard UI:
1. User sees prompt with audio samples
2. User selects existing contact OR creates new
3. Dashboard writes label event to Convex:

{
  type: 'speaker_cluster_labeled',
  userId: string,
  clusterId: string,
  contactId: string,
  timestamp: number
}
```

### Confirmation Phase (Worker)

```
1. Worker consumes speaker_cluster_labeled event

2. Update Neo4j:
   MATCH (sc:SpeakerCluster {clusterId: $clusterId})
   MATCH (c:Contact {contactId: $contactId})
   MERGE (sc)-[r:RESOLVES_TO]->(c)
   SET r.resolvedAt = $timestamp,
       r.confidence = 1.0,
       r.resolutionMethod = 'user_manual'

3. Backfill LanceDB:
   UPDATE audio_segments
   SET contactId = $contactId
   WHERE clusterId = $clusterId

4. Mark prompt as completed in Convex
```

### Backfill Implementation

```typescript
async function backfillClusterLabel(
  clusterId: string,
  contactId: string,
  config: BrainConfig
): Promise<{ affectedRows: number }> {
  // 1. Get all rows with this cluster
  const rows = await lancedb.search({
    filter: `clusterId = '${clusterId}'`,
    limit: 10000
  });

  // 2. Update each row
  const updates = rows.map(row => ({
    id: row.id,
    contactId: contactId
  }));

  await lancedb.updateBatch('audio_segments', updates);

  return { affectedRows: updates.length };
}
```

---

## F. Error Classification

```typescript
type BrainErrorCode =
  // Retriable
  | 'TIMEOUT'           // API/DB timeout
  | 'RATE_LIMITED'      // 429 response
  | 'TRANSIENT'         // Temporary failure
  | 'LEASE_EXPIRED'     // Lost lock

  // Non-retriable
  | 'EVENT_NOT_FOUND'   // Bad event ID
  | 'INVALID_EVENT'     // Malformed data
  | 'UNAUTHORIZED'      // Auth failure
  | 'EMBEDDING_FAILED'  // Model error

  // System
  | 'STORAGE_ERROR'     // LanceDB error
  | 'GRAPH_ERROR'       // Neo4j error
  | 'OPENROUTER_ERROR'  // AI API error
  | 'INTERNAL_ERROR';   // Unknown error
```
