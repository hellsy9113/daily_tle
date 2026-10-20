import { beforeEach, describe, expect, it, vi } from "vitest";
import { getAccountActivity } from "@/lib/activity/service";
import { getGfgProgress } from "@/lib/gfg/service";
import { getHackerRankProgress } from "@/lib/hackerrank/service";
import { getCodeforcesProgress } from "@/lib/codeforces/service";
import { collectNightlyActivity } from "@/lib/tracking/nightly-collection";
import { GET } from "@/app/api/cron/tracking/collect/route";

const { readAccounts } = vi.hoisted(() => ({ readAccounts: vi.fn() }));
vi.mock("@/lib/db/client", () => ({
  db: () => ({ select: () => ({ from: () => ({ where: readAccounts }) }) }),
}));
vi.mock("@/lib/activity/service", () => ({ getAccountActivity: vi.fn() }));
vi.mock("@/lib/gfg/service", () => ({ getGfgProgress: vi.fn() }));
vi.mock("@/lib/hackerrank/service", () => ({ getHackerRankProgress: vi.fn() }));
vi.mock("@/lib/codeforces/service", () => ({ getCodeforcesProgress: vi.fn() }));

beforeEach(() => {
  vi.clearAllMocks();
  readAccounts.mockResolvedValue([
    { id: "one", leetcodeUsername: null, gfgUsername: "example", hackerRankUsername: null },
    { id: "two", leetcodeUsername: "example", gfgUsername: null, hackerRankUsername: "example" },
  ]);
  for (const sync of [
    getAccountActivity,
    getGfgProgress,
    getHackerRankProgress,
    getCodeforcesProgress,
  ])
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
  it("collects a Codeforces-only account while Telegram delivery is paused", async () => {
    const account = {
      id: "codeforces-only",
      codeforcesUsername: "tourist",
      leetcodeUsername: null,
      gfgUsername: null,
      hackerRankUsername: null,
      status: "paused",
      chatId: null,
    };
    readAccounts.mockResolvedValue([account]);
    expect(await collectNightlyActivity()).toEqual({ checked: 1, failed: 0, deferred: 0 });
    expect(getCodeforcesProgress).toHaveBeenCalledExactlyOnceWith(account);
    expect(getAccountActivity).not.toHaveBeenCalled();
    expect(getGfgProgress).not.toHaveBeenCalled();
    expect(getHackerRankProgress).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });
  it("records Codeforces stale data and leased refreshes without reporting success", async () => {
    readAccounts.mockResolvedValue([
      { id: "stale", codeforcesUsername: "stale" },
      { id: "leased", codeforcesUsername: "leased" },
    ]);
    vi.mocked(getCodeforcesProgress)
      .mockResolvedValueOnce({ refreshFailed: true } as never)
      .mockResolvedValueOnce({ refreshing: true } as never);
    expect(await collectNightlyActivity()).toEqual({ checked: 0, failed: 1, deferred: 1 });
  });
  it("serializes Codeforces lookups while other platforms continue in parallel", async () => {
    const first = { id: "first", codeforcesUsername: "first" };
    const second = { id: "second", codeforcesUsername: "second", gfgUsername: "example" };
    readAccounts.mockResolvedValue([first, second]);
    let finishFirst!: () => void;
    const gate = new Promise<void>((resolve) => {
      finishFirst = resolve;
    });
    vi.mocked(getCodeforcesProgress).mockImplementationOnce(async () => {
      await gate;
      return { refreshing: false, refreshFailed: false } as never;
    });
    const pending = collectNightlyActivity();
    await vi.waitFor(() => {
      expect(getCodeforcesProgress).toHaveBeenCalledTimes(1);
      expect(getGfgProgress).toHaveBeenCalledExactlyOnceWith(second);
    });
    finishFirst();
    expect(await pending).toEqual({ checked: 3, failed: 0, deferred: 0 });
    expect(getCodeforcesProgress).toHaveBeenNthCalledWith(2, second);
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
