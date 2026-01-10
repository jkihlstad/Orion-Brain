import type { SweeperWorkerEnv } from "../../../shared/env";
import { log } from "../../../shared/utils/log";

interface SweeperRequestBody {
  dryRun?: boolean;
}

interface Job {
  eventId: string;
  userId: string;
  eventType: string;
  sourceApp: string;
}

export default {
  async fetch(request: Request, env: SweeperWorkerEnv): Promise<Response> {
    if (request.method !== "POST") {
      return new Response(JSON.stringify({ error: "Method not allowed" }), {
        status: 405,
        headers: { "Content-Type": "application/json" },
      });
    }

    try {
      const body: SweeperRequestBody = await request.json();
      const dryRun = body.dryRun === true;

      log(`Sweeper triggered - dryRun: ${dryRun}`);

      // Fetch pending events from Convex
      const convexUrl = env.CONVEX_URL;
      const brainKey = env.BRAIN_KEY;

      const pendingResponse = await fetch(`${convexUrl}/brainListPendingEvents`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Brain-Key": brainKey,
        },
        body: JSON.stringify({ limit: 500 }),
      });

      if (!pendingResponse.ok) {
        const errorText = await pendingResponse.text();
        log(`Failed to fetch pending events: ${errorText}`);
        return new Response(
          JSON.stringify({ error: "Failed to fetch pending events", details: errorText }),
          { status: 500, headers: { "Content-Type": "application/json" } }
        );
      }

      const { jobs }: { jobs: Job[] } = await pendingResponse.json();
      const pendingCount = jobs.length;

      log(`Found ${pendingCount} pending events`);

      if (dryRun) {
        // Dry run mode: return what would be enqueued without actually publishing
        return new Response(
          JSON.stringify({
            ok: true,
            dryRun: true,
            pendingCount,
            wouldEnqueue: jobs.slice(0, 50),
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }

      // Real run: enqueue jobs to the queue
      let enqueued = 0;
      for (const job of jobs) {
        try {
          await env.BRAIN_QUEUE.send(job);
          enqueued++;
        } catch (err) {
          log(`Failed to enqueue job ${job.eventId}: ${err}`);
        }
      }

      log(`Enqueued ${enqueued}/${pendingCount} jobs`);

      return new Response(
        JSON.stringify({
          ok: true,
          dryRun: false,
          pendingCount,
          enqueued,
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    } catch (err) {
      log(`Sweeper error: ${err}`);
      return new Response(
        JSON.stringify({ error: "Internal server error", details: String(err) }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }
  },

  async scheduled(_event: ScheduledEvent, env: SweeperWorkerEnv) {
    log("Sweeper scheduled tick");
    // For scheduled runs, trigger the fetch handler with dryRun=false
    const request = new Request("http://localhost/sweep", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dryRun: false }),
    });
    await this.fetch(request, env);
  },
};
