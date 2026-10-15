import { describe, expect, it, vi } from "vitest";
import { getGfgProfile } from "@/lib/gfg/client";
import { normalizeGfgProfile, gfgTimestamp } from "@/lib/gfg/transform";
import { parseGfgUsername, parseGfgQuery } from "@/lib/gfg/validation";
import { buildGfgProgress, monday } from "@/lib/gfg/progress";
import { formatGfgDailyReport } from "@/lib/gfg/format-report";
import type { GfgProfile, StoredGfgProblem } from "@/lib/gfg/types";

const now = new Date("2026-10-14T03:00:00Z");
const problem = (slug: string, time: unknown = "2026-10-13 22:40:24") => ({
  slug,
  pname: slug,
  lang: "python3",
  user_subtime: time,
});
const profile = { data: { total_problems_solved: 2 } };
const submissions = {
  status: "success",
  count: 2,
  result: {
    Easy: { "703173": problem("two-sum") },
    Medium: { "703174": problem("valid-parentheses") },
  },
};
const normalized = () => normalizeGfgProfile("example", profile, submissions, now);
const stored = (data: GfgProfile, baseline = true): StoredGfgProblem[] =>
  data.problems.map((item) => ({ ...item, baseline, firstObservedAt: now.toISOString() }));

describe("verified GFG response normalization", () => {
  it("uses the verified profile and solved-inventory shapes, preserving ambiguous timestamp text", () => {
    const data = normalized();
    expect(data).toMatchObject({
      totalSolved: 2,
      historyComplete: true,
      difficultyBreakdown: { School: 0, Basic: 0, Easy: 1, Medium: 1, Hard: 0 },
    });
    expect(data.problems[0]).toMatchObject({
      id: "two-sum",
      status: "Accepted",
      acceptedAt: null,
      reportedSubmissionTime: "2026-10-13 22:40:24",
    });
    expect(data.problems[0].url).toBe("https://www.geeksforgeeks.org/problems/two-sum/1");
  });
  it("deduplicates by slug and chooses the earliest available qualified acceptance", () => {
    const data = normalizeGfgProfile(
      "example",
      { data: { total_problems_solved: 1 } },
      {
        status: "success",
        count: 1,
        result: {
          Easy: {
            a: problem("same", "2026-10-13T22:00:00Z"),
            b: problem("same", "2026-10-12T22:00:00Z"),
            c: { ...problem("rejected"), status: "Wrong Answer" },
          },
        },
      },
      now,
    );
    expect(data.problems).toHaveLength(1);
    expect(data.problems[0].acceptedAt).toBe("2026-10-12T22:00:00.000Z");
  });
  it("accepts an empty inventory without inventing historical activity", () => {
    const empty = normalizeGfgProfile(
      "example",
      { data: { total_problems_solved: 0 } },
      { status: "success", count: 0, result: {} },
      now,
    );
    expect(empty).toMatchObject({ totalSolved: 0, problems: [], historyComplete: true });
    expect(buildGfgProgress(empty, [], [], now)).toMatchObject({
      solvedToday: null,
      solvedThisWeek: null,
      observedToday: 0,
    });
  });
  it("marks discrepancies between the total and inventory as incomplete", () => {
    expect(
      normalizeGfgProfile("example", { data: { total_problems_solved: 3 } }, submissions, now)
        .historyComplete,
    ).toBe(false);
  });
  it.each([
    null,
    { status: "failed" },
    { status: "success", count: 1, result: { Easy: { a: { slug: "bad/path", pname: "bad" } } } },
    { status: "success", count: 1, result: { Easy: [] } },
  ])("rejects malformed inventory %j", (value) => {
    expect(() => normalizeGfgProfile("example", profile, value, now)).toThrow();
  });
  it.each([undefined, null, "bad", "2026-10-13 23:59:00"])(
    "does not guess an acceptance timestamp for %j",
    (time) => expect(gfgTimestamp(time)).toBeNull(),
  );
});

describe("GFG validation and upstream communication", () => {
  it("preserves a rate-limit status even when the error body is not JSON", async () => {
    vi.mocked(fetch).mockResolvedValue(new Response("Too many requests", { status: 429 }));
    await expect(getGfgProfile("example")).rejects.toMatchObject({ status: 429 });
  });
  it.each(["", "two words", "../name", "https://gfg.example/user", "x".repeat(101), null])(
    "rejects invalid username %j before network access",
    async (value) => {
      await expect(getGfgProfile(value)).rejects.toMatchObject({ status: 400 });
      expect(fetch).not.toHaveBeenCalled();
    },
  );
  it("requests the public endpoints with the verified methods and body", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(Response.json(profile))
      .mockResolvedValueOnce(Response.json(submissions));
    expect((await getGfgProfile(" Mixed_User ", now)).username).toBe("Mixed_User");
    expect(String(vi.mocked(fetch).mock.calls[0][0])).toContain("handle=Mixed_User");
    expect(JSON.parse(String(vi.mocked(fetch).mock.calls[1][1]?.body))).toEqual({
      handle: "Mixed_User",
      requestType: "",
      year: "",
      month: "",
    });
    expect(vi.mocked(fetch).mock.calls[1][1]?.method).toBe("POST");
  });
  it.each([
    [400, { message: "User not found!" }, 404],
    [429, { message: "rate limit" }, 429],
    [503, {}, 502],
  ])("maps upstream status %s safely", async (status, body, expected) => {
    vi.mocked(fetch).mockResolvedValue(Response.json(body, { status }));
    await expect(getGfgProfile("example")).rejects.toMatchObject({ status: expected });
  });
  it("maps timeouts and non-JSON failures without leaking upstream details", async () => {
    vi.mocked(fetch).mockRejectedValueOnce(
      new DOMException("private upstream detail", "TimeoutError"),
    );
    await expect(getGfgProfile("example")).rejects.toMatchObject({ status: 504 });
    vi.mocked(fetch).mockResolvedValueOnce(new Response("private gateway detail"));
    await expect(getGfgProfile("example")).rejects.toMatchObject({ status: 502 });
  });
  it("validates periods, ISO bounds, and the explicit timezone", () => {
    expect(parseGfgUsername(" example ")).toBe("example");
    expect(
      parseGfgQuery(
        new URLSearchParams("period=weekly&includeProblems=true&timezone=Asia/Kolkata"),
      ),
    ).toMatchObject({ period: "weekly", includeProblems: true });
    for (const query of [
      "period=bad",
      "includeProblems=1",
      "startDate=2026-02-31",
      "endDate=2026-13-01",
      "timezone=UTC",
      "startDate=2026-10-14&endDate=2026-10-13",
    ])
      expect(() => parseGfgQuery(new URLSearchParams(query))).toThrow();
  });
});

describe("GFG activity and daily reports", () => {
  it("includes yesterday's saved observations even when a dashboard check already saved the inventory", () => {
    const data = normalized();
    const saved = stored(data, false).map((problem) => ({
      ...problem,
      firstObservedAt: "2026-10-13T02:00:00.000Z",
    }));
    const text = formatGfgDailyReport(data, saved, now).join("\n");
    expect(text).toContain("Newly observed during yesterday's checks");
    expect(text).toContain("https://www.geeksforgeeks.org/problems/two-sum/1");
    expect(text).toContain("exact solved count is unavailable");
  });
  it("does not move a previously dated problem into yesterday when it is re-solved", () => {
    const first = normalizeGfgProfile(
      "example",
      { data: { total_problems_solved: 1 } },
      {
        status: "success",
        count: 1,
        result: { Easy: { a: problem("same", "2026-10-10T22:00:00Z") } },
      },
      now,
    );
    const latest = {
      ...first,
      problems: first.problems.map((item) => ({ ...item, acceptedAt: "2026-10-13T02:00:00.000Z" })),
    };
    const text = formatGfgDailyReport(latest, stored(first), now).join("\n");
    expect(text).toBe("");
    expect(text).not.toContain("https://www.geeksforgeeks.org/problems/same/");
  });
  it("applies ISO bounds before grouping a partial Monday week", () => {
    const data = normalizeGfgProfile(
      "example",
      profile,
      {
        ...submissions,
        result: {
          Easy: {
            a: problem("monday", "2026-10-12T00:00:00Z"),
            b: problem("tuesday", "2026-10-13T00:00:00Z"),
          },
        },
      },
      now,
    );
    const result = buildGfgProgress(data, stored(data), [], now, {
      period: "weekly",
      includeProblems: false,
      startDate: "2026-10-13",
      endDate: "2026-10-14",
    });
    expect(result.weeklySolved).toEqual([{ weekStart: "2026-10-12", count: 1 }]);
  });
  it("keeps cumulative totals separate from observation activity and excludes the baseline", () => {
    const data = normalized();
    expect(buildGfgProgress(data, stored(data), [], now)).toMatchObject({
      solvedToday: null,
      dailySolved: null,
      weeklySolved: null,
      observedToday: 0,
    });
    const result = buildGfgProgress(
      data,
      stored(data, false),
      [{ date: "2026-10-14", totalSolved: 2 }],
      now,
    );
    expect(result).toMatchObject({
      observedToday: 2,
      observedThisWeek: 2,
      dateBasis: "observation",
    });
    expect(result.days.at(-1)).toMatchObject({ count: 2, coverage: "partial" });
  });
  it("uses Monday weeks and IST boundaries for qualified timestamps", () => {
    const data = normalizeGfgProfile(
      "example",
      profile,
      {
        ...submissions,
        result: {
          Easy: {
            a: problem("sunday", "2026-10-11T18:29:59Z"),
            b: problem("monday", "2026-10-11T18:30:00Z"),
          },
        },
      },
      now,
    );
    const result = buildGfgProgress(data, stored(data), [], now);
    expect(monday("2026-10-11")).toBe("2026-10-05");
    expect(result.solvedThisWeek).toBe(1);
    expect(result.weeklySolved).toEqual([
      { weekStart: "2026-10-05", count: 1 },
      { weekStart: "2026-10-12", count: 1 },
    ]);
  });
  it("does not include today's observations or the initial inventory in yesterday's recap", () => {
    const data = normalized();
    expect(formatGfgDailyReport(data, stored(data).slice(0, 1), now)).toEqual([]);
    expect(formatGfgDailyReport(data, [], now)).toEqual([]);
    expect(formatGfgDailyReport(data, stored(data, false), now)).toEqual([]);
  });
  it("keeps yesterday's saved dated problems even if the current inventory omits them", () => {
    const data = normalized();
    const saved = stored(data).map((problem) => ({
      ...problem,
      acceptedAt: "2026-10-13T02:00:00.000Z",
    }));
    const text = formatGfgDailyReport({ ...data, problems: [] }, saved, now).join("\n");
    expect(text).toContain("two-sum");
    expect(text).toContain("2 unique problems have an available accepted timestamp");
  });
});
