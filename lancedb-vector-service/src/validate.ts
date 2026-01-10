import { FastifyRequest, FastifyReply } from "fastify";
import { TABLE_DIMENSIONS } from "./dims.js";

export async function validateApiKey(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const apiKey = request.headers["x-api-key"];
  const expectedKey = process.env.LANCEDB_API_KEY;

  if (!expectedKey) {
    return reply.status(500).send({ error: "Server misconfigured: no API key set" });
  }

  if (apiKey !== expectedKey) {
    return reply.status(401).send({ error: "Invalid API key" });
  }
}

export function validateTable(table: string): string | null {
  if (!table || typeof table !== "string") {
    return "Table name is required";
  }

  if (!TABLE_DIMENSIONS[table]) {
    return `Unknown table: ${table}. Valid tables: ${Object.keys(TABLE_DIMENSIONS).join(", ")}`;
  }

  return null;
}
