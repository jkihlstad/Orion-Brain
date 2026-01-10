import Fastify from "fastify";
import { config } from "dotenv";
import { insertRow, searchVectors, updateByFilter, listTables } from "./lancedb.js";
import { validateApiKey, validateTable } from "./validate.js";
import { TABLE_DIMENSIONS, validateVector } from "./dims.js";

config();

const fastify = Fastify({ logger: true });

// Health check
fastify.get("/health", async () => ({ status: "ok", tables: await listTables() }));

// Insert vector
fastify.post<{
  Body: { table: string; id: string; vector: number[]; metadata?: Record<string, any> };
}>("/insert", {
  preHandler: validateApiKey,
  handler: async (request, reply) => {
    const { table, id, vector, metadata } = request.body;

    const tableError = validateTable(table);
    if (tableError) return reply.status(400).send({ error: tableError });

    const vectorError = validateVector(table, vector);
    if (vectorError) return reply.status(400).send({ error: vectorError });

    await insertRow(table, { id, vector, metadata });
    return { success: true, id };
  },
});

// Search vectors
fastify.post<{
  Body: { table: string; vector: number[]; limit?: number; filter?: string };
}>("/search", {
  preHandler: validateApiKey,
  handler: async (request, reply) => {
    const { table, vector, limit = 10, filter } = request.body;

    const tableError = validateTable(table);
    if (tableError) return reply.status(400).send({ error: tableError });

    const vectorError = validateVector(table, vector);
    if (vectorError) return reply.status(400).send({ error: vectorError });

    const results = await searchVectors(table, vector, limit, filter);
    return { results };
  },
});

// Update by filter
fastify.post<{
  Body: { table: string; filter: string; updates: Record<string, any> };
}>("/updateByFilter", {
  preHandler: validateApiKey,
  handler: async (request, reply) => {
    const { table, filter, updates } = request.body;

    const tableError = validateTable(table);
    if (tableError) return reply.status(400).send({ error: tableError });

    const affected = await updateByFilter(table, filter, updates);
    return { success: true, affected };
  },
});

const start = async () => {
  try {
    const port = parseInt(process.env.PORT || "8787", 10);
    await fastify.listen({ port, host: "0.0.0.0" });
    console.log(`LanceDB Vector Service running on port ${port}`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();
