# Brain Platform Dev Endpoint

## Overview

The `/internal/dev/consumeOnce` endpoint provides a development interface for processing individual events through the Brain Platform pipeline. This endpoint is designed for testing, debugging, and validating the event transformation flow from raw events to Neo4j graph data.

**Important**: This endpoint is only available in development and staging environments.

---

## Endpoint Contract

### POST /internal/dev/consumeOnce

Process a single event through the pipeline.

#### Authentication

| Header | Required | Description |
|--------|----------|-------------|
| `X-Dev-Key` | Yes | Development API key |

Valid dev keys are configured via environment variables:
- `DEV_KEY_PRIMARY`
- `DEV_KEY_SECONDARY`

#### Request Body

```typescript
{
  // Look up event by trace ID (one of traceId or eventType required)
  traceId?: string;

  // Look up event by event type
  eventType?: string;

  // If true, transform only without writing to Neo4j
  dryRun?: boolean;
}
```

#### Response

```typescript
{
  // Whether the operation succeeded
  ok: boolean;

  // Number of events processed (0 or 1)
  processed: number;

  // Trace ID of processed event
  traceId?: string;

  // Event ID of processed event
  eventId?: string;

  // Event type
  eventType?: string;

  // The cleaned/transformed event
  cleaned?: CleanedEvent;

  // Neo4j operation details
  neo4j?: {
    statementCount: number;
    statements?: string[];  // Only in dryRun mode
    success: boolean;
  };

  // Error message if failed
  error?: string;
}
```

#### Status Codes

| Code | Description |
|------|-------------|
| 200 | Success |
| 400 | Bad request (missing traceId/eventType) |
| 401 | Unauthorized (invalid/missing dev key) |
| 404 | Event not found |
| 500 | Internal server error |

---

## Usage Examples

### Basic Usage with Trace ID

```bash
curl -X POST http://localhost:3000/internal/dev/consumeOnce \
  -H "Content-Type: application/json" \
  -H "X-Dev-Key: dev-key-primary-12345" \
  -d '{"traceId": "abc-123-def"}'
```

### Dry Run Mode

Preview the transformation without writing to Neo4j:

```bash
curl -X POST http://localhost:3000/internal/dev/consumeOnce \
  -H "Content-Type: application/json" \
  -H "X-Dev-Key: dev-key-primary-12345" \
  -d '{"traceId": "abc-123-def", "dryRun": true}'
```

### Filter by Event Type

```bash
curl -X POST http://localhost:3000/internal/dev/consumeOnce \
  -H "Content-Type: application/json" \
  -H "X-Dev-Key: dev-key-primary-12345" \
  -d '{"eventType": "finance.transaction_created"}'
```

---

## Testing Workflow

### 1. Set Up Environment

```bash
# Required environment variables
export NODE_ENV=development
export DEV_KEY_PRIMARY=your-dev-key
export CONVEX_URL=https://your-convex-instance.convex.cloud
export NEO4J_URL=bolt://localhost:7687
export NEO4J_USER=neo4j
export NEO4J_PASS=password
```

### 2. Start the Server

```bash
npm run dev
# or
bun run src/index.ts
```

### 3. Test the Endpoint

```bash
# Health check
curl http://localhost:3000/health

# Process an event (dry run)
curl -X POST http://localhost:3000/internal/dev/consumeOnce \
  -H "Content-Type: application/json" \
  -H "X-Dev-Key: $DEV_KEY_PRIMARY" \
  -d '{"traceId": "test-trace-123", "dryRun": true}'
```

### 4. Verify in Neo4j

After processing (non-dry run), verify the data in Neo4j:

```cypher
// Check for the user node
MATCH (u:User) RETURN u LIMIT 10;

// Check for entities
MATCH (n) WHERE n.sourceTraceId = 'your-trace-id' RETURN n;

// Check relationships
MATCH (u:User)-[r]->(n) RETURN u, r, n LIMIT 20;
```

---

## Cleaned Event Mapping Checklist

When adding support for a new event type, follow this checklist:

### 1. Define the Event Type

- [ ] Identify the domain (e.g., `finance`, `browser`, `calendar`)
- [ ] Name the event type following the pattern: `{domain}.{action}` (e.g., `finance.transaction_created`)

### 2. Identify Entities

For each entity extracted from the event:

- [ ] Define the `kind` (node label in Neo4j)
- [ ] Define a stable `id` generation strategy
- [ ] List all `props` to extract

| Entity Kind | ID Strategy | Properties |
|-------------|-------------|------------|
| Transaction | `transactionId` from data | amount, currency, merchantName, etc. |
| WebPage | Base64 of URL | url, title, domain |
| CalendarEvent | `eventId` from data | title, startTime, endTime, location |

### 3. Identify Edges

For each relationship:

- [ ] Define `from` entity (kind + id)
- [ ] Define `rel` type (verb: MADE, VIEWED, SCHEDULED, etc.)
- [ ] Define `to` entity (kind + id)
- [ ] List any edge `props`

| From | Rel | To | Properties |
|------|-----|----|------------|
| User | MADE | Transaction | timestamp |
| User | VIEWED | WebPage | timestamp, duration |
| User | SCHEDULED | CalendarEvent | timestamp, isOrganizer |

### 4. Implement the Mapper

Add a new mapper in `src/pipeline/clean.ts`:

```typescript
registerMapper("domain.event_type", (raw) => {
  const data = raw.data as {
    // Type your expected data shape
  };

  const entities: ExtractedEntity[] = [
    // Define entities
  ];

  const edges: ExtractedEdge[] = [
    // Define edges
  ];

  return { entities, edges };
});
```

### 5. Test the Mapping

```bash
# Create a test event in Convex, then:
curl -X POST http://localhost:3000/internal/dev/consumeOnce \
  -H "X-Dev-Key: $DEV_KEY_PRIMARY" \
  -d '{"eventType": "domain.event_type", "dryRun": true}'
```

Verify:
- [ ] Entities are correctly extracted
- [ ] Entity IDs are stable (same input = same ID)
- [ ] Edges connect the correct entities
- [ ] Privacy scope is appropriate

### 6. Verify Cypher Generation

Check the generated Cypher statements in dry run response:
- [ ] User node MERGE is present
- [ ] All entity MERGEs are idempotent
- [ ] Edge MERGEs reference correct nodes
- [ ] Timestamps and metadata are set

### 7. Integration Test

Process the event with `dryRun: false` and verify in Neo4j:
- [ ] Nodes exist with correct labels and properties
- [ ] Relationships exist with correct types
- [ ] Re-processing the same event is idempotent

---

## Supported Event Types

| Event Type | Domain | Entities | Edges |
|------------|--------|----------|-------|
| `finance.transaction_created` | finance | Transaction, Account, Merchant | User-MADE-Transaction, Transaction-FROM_ACCOUNT-Account, Transaction-AT_MERCHANT-Merchant |
| `browser.page_visited` | browser | WebPage, Domain | User-VIEWED-WebPage, WebPage-HOSTED_ON-Domain |
| `calendar.event_created` | calendar | CalendarEvent, Location | User-SCHEDULED-CalendarEvent, User-INVITED_TO-CalendarEvent, CalendarEvent-AT_LOCATION-Location |

---

## Troubleshooting

### Authentication Errors

```
{"ok":false,"error":"Missing X-Dev-Key header"}
```

**Solution**: Ensure the `X-Dev-Key` header is included in your request.

```
{"ok":false,"error":"Dev key authentication is not enabled in this environment"}
```

**Solution**: Set `NODE_ENV` to `development`, `staging`, or `test`.

### Event Not Found

```
{"ok":false,"error":"No events found for traceId: ..."}
```

**Solution**: Verify the trace ID exists in Convex. Use the Convex dashboard to check.

### Neo4j Connection Errors

```
{"ok":false,"error":"NEO4J_URL environment variable is required"}
```

**Solution**: Set the required Neo4j environment variables.

### Cypher Execution Errors

If Cypher execution fails, use `dryRun: true` to inspect the generated statements and identify issues.

---

## Architecture Notes

### Pipeline Flow

```
Convex (raw events)
       ↓
   fetchEventsByTraceId()
       ↓
   cleanEvent() → CleanedEvent
       ↓
   generateCypher() → string[]
       ↓
   executeCypher() → Neo4j
```

### Idempotency

All operations are idempotent:
- MERGE ensures nodes/edges are created only if they don't exist
- ON MATCH clauses update timestamps on existing data
- Same event can be processed multiple times safely

### Privacy Scope

Events have a `privacyScope` that defaults based on domain:
- `finance`: private
- `calendar`: private
- `browser`: private

This can be overridden via `metadata.privacyScope` in the raw event.
