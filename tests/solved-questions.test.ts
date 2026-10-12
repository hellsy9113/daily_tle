import { describe, expect, it, vi } from "vitest";
import { getPreviousCalendarPeriod } from "@/lib/leetcode/calendar-periods";
import { getLastDaySolvedQuestions } from "@/lib/leetcode/last-day-solved";
import { getLastWeekSolvedQuestions } from "@/lib/leetcode/last-week-solved";
import type { AcceptedSubmission } from "@/lib/leetcode/types";

const now = new Date("2026-10-12T06:30:00Z");

function accepted(titleSlug: string, instant: string): AcceptedSubmission {
  return { title: titleSlug, titleSlug, timestamp: String(Date.parse(instant) / 1000) };
}

function upstream(history: unknown, user: unknown = { username: "Mixed_User" }) {
  const fetchMock = vi.fn<typeof fetch>(async () =>
    Response.json({ data: { matchedUser: user, recentAcSubmissionList: history } }),
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("Asia/Kolkata calendar periods", () => {
  it.each([
    ["lastday", "2026-10-12T06:30:00Z", "2026-10-10T18:30:00.000Z", "2026-10-11T18:30:00.000Z"],
    ["lastday", "2026-10-11T18:29:59Z", "2026-10-09T18:30:00.000Z", "2026-10-10T18:30:00.000Z"],
    ["lastday", "2026-10-11T18:30:00Z", "2026-10-10T18:30:00.000Z", "2026-10-11T18:30:00.000Z"],
    ["lastday", "2026-03-01T00:00:00Z", "2026-02-27T18:30:00.000Z", "2026-02-28T18:30:00.000Z"],
    ["lastday", "2024-03-01T00:00:00Z", "2024-02-28T18:30:00.000Z", "2024-02-29T18:30:00.000Z"],
    ["lastday", "2026-01-01T00:00:00Z", "2025-12-30T18:30:00.000Z", "2025-12-31T18:30:00.000Z"],
    ["lastweek", "2026-10-12T06:30:00Z", "2026-10-04T18:30:00.000Z", "2026-10-11T18:30:00.000Z"],
    ["lastweek", "2026-10-11T18:29:59Z", "2026-09-27T18:30:00.000Z", "2026-10-04T18:30:00.000Z"],
    ["lastweek", "2026-10-11T18:30:00Z", "2026-10-04T18:30:00.000Z", "2026-10-11T18:30:00.000Z"],
    ["lastweek", "2026-10-14T06:30:00Z", "2026-10-04T18:30:00.000Z", "2026-10-11T18:30:00.000Z"],
    ["lastweek", "2026-01-05T06:30:00Z", "2025-12-28T18:30:00.000Z", "2026-01-04T18:30:00.000Z"],
    ["lastweek", "2024-03-04T06:30:00Z", "2024-02-25T18:30:00.000Z", "2024-03-03T18:30:00.000Z"],
  ] as const)("calculates %s at %s", (period, instant, start, end) => {
    const range = getPreviousCalendarPeriod(period, new Date(instant));
    expect(range.start.toISOString()).toBe(start);
    expect(range.end.toISOString()).toBe(end);
  });

  it("is independent of the server timezone", () => {
    vi.stubEnv("TZ", "Pacific/Honolulu");
    const range = getPreviousCalendarPeriod("lastday", now);
    expect(range.start.toISOString()).toBe("2026-10-10T18:30:00.000Z");
    expect(range.end.toISOString()).toBe("2026-10-11T18:30:00.000Z");
  });
});

const services = [
  { period: "lastday", get: getLastDaySolvedQuestions, start: "2026-10-10T18:30:00Z" },
  { period: "lastweek", get: getLastWeekSolvedQuestions, start: "2026-10-04T18:30:00Z" },
] as const;

describe.each(services)("$period solved-question service", ({ period, get, start }) => {
  it("queries Accepted submissions and checks existence using the trimmed username", async () => {
    const fetchMock = upstream([accepted("two-sum", "2026-10-11T10:00:00Z")]);
    const result = await get(" Mixed_User ", now);
    const body = JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
    expect(body.variables).toEqual({ username: "Mixed_User", limit: 20 });
    expect(body.query).toContain("recentAcSubmissionList");
    expect(body.query).toContain("matchedUser");
    expect(body.query).not.toContain("recentSubmissionList(");
    expect(result).toMatchObject({
      username: "Mixed_User",
      period,
      timezone: "Asia/Kolkata",
      count: 1,
    });
  });

  it("includes the start, excludes the end, and sorts results newest first", async () => {
    const first = accepted("start", start);
    const latest = accepted("latest", "2026-10-11T18:29:59Z");
    upstream([
      first,
      accepted("end", "2026-10-11T18:30:00Z"),
      latest,
      accepted("before", new Date(Date.parse(start) - 1000).toISOString()),
    ]);
    const result = await get("example", now);
    expect(result.questions).toEqual([latest, first]);
    expect(result.count).toBe(2);
    expect(result.mayBeIncomplete).toBe(false);
  });

  it("keeps the newest qualifying solution to each problem, including re-solves", async () => {
    const newest = accepted("two-sum", "2026-10-11T12:00:00Z");
    const another = accepted("add-two-numbers", "2026-10-11T11:00:00Z");
    upstream([
      accepted("two-sum", "2026-10-12T05:00:00Z"),
      accepted("two-sum", "2026-10-11T10:00:00Z"),
      accepted("two-sum", "2026-09-01T10:00:00Z"),
      another,
      newest,
    ]);
    const result = await get("example", now);
    expect(result.questions).toEqual([newest, another]);
    expect(result.count).toBe(2);
  });

  it("marks empty public history as potentially incomplete", async () => {
    upstream([]);
    await expect(get("example", now)).resolves.toMatchObject({
      count: 0,
      questions: [],
      mayBeIncomplete: true,
    });
  });

  it("keeps the coverage warning when the earliest entry is exactly at the start", async () => {
    upstream([accepted("boundary", start)]);
    expect((await get("example", now)).mayBeIncomplete).toBe(true);
  });

  it("reports zero available matches without claiming complete coverage when only newer entries exist", async () => {
    upstream([accepted("today", "2026-10-12T05:00:00Z")]);
    await expect(get("example", now)).resolves.toMatchObject({ count: 0, mayBeIncomplete: true });
  });

  it("can report complete zero results when the feed reaches before the start", async () => {
    upstream([accepted("old", "2026-09-01T10:00:00Z")]);
    await expect(get("example", now)).resolves.toMatchObject({
      count: 0,
      questions: [],
      mayBeIncomplete: false,
    });
  });

  it.each(["", " ", "two words"])(
    "rejects invalid username %j before requesting history",
    async (username) => {
      const fetchMock = upstream([]);
      await expect(get(username, now)).rejects.toMatchObject({ status: 400 });
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );

  it("returns 404 for a missing user", async () => {
    upstream([], null);
    await expect(get("missing", now)).rejects.toMatchObject({ status: 404 });
  });
});

describe("Accepted-history validation", () => {
  it.each([
    "",
    "bad",
    "1.5",
    "1e9",
    "-1",
    "Infinity",
    "1710000000 ",
    "99999999999999999999",
    "8640000000001",
    1710000000,
  ])(
    "rejects invalid Unix timestamp %j instead of silently dropping a record",
    async (timestamp) => {
      upstream([{ title: "Two Sum", titleSlug: "two-sum", timestamp }]);
      await expect(getLastDaySolvedQuestions("example", now)).rejects.toMatchObject({
        status: 502,
      });
    },
  );

  it.each([
    null,
    {},
    [null],
    [{}],
    [{ title: "", titleSlug: "two-sum", timestamp: "1710000000" }],
    [{ title: "Two Sum", titleSlug: " ", timestamp: "1710000000" }],
  ])("rejects malformed accepted history %j", async (history) => {
    upstream(history);
    await expect(getLastDaySolvedQuestions("example", now)).rejects.toMatchObject({ status: 502 });
  });

  it("rejects a missing user-existence response", async () => {
    upstream([], {});
    await expect(getLastDaySolvedQuestions("example", now)).rejects.toMatchObject({ status: 502 });
  });

  it("captures the range before a request crosses midnight in Asia/Kolkata", async () => {
    const clock = new Date("2026-10-11T18:29:59Z");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        clock.setTime(Date.parse("2026-10-11T18:30:01Z"));
        return Response.json({
          data: { matchedUser: { username: "example" }, recentAcSubmissionList: [] },
        });
      }),
    );
    const result = await getLastDaySolvedQuestions("example", clock);
    expect(result.start).toBe("2026-10-09T18:30:00.000Z");
    expect(result.end).toBe("2026-10-10T18:30:00.000Z");
  });
});
