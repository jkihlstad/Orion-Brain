import * as lancedb from "@lancedb/lancedb";
import { tableFromArrays, Schema, Field, Float32, Utf8, Int32, FixedSizeList } from "apache-arrow";

let dbInstance: lancedb.Connection | null = null;

export async function getDB(): Promise<lancedb.Connection> {
  if (!dbInstance) {
    const dbPath = process.env.LANCEDB_PATH || "./data/lancedb";
    dbInstance = await lancedb.connect(dbPath);
  }
  return dbInstance;
}

export async function insertRow(
  tableName: string,
  row: { id: string; vector: number[]; metadata?: Record<string, any> }
): Promise<void> {
  const db = await getDB();
  const table = await db.openTable(tableName);

  const data = tableFromArrays({
    id: [row.id],
    vector: [row.vector],
    metadata: [JSON.stringify(row.metadata || {})],
  });

  await table.add(data);
}

export async function searchVectors(
  tableName: string,
  queryVector: number[],
  limit: number = 10,
  filter?: string
): Promise<Array<{ id: string; score: number; metadata: Record<string, any> }>> {
  const db = await getDB();
  const table = await db.openTable(tableName);

  let query = table.vectorSearch(queryVector).limit(limit);

  if (filter) {
    query = query.where(filter);
  }

  const results = await query.toArray();

  return results.map((row: any) => ({
    id: row.id,
    score: row._distance ?? 0,
    metadata: typeof row.metadata === "string" ? JSON.parse(row.metadata) : row.metadata || {},
  }));
}

export async function updateByFilter(
  tableName: string,
  filter: string,
  updates: Record<string, any>
): Promise<number> {
  const db = await getDB();
  const table = await db.openTable(tableName);

  // Build SET clause for SQL-like update
  const setClauses = Object.entries(updates)
    .map(([key, value]) => {
      if (typeof value === "string") {
        return `${key} = '${value.replace(/'/g, "''")}'`;
      }
      return `${key} = ${JSON.stringify(value)}`;
    })
    .join(", ");

  await table.update({ where: filter, values: updates });

  return 1; // LanceDB doesn't return affected count
}

export async function createTableIfNotExists(
  tableName: string,
  vectorDim: number
): Promise<void> {
  const db = await getDB();

  const tableNames = await db.tableNames();
  if (tableNames.includes(tableName)) {
    return;
  }

  // Create schema with vector dimension
  const schema = new Schema([
    new Field("id", new Utf8(), false),
    new Field("vector", new FixedSizeList(vectorDim, new Field("item", new Float32(), true)), false),
    new Field("metadata", new Utf8(), true),
  ]);

  // Create empty table with schema
  const seedData = tableFromArrays({
    id: ["__seed__"],
    vector: [new Array(vectorDim).fill(0)],
    metadata: ["{}"],
  });

  await db.createTable(tableName, seedData);

  // Delete seed row
  const table = await db.openTable(tableName);
  await table.delete("id = '__seed__'");
}

export async function listTables(): Promise<string[]> {
  const db = await getDB();
  return db.tableNames();
}
