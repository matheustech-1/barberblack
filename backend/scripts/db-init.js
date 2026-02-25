import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import pg from "pg";

dotenv.config({
  path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", ".env")
});

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("Missing required env var: DATABASE_URL");
  process.exit(1);
}

const schemaPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "sql", "schema.sql");

async function run() {
  const sql = await fs.readFile(schemaPath, "utf8");
  const pool = new pg.Pool({
    connectionString: databaseUrl
  });

  try {
    await pool.query(sql);
    console.log("Database initialized successfully.");
  } catch (error) {
    console.error("Failed to initialize database.");
    if (error && typeof error === "object") {
      if ("message" in error) console.error(`message: ${error.message}`);
      if ("code" in error) console.error(`code: ${error.code}`);
    }
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

run();

