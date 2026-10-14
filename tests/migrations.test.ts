import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const database = vi.hoisted(() => ({ begin: vi.fn(), end: vi.fn() }));
vi.mock("postgres", () => ({ default: () => database }));
vi.mock("../scripts/database-env.mjs", () => ({ loadDatabaseEnvironment: vi.fn() }));

const originalExitCode = process.exitCode;

beforeEach(() => {
  vi.resetModules();
  database.begin.mockReset();
  database.end.mockReset().mockResolvedValue(undefined);
  vi.stubEnv("DATABASE_URL_UNPOOLED", "postgres://test:secret@localhost/test");
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  process.exitCode = originalExitCode;
});

describe("migration failures", () => {
  it.each([
    ["ETIMEDOUT", "Database connection timed out"],
    ["28P01", "Database authentication failed"],
    ["42501", "Database permissions are insufficient"],
    ["postgres://test:secret@localhost/test", "[UNKNOWN]"],
  ])("reports %s without leaking connection details", async (code, expected) => {
    database.begin.mockRejectedValue(
      Object.assign(new Error("Connection failed: postgres://test:secret@localhost/test"), {
        code,
      }),
    );

    await import("../scripts/migrate.mjs");

    const output = vi.mocked(console.error).mock.calls.flat().join(" ");
    expect(output).toContain(expected);
    expect(output).not.toContain("postgres://");
    expect(output).not.toContain("secret");
    expect(process.exitCode).toBe(1);
    expect(database.end).toHaveBeenCalledOnce();
  });

  it("identifies a changed historical migration without applying SQL", async () => {
    const transaction = Object.assign(
      vi.fn(async (parts: TemplateStringsArray) =>
        parts[0].includes("SELECT name, checksum")
          ? [{ name: "0001_tracking.sql", checksum: "changed" }]
          : [],
      ),
      { unsafe: vi.fn() },
    );
    database.begin.mockImplementation(async (run) => run(transaction));

    await import("../scripts/migrate.mjs");

    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining("(0001_tracking.sql) [MIGRATION_CHANGED]"),
    );
    expect(transaction.unsafe).not.toHaveBeenCalled();
    expect(database.end).toHaveBeenCalledOnce();
  });

  it("identifies a failed SQL migration without logging its query", async () => {
    const transaction = Object.assign(vi.fn().mockResolvedValue([]), {
      unsafe: vi
        .fn()
        .mockRejectedValue(Object.assign(new Error("sensitive SQL text"), { code: "42601" })),
    });
    database.begin.mockImplementation(async (run) => run(transaction));

    await import("../scripts/migrate.mjs");

    const output = vi.mocked(console.error).mock.calls.flat().join(" ");
    expect(output).toContain("(0001_tracking.sql) [42601]");
    expect(output).not.toContain("sensitive SQL text");
    expect(database.end).toHaveBeenCalledOnce();
  });
});
