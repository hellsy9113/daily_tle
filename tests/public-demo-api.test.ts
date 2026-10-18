import { describe, expect, it, vi } from "vitest";
import { GET } from "@/app/api/user/recent-solved/[username]/route";
import { getRecentSolvedQuestions } from "@/lib/leetcode/recent-solved";
import { getCurrentSolvedQuestions } from "@/lib/leetcode/current-solved";
import { getCurrentCalendarPeriod } from "@/lib/leetcode/calendar-periods";
import { queryBotUrl } from "@/lib/telegram/bot-link";

const now = new Date("2026-10-19T06:30:00Z");
const question = (slug: string, time: string) => ({
  title: slug,
  titleSlug: slug,
  timestamp: String(Date.parse(time) / 1000),
});
function upstream(problems: ReturnType<typeof question>[]) {
  vi.mocked(fetch).mockResolvedValue(
    Response.json({
      data: { matchedUser: { username: "example" }, recentAcSubmissionList: problems },
    }),
  );
}
describe("public recent solved demo API", () => {
  it("deduplicates the Accepted feed, keeps the latest solve, sorts it, and excludes future records", async () => {
    upstream([
      question("same", "2026-10-18T06:00:00Z"),
      question("other", "2026-10-19T01:00:00Z"),
      question("same", "2026-10-19T02:00:00Z"),
      question("future", "2026-10-20T00:00:00Z"),
    ]);
    const result = await getRecentSolvedQuestions(" example ", now);
    expect(result).toMatchObject({
      username: "example",
      count: 2,
      sourceLimit: 20,
      checkedAt: now.toISOString(),
    });
    expect(result.questions.map((problem) => problem.titleSlug)).toEqual(["same", "other"]);
    expect(result.questions[0].timestamp).toBe(String(Date.parse("2026-10-19T02:00:00Z") / 1000));
    const payload = JSON.parse(String(vi.mocked(fetch).mock.calls[0][1]?.body));
    expect(payload.query).toContain("recentAcSubmissionList");
    expect(payload.variables).toEqual({ username: "example", limit: 20 });
  });
  it("works without sign-in and returns no-store JSON for an empty public feed", async () => {
    upstream([]);
    const result = await GET(new Request("http://localhost/api/user/recent-solved/example"), {
      params: Promise.resolve({ username: "example" }),
    });
    expect(result.status).toBe(200);
    expect(result.headers.get("cache-control")).toBe("no-store");
    expect(await result.json()).toMatchObject({ count: 0, questions: [], sourceLimit: 20 });
  });
  it("validates a username before making any upstream request", async () => {
    const result = await GET(new Request("http://localhost/api/user/recent-solved/example"), {
      params: Promise.resolve({ username: "two words" }),
    });
    expect(result.status).toBe(400);
    expect(fetch).not.toHaveBeenCalled();
  });
  it.each([
    [{ matchedUser: null, recentAcSubmissionList: [] }, 404],
    [{ matchedUser: { username: "example" }, recentAcSubmissionList: [{}] }, 502],
  ])("returns a safe error for missing or malformed public data", async (data, status) => {
    vi.mocked(fetch).mockResolvedValue(Response.json({ data }));
    const result = await GET(new Request("http://localhost/api/user/recent-solved/example"), {
      params: Promise.resolve({ username: "example" }),
    });
    expect(result.status).toBe(status);
    expect(result.headers.get("cache-control")).toBe("no-store");
    expect(await result.json()).toHaveProperty("error");
  });
  it("keeps transport details out of public errors", async () => {
    vi.mocked(fetch).mockRejectedValue(new Error("private transport details"));
    const result = await GET(new Request("http://localhost/api/user/recent-solved/example"), {
      params: Promise.resolve({ username: "example" }),
    });
    expect(result.status).toBe(502);
    expect(await result.text()).not.toContain("private transport details");
  });
});
describe("current calendar queries", () => {
  it("uses IST midnight and a Monday-start week, including the current instant", async () => {
    const sunday = new Date("2026-10-18T18:29:59Z");
    expect(getCurrentCalendarPeriod("today", sunday).start.toISOString()).toBe(
      "2026-10-17T18:30:00.000Z",
    );
    expect(getCurrentCalendarPeriod("thisweek", sunday).start.toISOString()).toBe(
      "2026-10-11T18:30:00.000Z",
    );
    const monday = new Date("2026-10-18T18:30:00Z");
    expect(getCurrentCalendarPeriod("thisweek", monday).start.toISOString()).toBe(
      monday.toISOString(),
    );
    upstream([
      question("previous-day", "2026-10-18T18:29:59Z"),
      question("midnight", "2026-10-18T18:30:00Z"),
      question("now", now.toISOString()),
      question("future", "2026-10-19T06:30:01Z"),
    ]);
    expect(
      (await getCurrentSolvedQuestions("example", "today", now)).questions.map(
        (problem) => problem.titleSlug,
      ),
    ).toEqual(["now", "midnight"]);
  });
});
describe("original bot link", () => {
  it("uses the supplied original bot by default and accepts a safe username override", () => {
    vi.stubEnv("TELEGRAM_BOT_USERNAME", "");
    expect(queryBotUrl()).toBe("https://t.me/todo1245bot");
    vi.stubEnv("TELEGRAM_BOT_USERNAME", "@another_query_bot");
    expect(queryBotUrl()).toBe("https://t.me/another_query_bot");
    vi.stubEnv("TELEGRAM_BOT_USERNAME", "https://attacker.example");
    expect(queryBotUrl()).toBe("https://t.me/todo1245bot");
  });
});
