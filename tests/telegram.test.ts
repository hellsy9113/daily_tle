import { describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/telegram/webhook/route";
import { formatSubmissions, splitMessage } from "@/lib/telegram/format-submissions";
import { recentSubmissions, submission } from "./fixtures";

function webhook(body: unknown, secret = "test-secret") {
  return POST(
    new Request("http://localhost/api/telegram/webhook", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Telegram-Bot-Api-Secret-Token": secret },
      body: JSON.stringify(body),
    }),
  );
}

function message(text: string) {
  return { message: { text, chat: { id: -123 } } };
}

function mockApis(options: { lookupFails?: boolean; sendFails?: boolean } = {}) {
  const replies: { chat_id: number; text: string }[] = [];
  const fetchMock = vi.fn<typeof fetch>(async (input, init) => {
    const url = String(input);
    if (url === "https://leetcode.com/graphql") {
      return Response.json(
        { data: recentSubmissions },
        { status: options.lookupFails ? 503 : 200 },
      );
    }
    if (url !== "https://api.telegram.org/bottest-token/sendMessage") {
      throw new Error("Unexpected external endpoint");
    }
    replies.push(JSON.parse(String(init?.body)));
    return Response.json({ ok: !options.sendFails }, { status: options.sendFails ? 429 : 200 });
  });
  vi.stubGlobal("fetch", fetchMock);
  return { fetchMock, replies };
}

describe("Telegram webhook", () => {
  it.each(["/start", " /START ", "/start@first_bot", "/start sample-link"])(
    "describes the bot and its requirements for %j without a LeetCode lookup",
    async (text) => {
      const { replies, fetchMock } = mockApis();
      expect((await webhook(message(text))).status).toBe(200);
      expect(replies).toHaveLength(1);
      expect(replies[0].text).toContain("Check your LeetCode practice on demand");
      expect(replies[0].text).toContain("What you need:");
      expect(replies[0].text).toContain("public LeetCode username");
      expect(replies[0].text).not.toContain("name:your_leetcode_username");
      expect(replies[0].text).toContain("/help");
      expect(replies[0].text).toContain("/command");
      expect(fetchMock).toHaveBeenCalledTimes(1);
    },
  );

  it.each(["/command", " /COMMAND ", "/command@first_bot"])(
    "lists every available command for %j without a LeetCode lookup",
    async (text) => {
      const { replies, fetchMock } = mockApis();
      expect((await webhook(message(text))).status).toBe(200);
      expect(replies).toHaveLength(1);
      for (const command of [
        "profile:your_leetcode_username",
        "accepted:your_leetcode_username",
        "today:your_leetcode_username",
        "thisweek:your_leetcode_username",
        "name:your_leetcode_username",
        "lastday:your_leetcode_username",
        "lastweek:your_leetcode_username",
      ]) {
        expect(replies[0].text).toContain(command);
      }
      expect(replies[0].text).toContain("Asia/Kolkata");
      expect(replies[0].text).toContain("one command per message");
      expect(fetchMock).toHaveBeenCalledTimes(1);
    },
  );

  it("preserves the welcome reply", async () => {
    const { replies, fetchMock } = mockApis();
    expect((await webhook(message(" HELLO "))).status).toBe(200);
    expect(replies).toEqual([{ chat_id: -123, text: "welcome" }]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("uses the shared LeetCode service for a name command", async () => {
    const { replies, fetchMock } = mockApis();
    expect((await webhook(message(" NAME : Mixed_User "))).status).toBe(200);
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body)).variables).toEqual({
      username: "Mixed_User",
    });
    expect(replies[0]).toMatchObject({ chat_id: -123 });
    expect(replies[0].text).toContain("Recent submissions for Mixed_User");
    expect(replies[0].text).toContain("Two Sum");
    expect(replies[0].text).toContain("Accepted · python3");
    expect(replies[0].text).toContain("https://leetcode.com/problems/two-sum/");
  });

  it.each(["name:", "name:   ", "name:two words"])(
    "returns usage for %j without calling LeetCode",
    async (text) => {
      const { replies, fetchMock } = mockApis();
      expect((await webhook(message(text))).status).toBe(200);
      expect(replies[0].text).toContain("name:your_leetcode_username");
      expect(fetchMock).toHaveBeenCalledTimes(1);
    },
  );

  it.each([
    null,
    {},
    { callback_query: {} },
    { message: { text: "hello", chat: { id: "123" } } },
    message("other"),
    message("/starter"),
    message("/commanding"),
  ])("acknowledges ignored or malformed updates %j without external requests", async (update) => {
    expect((await webhook(update)).status).toBe(200);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("rejects a wrong secret before calling any external service", async () => {
    expect((await webhook(message("name:example"), "wrong")).status).toBe(401);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("keeps optional secret verification compatible", async () => {
    vi.stubEnv("TELEGRAM_WEBHOOK_SECRET", "");
    const { replies } = mockApis();
    expect((await webhook(message("hello"), "")).status).toBe(200);
    expect(replies[0].text).toBe("welcome");
  });

  it("returns 400 for invalid JSON", async () => {
    const response = await POST(
      new Request("http://localhost", {
        method: "POST",
        headers: { "X-Telegram-Bot-Api-Secret-Token": "test-secret" },
        body: "{bad",
      }),
    );
    expect(response.status).toBe(400);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("returns a configuration error before calling LeetCode when the token is missing", async () => {
    vi.stubEnv("TELEGRAM_BOT_TOKEN", "");
    expect((await webhook(message("name:example"))).status).toBe(500);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("sends a retry message and acknowledges an upstream lookup failure", async () => {
    const { replies } = mockApis({ lookupFails: true });
    expect((await webhook(message("name:example"))).status).toBe(200);
    expect(replies[0].text).toContain("Could not fetch LeetCode data");
  });

  it("returns 502 when Telegram rejects a reply so delivery can be retried", async () => {
    mockApis({ sendFails: true });
    expect((await webhook(message("hello"))).status).toBe(502);
  });

  it("keeps token-containing network errors out of responses", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("URL contains test-token")));
    const response = await webhook(message("hello"));
    expect(response.status).toBe(502);
    expect(await response.text()).not.toContain("test-token");
  });
});

describe("Telegram message formatting", () => {
  it("reports an empty submission list", () => {
    expect(formatSubmissions("example", { recentSubmissionList: [] })[0]).toContain(
      "No recent submissions",
    );
  });

  it("splits large result sets without dropping problem links", () => {
    const data = {
      recentSubmissionList: Array.from({ length: 20 }, (_, index) => ({
        ...submission,
        title: `Problem ${index} ${"x".repeat(300)}`,
        titleSlug: `problem-${index}`,
      })),
    };
    const replies = formatSubmissions("example", data);
    expect(replies.length).toBeGreaterThan(1);
    for (const reply of replies) expect(reply.length).toBeLessThanOrEqual(4096);
    const combined = replies.join("\n");
    for (let index = 0; index < 20; index++)
      expect(combined).toContain(`https://leetcode.com/problems/problem-${index}/`);
  });

  it("preserves complete emoji when splitting a very long line", () => {
    const text = "😀".repeat(5000);
    const replies = splitMessage(text);
    expect(replies.join("")).toBe(text);
    for (const reply of replies) {
      expect(reply.length).toBeLessThanOrEqual(4096);
      expect(reply).not.toMatch(/[\uD800-\uDBFF]$/);
      expect(reply).not.toMatch(/^[\uDC00-\uDFFF]/);
    }
  });
});
