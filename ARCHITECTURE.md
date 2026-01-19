# Brain Platform Architecture

## Purpose
The Brain Platform is the Neural Intelligence Platform for the Orion ecosystem, providing comprehensive media processing pipelines (audio, video, image, text), AI-powered semantic search, insights generation, and event orchestration using LangGraph workflows. It serves as the central "brain" that processes user events from all apps, generates embeddings, stores vectors in LanceDB, builds knowledge graphs in Neo4j, and provides intelligent queries and insights through a unified API.

## Ecosystem Role
This repository is **System #4** in the Orion ecosystem. It sits between the ingestion layer (convex-ingestion-store) and the iOS apps, consuming raw events and producing enriched intelligence. It receives events via the edge gateway, processes them through LangGraph pipelines, stores vectors and graph relationships, and exposes search/insights APIs that the Dashboard and other apps consume.

## Key Invariants
- Events are processed idempotently - duplicate processing must not corrupt state
- All media processing goes through OpenRouter API for model access
- Vector embeddings must match the dimensionality expected by LanceDB
- Authentication is required for all API endpoints (Clerk JWT or server-to-server)
- Dead letter queue must capture all failed events for retry
- Privacy scopes must be respected in all search and insights operations

## Project Structure
```
brain-platform/
  brain-cloudflare/          # Cloudflare Workers for edge orchestration
    workers/                 # API, Consumer, Sweeper workers
    shared/                  # Shared utilities for workers
  brain-scheduler/           # Scheduling coordination service
  convex/                    # Convex backend functions
    brainOps.ts              # Brain operations mutations
    brainRegistry.ts         # Event type registry
    brainScheduler.ts        # Scheduler integration
    brainSocial.ts           # Social signal processing
    httpActions/             # HTTP endpoint handlers
    schema.ts                # Database schema
  ios-edge-app/              # iOS edge computation utilities
  lancedb-vector-service/    # Vector similarity search service
    src/                     # Service implementation
    Dockerfile               # Container configuration
  social-engine/             # Social feature processing
  src/                       # Core TypeScript library
    adapters/                # External service adapters (OpenRouter)
    api/                     # Express API server (search, insights)
    langgraph/               # LangGraph workflow definitions
    middleware/              # Auth middleware (Clerk, server auth)
    pipelines/               # Media processing pipelines
    schemas/                 # Zod validation schemas
    types/                   # TypeScript type definitions
    utils/                   # Math, vector operations, clustering
    worker/                  # Background worker utilities
  system4-neural-brain/      # Neural brain subsystem
    config/                  # Configuration files
    docs/                    # Documentation
    src/                     # Source code
```

## Build & Run
```bash
# Install dependencies
npm install

# Build TypeScript
npm run build

# Development with watch
npm run dev

# Start API server
npm start

# Start development server
npm run start:dev

# Deploy Cloudflare workers
cd brain-cloudflare
npm run deploy:api
npm run deploy:consumer
npm run deploy:sweeper
```

## Testing
```bash
# Run tests
npm test

# Run linting
npm run lint
```

## Key Files
- `src/index.ts` - Main library exports (pipelines, API, middleware)
- `src/langgraph/graph.ts` - LangGraph workflow definitions
- `src/api/server.ts` - Express API server setup
- `src/api/search.ts` - Semantic and multimodal search
- `src/api/insights.ts` - AI insights generation
- `src/adapters/openrouter.ts` - OpenRouter API adapter
- `src/middleware/clerkAuth.ts` - Clerk JWT authentication
- `convex/schema.ts` - Convex database schema
- `brain-cloudflare/README.md` - Worker architecture documentation

## API / Endpoints
### Express API Server
- `POST /v1/brain/search` - Semantic search across user events
- `POST /v1/brain/insights` - Generate AI insights from user data

### Cloudflare Workers
- `POST /v1/brain/search` - Edge semantic search
- `POST /v1/brain/insights` - Edge insights generation

### Convex HTTP Actions
- `POST /brain/leaseSpeakerLabelEvents` - Lease events for processing
- `POST /brain/ackDone` - Acknowledge successful processing
- `POST /brain/ackFailed` - Acknowledge failed processing
- `POST /brain/createLabelSpeakerPrompt` - Create speaker labeling prompts
- `POST /brain/listPendingEvents` - List events awaiting processing

## Integration Points
- **Contracts**: `suite-contracts` - Event types, consent scopes, envelope schema
- **Gateway**: `edge-gateway-worker` - Receives events for brain processing
- **Storage**: `convex-ingestion-store` - Event source and consent data
- **Vector DB**: LanceDB - Vector similarity storage and search
- **Graph DB**: Neo4j Aura - Knowledge graph storage
- **AI Models**: OpenRouter API - Embeddings, transcription, sentiment
- **Auth**: Clerk - JWT verification for user authentication
