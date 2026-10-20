import { beforeEach, describe, expect, it, vi } from "vitest";
import { getAccountActivity } from "@/lib/activity/service";
import { getGfgProgress } from "@/lib/gfg/service";
import { getHackerRankProgress } from "@/lib/hackerrank/service";
import { collectNightlyActivity } from "@/lib/tracking/nightly-collection";
import { GET } from "@/app/api/cron/tracking/collect/route";

const { readAccounts } = vi.hoisted(() => ({ readAccounts: vi.fn() }));
vi.mock("@/lib/db/client", () => ({
  db: () => ({ select: () => ({ from: () => ({ where: readAccounts }) }) }),
}));
vi.mock("@/lib/activity/service", () => ({ getAccountActivity: vi.fn() }));
vi.mock("@/lib/gfg/service", () => ({ getGfgProgress: vi.fn() }));
vi.mock("@/lib/hackerrank/service", () => ({ getHackerRankProgress: vi.fn() }));

beforeEach(() => {
  vi.clearAllMocks();
  readAccounts.mockResolvedValue([
    { id: "one", leetcodeUsername: null, gfgUsername: "example", hackerRankUsername: null },
    { id: "two", leetcodeUsername: "example", gfgUsername: null, hackerRankUsername: "example" },
  ]);
  for (const sync of [getAccountActivity, getGfgProgress, getHackerRankProgress])
    vi.mocked(sync).mockResolvedValue({ refreshing: false, refreshFailed: false } as never);
});

describe("nightly activity collection", () => {
  it("requires cron authentication before reading accounts", async () => {
    const response = await GET(new Request("http://localhost/api/cron/tracking/collect"));
    expect(response.status).toBe(401);
    expect(readAccounts).not.toHaveBeenCalled();
  });
  it("checks registered platforms without a browser or Telegram connection", async () => {
    expect(await collectNightlyActivity()).toEqual({ checked: 3, failed: 0, deferred: 0 });
    expect(getGfgProgress).toHaveBeenCalledTimes(1);
    expect(getAccountActivity).toHaveBeenCalledTimes(1);
    expect(getHackerRankProgress).toHaveBeenCalledTimes(1);
    expect(fetch).not.toHaveBeenCalled();
  });
  it("continues other platform checks when one lookup fails", async () => {
    vi.mocked(getGfgProgress).mockRejectedValue(new Error("upstream unavailable"));
    expect(await collectNightlyActivity()).toEqual({ checked: 2, failed: 1, deferred: 0 });
  });
  it("reports retained stale data as failed and active syncs as deferred", async () => {
    vi.mocked(getGfgProgress).mockResolvedValue({ refreshFailed: true } as never);
    vi.mocked(getAccountActivity).mockResolvedValue({ refreshing: true } as never);
    expect(await collectNightlyActivity()).toEqual({ checked: 1, failed: 1, deferred: 1 });
  });
  it("leaves remaining work for future syncs when the execution budget is exhausted", async () => {
    expect(await collectNightlyActivity({ budgetMs: 0 })).toEqual({
      checked: 0,
      failed: 0,
      deferred: 3,
    });
    expect(getGfgProgress).not.toHaveBeenCalled();
  });
});
