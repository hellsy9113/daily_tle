import { existsSync } from "node:fs";

export function loadDatabaseEnvironment() {
  if (existsSync(".env.local")) process.loadEnvFile(".env.local");
}
