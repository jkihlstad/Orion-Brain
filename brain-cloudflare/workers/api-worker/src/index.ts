import type { ApiWorkerEnv } from "../../../shared/env";
import { json } from "../../../shared/utils/json";
import { verifyClerkJwtSkeleton } from "../../../shared/adapters/clerk";
import { handleSearch } from "./routes/search";
import { handleInsights } from "./routes/insights";

export default {
  async fetch(req: Request, env: ApiWorkerEnv): Promise<Response> {
    try {
      const url = new URL(req.url);

      // Auth (Dashboard calls)
      const identity = await verifyClerkJwtSkeleton({
        authHeader: req.headers.get("authorization"),
        expectedIssuer: env.CLERK_JWT_ISSUER || undefined,
        expectedAudience: env.CLERK_JWT_AUDIENCE || undefined
      });

      if (req.method === "POST" && url.pathname === "/v1/brain/search") {
        return await handleSearch(req, env, identity.sub);
      }
      if (req.method === "POST" && url.pathname === "/v1/brain/insights") {
        return await handleInsights(req, env, identity.sub);
      }

      return json({ error: "Not found" }, { status: 404 });
    } catch (e: any) {
      return json({ error: e?.message ?? "Internal error" }, { status: 500 });
    }
  }
};
