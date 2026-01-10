# Brain (Cloudflare Workers)

System #4: Neural Intelligence Platform orchestration on Cloudflare.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    Cloudflare Workers                            │
├─────────────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────────┐  ┌─────────────────────┐  │
│  │ API Worker  │  │ Consumer Worker │  │  Sweeper Worker     │  │
│  │ /v1/brain/* │  │ Queue Consumer  │  │  Cron (*/5 * * * *) │  │
│  └─────────────┘  └─────────────────┘  └─────────────────────┘  │
│         │                 │                      │               │
│         ▼                 ▼                      ▼               │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │                    Cloudflare KV                          │   │
│  │              (Dedupe + Lightweight Locks)                 │   │
│  └──────────────────────────────────────────────────────────┘   │
│         │                 │                                      │
│         ▼                 ▼                                      │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │                  Cloudflare Queues                        │   │
│  │                    (BRAIN_JOBS)                           │   │
│  └──────────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────────┘
                              │
          ┌───────────────────┼───────────────────┐
          ▼                   ▼                   ▼
   ┌─────────────┐     ┌─────────────┐     ┌─────────────┐
   │  OpenRouter │     │   Neo4j     │     │  LanceDB    │
   │  (Embeddings│     │   Aura      │     │  Vector     │
   │  Sentiment) │     │   (HTTPS)   │     │  Service    │
   └─────────────┘     └─────────────┘     └─────────────┘
```

## Workers

- **API Worker**: Dashboard endpoints (`/v1/brain/search`, `/v1/brain/insights`)
- **Consumer Worker**: Consumes queue jobs and processes events
- **Sweeper Worker**: Cron that enqueues pending Convex events

## Prerequisites

- Cloudflare account + Wrangler CLI logged in
- KV namespace: `BRAIN_KV`
- Queue: `BRAIN_JOBS`
- Neo4j Aura Query API endpoint + credentials
- Vector Service wrapping LanceDB over HTTP
- Convex HTTP Actions endpoint

## Setup

### 1. Create Cloudflare Resources

```bash
# Create KV namespace
wrangler kv:namespace create BRAIN_KV

# Create Queue
wrangler queues create BRAIN_JOBS
```

### 2. Update wrangler.jsonc files

Replace `REPLACE_WITH_KV_NAMESPACE_ID` with your actual KV namespace ID.

### 3. Set Secrets

```bash
# API Worker
wrangler secret put OPENROUTER_API_KEY --config workers/api-worker/wrangler.jsonc
wrangler secret put NEO4J_USER --config workers/api-worker/wrangler.jsonc
wrangler secret put NEO4J_PASSWORD --config workers/api-worker/wrangler.jsonc
wrangler secret put LANCEDB_API_KEY --config workers/api-worker/wrangler.jsonc

# Consumer Worker
wrangler secret put OPENROUTER_API_KEY --config workers/consumer-worker/wrangler.jsonc
wrangler secret put NEO4J_USER --config workers/consumer-worker/wrangler.jsonc
wrangler secret put NEO4J_PASSWORD --config workers/consumer-worker/wrangler.jsonc
wrangler secret put CONVEX_BRAIN_API_KEY --config workers/consumer-worker/wrangler.jsonc
wrangler secret put LANCEDB_API_KEY --config workers/consumer-worker/wrangler.jsonc

# Sweeper Worker
wrangler secret put CONVEX_BRAIN_API_KEY --config workers/sweeper-worker/wrangler.jsonc
```

### 4. Install Dependencies

```bash
npm install
```

### 5. Deploy

```bash
npm run deploy:api
npm run deploy:consumer
npm run deploy:sweeper
```

## Development

```bash
# Run API worker locally
npm run dev:api

# Run Consumer worker locally
npm run dev:consumer

# Run Sweeper worker locally
npm run dev:sweeper
```

## API Endpoints

### POST /v1/brain/search

Search across user's events using semantic similarity.

```json
{
  "query": "meeting with John about project",
  "topK": 20,
  "modalities": ["text", "audio"],
  "privacyScope": "private"
}
```

### POST /v1/brain/insights

Generate AI insights from user's data.

```json
{
  "timeRange": { "fromMs": 1704067200000, "toMs": 1704153600000 },
  "focus": "daily_summary"
}
```

## Required External Services

### Neo4j Aura Query API

Workers can't use Bolt protocol. Use Neo4j Aura's HTTPS Query API.

### LanceDB Vector Service

Workers can't run embedded LanceDB. Host a small HTTP service that wraps LanceDB:

- `POST /insert` - Insert vector rows
- `POST /search` - Similarity search
- `POST /updateByFilter` - Batch update by filter

### Convex HTTP Actions

Expose these endpoints from Convex:

- `POST /brain/leaseSpeakerLabelEvents`
- `POST /brain/ackDone`
- `POST /brain/ackFailed`
- `POST /brain/createLabelSpeakerPrompt`
- `POST /brain/listPendingEvents`

## Next Steps

1. Implement Clerk JWT JWKS verification (production security)
2. Implement Convex HTTP Actions
3. Implement LanceDB Vector Service
4. Add general event processing pipelines:
   - `audio_recorded` → transcribe → segment → embed → cluster → prompt
   - `page_visit`/text events → embed → store
   - `video`/`image` → CLIP embed → store

## License

Proprietary - Orion Team
