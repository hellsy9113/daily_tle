import { beforeEach, describe, expect, it, vi } from "vitest";
import { requireAccount } from "@/lib/auth/session";
import { getActivityDay } from "@/lib/activity/details";
import { getWeeklyGoal, saveWeeklyGoal } from "@/lib/activity/goals";
import { GET as day } from "@/app/api/tracking/activity/day/route";
import { GET as goal, PUT as save } from "@/app/api/tracking/goal/route";
import { ApiError } from "@/lib/http/api-error";
import type { Account } from "@/lib/db/schema";

vi.mock("@/lib/auth/session", () => ({ requireAccount: vi.fn() }));
vi.mock("@/lib/activity/details", () => ({ getActivityDay: vi.fn() }));
vi.mock("@/lib/activity/goals", () => ({ getWeeklyGoal: vi.fn(), saveWeeklyGoal: vi.fn() }));
const account = { id: "own", leetcodeUsername: "fixed_user", gfgUsername: "gfg_user" } as Account;
const write = (body: unknown, origin = "http://localhost:3000") =>
  new Request("http://localhost:3000/api/tracking/goal", {
    method: "PUT",
    headers: { Origin: origin, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("APP_URL", "http://localhost:3000");
  vi.mocked(requireAccount).mockResolvedValue(account);
  vi.mocked(getActivityDay).mockResolvedValue({
    date: "2026-10-14",
    basis: "accepted",
    problems: [{ id: "two-sum", title: "Two Sum", url: "https://leetcode.com/problems/two-sum/" }],
  });
  vi.mocked(getWeeklyGoal).mockResolvedValue({ weeklyTarget: 5 });
  vi.mocked(saveWeeklyGoal).mockResolvedValue({ weeklyTarget: 10 });
});
describe("saved day details and weekly goals", () => {
  it("reads only the authenticated account's selected day and prevents caching", async () => {
    const response = await day(
      new Request(
        "http://localhost/api/tracking/activity/day?platform=leetcode&date=2026-10-14&accountId=someone_else",
      ),
    );
    expect(response.status).toBe(200);
    expect(getActivityDay).toHaveBeenCalledExactlyOnceWith(account, "leetcode", "2026-10-14");
    expect((await response.json()).problems[0].title).toBe("Two Sum");
    expect(response.headers.get("cache-control")).toBe("no-store");
  });
  it("requires a session for day reads and all goal operations", async () => {
    vi.mocked(requireAccount).mockRejectedValue(new ApiError(401, "Sign in to continue."));
    expect(
      (
        await day(
          new Request("http://localhost/api/tracking/activity/day?platform=gfg&date=2026-10-14"),
        )
      ).status,
    ).toBe(401);
    expect(
      (await goal(new Request("http://localhost/api/tracking/goal?platform=gfg"))).status,
    ).toBe(401);
    expect((await save(write({ platform: "gfg", weeklyTarget: 10 }))).status).toBe(401);
    expect(getActivityDay).not.toHaveBeenCalled();
    expect(getWeeklyGoal).not.toHaveBeenCalled();
    expect(saveWeeklyGoal).not.toHaveBeenCalled();
  });
  it.each(["platform=other&date=2026-10-14", "platform=gfg&date=2026-02-30", "platform=gfg"])(
    "validates day queries (%s) before accessing saved data",
    async (query) => {
      expect(
        (await day(new Request(`http://localhost/api/tracking/activity/day?${query}`))).status,
      ).toBe(400);
      expect(getActivityDay).not.toHaveBeenCalled();
    },
  );
  it("reads a platform target only for the session account", async () => {
    const response = await goal(
      new Request("http://localhost/api/tracking/goal?platform=gfg&accountId=other"),
    );
    expect(await response.json()).toEqual({ weeklyTarget: 5 });
    expect(getWeeklyGoal).toHaveBeenCalledExactlyOnceWith(account, "gfg");
    expect(response.headers.get("cache-control")).toBe("no-store");
  });
  it("supports Codeforces day details and a separate weekly target", async () => {
    const details = await day(
      new Request(
        "http://localhost/api/tracking/activity/day?platform=codeforces&date=2026-10-14&accountId=other",
      ),
    );
    expect(details.status).toBe(200);
    expect(getActivityDay).toHaveBeenCalledExactlyOnceWith(account, "codeforces", "2026-10-14");
    const saved = await save(write({ platform: "codeforces", weeklyTarget: 12 }));
    expect(saved.status).toBe(200);
    expect(saveWeeklyGoal).toHaveBeenCalledExactlyOnceWith(account, "codeforces", 12);
    expect(saved.headers.get("cache-control")).toBe("no-store");
  });
  it("rejects cross-origin writes and injected account identifiers", async () => {
    expect(
      (await save(write({ platform: "gfg", weeklyTarget: 10 }, "https://attacker.test"))).status,
    ).toBe(403);
    expect(
      (await save(write({ platform: "gfg", weeklyTarget: 10, accountId: "other" }))).status,
    ).toBe(400);
    expect(saveWeeklyGoal).not.toHaveBeenCalled();
  });
  it("saves and removes targets with validated inputs", async () => {
    expect((await save(write({ platform: "leetcode", weeklyTarget: 10 }))).status).toBe(200);
    expect(saveWeeklyGoal).toHaveBeenCalledWith(account, "leetcode", 10);
    vi.mocked(saveWeeklyGoal).mockResolvedValue({ weeklyTarget: null });
    const response = await save(write({ platform: "gfg", weeklyTarget: null }));
    expect(await response.json()).toEqual({ weeklyTarget: null });
    expect(saveWeeklyGoal).toHaveBeenCalledWith(account, "gfg", null);
    expect(response.headers.get("cache-control")).toBe("no-store");
  });
  it("rejects malformed JSON and invalid target values before writing", async () => {
    const malformed = new Request("http://localhost:3000/api/tracking/goal", {
      method: "PUT",
      headers: { Origin: "http://localhost:3000", "Content-Type": "application/json" },
      body: "{",
    });
    expect((await save(malformed)).status).toBe(400);
    expect((await save(write({ platform: "gfg", weeklyTarget: 1.5 }))).status).toBe(400);
    expect(saveWeeklyGoal).not.toHaveBeenCalled();
  });
  it("preserves safe registration errors without exposing unexpected database failures", async () => {
    vi.mocked(getActivityDay).mockRejectedValue(new ApiError(409, "Register GFG first."));
    expect(
      (
        await day(
          new Request("http://localhost/api/tracking/activity/day?platform=gfg&date=2026-10-14"),
        )
      ).status,
    ).toBe(409);
    vi.mocked(saveWeeklyGoal).mockRejectedValue(new Error("private database details"));
    const response = await save(write({ platform: "gfg", weeklyTarget: 5 }));
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "An unexpected error occurred." });
  });
});
