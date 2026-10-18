import "server-only";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { ApiError } from "@/lib/http/api-error";
import * as schema from "./schema";

type Database = ReturnType<typeof createDatabase>;
const globalDatabase = globalThis as typeof globalThis & { trackingDatabase?: Database };

function createDatabase(url: string) {
  const client = postgres(url, {
    max: 5,
    prepare: false,
    connect_timeout: process.env.NODE_ENV === "test" ? 30 : 10,
    idle_timeout: 20,
    connection: { statement_timeout: 10000 },
  });
  return drizzle(client, { schema });
}

export function db(): Database {
  if (!globalDatabase.trackingDatabase) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new ApiError(503, "Tracking setup is unavailable. Try again later.");
    globalDatabase.trackingDatabase = createDatabase(url);
  }
  return globalDatabase.trackingDatabase;
}

export async function closeDatabase(): Promise<void> {
  await globalDatabase.trackingDatabase?.$client.end();
  delete globalDatabase.trackingDatabase;
}
