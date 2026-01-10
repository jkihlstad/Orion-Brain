import type { ConsumerWorkerEnv } from "../../../shared/env";
import type { BrainJobMessage } from "../../../shared/types";
import { log, errorLog } from "../../../shared/utils/log";
import { processBrainJob } from "./pipeline/processEvent";

function wid() {
  return `cf-worker-${crypto.randomUUID()}`;
}

export default {
  async queue(batch: MessageBatch<BrainJobMessage>, env: ConsumerWorkerEnv) {
    const workerId = wid();

    for (const msg of batch.messages) {
      const job = msg.body;
      const attempt = job.attempt ?? 0;

      try {
        await processBrainJob(env, workerId, job);
        msg.ack();
      } catch (e: any) {
        errorLog("Job failed", job.eventId, e?.message ?? e);

        const nextAttempt = attempt + 1;
        if (nextAttempt <= 5) {
          await env.BRAIN_JOBS.send({ ...job, attempt: nextAttempt });
          msg.ack();
        } else {
          msg.ack();
        }
      }
    }
  }
};
