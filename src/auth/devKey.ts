import type { Env } from "../env";

/**
 * Check if development mode is enabled.
 * Throws an error if BRAIN_DEV_ENABLED is not "true".
 */
export function requireDev(env: Env): void {
  if (env.BRAIN_DEV_ENABLED !== "true") {
    throw new Error("Development mode is not enabled");
  }
}

/**
 * Verify the x-dev-key header matches the configured BRAIN_DEV_KEY.
 * Also checks that dev mode is enabled.
 * Throws an error if verification fails.
 */
export function requireDevKey(req: Request, env: Env): void {
  requireDev(env);

  const providedKey = req.headers.get("x-dev-key");

  if (!providedKey) {
    throw new Error("Missing x-dev-key header");
  }

  if (!env.BRAIN_DEV_KEY) {
    throw new Error("BRAIN_DEV_KEY is not configured");
  }

  if (providedKey !== env.BRAIN_DEV_KEY) {
    throw new Error("Invalid dev key");
  }
}
