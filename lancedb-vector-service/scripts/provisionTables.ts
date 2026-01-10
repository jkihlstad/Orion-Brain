import { config } from "dotenv";
import * as lancedb from "@lancedb/lancedb";
import { tableFromArrays, Schema, Field, Float32, Utf8, FixedSizeList } from "apache-arrow";
import { TABLE_DIMENSIONS } from "../src/dims.js";

config();

async function provisionTables() {
  const dbPath = process.env.LANCEDB_PATH || "./data/lancedb";
  console.log(`Provisioning LanceDB tables at: ${dbPath}`);

  const db = await lancedb.connect(dbPath);
  const existingTables = await db.tableNames();

  for (const [tableName, vectorDim] of Object.entries(TABLE_DIMENSIONS)) {
    if (existingTables.includes(tableName)) {
      console.log(`Table "${tableName}" already exists, skipping...`);
      continue;
    }

    console.log(`Creating table "${tableName}" with vector dimension ${vectorDim}...`);

    // Create seed data to establish schema
    const seedData = tableFromArrays({
      id: ["__seed__"],
      vector: [new Array(vectorDim).fill(0)],
      metadata: ["{}"],
    });

    await db.createTable(tableName, seedData);

    // Delete seed row to leave empty table
    const table = await db.openTable(tableName);
    await table.delete("id = '__seed__'");

    console.log(`Table "${tableName}" created successfully`);
  }

  console.log("\nProvisioning complete. Tables:");
  const tables = await db.tableNames();
  for (const t of tables) {
    const table = await db.openTable(t);
    const count = await table.countRows();
    console.log(`  - ${t}: ${count} rows`);
  }
}

provisionTables().catch((err) => {
  console.error("Provisioning failed:", err);
  process.exit(1);
});
