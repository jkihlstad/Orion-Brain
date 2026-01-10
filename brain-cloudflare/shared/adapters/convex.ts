import type { BrainJobMessage, ConvexEvent } from "../types";
import { errorLog } from "../utils/log";

export async function convexLeaseSpeakerLabels(env: {
  CONVEX_BRAIN_API_URL: string;
  CONVEX_BRAIN_API_KEY: string;
}, args: { workerId: string; limit: number }) {
  const res = await fetch(`${env.CONVEX_BRAIN_API_URL}/brain/leaseSpeakerLabelEvents`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-brain-key": env.CONVEX_BRAIN_API_KEY
    },
    body: JSON.stringify(args)
  });
  if (!res.ok) {
    const t = await res.text();
    errorLog("Convex lease error", res.status, t);
    throw new Error("Convex lease failed");
  }
  return (await res.json()) as ConvexEvent[];
}

export async function convexAckDone(env: {
  CONVEX_BRAIN_API_URL: string;
  CONVEX_BRAIN_API_KEY: string;
}, args: { eventId: string; workerId: string }) {
  const res = await fetch(`${env.CONVEX_BRAIN_API_URL}/brain/ackDone`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-brain-key": env.CONVEX_BRAIN_API_KEY },
    body: JSON.stringify(args)
  });
  if (!res.ok) throw new Error("Convex ack done failed");
}

export async function convexAckFailed(env: {
  CONVEX_BRAIN_API_URL: string;
  CONVEX_BRAIN_API_KEY: string;
}, args: { eventId: string; workerId: string; error: string; retry?: boolean }) {
  const res = await fetch(`${env.CONVEX_BRAIN_API_URL}/brain/ackFailed`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-brain-key": env.CONVEX_BRAIN_API_KEY },
    body: JSON.stringify(args)
  });
  if (!res.ok) throw new Error("Convex ack failed failed");
}

export async function convexCreateLabelSpeakerPrompt(env: {
  CONVEX_BRAIN_API_URL: string;
  CONVEX_BRAIN_API_KEY: string;
}, payload: {
  userId: string;
  clusterId: string;
  sampleCount: number;
  exampleMediaRefs?: string[];
}) {
  const res = await fetch(`${env.CONVEX_BRAIN_API_URL}/brain/createLabelSpeakerPrompt`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-brain-key": env.CONVEX_BRAIN_API_KEY },
    body: JSON.stringify(payload)
  });
  if (!res.ok) throw new Error("Convex create prompt failed");
}
