import { describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/http/api-error";
import { queryLeetCode } from "@/lib/leetcode/client";
import { getRecentSubmissions } from "@/lib/leetcode/recent-submissions";
import { formatUserProfile, getUserProfile } from "@/lib/leetcode/user-profile";
import { recentSubmissions, userProfileData } from "./fixtures";

function upstream(body: unknown, status = 200) {
  const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(Response.json(body, { status }));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("LeetCode services", () => {
  it("forwards the trimmed username and returns the existing submission envelope", async () => {
    const fetchMock = upstream({ data: recentSubmissions });
    await expect(getRecentSubmissions(" Mixed_User ")).resolves.toEqual(recentSubmissions);
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe("https://leetcode.com/graphql");
    expect(JSON.parse(String(options?.body)).variables).toEqual({ username: "Mixed_User" });
    expect(options?.signal).toBeInstanceOf(AbortSignal);
    expect(options?.cache).toBe("no-store");
  });

  it.each(["", "   ", "two words"])(
    "rejects invalid username %j before making a request",
    async (username) => {
      const fetchMock = upstream({ data: recentSubmissions });
      await expect(getRecentSubmissions(username)).rejects.toMatchObject({ status: 400 });
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );

  it("accepts an empty submission list", async () => {
    upstream({ data: { recentSubmissionList: [] } });
    await expect(getRecentSubmissions("user")).resolves.toEqual({ recentSubmissionList: [] });
  });

  it.each([
    { recentSubmissionList: null },
    { recentSubmissionList: [{}] },
    { recentSubmissionList: [{ title: "Incomplete" }] },
  ])("rejects malformed submission data %j", async (data) => {
    upstream({ data });
    await expect(getRecentSubmissions("user")).rejects.toMatchObject({ status: 502 });
  });

  it("maps profile counts by difficulty and preserves the public response fields", async () => {
    const data = userProfileData();
    upstream({ data });
    await expect(getUserProfile("user")).resolves.toEqual({
      totalSolved: 350,
      totalSubmissions: data.matchedUser.submitStats.totalSubmissionNum,
      totalQuestions: 3500,
      easySolved: 100,
      totalEasy: 1000,
      mediumSolved: 200,
      totalMedium: 2000,
      hardSolved: 50,
      totalHard: 500,
      ranking: 1234,
      contributionPoint: 20,
      reputation: 10,
      submissionCalendar: { "1710000000": 2 },
      recentSubmissions: data.recentSubmissionList,
      matchedUserStats: data.matchedUser.submitStats,
    });
  });

  it("returns a not-found error for a missing user", async () => {
    upstream({ data: { matchedUser: null } });
    await expect(getUserProfile("missing")).rejects.toMatchObject({ status: 404 });
  });

  it.each(["{broken", "null", "[]", '{"timestamp":"invalid"}'])(
    "rejects malformed calendar %j",
    (calendar) => {
      const data = userProfileData();
      data.matchedUser.submissionCalendar = calendar;
      expect(() => formatUserProfile(data)).toThrow(ApiError);
    },
  );
});

describe("LeetCode transport", () => {
  it("maps the real missing-user GraphQL field error to 404", async () => {
    upstream({
      data: { matchedUser: null, recentAcSubmissionList: [] },
      errors: [{ message: "That user does not exist.", path: ["matchedUser"] }],
    });
    await expect(queryLeetCode("query", { username: "missing" })).rejects.toMatchObject({
      status: 404,
    });
  });

  it.each([
    { message: "Internal resolver failure", path: ["matchedUser"] },
    { message: "That user does not exist.", path: ["anotherField"] },
  ])("keeps unrelated field errors as upstream failures: %j", async (error) => {
    upstream({ data: { matchedUser: null }, errors: [error] });
    await expect(queryLeetCode("query", { username: "user" })).rejects.toMatchObject({
      status: 502,
    });
  });

  it.each([null, {}, { data: null }, { errors: [{ message: "private upstream details" }] }])(
    "rejects malformed or unsuccessful GraphQL envelope %j",
    async (body) => {
      upstream(body);
      await expect(queryLeetCode("query", { username: "user" })).rejects.toMatchObject({
        status: 502,
      });
    },
  );

  it("handles a non-JSON upstream HTTP failure", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("unavailable", { status: 503 })));
    await expect(queryLeetCode("query", { username: "user" })).rejects.toMatchObject({
      status: 502,
    });
  });

  it("handles invalid JSON in a successful HTTP response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("not JSON")));
    await expect(queryLeetCode("query", { username: "user" })).rejects.toMatchObject({
      status: 502,
    });
  });

  it("handles a network failure without exposing its details", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("private network details")));
    await expect(queryLeetCode("query", { username: "user" })).rejects.toMatchObject({
      status: 502,
      message: "Could not reach LeetCode. Try again shortly.",
    });
  });

  it("distinguishes an upstream timeout", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new DOMException("Timed out", "TimeoutError")),
    );
    await expect(queryLeetCode("query", { username: "user" })).rejects.toMatchObject({
      status: 504,
    });
  });
});
