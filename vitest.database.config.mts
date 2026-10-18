import { existsSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

if (existsSync(".env.local")) process.loadEnvFile(".env.local");
const databaseUrl = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL_UNPOOLED;
if (!databaseUrl)
  throw new Error(
    "Configure TEST_DATABASE_URL or DATABASE_URL_UNPOOLED for isolated database tests.",
  );

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL(".", import.meta.url)),
      "server-only": fileURLToPath(new URL("./tests/server-only.ts", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["tests/database.integration.ts"],
    testTimeout: 180_000,
    hookTimeout: 60_000,
    env: {
      DATABASE_URL: databaseUrl,
      TRACKING_TEST_SCHEMA: `tracking_test_${randomBytes(8).toString("hex")}`,
    },
  },
});
