import type { ConsumerWorkerEnv } from "../../../../shared/env";
import type { ConvexEvent } from "../../../../shared/types";
import { neo4jUpsertContactAndLinkCluster } from "../../../../shared/adapters/neo4j";
import { lancedbBackfillCluster } from "../../../../shared/adapters/lancedb";

export async function handleSpeakerClusterLabeled(env: ConsumerWorkerEnv, ev: ConvexEvent) {
  const metrics = ev.modality?.metrics ?? {};
  const clusterId = String(metrics.clusterId ?? "");
  const displayName = String(metrics.displayName ?? "");
  const category = String(metrics.category ?? "");

  if (!clusterId || !displayName || !category) {
    throw new Error(`Invalid speaker label payload: ${JSON.stringify(metrics)}`);
  }

  const contactId = await neo4jUpsertContactAndLinkCluster(env, {
    userId: String(ev.userId),
    clusterId,
    displayName,
    category
  });

  await lancedbBackfillCluster(env, {
    table: "audio_segments",
    userId: String(ev.userId),
    clusterId,
    patch: {
      contactId,
      displayName,
      category,
      isLabeled: true,
      labeledAt: Date.now(),
      labelVersion: "INC"
    }
  });
}
