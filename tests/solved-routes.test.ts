import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET as getLastDay } from "@/app/api/user/lastday/[username]/route";
import { GET as getLastWeek } from "@/app/api/user/lastweek/[username]/route";

const routes = [
  {
    period: "lastweek",
    get: getLastWeek,
    count: 2,
    start: "2026-10-04T18:30:00.000Z",
    end: "2026-10-11T18:30:00.000Z",
  },
  {
    period: "lastday",
    get: getLastDay,
    count: 1,
    start: "2026-10-10T18:30:00.000Z",
    end: "2026-10-11T18:30:00.000Z",
  },
] as const;
const request = new Request("http://localhost/api/user/lastday/example");
const context = (username: string) => ({ params: Promise.resolve({ username }) });

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-12T06:30:00Z"));
});
afterEach(() => vi.useRealTimers());

function upstream(data: unknown, status = 200) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => Response.json({ data }, { status })),
  );
}

describe.each(routes)("$period API", ({ period, get, start, end, count }) => {
  it("returns the period metadata, unique count, questions, and coverage state", async () => {
    upstream({
      matchedUser: { username: "example" },
      recentAcSubmissionList: [
        {
          title: "Old",
          titleSlug: "old",
          timestamp: String(Date.parse("2026-10-01T12:00:00Z") / 1000),
        },
        {
          title: "Two Sum",
          titleSlug: "two-sum",
          timestamp: String(Date.parse("2026-10-11T12:00:00Z") / 1000),
        },
        {
          title: "Earlier",
          titleSlug: "earlier",
          timestamp: String(Date.parse("2026-10-06T12:00:00Z") / 1000),
        },
      ],
    });
    const response = await get(request, context("example"));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({
      username: "example",
      period,
      timezone: "Asia/Kolkata",
      start,
      end,
      count,
      mayBeIncomplete: false,
    });
    expect(body.questions).toHaveLength(count);
    expect(Object.keys(body.questions[0]).sort()).toEqual(["timestamp", "title", "titleSlug"]);
  });

  it("returns 200 and a coverage warning for empty available history", async () => {
    upstream({ matchedUser: { username: "example" }, recentAcSubmissionList: [] });
    const response = await get(request, context("example"));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ count: 0, questions: [], mayBeIncomplete: true });
  });

  it("returns 400 before requesting history for an invalid username", async () => {
    const response = await get(request, context("two words"));
    expect(response.status).toBe(400);
    expect(await response.json()).toHaveProperty("error");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("returns 404 for a nonexistent user", async () => {
    upstream({ matchedUser: null, recentAcSubmissionList: [] });
    const response = await get(request, context("missing"));
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "LeetCode user was not found." });
  });

  it("returns 404 for LeetCode's actual missing-user GraphQL error envelope", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          data: { matchedUser: null, recentAcSubmissionList: [] },
          errors: [{ message: "That user does not exist.", path: ["matchedUser"] }],
        }),
      ),
    );
    expect((await get(request, context("missing"))).status).toBe(404);
  });

  it("returns 502 for malformed history", async () => {
    upstream({ matchedUser: { username: "example" }, recentAcSubmissionList: [{}] });
    expect((await get(request, context("example"))).status).toBe(502);
  });

  it("returns 502 for an upstream failure", async () => {
    upstream({}, 503);
    expect((await get(request, context("example"))).status).toBe(502);
  });

  it("returns 504 for an upstream timeout", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new DOMException("Timed out", "TimeoutError")),
    );
    const response = await get(request, context("example"));
    expect(response.status).toBe(504);
    expect(await response.json()).toHaveProperty("error");
  });
});
