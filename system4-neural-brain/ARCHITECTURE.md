# System #4: Neural Intelligence Platform ("The Brain")
## Architecture Documentation

### Version: 1.0.0
### Last Updated: 2025-01-06

---

## Data Flow Diagram

```
                                    EXTERNAL SYSTEMS
    +------------------+     +------------------+     +------------------+
    |   iOS Browser    |     |    Dashboard     |     |      Clerk       |
    |   (SwiftUI)      |     |    (Next.js)     |     |   (Identity)     |
    +--------+---------+     +--------+---------+     +--------+---------+
             |                        |                        |
             | Upload Events          | Query/Label            | JWT Verify
             v                        v                        v
    +--------+---------+     +--------+------------------------+---------+
    |                  |     |                                           |
    |     CONVEX       |     |        SYSTEM #4: NEURAL BRAIN            |
    |  (Event Store)   |<--->|                                           |
    |                  |     |  +----------------+  +------------------+  |
    | - events table   |     |  |  Worker Pool   |  |    API Server    |  |
    | - media refs     |     |  |                |  |                  |  |
    | - prompts table  |     |  | - Poll/Lease   |  | /v1/brain/search |  |
    | - consent        |     |  | - Process      |  | /v1/brain/insights|  |
    |                  |     |  | - Ack/Fail     |  | /v1/brain/jobs   |  |
    +------------------+     |  +-------+--------+  +--------+---------+  |
                             |          |                    |           |
                             |          v                    v           |
                             |  +-------+--------------------+--------+  |
                             |  |           LangGraph Orchestration    |  |
                             |  |                                      |  |
                             |  |  fetch -> route -> embed -> enrich   |  |
                             |  |           -> store -> graph -> prompt |  |
                             |  +--+------------------+---------------+  |
                             |     |                  |                  |
                             |     v                  v                  |
                             |  +--+-------+    +-----+--------+         |
                             |  |          |    |              |         |
                             |  | LanceDB  |    |   Neo4j      |         |
                             |  | (Vectors)|    |  (Graph)     |         |
                             |  |          |    |              |         |
                             |  +----------+    +--------------+         |
                             |                                           |
                             +-------------------------------------------+
                                            |
                                            v
                             +-------------------------------------------+
                             |              OpenRouter                   |
                             |  - Text Embeddings (text-embedding-3)     |
                             |  - CLIP Embeddings (vision)               |
                             |  - Transcription (whisper)                |
                             |  - Chat (sentiment/entities)              |
                             +-------------------------------------------+
```

---

## System Boundaries

### CONVEX (System #1-3 - External)
- **Role**: Canonical truth for all events
- **Owns**: Raw events, media references, user consent, prompts
- **Interface**: Polling/lease pattern for event consumption

### NEURAL BRAIN (System #4 - This System)
- **Role**: Intelligence layer - embeddings, search, insights
- **Owns**: Vector embeddings, graph relationships, speaker clusters
- **Does NOT own**: Raw event data (references Convex)

### DASHBOARD (External Consumer)
- **Role**: User interface for search, labeling, insights
- **Interface**: REST API with Clerk JWT auth

---

## Component Architecture

### 1. Worker Pool
```
+--------------------------------------------------+
|                   Worker Pool                     |
|                                                   |
|  +-------------+  +-------------+  +----------+  |
|  | Poller      |  | Processor   |  | Acker    |  |
|  |             |  |             |  |          |  |
|  | - Lease     |  | - Route     |  | - Commit |  |
|  |   events    |  | - Embed     |  | - Fail   |  |
|  | - Batch     |  | - Store     |  | - Retry  |  |
|  +-------------+  +-------------+  +----------+  |
+--------------------------------------------------+
```

### 2. API Server
```
+--------------------------------------------------+
|                   API Server                      |
|                                                   |
|  +-------------+  +-------------+  +----------+  |
|  | Auth        |  | Routes      |  | Handlers |  |
|  | Middleware  |  |             |  |          |  |
|  |             |  | /search     |  | Search   |  |
|  | - Clerk JWT |  | /insights   |  | Insights |  |
|  | - API Key   |  | /jobs       |  | Jobs     |  |
|  | - Scoping   |  | /speakers   |  | Speakers |  |
|  +-------------+  +-------------+  +----------+  |
+--------------------------------------------------+
```

### 3. Storage Layer
```
+------------------------+    +------------------------+
|       LanceDB          |    |        Neo4j           |
|                        |    |                        |
| Tables:                |    | Nodes:                 |
| - audio_segments       |    | - User                 |
| - text_events          |    | - Event                |
| - image_frames         |    | - SpeakerCluster       |
| - video_segments       |    | - Contact              |
| - browser_sessions     |    | - Session              |
|                        |    | - Url                  |
| Indexes:               |    |                        |
| - vector (IVF_PQ)      |    | Relationships:         |
| - userId               |    | - GENERATED            |
| - timestamp            |    | - HAS_SPEAKER_CLUSTER  |
| - privacyScope         |    | - RESOLVES_TO          |
+------------------------+    | - HAS_SESSION          |
                              | - VIEWED               |
                              | - IN_SESSION           |
                              +------------------------+
```

---

## Event Processing Flow

```
1. EVENT INGESTION
   Convex Event Created
         |
         v
2. LEASE & FETCH
   Worker polls Convex
   Lease event (lock for processing)
         |
         v
3. ROUTE BY MODALITY
   +---> text   ---> Text Pipeline
   +---> audio  ---> Audio Pipeline
   +---> image  ---> Image Pipeline
   +---> video  ---> Video Pipeline
         |
         v
4. EMBED
   Call OpenRouter for embeddings
   (text-embedding-3, CLIP, whisper)
         |
         v
5. ENRICH
   - Sentiment analysis
   - Entity extraction
   - Speaker clustering (audio)
         |
         v
6. STORE VECTORS
   Write to LanceDB tables
   (with full metadata)
         |
         v
7. UPDATE GRAPH
   Upsert Neo4j nodes/edges
   - Event node
   - Relationships
   - Speaker clusters
         |
         v
8. CHECK PROMPTS
   If unknown speaker cluster
   hits threshold (5+ occurrences):
   Create prompt in Convex
         |
         v
9. FINALIZE
   Ack event as processed
   (or move to failed state)
```

---

## Speaker Labeling Flow

```
1. DETECTION (Worker)
   Unknown speaker cluster reaches threshold
         |
         v
2. PROMPT CREATION (Worker -> Convex)
   Create prompt: { type: 'speaker_label', clusterId, samples }
         |
         v
3. USER LABELS (Dashboard -> Convex)
   User selects/creates contact
   Write event: { type: 'speaker_cluster_labeled', clusterId, contactId }
         |
         v
4. CONSUME LABEL (Worker)
   Process speaker_cluster_labeled event
         |
         v
5. UPDATE GRAPH (Worker -> Neo4j)
   (SpeakerCluster)-[:RESOLVES_TO]->(Contact)
         |
         v
6. BACKFILL VECTORS (Worker -> LanceDB)
   Update all rows with clusterId
   Set contactId field
```

---

## Privacy Enforcement

### Scopes
- `private`: Only visible to owner
- `social`: Visible to connected users (future)
- `public`: Visible to all (future)

### Enforcement Points
1. **API Layer**: All queries include userId filter
2. **LanceDB**: Metadata filters enforce scope
3. **Neo4j**: User-scoped traversals
4. **Never**: Trust client-provided userId

```typescript
// Every query MUST include user scope
const results = await lancedb.search({
  query: embedding,
  filter: `userId = '${userId}' AND privacyScope IN (${allowedScopes})`,
  limit: 10
});
```

---

## Idempotency Strategy

### Event Processing
- Key: `eventId`
- Check: Before processing, verify not already in LanceDB
- Storage: Store processing state in event metadata

### API Requests
- Key: `X-Idempotency-Key` header
- TTL: 24 hours
- Storage: Redis/memory cache

### Retry Policy
```typescript
{
  maxRetries: 3,
  backoff: 'exponential',
  baseDelay: 1000,
  maxDelay: 30000,
  retryableErrors: ['TIMEOUT', 'RATE_LIMIT', 'TRANSIENT']
}
```

---

## Schema Versioning

All schemas include version numbers for forward compatibility:

- `EVENT_SCHEMA_VERSION`: 1
- `EMBEDDING_SCHEMA_VERSION`: 1
- `PROMPT_SCHEMA_VERSION`: 1
- `GRAPH_SCHEMA_VERSION`: 1

Migration handlers process version upgrades during read.
