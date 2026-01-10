import { sha256Hex } from "../utils/crypto";

export type ClerkIdentity = {
  sub: string;
  iss?: string;
  aud?: string | string[];
  exp?: number;
};

function parseJwt(token: string): any {
  const parts = token.split(".");
  if (parts.length !== 3) throw new Error("Invalid JWT");
  const payload = parts[1];
  const json = atob(payload.replace(/-/g, "+").replace(/_/g, "/"));
  return JSON.parse(json);
}

export async function verifyClerkJwtSkeleton(opts: {
  authHeader: string | null;
  expectedIssuer?: string;
  expectedAudience?: string;
}): Promise<ClerkIdentity> {
  if (!opts.authHeader?.startsWith("Bearer ")) throw new Error("Missing bearer token");
  const token = opts.authHeader.slice("Bearer ".length).trim();

  const payload = parseJwt(token) as ClerkIdentity;

  const now = Math.floor(Date.now() / 1000);
  if (payload.exp && payload.exp < now) throw new Error("Token expired");

  if (opts.expectedIssuer && payload.iss && payload.iss !== opts.expectedIssuer) {
    throw new Error("Issuer mismatch");
  }

  if (opts.expectedAudience && payload.aud) {
    const aud = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
    if (!aud.includes(opts.expectedAudience)) throw new Error("Audience mismatch");
  }

  if (!payload.sub) throw new Error("Missing sub");
  return payload;
}

export async function userScopedKey(userId: string, suffix: string) {
  return `${await sha256Hex(userId)}:${suffix}`;
}
