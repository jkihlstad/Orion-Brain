// convex/httpActions/_auth.ts
function getBrainApiKey(): string {
  const key = process.env.BRAIN_API_KEY;
  if (!key) throw new Error("Missing BRAIN_API_KEY env var in Convex");
  return key;
}

export function requireBrainKey(req: Request) {
  const expected = getBrainApiKey();
  const provided = req.headers.get("x-brain-key");
  if (!provided || provided !== expected) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "content-type": "application/json; charset=utf-8" },
    });
  }
  return null;
}

export async function readJson<T>(req: Request): Promise<T> {
  const text = await req.text();
  if (!text) throw new Error("Empty JSON body");
  return JSON.parse(text) as T;
}

export function json(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}
