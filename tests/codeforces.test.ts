import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  CODEFORCES_MAX_PAGES,
  CODEFORCES_PAGE_SIZE,
  getCodeforcesProfile,
  normalizeCodeforcesPage,
  parseCodeforcesUsername,
} from "@/lib/codeforces/client";
import { reserveCodeforcesApiSlot } from "@/lib/codeforces/rate-limit";
import { buildCodeforcesProgress } from "@/lib/codeforces/progress";
import { formatCodeforcesDailyReport } from "@/lib/codeforces/format-report";
import { codeforcesProblemUrl } from "@/lib/codeforces/urls";
import type { CodeforcesProfile, StoredCodeforcesProblem } from "@/lib/codeforces/types";

vi.mock("@/lib/codeforces/rate-limit", () => ({ reserveCodeforcesApiSlot: vi.fn(async () => {}) }));

const now = new Date("2026-10-20T03:00:00.000Z");
const at = (instant: string) => Date.parse(instant) / 1000;
const identity = {
  handle: "tourist",
  rating: 3900,
  maxRating: 4000,
  rank: "legendary grandmaster",
  registrationTimeSeconds: at("2010-01-01T00:00:00.000Z"),
};
const envelope = (result: unknown[]) => ({ status: "OK", result });
const submission = (
  id = 123,
  contestId = 2000,
  index = "A",
  instant = "2026-10-19T02:00:00.000Z",
  verdict = "OK",
) => ({
  id,
  contestId,
  creationTimeSeconds: at(instant),
  verdict,
  problem: {
    contestId,
    index,
    name: `Problem ${contestId}${index}`,
    rating: 800,
    tags: ["math", "implementation"],
  },
});
function profile(overrides: Partial<CodeforcesProfile> = {}): CodeforcesProfile {
  return {
    platform: "codeforces",
    username: "tourist",
    rating: 3900,
    maxRating: 4000,
    rank: "legendary grandmaster",
    historyComplete: true,
    historyStart: "2010-01-01T00:00:00.000Z",
    checkedAt: now.toISOString(),
    problems: normalizeCodeforcesPage(envelope([submission()])).problems,
    ...overrides,
  };
}
const stored = (value: CodeforcesProfile): StoredCodeforcesProblem[] =>
  value.problems.map((problem) => ({
    ...problem,
    firstObservedAt: value.checkedAt,
    baseline: true,
  }));

beforeEach(() => {
  vi.mocked(reserveCodeforcesApiSlot).mockReset().mockResolvedValue(undefined);
});

describe("Codeforces supported public API client", () => {
  it("reads the official identity and submission feed without credentials or source-code requests", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(Response.json(envelope([identity])))
      .mockResolvedValueOnce(
        Response.json(
          envelope([
            submission(),
            submission(124),
            submission(125, 2000, "A", "2026-10-18T02:00:00.000Z", "WRONG_ANSWER"),
            submission(126, 2001, "A"),
          ]),
        ),
      );
    const result = await getCodeforcesProfile("TOURIST", now);
    expect(result).toMatchObject({
      username: "tourist",
      rating: 3900,
      maxRating: 4000,
      historyComplete: true,
      historyStart: "2010-01-01T00:00:00.000Z",
      checkedSubmissionIds: [123, 124, 125, 126],
    });
    expect(result.problems).toHaveLength(3);
    expect(new Set(result.problems.map((problem) => problem.id)).size).toBe(2);
    expect(result.problems[0]).toMatchObject({
      submissionId: 123,
      id: "2000:A",
      url: "https://codeforces.com/problemset/problem/2000/A",
    });
    const urls = vi.mocked(fetch).mock.calls.map(([url]) => new URL(String(url)));
    expect(urls.map((url) => url.pathname)).toEqual(["/api/user.info", "/api/user.status"]);
    expect(urls[0].searchParams.get("handles")).toBe("TOURIST");
    expect(urls[1].searchParams.get("handle")).toBe("tourist");
    expect(urls[1].searchParams.get("from")).toBe("1");
    expect(urls[1].searchParams.get("count")).toBe(String(CODEFORCES_PAGE_SIZE));
    expect(reserveCodeforcesApiSlot).toHaveBeenCalledTimes(2);
    expect(fetch).toHaveBeenCalledWith(
      expect.any(URL),
      expect.objectContaining({ cache: "no-store", signal: expect.any(AbortSignal) }),
    );
  });

  it("bounds pagination and derives coverage from attempted submissions, including failed attempts", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(Response.json(envelope([identity])));
    for (let page = 0; page < CODEFORCES_MAX_PAGES; page++) {
      const rows = Array.from({ length: CODEFORCES_PAGE_SIZE }, (_, i) =>
        submission(
          page * CODEFORCES_PAGE_SIZE + i + 1,
          2000,
          "A",
          `2026-10-${String(19 - page).padStart(2, "0")}T02:00:00.000Z`,
          "WRONG_ANSWER",
        ),
      );
      vi.mocked(fetch).mockResolvedValueOnce(Response.json(envelope(rows)));
    }
    const result = await getCodeforcesProfile("tourist", now);
    expect(result).toMatchObject({
      problems: [],
      historyComplete: false,
      historyStart: "2026-10-15T02:00:00.000Z",
    });
    expect(result.checkedSubmissionIds).toHaveLength(CODEFORCES_MAX_PAGES * CODEFORCES_PAGE_SIZE);
    expect(result).not.toHaveProperty("totalSolved");
    expect(fetch).toHaveBeenCalledTimes(CODEFORCES_MAX_PAGES + 1);
    const urls = vi
      .mocked(fetch)
      .mock.calls.slice(1)
      .map(([url]) => new URL(String(url)));
    expect(urls.map((url) => url.searchParams.get("from"))).toEqual([
      "1",
      "1001",
      "2001",
      "3001",
      "4001",
    ]);
  });

  it("deduplicates submission IDs across overlapping pages", async () => {
    const rows = Array.from({ length: CODEFORCES_PAGE_SIZE }, (_, i) => submission(i + 1));
    vi.mocked(fetch)
      .mockResolvedValueOnce(Response.json(envelope([identity])))
      .mockResolvedValueOnce(Response.json(envelope(rows)))
      .mockResolvedValueOnce(Response.json(envelope([submission(1000), submission(1001)])));
    const result = await getCodeforcesProfile("tourist", now);
    expect(result.historyComplete).toBe(true);
    expect(result.problems).toHaveLength(1001);
  });

  it("rejects a repeated full page rather than fabricate complete history", async () => {
    const rows = Array.from({ length: CODEFORCES_PAGE_SIZE }, (_, i) => submission(i + 1));
    vi.mocked(fetch)
      .mockResolvedValueOnce(Response.json(envelope([identity])))
      .mockImplementation(async () => Response.json(envelope(rows)));
    await expect(getCodeforcesProfile("tourist", now)).rejects.toMatchObject({ status: 502 });
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it("supports empty history and unrated accounts without substituting a rating of zero", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(
        Response.json(
          envelope([
            { handle: "new_user", registrationTimeSeconds: at("2026-10-19T01:00:00.000Z") },
          ]),
        ),
      )
      .mockResolvedValueOnce(Response.json(envelope([])));
    expect(await getCodeforcesProfile("new_user", now)).toMatchObject({
      problems: [],
      rating: null,
      maxRating: null,
      rank: null,
      historyComplete: true,
    });
  });

  it.each([404, 429, 503])("handles HTTP %s without exposing upstream data", async (status) => {
    vi.mocked(fetch).mockResolvedValue(new Response("sensitive upstream text", { status }));
    await expect(getCodeforcesProfile("tourist", now)).rejects.toMatchObject({
      status: status === 503 ? 502 : status,
    });
  });

  it.each([
    [400, "handles: User with handle nobody not found", 404],
    [200, "handle: User with handle nobody not found", 404],
    [400, "Call limit exceeded", 429],
    [200, "limit exceeded", 429],
    [400, "sensitive unknown detail", 502],
  ])("handles FAILED envelope %s %s", async (http, comment, status) => {
    vi.mocked(fetch).mockResolvedValue(
      Response.json({ status: "FAILED", comment }, { status: http as number }),
    );
    await expect(getCodeforcesProfile("nobody", now)).rejects.toMatchObject({ status });
  });

  it.each([
    {},
    envelope([]),
    envelope([{ ...identity, handle: "other" }]),
    envelope([{ ...identity, handle: "unsafe/name" }]),
    envelope([{ ...identity, registrationTimeSeconds: 0 }]),
    envelope([{ ...identity, rating: "3900" }]),
  ])("rejects malformed and mismatched identities", async (value) => {
    vi.mocked(fetch).mockResolvedValue(Response.json(value));
    await expect(getCodeforcesProfile("tourist", now)).rejects.toMatchObject({ status: 502 });
  });

  it("handles malformed JSON and timeouts safely", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response("private broken JSON"));
    await expect(getCodeforcesProfile("tourist", now)).rejects.toMatchObject({ status: 502 });
    vi.mocked(fetch).mockRejectedValueOnce(
      new DOMException("private timeout detail", "TimeoutError"),
    );
    await expect(getCodeforcesProfile("tourist", now)).rejects.toMatchObject({
      status: 504,
      message: "Could not read Codeforces public activity. Try again shortly.",
    });
  });

  it("does not fetch when the shared rate reservation rejects the request", async () => {
    vi.mocked(reserveCodeforcesApiSlot).mockRejectedValueOnce(new Error("unavailable DB"));
    await expect(getCodeforcesProfile("tourist", now)).rejects.toMatchObject({ status: 502 });
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each(["", "aa", "a".repeat(25), "name/other", "name?other", "user name", null, 123])(
    "rejects unsafe handles before any DB or upstream access (%s)",
    async (value) => {
      expect(() => parseCodeforcesUsername(value)).toThrow();
      await expect(getCodeforcesProfile(value)).rejects.toMatchObject({ status: 400 });
      expect(fetch).not.toHaveBeenCalled();
      expect(reserveCodeforcesApiSlot).not.toHaveBeenCalled();
    },
  );

  it.each([
    { ...submission(), id: 0 },
    { ...submission(), creationTimeSeconds: -1 },
    { ...submission(), creationTimeSeconds: 1.5 },
    { ...submission(), verdict: true },
    { ...submission(), problem: { ...submission().problem, index: "../A" } },
    { ...submission(), problem: { ...submission().problem, name: "" } },
    { ...submission(), problem: { ...submission().problem, tags: [123] } },
    { ...submission(), problem: { ...submission().problem, rating: "800" } },
    { ...submission(), problem: { ...submission().problem, contestId: 999 } },
  ])("rejects unsafe accepted submission metadata", (value) => {
    expect(() => normalizeCodeforcesPage(envelope([value]))).toThrow();
  });

  it("keeps pending submissions out of accepted activity", () => {
    expect(
      normalizeCodeforcesPage(
        envelope([
          { ...submission(), verdict: undefined },
          submission(124, 2000, "A", undefined, "TESTING"),
        ]),
      ).problems,
    ).toEqual([]);
  });

  it("constructs standard, gym, and ACM SGU links from validated identifiers", () => {
    expect(codeforcesProblemUrl(2000, "A1")).toBe(
      "https://codeforces.com/problemset/problem/2000/A1",
    );
    expect(codeforcesProblemUrl(100123, "B")).toBe("https://codeforces.com/gym/100123/problem/B");
    expect(codeforcesProblemUrl(99999, "113")).toBe(
      "https://codeforces.com/problemsets/acmsguru/problem/99999/113",
    );
    const acm = {
      ...submission(123, 99999, "113"),
      contestId: undefined,
      problem: {
        ...submission(123, 99999, "113").problem,
        contestId: undefined,
        problemsetName: "acmsguru",
      },
    };
    expect(normalizeCodeforcesPage(envelope([acm])).problems[0].id).toBe("99999:113");
  });
});

describe("Codeforces accepted activity and recaps", () => {
  it("counts unique problems per IST day, allows re-solves on later days, and deduplicates weekly totals", () => {
    const value = profile({
      problems: normalizeCodeforcesPage(
        envelope([
          submission(1, 2000, "A", "2026-10-19T18:29:59.000Z"),
          submission(2, 2000, "A", "2026-10-19T18:30:00.000Z"),
          submission(3, 2000, "A", "2026-10-19T20:00:00.000Z"),
          submission(4, 2001, "A", "2026-10-19T20:00:00.000Z"),
          submission(5, 2002, "A", "2026-10-21T20:00:00.000Z"),
        ]),
      ).problems,
    });
    const result = buildCodeforcesProgress(value, stored(value), [], now);
    expect(result).toMatchObject({ savedSolved: 2, solvedToday: 2, solvedThisWeek: 2 });
    expect(result.days).toHaveLength(365);
    expect(result.days.find((day) => day.date === "2026-10-19")).toMatchObject({
      count: 1,
      coverage: "complete",
    });
    expect(result.days.find((day) => day.date === "2026-10-20")).toMatchObject({
      count: 2,
      coverage: "partial",
    });
  });

  it("marks bounded-history boundaries partial and earlier days unknown, including empty accepted history", () => {
    const value = profile({
      historyComplete: false,
      historyStart: "2026-10-18T05:00:00.000Z",
      problems: [],
    });
    const result = buildCodeforcesProgress(value, [], [], now);
    expect(result.days.find((day) => day.date === "2026-10-17")).toMatchObject({
      count: 0,
      coverage: "unknown",
    });
    expect(result.days.find((day) => day.date === "2026-10-18")).toMatchObject({
      count: 0,
      coverage: "partial",
    });
    expect(result.days.find((day) => day.date === "2026-10-19")).toMatchObject({
      count: 0,
      coverage: "complete",
    });
    expect(result.days.find((day) => day.date === "2026-10-20")).toMatchObject({
      count: 0,
      coverage: "partial",
    });
  });

  it("merges retained coverage intervals without filling unobserved gaps", () => {
    const value = profile({
      historyComplete: false,
      historyStart: "2026-10-19T18:30:00.000Z",
      problems: [],
    });
    const result = buildCodeforcesProgress(
      value,
      [],
      [
        {
          date: "2026-10-17",
          historyStart: new Date("2026-10-15T18:30:00.000Z"),
          checkedAt: new Date("2026-10-17T18:30:00.000Z"),
          historyComplete: false,
        },
      ],
      now,
    );
    expect(result.days.find((day) => day.date === "2026-10-16")?.coverage).toBe("complete");
    expect(result.days.find((day) => day.date === "2026-10-17")?.coverage).toBe("complete");
    expect(result.days.find((day) => day.date === "2026-10-18")?.coverage).toBe("partial");
    expect(result.days.find((day) => day.date === "2026-10-19")?.coverage).toBe("unknown");
  });

  it("never treats a future checkpoint as complete coverage of today", () => {
    const value = profile({ checkedAt: "2026-10-21T03:00:00.000Z" });
    expect(buildCodeforcesProgress(value, stored(value), [], now).days.at(-1)?.coverage).toBe(
      "partial",
    );
  });

  it("includes retained accepted submissions and counts a re-solve yesterday once", () => {
    const old = profile({
      problems: normalizeCodeforcesPage(
        envelope([
          submission(1, 2000, "A", "2026-10-10T01:00:00.000Z"),
          submission(2, 2000, "A", "2026-10-19T01:00:00.000Z"),
          submission(3, 2000, "A", "2026-10-19T02:00:00.000Z"),
        ]),
      ).problems,
    });
    const latest = profile({ problems: [] });
    const text = formatCodeforcesDailyReport(latest, stored(old), now).join("\n");
    expect(text).toContain("1 unique Accepted problems");
    expect(text).toContain("19 Oct 2026");
    expect(text).toContain("https://codeforces.com/problemset/problem/2000/A");
  });

  it("removes rejudged submissions from a recap when the latest checked feed no longer accepts them", () => {
    const old = profile();
    expect(
      formatCodeforcesDailyReport(
        profile({ problems: [], checkedSubmissionIds: [123] }),
        stored(old),
        now,
      ),
    ).toEqual([]);
  });

  it("uses frozen weekly boundaries and provides an empty weekly summary", () => {
    const range = {
      start: new Date("2026-10-18T18:30:00.000Z"),
      end: new Date("2026-10-19T17:30:00.000Z"),
    };
    const latest = profile({ problems: [] });
    const text = formatCodeforcesDailyReport(latest, [], now, range).join("\n");
    expect(text).toContain("Codeforces weekly recap");
    expect(text).toContain("0 unique Accepted problems");
    expect(text).toContain("Sunday cutoff");
    expect(formatCodeforcesDailyReport(latest, [], now)).toEqual([]);
  });

  it("splits large reports at Telegram limits and discloses bounded history", () => {
    const value = profile({
      historyComplete: false,
      problems: normalizeCodeforcesPage(
        envelope(Array.from({ length: 100 }, (_, i) => submission(i + 1, 2000 + i))),
      ).problems,
    });
    const parts = formatCodeforcesDailyReport(value, [], now);
    expect(parts.length).toBeGreaterThan(1);
    expect(parts.every((part) => part.length <= 4096)).toBe(true);
    expect(parts.join("\n")).toContain("bounded portion");
    expect(parts.join("\n")).toContain("/2099/A");
  });
});
