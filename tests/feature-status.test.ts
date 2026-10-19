import { beforeEach, describe, expect, it, vi } from "vitest";
import { trackingStatuses } from "@/lib/features/status";
import type { Account } from "@/lib/db/schema";
import { featureIds } from "@/lib/features/catalog";

const query = vi.hoisted(() => vi.fn());
vi.mock("@/lib/db/client", async () => {
  const { drizzle } = await import("drizzle-orm/pg-proxy");
  return { db: () => drizzle(query) };
});
const account = {
  id: "00000000-0000-4000-8000-000000000001",
  leetcodeUsername: "lc",
  gfgUsername: "gfg",
  hackerRankUsername: null,
  chatId: 101,
  status: "active",
} as Account;

beforeEach(() => {
  query.mockReset();
  query.mockImplementation(async (sql: string) => ({
    rows: sql.includes('"platform_services"')
      ? [
          ["generation-lc", account.id, "leetcode", true, "1", null],
          ["generation-gfg", account.id, "gfg", false, "1", null],
        ]
      : [
          ["leetcode", "2026-10-18", "sent", "2026-10-19T03:00:00Z", true],
          ["gfg", "2026-10-17", "failed", null, false],
        ],
  }));
});

describe("batched private feature status", () => {
  it.each([{ ids: ["leetcode"] as const }, { ids: featureIds }])(
    "uses two account-scoped queries for $ids",
    async ({ ids }) => {
      const statuses = await trackingStatuses(account, ids);
      expect(query).toHaveBeenCalledTimes(2);
      expect(Object.keys(statuses)).toEqual(ids);
      for (const [sql, params] of query.mock.calls) {
        expect(sql).toContain('"account_id"');
        expect(params).toContain(account.id);
        for (const id of ids.filter((id) => id !== "notes")) expect(params).toContain(id);
      }
      expect(statuses.leetcode).toMatchObject({
        username: "lc",
        paused: true,
        registrationId: "generation-lc",
        lastDelivery: { reportDate: "2026-10-18", status: "empty" },
      });
    },
  );
  it("keeps per-service latest reports and unregistered state independent", async () => {
    const statuses = await trackingStatuses(account);
    expect(statuses.gfg?.lastDelivery).toEqual({
      reportDate: "2026-10-17",
      status: "failed",
      sentAt: null,
    });
    expect(statuses.hackerrank).toMatchObject({
      username: null,
      registrationId: null,
      paused: false,
      lastDelivery: null,
    });
    expect(query.mock.calls.find(([sql]) => sql.includes("distinct on"))?.[0]).toMatch(
      /order by.*platform.*report_date.*desc/,
    );
  });
  it("does no database work for an empty selection", async () => {
    expect(await trackingStatuses(account, [])).toEqual({});
    expect(query).not.toHaveBeenCalled();
  });
});
