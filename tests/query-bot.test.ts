import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/telegram/webhook/route";
import { parseCommand } from "@/lib/telegram/commands";
import { getCommandReplies } from "@/lib/telegram/replies";
import { userProfileData } from "./fixtures";

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-19T06:30:00Z"));
});
afterEach(() => vi.useRealTimers());
describe("query bot help and additional queries", () => {
  it("shows only navigation on start and puts all username queries in the command guide", async () => {
    const start = (await getCommandReplies({ type: "start" })).join("\n");
    expect(start).toContain("What you need");
    expect(start).toContain("/start");
    expect(start).toContain("/command");
    expect(start).toContain("/help");
    expect(start).not.toMatch(/(?:name|profile|accepted|lastday|lastweek|today|thisweek):/);
    expect(parseCommand("/help@todo1245bot")).toEqual({ type: "help" });
    const guide = (await getCommandReplies({ type: "help" })).join("\n");
    for (const command of [
      "profile",
      "accepted",
      "name",
      "today",
      "thisweek",
      "lastday",
      "lastweek",
    ])
      expect(guide).toContain(`${command}:your_leetcode_username`);
    expect(fetch).not.toHaveBeenCalled();
  });
  it.each(["profile", "accepted", "today", "thisweek"] as const)(
    "parses %s and rejects invalid or batched queries",
    (type) => {
      expect(parseCommand(` ${type.toUpperCase()} : Mixed_User `)).toEqual({
        type,
        username: "Mixed_User",
      });
      for (const text of [`${type}:`, `${type}:two words`, `${type}:first;${type}:second`])
        expect(parseCommand(text)).toEqual({ type: "usage" });
    },
  );
  it.each([
    ["profile", "Total solved: 350"],
    ["accepted", "Recent Accepted problems"],
    ["today", "Today so far"],
    ["thisweek", "This week so far"],
  ] as const)(
    "uses shared services for %s and replies in the originating chat",
    async (command, expected) => {
      const sent: string[] = [];
      vi.mocked(fetch).mockImplementation(async (url, options) => {
        if (String(url) === "https://leetcode.com/graphql")
          return Response.json({
            data:
              command === "profile"
                ? userProfileData()
                : {
                    matchedUser: { username: "example" },
                    recentAcSubmissionList: [
                      {
                        title: "Two Sum",
                        titleSlug: "two-sum",
                        timestamp: String(Date.parse("2026-10-19T02:00:00Z") / 1000),
                      },
                    ],
                  },
          });
        expect(String(url)).toBe("https://api.telegram.org/bottest-token/sendMessage");
        const body = JSON.parse(String(options?.body));
        expect(body.chat_id).toBe(123);
        sent.push(body.text);
        return Response.json({ ok: true });
      });
      const response = await POST(
        new Request("http://localhost/api/telegram/webhook", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Telegram-Bot-Api-Secret-Token": "test-secret",
          },
          body: JSON.stringify({ message: { text: `${command}:example`, chat: { id: 123 } } }),
        }),
      );
      expect(response.status).toBe(200);
      expect(sent.join("\n")).toContain(expected);
      if (command !== "profile")
        expect(sent.join("\n")).toContain("https://leetcode.com/problems/two-sum/");
      else {
        expect(sent.join("\n")).toContain("Easy: 100");
        expect(sent.join("\n")).toContain("Ranking: 1234");
      }
    },
  );
  it("returns safe feedback when a new query fails", async () => {
    vi.mocked(fetch).mockRejectedValue(new Error("private upstream detail"));
    const text = (await getCommandReplies({ type: "profile", username: "example" })).join("\n");
    expect(text).toContain("Could not fetch LeetCode data");
    expect(text).not.toContain("private upstream detail");
  });
});
