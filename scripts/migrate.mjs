import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import postgres from "postgres";
import { loadDatabaseEnvironment } from "./database-env.mjs";

loadDatabaseEnvironment();
const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
if (!url) throw new Error("Configure DATABASE_URL_UNPOOLED before running migrations.");
const sql = postgres(url, { max: 1, prepare: false, connect_timeout: 10 });
try {
  await sql.begin(async (transaction) => {
    await transaction`SELECT pg_advisory_xact_lock(713982641)`;
    await transaction`CREATE SCHEMA IF NOT EXISTS tracking`;
    await transaction`CREATE TABLE IF NOT EXISTS tracking.schema_migrations (name text PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())`;
    const applied = await transaction`SELECT name, checksum FROM tracking.schema_migrations`;
    for (const name of (await readdir("migrations"))
      .filter((file) => file.endsWith(".sql"))
      .sort()) {
      const source = await readFile(`migrations/${name}`, "utf8");
      const checksum = createHash("sha256").update(source).digest("hex");
      const previous = applied.find((entry) => entry.name === name);
      if (previous) {
        if (previous.checksum !== checksum)
          throw new Error(`Applied migration has changed: ${name}`);
        continue;
      }
      await transaction.unsafe(source);
      await transaction`INSERT INTO tracking.schema_migrations (name, checksum) VALUES (${name}, ${checksum})`;
      console.log(`Applied ${name}`);
    }
  });
  console.log("Database migrations are up to date.");
} catch {
  console.error(
    "Migration failed. Check database connectivity, permissions, and migration history.",
  );
  process.exitCode = 1;
} finally {
  await sql.end();
}
