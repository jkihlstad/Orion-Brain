import type { SearchResult } from "../types";

export async function lancedbInsert(env: {
  LANCEDB_API_URL: string; LANCEDB_API_KEY?: string;
}, table: string, row: any) {
  const res = await fetch(`${env.LANCEDB_API_URL}/insert`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(env.LANCEDB_API_KEY ? { "authorization": `Bearer ${env.LANCEDB_API_KEY}` } : {})
    },
    body: JSON.stringify({ table, row })
  });
  if (!res.ok) throw new Error("LanceDB insert failed");
}

export async function lancedbSearch(env: {
  LANCEDB_API_URL: string; LANCEDB_API_KEY?: string;
}, args: { table: string; vector: number[]; topK: number; filters: Record<string, any> }) {
  const res = await fetch(`${env.LANCEDB_API_URL}/search`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(env.LANCEDB_API_KEY ? { "authorization": `Bearer ${env.LANCEDB_API_KEY}` } : {})
    },
    body: JSON.stringify(args)
  });
  if (!res.ok) throw new Error("LanceDB search failed");
  return (await res.json()) as Array<{ eventId: string; score: number; metadata: any }>;
}

export async function lancedbBackfillCluster(env: {
  LANCEDB_API_URL: string; LANCEDB_API_KEY?: string;
}, args: {
  table: string;
  userId: string;
  clusterId: string;
  patch: Record<string, any>;
}) {
  const res = await fetch(`${env.LANCEDB_API_URL}/updateByFilter`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(env.LANCEDB_API_KEY ? { "authorization": `Bearer ${env.LANCEDB_API_KEY}` } : {})
    },
    body: JSON.stringify(args)
  });
  if (!res.ok) throw new Error("LanceDB backfill failed");
}
