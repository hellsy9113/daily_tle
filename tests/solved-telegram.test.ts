import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/telegram/webhook/route";
import { parseCommand } from "@/lib/telegram/commands";
import { formatSolvedQuestions } from "@/lib/telegram/format-solved-questions";
import type { SolvedQuestionsResult } from "@/lib/leetcode/types";

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-12T06:30:00Z"));
});
afterEach(() => vi.useRealTimers());

async function webhook(text: string, secret = "test-secret") {
  return POST(
    new Request("http://localhost/api/telegram/webhook", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Telegram-Bot-Api-Secret-Token": secret },
      body: JSON.stringify({ message: { text, chat: { id: 123 } } }),
    }),
  );
}

function mockApis(
  options: {
    empty?: boolean;
    missing?: boolean;
    invalid?: boolean;
    lookupFails?: boolean;
    sendFails?: boolean;
  } = {},
) {
  const replies: { chat_id: number; text: string }[] = [];
  const fetchMock = vi.fn<typeof fetch>(async (input, init) => {
    if (String(input) === "https://leetcode.com/graphql") {
      return Response.json(
        {
          data: {
            matchedUser: options.missing ? null : { username: "Mixed_User" },
            recentAcSubmissionList: options.invalid
              ? [{}]
              : options.empty
                ? []
                : [
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
          },
        },
        { status: options.lookupFails ? 503 : 200 },
      );
    }
    if (String(input) !== "https://api.telegram.org/bottest-token/sendMessage")
      throw new Error("Unexpected URL");
    replies.push(JSON.parse(String(init?.body)));
    return Response.json({ ok: !options.sendFails }, { status: options.sendFails ? 429 : 200 });
  });
  vi.stubGlobal("fetch", fetchMock);
  return { fetchMock, replies };
}

describe("period command parsing", () => {
  it.each(["lastweek", "lastday"])(
    "accepts %s with whitespace and case-insensitive prefixes",
    (prefix) => {
      expect(parseCommand(`  ${prefix.toUpperCase()} : Mixed_User  `)).toEqual({
        type: prefix,
        username: "Mixed_User",
      });
    },
  );

  it.each([
    "lastweek:",
    "lastday:   ",
    "lastweek:two words",
    "lastday:two words",
    "lastweek:foo;lastday:foo",
    "lastday:foo; lastweek:bar",
    "hello;lastday:foo",
  ])("returns usage for %j", (text) => expect(parseCommand(text)).toEqual({ type: "usage" }));

  it("ignores an unrecognized prefix", () => {
    expect(parseCommand("lastmonth:example")).toEqual({ type: "ignored" });
  });
});

describe.each([
  { command: "lastweek", label: "Last week", count: 2 },
  { command: "lastday", label: "Yesterday", count: 1 },
])("$command webhook", ({ command, label, count }) => {
  it("looks up accepted history and sends correctly labeled results to the same chat", async () => {
    const { fetchMock, replies } = mockApis();
    expect((await webhook(` ${command.toUpperCase()} : Mixed_User `)).status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const payload = JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
    expect(payload.variables).toEqual({ username: "Mixed_User", limit: 20 });
    expect(payload.query).toContain("recentAcSubmissionList");
    expect(replies[0].chat_id).toBe(123);
    expect(replies[0].text).toContain(`${label} for Mixed_User`);
    expect(replies[0].text).toContain("11 Oct 2026");
    expect(replies[0].text).toContain("Asia/Kolkata");
    expect(replies[0].text).toContain(`${count} unique Accepted`);
    expect(replies[0].text).toContain("https://leetcode.com/problems/two-sum/");
    if (command === "lastweek") expect(replies[0].text).toContain("05 Oct 2026");
    else expect(replies[0].text).not.toContain("https://leetcode.com/problems/earlier/");
  });

  it("reports empty matches and warns about incomplete history", async () => {
    const { replies } = mockApis({ empty: true });
    expect((await webhook(`${command}:example`)).status).toBe(200);
    expect(replies[0].text).toContain(
      "No matching problems were found in the available public history",
    );
    expect(replies[0].text).toContain("Coverage warning");
    expect(replies[0].text).not.toContain("No problems were solved");
  });

  it.each([{ lookupFails: true }, { missing: true }, { invalid: true }])(
    "reuses the lookup failure reply for %j",
    async (options) => {
      const { replies } = mockApis(options);
      expect((await webhook(`${command}:example`)).status).toBe(200);
      expect(replies[0].text).toContain("Could not fetch LeetCode data");
    },
  );

  it("returns 502 when Telegram rejects the period reply", async () => {
    mockApis({ sendFails: true });
    expect((await webhook(`${command}:example`)).status).toBe(502);
  });

  it("rejects a wrong webhook secret before a lookup", async () => {
    expect((await webhook(`${command}:example`, "wrong")).status).toBe(401);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("returns a configuration error before a lookup when the bot token is missing", async () => {
    vi.stubEnv("TELEGRAM_BOT_TOKEN", "");
    expect((await webhook(`${command}:example`)).status).toBe(500);
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe("period replies", () => {
  it("responds to an empty username and a semicolon batch without a LeetCode lookup", async () => {
    const { fetchMock, replies } = mockApis();
    for (const command of ["lastweek:", "lastday:", "lastweek:example;lastday:example"]) {
      expect((await webhook(command)).status).toBe(200);
    }
    expect(fetchMock).toHaveBeenCalledTimes(3);
    for (const reply of replies) {
      expect(reply.text).toContain("Send one command per message");
      expect(reply.text).toContain("lastweek:your_leetcode_username");
      expect(reply.text).toContain("lastday:your_leetcode_username");
    }
  });

  const result: SolvedQuestionsResult = {
    username: "example",
    period: "lastweek",
    timezone: "Asia/Kolkata",
    start: "2026-10-04T18:30:00.000Z",
    end: "2026-10-11T18:30:00.000Z",
    count: 0,
    questions: [],
    mayBeIncomplete: false,
  };

  it("does not warn about incomplete coverage when the source reaches before the period", () => {
    expect(formatSolvedQuestions(result).join("\n")).not.toContain("Coverage warning");
  });

  it("splits long replies without losing links or the coverage warning", () => {
    const questions = Array.from({ length: 20 }, (_, index) => ({
      title: `Problem ${index} ${"😀".repeat(150)}`,
      titleSlug: `problem-${index}`,
      timestamp: "1791705600",
    }));
    const replies = formatSolvedQuestions({
      ...result,
      count: questions.length,
      questions,
      mayBeIncomplete: true,
    });
    expect(replies.length).toBeGreaterThan(1);
    const combined = replies.join("\n");
    for (let index = 0; index < 20; index++)
      expect(combined).toContain(`https://leetcode.com/problems/problem-${index}/`);
    expect(combined).toContain("Coverage warning");
    for (const reply of replies) {
      expect(reply.length).toBeLessThanOrEqual(4096);
      expect(reply).not.toMatch(/[\uD800-\uDBFF]$/);
      expect(reply).not.toMatch(/^[\uDC00-\uDFFF]/);
    }
  });
});
