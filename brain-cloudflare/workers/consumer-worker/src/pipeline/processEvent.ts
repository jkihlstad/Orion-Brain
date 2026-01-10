import type { ConsumerWorkerEnv } from "../../../../shared/env";
import type { BrainJobMessage, ConvexEvent } from "../../../../shared/types";
import { convexAckDone, convexAckFailed, convexLeaseSpeakerLabels } from "../../../../shared/adapters/convex";
import { handleSpeakerClusterLabeled } from "./audio";

export async function processBrainJob(env: ConsumerWorkerEnv, workerId: string, job: BrainJobMessage) {
  if (job.eventType === "speaker_cluster_labeled") {
    const leased = await convexLeaseSpeakerLabels(env, { workerId, limit: 1 });
    if (!leased.length) return;

    const ev = leased[0] as any as ConvexEvent;

    try {
      await handleSpeakerClusterLabeled(env, ev);
      await convexAckDone(env, { eventId: ev._id, workerId });
    } catch (err: any) {
      await convexAckFailed(env, {
        eventId: ev._id,
        workerId,
        error: err?.message ?? String(err),
        retry: (ev.brainAttempts ?? 0) < 5
      });
      throw err;
    }
  }
}
