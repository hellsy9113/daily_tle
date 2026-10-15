import { describe, expect, it, vi } from "vitest";
import {
  getHackerRankProfile,
  HACKERRANK_MAX_PAGES,
  normalizeHackerRankPage,
  parseHackerRankUsername,
} from "@/lib/hackerrank/client";
import { buildHackerRankProgress } from "@/lib/hackerrank/progress";
import { formatHackerRankDailyReport } from "@/lib/hackerrank/format-report";
import {
  challenge,
  hackerRankNow as now,
  hackerRankPage,
  hackerRankProfile,
  storedHackerRank,
} from "./hackerrank-fixtures";

const identity = { status: true, model: { username: "hr_user" } };
describe("HackerRank public profile client", () => {
  it("reads the verified profile and cursor feed, preserving contest identity and earliest timestamps", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(Response.json(identity))
      .mockResolvedValueOnce(Response.json(hackerRankPage([challenge()], "opaque+/=", false)))
      .mockResolvedValueOnce(
        Response.json(
          hackerRankPage([
            challenge("two-sum", "2026-10-12T23:00:00+05:30"),
            challenge("two-sum", "2026-10-13T01:00:00Z", "contest-1"),
          ]),
        ),
      );
    const result = await getHackerRankProfile("HR_User", now);
    expect(result).toMatchObject({ username: "hr_user", historyComplete: true });
    expect(result.problems).toHaveLength(2);
    expect(result.problems[0].solvedAt).toBe("2026-10-12T17:30:00.000Z");
    expect(result.problems[1]).toMatchObject({
      id: "contest-1:two-sum",
      url: "https://www.hackerrank.com/contests/contest-1/challenges/two-sum",
    });
    const urls = vi.mocked(fetch).mock.calls.map(([url]) => new URL(String(url)));
    expect(urls[0].pathname).toBe("/rest/hackers/HR_User");
    expect(urls[1].searchParams.get("response_version")).toBe("v2");
    expect(urls[1].searchParams.get("limit")).toBe("20");
    expect(urls[2].searchParams.get("cursor")).toBe("opaque+/=");
    expect(fetch).toHaveBeenCalledWith(
      expect.any(URL),
      expect.objectContaining({ cache: "no-store", signal: expect.any(AbortSignal) }),
    );
  });
  it("bounds pagination and marks history incomplete without inventing a total", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(Response.json(identity));
    for (let i = 0; i < HACKERRANK_MAX_PAGES; i++)
      vi.mocked(fetch).mockResolvedValueOnce(
        Response.json(hackerRankPage([challenge(`p-${i}`)], `page-${i}`, false)),
      );
    const result = await getHackerRankProfile("hr_user", now);
    expect(result.historyComplete).toBe(false);
    expect(result.problems).toHaveLength(HACKERRANK_MAX_PAGES);
    expect(result).not.toHaveProperty("totalSolved");
    expect(fetch).toHaveBeenCalledTimes(HACKERRANK_MAX_PAGES + 1);
  });
  it("accepts an empty public feed", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(Response.json(identity))
      .mockResolvedValueOnce(Response.json(hackerRankPage([])));
    expect(await getHackerRankProfile("hr_user", now)).toMatchObject({
      problems: [],
      historyComplete: true,
    });
  });
  it("rejects repeated cursors instead of silently treating a loop as complete", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(Response.json(identity))
      .mockImplementation(async () => Response.json(hackerRankPage([challenge()], "same", false)));
    await expect(getHackerRankProfile("hr_user", now)).rejects.toMatchObject({ status: 502 });
    expect(fetch).toHaveBeenCalledTimes(3);
  });
  it.each([404, 429, 503])("handles HTTP %s before parsing an error body", async (status) => {
    vi.mocked(fetch).mockResolvedValue(new Response("private upstream details", { status }));
    await expect(getHackerRankProfile("hr_user", now)).rejects.toMatchObject({
      status: status === 503 ? 502 : status,
    });
  });
  it.each([
    {},
    { status: true, model: { username: "other" } },
    { status: true, model: { username: "invalid/name" } },
  ])("rejects invalid upstream identities", async (data) => {
    vi.mocked(fetch).mockResolvedValue(Response.json(data));
    await expect(getHackerRankProfile("hr_user", now)).rejects.toMatchObject({ status: 502 });
  });
  it("handles a deleted account and malformed JSON safely", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      Response.json({ status: true, model: { username: "hr_user", deleted: true } }),
    );
    await expect(getHackerRankProfile("hr_user", now)).rejects.toMatchObject({ status: 404 });
    vi.mocked(fetch).mockResolvedValueOnce(new Response("private malformed body"));
    await expect(getHackerRankProfile("hr_user", now)).rejects.toMatchObject({ status: 502 });
  });
  it("returns a safe timeout error", async () => {
    vi.mocked(fetch).mockRejectedValue(new DOMException("private details", "TimeoutError"));
    await expect(getHackerRankProfile("hr_user", now)).rejects.toMatchObject({
      status: 504,
      message: "Could not read HackerRank's public profile. Try again shortly.",
    });
  });
  it.each(["../user", "a/b", "a?b", "", "user name", "a".repeat(101), null])(
    "rejects invalid usernames before making requests (%s)",
    async (value) => {
      expect(() => parseHackerRankUsername(value)).toThrow();
      await expect(getHackerRankProfile(value)).rejects.toMatchObject({ status: 400 });
      expect(fetch).not.toHaveBeenCalled();
    },
  );
  it.each([
    { created_at: "2026-10-13 22:00:00" },
    { created_at: "2026-02-31T22:00:00Z" },
    { created_at: "0000-01-01T00:00:00Z" },
    { url: "https://attacker.example/challenge" },
    { ch_slug: "../unsafe" },
    { con_slug: "../unsafe" },
    { name: "" },
  ])("rejects unsafe or ambiguous challenge data (%j)", (override) => {
    expect(() =>
      normalizeHackerRankPage(hackerRankPage([{ ...challenge(), ...override }])),
    ).toThrow();
  });
});

describe("HackerRank calendar and recaps", () => {
  it("groups saved history by IST, excludes future dates, and leaves unavailable days unknown", () => {
    const profile = hackerRankProfile("hr_user", ["before", "today", "future"]);
    profile.problems[0].solvedAt = "2026-10-13T18:29:59.000Z";
    profile.problems[1].solvedAt = "2026-10-13T18:30:00.000Z";
    profile.problems[2].solvedAt = "2026-10-15T18:30:00.000Z";
    const result = buildHackerRankProgress(profile, storedHackerRank(profile), [], now);
    expect(result).toMatchObject({ savedSolved: 3, solvedToday: 1, solvedThisWeek: 2 });
    expect(result.days).toHaveLength(365);
    expect(result.days.find((day) => day.date === "2026-10-13")).toMatchObject({
      count: 1,
      coverage: "partial",
    });
    expect(result.days.find((day) => day.date === "2026-10-14")).toMatchObject({
      count: 1,
      coverage: "partial",
    });
    expect(result.days.find((day) => day.date === "2026-10-12")).toMatchObject({
      count: 0,
      coverage: "unknown",
    });
    expect(result.days.some((day) => day.coverage === "complete")).toBe(false);
  });
  it("uses the stored report period, includes previously saved problems, and keeps earliest dates for re-solves", () => {
    const saved = hackerRankProfile("hr_user", ["saved-yesterday", "old-problem"]);
    saved.problems[1].solvedAt = "2026-10-10T02:00:00.000Z";
    const latest = hackerRankProfile("hr_user", ["old-problem"]);
    const text = formatHackerRankDailyReport(latest, storedHackerRank(saved), now).join("\n");
    expect(text).toContain("1 unique solved challenges");
    expect(text).toContain("https://www.hackerrank.com/challenges/saved-yesterday");
    expect(text).not.toContain("https://www.hackerrank.com/challenges/old-problem");
    expect(text).toContain("13 Oct 2026");
    expect(text).toContain("first-ever solve dates are not guaranteed");
  });
  it("suppresses a HackerRank report without yesterday's challenges even when history is incomplete", () => {
    expect(
      formatHackerRankDailyReport(
        { ...hackerRankProfile("hr_user", []), historyComplete: false },
        [],
        now,
      ),
    ).toEqual([]);
  });
  it("splits large recaps at Telegram's message limit", () => {
    const profile = hackerRankProfile(
      "hr_user",
      Array.from({ length: 100 }, (_, i) => `problem-${i}`),
    );
    const parts = formatHackerRankDailyReport(profile, [], now);
    expect(parts.length).toBeGreaterThan(1);
    expect(parts.every((part) => part.length <= 4096)).toBe(true);
    expect(parts.join("\n")).toContain("https://www.hackerrank.com/challenges/problem-99");
  });
});
