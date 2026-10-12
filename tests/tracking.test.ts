import { describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/http/api-error";
import { getLeetCodeIdentity } from "@/lib/leetcode/user-identity";
import { registrationAvailable, trackingBot } from "@/lib/tracking/config";
import { createMessagePacer } from "@/lib/tracking/dispatch";
import { formatDailyReport, EMPTY_REPORT } from "@/lib/tracking/format-report";
import { hashToken, randomToken, requireSameOrigin, secretsEqual } from "@/lib/tracking/security";
import { parseTrackingUpdate, handleTrackingWebhook } from "@/lib/tracking/webhook";
import { sendTrackingMessage } from "@/lib/tracking/telegram-client";
import { reportPeriod } from "@/lib/tracking/delivery-store";

const result = {
  username: "test",
  period: "lastday" as const,
  timezone: "Asia/Kolkata" as const,
  start: "2026-10-11T18:30:00.000Z",
  end: "2026-10-12T18:30:00.000Z",
  count: 0,
  questions: [],
  mayBeIncomplete: false,
};
function botEnvironment() {
  vi.stubEnv("TRACKING_TELEGRAM_BOT_TOKEN", "42:second-bot");
  vi.stubEnv("TRACKING_TELEGRAM_BOT_USERNAME", "second_bot");
  vi.stubEnv("TRACKING_TELEGRAM_WEBHOOK_SECRET", "second-secret");
}

describe("tracking security", () => {
  it("generates deep-link-safe tokens and stores irreversible hashes", () => {
    const token = randomToken();
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(hashToken(token)).toMatch(/^[a-f0-9]{64}$/);
    expect(hashToken(token)).not.toContain(token);
    expect(randomToken()).not.toBe(token);
  });
  it("rejects missing and mismatched secrets", () => {
    expect(secretsEqual(null, "secret")).toBe(false);
    expect(secretsEqual("wrong", "secret")).toBe(false);
    expect(secretsEqual("secret", "secret")).toBe(true);
  });
  it("rejects cross-origin and missing-origin mutations", () => {
    vi.stubEnv("APP_URL", "http://localhost:3000");
    expect(() =>
      requireSameOrigin(
        new Request("http://localhost:3000", { headers: { origin: "https://other.test" } }),
      ),
    ).toThrow(ApiError);
    expect(() => requireSameOrigin(new Request("http://localhost:3000"))).toThrow(ApiError);
    expect(() =>
      requireSameOrigin(
        new Request("http://localhost:3000", { headers: { origin: "http://localhost:3000" } }),
      ),
    ).not.toThrow();
  });
  it("keeps registration closed when bot setup is missing", () => {
    expect(registrationAvailable()).toBe(false);
  });
  it("refuses to use the existing bot token for tracking", () => {
    botEnvironment();
    vi.stubEnv("TELEGRAM_BOT_TOKEN", "42:second-bot");
    expect(() => trackingBot()).toThrow(ApiError);
  });
});

describe("public LeetCode identity", () => {
  it("returns the canonical username", async () => {
    vi.mocked(fetch).mockResolvedValue(
      Response.json({ data: { matchedUser: { username: "Canonical" } } }),
    );
    expect(await getLeetCodeIdentity(" canonical ")).toBe("Canonical");
  });
  it.each([null, {}, { username: "" }, { username: 1 }, { username: "bad user" }])(
    "handles nonexistent or malformed identities: %j",
    async (matchedUser) => {
      vi.mocked(fetch).mockResolvedValue(Response.json({ data: { matchedUser } }));
      await expect(getLeetCodeIdentity("test")).rejects.toMatchObject({
        status: matchedUser === null ? 404 : 502,
      });
    },
  );
});

describe("tracking webhook input", () => {
  const message = {
    update_id: 1,
    message: {
      chat: { id: 123, type: "private" },
      from: { id: 123, is_bot: false },
      text: " /start ",
    },
  };
  it("uses the sender identity and accepts only private chats", () => {
    expect(parseTrackingUpdate(message)).toMatchObject({
      userId: 123,
      chatId: 123,
      text: "/start",
    });
    expect(
      parseTrackingUpdate({
        ...message,
        message: { ...message.message, chat: { id: 123, type: "group" } },
      }),
    ).toBeNull();
    expect(
      parseTrackingUpdate({
        ...message,
        message: { ...message.message, from: { id: 456, is_bot: false } },
      }),
    ).toBeNull();
    expect(parseTrackingUpdate({ ...message, update_id: 0.1 })).toBeNull();
  });
  it("rejects the existing webhook secret", async () => {
    botEnvironment();
    const response = await handleTrackingWebhook(
      new Request("http://localhost:3000", {
        method: "POST",
        headers: { "x-telegram-bot-api-secret-token": "test-secret" },
        body: JSON.stringify(message),
      }),
    );
    expect(response.status).toBe(401);
    expect(fetch).not.toHaveBeenCalled();
  });
  it("ignores unsupported updates without sending or opening the database", async () => {
    botEnvironment();
    const response = await handleTrackingWebhook(
      new Request("http://localhost:3000", {
        method: "POST",
        headers: { "x-telegram-bot-api-secret-token": "second-secret" },
        body: JSON.stringify({ update_id: 1 }),
      }),
    );
    expect(response.status).toBe(200);
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe("tracking messages", () => {
  it("uses the exact requested empty-day text", () => {
    expect(formatDailyReport(result)).toEqual([EMPTY_REPORT]);
  });
  it("adds a coverage warning to an incomplete empty report", () => {
    expect(formatDailyReport({ ...result, mayBeIncomplete: true })[0]).toContain(
      "Coverage warning",
    );
  });
  it("splits long reports and retains problem links", () => {
    const questions = Array.from({ length: 20 }, (_, i) => ({
      title: `Question ${i} ${"x".repeat(400)}`,
      titleSlug: `question-${i}`,
      timestamp: "1",
    }));
    const messages = formatDailyReport({ ...result, count: 20, questions });
    expect(messages.length).toBeGreaterThan(1);
    expect(messages.every((text) => text.length <= 4096)).toBe(true);
    expect(messages.join("")).toContain("https://leetcode.com/problems/question-19/");
  });
  it("uses only the second bot token", async () => {
    botEnvironment();
    vi.mocked(fetch).mockResolvedValue(Response.json({ ok: true }));
    await sendTrackingMessage(123, "report");
    expect(fetch).toHaveBeenCalledWith(
      "https://api.telegram.org/bot42:second-bot/sendMessage",
      expect.objectContaining({ body: JSON.stringify({ chat_id: 123, text: "report" }) }),
    );
  });
  it.each([403, 429, 500])("classifies Telegram error %i", async (code) => {
    botEnvironment();
    vi.mocked(fetch).mockResolvedValue(
      Response.json(
        { ok: false, error_code: code, parameters: { retry_after: 37 } },
        { status: code },
      ),
    );
    await expect(sendTrackingMessage(123, "report")).rejects.toMatchObject({
      kind: code === 403 ? "blocked" : code === 429 ? "rate_limit" : "upstream",
      ...(code === 429 ? { retryAfter: 37 } : {}),
    });
  });
  it("paces concurrent messages globally and in the same chat", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-13T03:00:00Z"));
    try {
      const pause = vi.fn(async (ms: number) => {
        void ms;
      });
      const pace = createMessagePacer(pause);
      await Promise.all([pace(1), pace(2), pace(1)]);
      expect(pause.mock.calls.map(([ms]) => ms)).toEqual([0, 200, 1000]);
    } finally {
      vi.useRealTimers();
    }
  });
  it("stores the correct IST report date and cutoff", () => {
    const period = reportPeriod(new Date("2026-01-01T03:00:00Z"));
    expect(period.reportDate).toBe("2025-12-31");
    expect(period.cutoff.toISOString()).toBe("2026-01-01T03:00:00.000Z");
  });
});
