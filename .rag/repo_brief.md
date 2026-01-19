# Repo Brief: `brain-platform`
_Auto-generated (overwritten) on 2026-01-10T07:17:38Z_

**Purpose:** Neural brain platform with Convex, vector DB, and AI services.

## Type hints
- Swift/iOS: `False`
- Cloudflare Wrangler: `False`
- Convex: `True`

## Build / run commands
- `npm install`
- `npx convex dev`
- `npx convex deploy`

## Key files
- `ARCHITECTURE.md`
- `package.json`
- `src/index.ts`
- `convex/schema.ts`

## Likely endpoint-related files (heuristic)
- `brain-cloudflare/workers/api-worker/src/index.ts`
- `src/api/server.ts`
- `src/middleware/serverAuth.ts`
- `system4-neural-brain/src/api/server.ts`

## Likely eventType-related files (heuristic)
- `brain-cloudflare/package-lock.json`
- `ios-edge-app/Sources/Views/AudioCaptureView.swift`
- `ios-edge-app/Sources/Views/ContentView.swift`
- `ios-edge-app/Sources/Views/NeuralQueueStatusView.swift`
- `ios-edge-app/Sources/Views/VideoCaptureView.swift`
- `package-lock.json`
- `src/adapters/__tests__/lancedb.test.ts`
- `src/adapters/__tests__/neo4j.test.ts`

## Likely env var usage files (names only; no secrets)
- `brain-cloudflare/shared/adapters/convex.ts`
- `brain-cloudflare/shared/adapters/lancedb.ts`
- `brain-cloudflare/shared/adapters/neo4j.ts`
- `brain-cloudflare/shared/adapters/openrouter.ts`
- `brain-cloudflare/workers/api-worker/src/index.ts`
- `brain-cloudflare/workers/consumer-worker/src/index.ts`
- `brain-cloudflare/workers/sweeper-worker/src/index.ts`
- `brain-scheduler/src/convex.ts`
- `brain-scheduler/src/openrouter.ts`
- `convex/httpActions/_auth.ts`
- `convex/httpActions/brain_scheduler.ts`
- `convex/httpActions/brain_social.ts`
- `lancedb-vector-service/scripts/provisionTables.ts`
- `lancedb-vector-service/src/lancedb.ts`
- `lancedb-vector-service/src/server.ts`
- `lancedb-vector-service/src/validate.ts`
- `social-engine/src/convex.ts`
- `social-engine/src/openrouter.ts`
- `src/adapters/openrouter.ts`
- `src/api/embeddings.ts`
- `src/api/graph.ts`
- `src/api/insights.ts`
- `src/api/search.ts`
- `src/api/server.ts`
- `src/langgraph/graph.ts`
- `src/middleware/clerkAuth.ts`
- `src/middleware/serverAuth.ts`
- `src/worker/config.ts`
- `system4-neural-brain/config/default.ts`
- `system4-neural-brain/src/api/server.ts`

## Integration reminders (canonical)
- Canonical contracts and registry live in `suite-contracts`.
- Gateway is the single entrypoint for edge apps (`edge-gateway-worker`).
- Canonical system overview lives in `ecosystem-docs/SYSTEM_MAP.md`.
