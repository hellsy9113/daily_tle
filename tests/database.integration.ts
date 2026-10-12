import { readFile } from "node:fs/promises";
import postgres from "postgres";
import { and, eq } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { db, closeDatabase } from "@/lib/db/client";
import { accounts, connectionTokens, deliveries, sessions } from "@/lib/db/schema";
import { accountForToken, createSession, revokeSession } from "@/lib/auth/session";
import { getLeetCodeIdentity } from "@/lib/leetcode/user-identity";
import { getLastDaySolvedQuestions } from "@/lib/leetcode/last-day-solved";
import { ApiError } from "@/lib/http/api-error";
import { registerUsername, createConnectionLink } from "@/lib/tracking/registration";
import { hashToken } from "@/lib/tracking/security";
import { processTrackingUpdate } from "@/lib/tracking/webhook";
import {
  acquireDispatchLock,
  claimDelivery,
  prepareDeliveries,
  releaseDispatchLock,
} from "@/lib/tracking/delivery-store";
import { dispatchTracking } from "@/lib/tracking/dispatch";
import { sendTrackingMessage, TrackingTelegramError } from "@/lib/tracking/telegram-client";

vi.mock("@/lib/leetcode/user-identity", () => ({
  getLeetCodeIdentity: vi.fn(async (username: string) => username),
}));
vi.mock("@/lib/leetcode/last-day-solved", () => ({ getLastDaySolvedQuestions: vi.fn() }));
vi.mock("@/lib/tracking/telegram-client", async (original) => ({
  ...(await original<typeof import("@/lib/tracking/telegram-client")>()),
  sendTrackingMessage: vi.fn(async () => {}),
}));

const namespace = process.env.TRACKING_TEST_SCHEMA!;
if (!/^tracking_test_[a-f0-9]{16}$/.test(namespace))
  throw new Error("Database tests require an isolated generated schema.");
const admin = postgres(process.env.DATABASE_URL!, {
  max: 1,
  prepare: false,
  connect_timeout: 10,
  onnotice: () => {},
});
const now = new Date("2026-10-13T03:00:00Z");

beforeAll(async () => {
  const migration = (await readFile("migrations/0001_tracking.sql", "utf8")).replace(
    /\btracking\b/g,
    namespace,
  );
  await admin.unsafe(migration);
});
beforeEach(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(now);
  vi.stubEnv("APP_URL", "http://localhost:3000");
  vi.stubEnv("TRACKING_REGISTRATION_ENABLED", "true");
  vi.stubEnv("TRACKING_TELEGRAM_BOT_TOKEN", "42:tracking-token");
  vi.stubEnv("TRACKING_TELEGRAM_BOT_USERNAME", "tracking_test_bot");
  vi.stubEnv("TRACKING_TELEGRAM_WEBHOOK_SECRET", "tracking-secret");
  vi.stubEnv("TELEGRAM_LOGIN_CLIENT_ID", "42");
  vi.stubEnv("TELEGRAM_LOGIN_CLIENT_SECRET", "login-secret");
  await admin.unsafe(
    `TRUNCATE ${namespace}.accounts, ${namespace}.login_attempts, ${namespace}.telegram_updates, ${namespace}.dispatch_lock CASCADE`,
  );
  vi.mocked(getLeetCodeIdentity).mockImplementation(async (username) => username);
  vi.mocked(sendTrackingMessage).mockResolvedValue();
  vi.mocked(getLastDaySolvedQuestions).mockRejectedValue(new ApiError(502, "Upstream unavailable"));
});
afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
  vi.useRealTimers();
});
afterAll(async () => {
  await closeDatabase();
  await admin.unsafe(`DROP SCHEMA IF EXISTS ${namespace} CASCADE`);
  await admin.end();
});

async function account(telegramId = 101, username?: string) {
  const [result] = await db()
    .insert(accounts)
    .values({ telegramId, leetcodeUsername: username, registeredAt: username ? now : null })
    .returning();
  return result;
}
async function activeAccount(telegramId = 101) {
  const created = await account(telegramId, `user_${telegramId}`);
  const [result] = await db()
    .update(accounts)
    .set({ chatId: telegramId, status: "active", connectedAt: new Date(now.getTime() - 60_000) })
    .where(eq(accounts.id, created.id))
    .returning();
  return result;
}
const startToken = (url: string) => new URL(url).searchParams.get("start")!;

describe("registration and database invariants", () => {
  it("saves the canonical name once and rejects subsequent edits", async () => {
    const user = await account();
    vi.mocked(getLeetCodeIdentity).mockResolvedValue("Canonical_User");
    expect((await registerUsername(user, "canonical_user")).username).toBe("Canonical_User");
    await expect(registerUsername(user, "different")).rejects.toMatchObject({ status: 409 });
    await expect(
      db().update(accounts).set({ leetcodeUsername: "different" }).where(eq(accounts.id, user.id)),
    ).rejects.toThrow();
    await expect(
      db().update(accounts).set({ leetcodeUsername: null }).where(eq(accounts.id, user.id)),
    ).rejects.toThrow();
    await expect(
      db().update(accounts).set({ telegramId: 999 }).where(eq(accounts.id, user.id)),
    ).rejects.toThrow();
  });
  it("allows exactly one case-insensitive registration during a race", async () => {
    const users = await Promise.all([account(101), account(102)]);
    const results = await Promise.allSettled(
      users.map((user, i) => registerUsername(user, i ? "SAME_USER" : "same_user")),
    );
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.find((result) => result.status === "rejected")).toMatchObject({
      reason: { status: 409 },
    });
  });
  it("allows only one simultaneous registration for the same account", async () => {
    const user = await account();
    const results = await Promise.allSettled([
      registerUsername(user, "first"),
      registerUsername(user, "second"),
    ]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
  });
  it("does not persist a username after upstream failure", async () => {
    const user = await account();
    vi.mocked(getLeetCodeIdentity).mockRejectedValue(new Error("upstream unavailable"));
    await expect(registerUsername(user, "missing")).rejects.toThrow();
    expect((await db().select().from(accounts))[0].leetcodeUsername).toBeNull();
  });
});

describe("sessions", () => {
  it("stores only a hash and resolves the correct account", async () => {
    const first = await account(101);
    await account(102);
    const token = await createSession(first.id);
    expect((await accountForToken(token))?.id).toBe(first.id);
    expect((await db().select().from(sessions))[0].tokenHash).toBe(hashToken(token));
    expect(await accountForToken("forged")).toBeNull();
  });
  it("rejects expired and revoked sessions", async () => {
    const user = await account();
    const token = await createSession(user.id);
    vi.setSystemTime(new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000));
    expect(await accountForToken(token)).toBeNull();
    vi.setSystemTime(now);
    await revokeSession(token);
    expect(await accountForToken(token)).toBeNull();
  });
});

describe("Telegram account binding", () => {
  it("keeps a newly activated account active when membership arrives after Start", async () => {
    const user = await activeAccount();
    await processTrackingUpdate({ updateId: 1, userId: 101, chatId: 101, blocked: false });
    expect((await db().select().from(accounts).where(eq(accounts.id, user.id)))[0].status).toBe(
      "active",
    );
    await processTrackingUpdate({ updateId: 2, userId: 101, chatId: 101, blocked: true });
    await processTrackingUpdate({ updateId: 3, userId: 101, chatId: 101, blocked: false });
    expect((await db().select().from(accounts).where(eq(accounts.id, user.id)))[0].status).toBe(
      "paused",
    );
  });
  it("rejects a forwarded token without consuming the owner's link", async () => {
    const owner = await account(101, "owner");
    await account(102, "other");
    const link = await createConnectionLink(owner);
    const token = startToken(link.url);
    const reply = await processTrackingUpdate({
      updateId: 1,
      userId: 102,
      chatId: 102,
      text: `/start ${token}`,
    });
    expect(reply).toContain("same Telegram account");
    expect(
      await processTrackingUpdate({
        updateId: 2,
        userId: 101,
        chatId: 101,
        text: `/start ${token}`,
      }),
    ).toContain("active for owner");
    expect(
      await processTrackingUpdate({
        updateId: 2,
        userId: 101,
        chatId: 101,
        text: `/start ${token}`,
      }),
    ).toBeNull();
    expect(
      await processTrackingUpdate({
        updateId: 3,
        userId: 101,
        chatId: 101,
        text: `/start ${token}`,
      }),
    ).toContain("expired");
  });
  it("expires links after 15 minutes and invalidates earlier links", async () => {
    const user = await account(101, "owner");
    const first = await createConnectionLink(user);
    const second = await createConnectionLink(user);
    expect((await db().select().from(connectionTokens))[0].tokenHash).toBe(
      hashToken(startToken(second.url)),
    );
    expect(
      await processTrackingUpdate({
        updateId: 1,
        userId: 101,
        chatId: 101,
        text: `/start ${startToken(first.url)}`,
      }),
    ).toContain("expired");
    vi.setSystemTime(new Date(now.getTime() + 15 * 60 * 1000));
    expect(
      await processTrackingUpdate({
        updateId: 2,
        userId: 101,
        chatId: 101,
        text: `/start ${startToken(second.url)}`,
      }),
    ).toContain("expired");
  });
  it("requires the connection link before an unbound account can start", async () => {
    await account(101, "owner");
    expect(
      await processTrackingUpdate({ updateId: 1, userId: 101, chatId: 101, text: "/start" }),
    ).toContain("Set up");
    expect((await db().select().from(accounts))[0].chatId).toBeNull();
  });
  it("pauses pending deliveries and resumes only the same fixed account", async () => {
    const user = await activeAccount();
    await prepareDeliveries(now);
    expect(
      await processTrackingUpdate({ updateId: 1, userId: 101, chatId: 101, text: "/stop" }),
    ).toContain("paused");
    expect((await db().select().from(deliveries))[0].status).toBe("cancelled");
    expect(
      await processTrackingUpdate({ updateId: 2, userId: 101, chatId: 101, text: "/start" }),
    ).toContain("active for user_101");
    expect((await db().select().from(accounts))[0].leetcodeUsername).toBe(user.leetcodeUsername);
    await expect(
      db().update(accounts).set({ chatId: 102 }).where(eq(accounts.id, user.id)),
    ).rejects.toThrow();
  });
});

describe("durable delivery processing", () => {
  it("persists pending work when the execution budget is exhausted", async () => {
    await activeAccount();
    expect((await dispatchTracking({ now, budgetMs: 0, pause: async () => {} })).sent).toBe(0);
    expect((await db().select().from(deliveries))[0].status).toBe("pending");
    expect(sendTrackingMessage).not.toHaveBeenCalled();
  });
  it("records lookup failures without sending an empty-day report", async () => {
    await activeAccount();
    await dispatchTracking({ now, pause: async () => {} });
    expect(sendTrackingMessage).not.toHaveBeenCalled();
    expect((await db().select().from(deliveries))[0]).toMatchObject({
      status: "failed",
      messages: null,
      lastError: "lookup_502",
    });
  });
  it("fetches the stored report period and sends the exact empty-day message", async () => {
    await activeAccount();
    vi.mocked(getLastDaySolvedQuestions).mockResolvedValue({
      username: "user_101",
      period: "lastday",
      timezone: "Asia/Kolkata",
      start: "2026-10-11T18:30:00.000Z",
      end: "2026-10-12T18:30:00.000Z",
      count: 0,
      questions: [],
      mayBeIncomplete: false,
    });
    await dispatchTracking({ now, pause: async () => {} });
    expect(getLastDaySolvedQuestions).toHaveBeenCalledWith(
      "user_101",
      new Date("2026-10-12T18:30:00.000Z"),
    );
    expect(sendTrackingMessage).toHaveBeenCalledWith(
      101,
      "hmm..no question found.do it today, I will be waiting",
    );
  });
  it("creates one record per date, preserving the exact yesterday boundaries", async () => {
    await activeAccount();
    await prepareDeliveries(now);
    await prepareDeliveries(new Date(now.getTime() + 60 * 60 * 1000));
    const rows = await db().select().from(deliveries);
    expect(rows).toHaveLength(1);
    expect(rows[0].reportDate).toBe("2026-10-12");
    expect(rows[0].start.toISOString()).toBe("2026-10-11T18:30:00.000Z");
    expect(rows[0].end.toISOString()).toBe("2026-10-12T18:30:00.000Z");
  });
  it("does not include a user connected after the scheduled morning cutoff", async () => {
    const user = await account(101, "late_user");
    await db()
      .update(accounts)
      .set({ chatId: 101, connectedAt: new Date(now.getTime() + 1000), status: "active" })
      .where(eq(accounts.id, user.id));
    await prepareDeliveries(new Date(now.getTime() + 3600_000));
    expect(await db().select().from(deliveries)).toHaveLength(0);
  });
  it("leases each record to only one concurrent worker", async () => {
    await activeAccount();
    await prepareDeliveries(now);
    const claimed = await Promise.all([
      claimDelivery("2026-10-12", now),
      claimDelivery("2026-10-12", now),
    ]);
    expect(claimed.filter(Boolean)).toHaveLength(1);
  });
  it("prevents overlapping dispatcher runs", async () => {
    const token = await acquireDispatchLock(now);
    expect(token).toBeTruthy();
    expect(await acquireDispatchLock(now)).toBeNull();
    await releaseDispatchLock(token!);
    expect(await acquireDispatchLock(now)).toBeTruthy();
  });
  it("resumes only the unsent message parts after an interrupted run", async () => {
    await activeAccount();
    await prepareDeliveries(now);
    await db()
      .update(deliveries)
      .set({
        messages: ["already delivered", "remaining message"],
        sentParts: 1,
        status: "sending",
        leaseToken: "old-lease",
        leaseUntil: new Date(now.getTime() - 1000),
      });
    expect((await dispatchTracking({ now, pause: async () => {} })).sent).toBe(1);
    expect(sendTrackingMessage).toHaveBeenCalledExactlyOnceWith(101, "remaining message");
    expect((await dispatchTracking({ now, pause: async () => {} })).sent).toBe(0);
  });
  it("blocks the account when Telegram rejects delivery with 403", async () => {
    const user = await activeAccount();
    await prepareDeliveries(now);
    await db()
      .update(deliveries)
      .set({ messages: ["report"] });
    vi.mocked(sendTrackingMessage).mockRejectedValue(new TrackingTelegramError("blocked"));
    await dispatchTracking({ now, pause: async () => {} });
    expect((await db().select().from(accounts).where(eq(accounts.id, user.id)))[0].status).toBe(
      "blocked",
    );
    expect((await db().select().from(deliveries))[0].status).toBe("cancelled");
  });
  it("persists Telegram retry_after and avoids retrying early", async () => {
    await activeAccount();
    await prepareDeliveries(now);
    await db()
      .update(deliveries)
      .set({ messages: ["report"] });
    vi.mocked(sendTrackingMessage).mockRejectedValue(new TrackingTelegramError("rate_limit", 120));
    await dispatchTracking({ now, pause: async () => {} });
    const [row] = await db().select().from(deliveries);
    expect(row.nextAttemptAt.getTime()).toBe(now.getTime() + 120_000);
    expect(await claimDelivery("2026-10-12", new Date(now.getTime() + 119_000))).toBeNull();
  });
  it("delivers a 100-user batch and does not resend successful reports", async () => {
    await db()
      .insert(accounts)
      .values(
        Array.from({ length: 100 }, (_, i) => ({
          telegramId: 1000 + i,
          chatId: 1000 + i,
          leetcodeUsername: `batch_${i}`,
          status: "active",
          registeredAt: now,
          connectedAt: new Date(now.getTime() - 60_000),
        })),
      );
    await prepareDeliveries(now);
    await db()
      .update(deliveries)
      .set({ messages: ["daily report"] });
    expect((await dispatchTracking({ now, pause: async () => {} })).sent).toBe(100);
    expect(sendTrackingMessage).toHaveBeenCalledTimes(100);
    expect(
      await db()
        .select()
        .from(deliveries)
        .where(and(eq(deliveries.reportDate, "2026-10-12"), eq(deliveries.status, "sent"))),
    ).toHaveLength(100);
    expect((await dispatchTracking({ now, pause: async () => {} })).sent).toBe(0);
  }, 280_000);
});
