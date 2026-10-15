import { readFile, readdir } from "node:fs/promises";
import postgres from "postgres";
import { and, eq } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { db, closeDatabase } from "@/lib/db/client";
import {
  accounts,
  acceptedActivity,
  activityDays,
  activityGoals,
  connectionTokens,
  deliveries,
  sessions,
  gfgProblems,
  gfgSnapshots,
  hackerRankProblems,
  hackerRankSnapshots,
  hackerRankSync,
} from "@/lib/db/schema";
import { getHackerRankProfile } from "@/lib/hackerrank/client";
import { getHackerRankProgress, registerHackerRank } from "@/lib/hackerrank/service";
import {
  claimHackerRankSync,
  readHackerRankProblems,
  saveHackerRankSync,
} from "@/lib/hackerrank/store";
import { hackerRankProfile as profileFixture } from "./hackerrank-fixtures";
import { getGfgProfile } from "@/lib/gfg/client";
import { getGfgProgress, registerGfg } from "@/lib/gfg/service";
import { claimGfgSync, readGfgProblems, saveGfgSync } from "@/lib/gfg/store";
import type { GfgProfile } from "@/lib/gfg/types";
import { getAcceptedHistory } from "@/lib/leetcode/accepted-history";
import { getAccountActivity } from "@/lib/activity/service";
import { getActivityDay } from "@/lib/activity/details";
import { getWeeklyGoal, saveWeeklyGoal } from "@/lib/activity/goals";
import { observeAcceptedHistory } from "@/lib/activity/observations";
import {
  claimActivitySync,
  readActivity,
  saveActivitySync,
  writeActivityObservation,
} from "@/lib/activity/store";
import { accountForToken, createSession, revokeSession } from "@/lib/auth/session";
import { getLeetCodeIdentity } from "@/lib/leetcode/user-identity";
import { getLastDaySolvedQuestions } from "@/lib/leetcode/last-day-solved";
import { ApiError } from "@/lib/http/api-error";
import {
  registerUsername,
  createConnectionLink,
  trackingStatus,
} from "@/lib/tracking/registration";
import { hashToken } from "@/lib/tracking/security";
import { processTrackingUpdate } from "@/lib/tracking/webhook";
import {
  acquireDispatchLock,
  blockAccount,
  claimDelivery,
  prepareDeliveries,
  prepareEmptyDayReports,
  prepareDeliveryReport,
  releaseDispatchLock,
} from "@/lib/tracking/delivery-store";
import { EMPTY_REPORT } from "@/lib/tracking/format-report";
import { dispatchTracking } from "@/lib/tracking/dispatch";
import { sendTrackingMessage, TrackingTelegramError } from "@/lib/tracking/telegram-client";

vi.mock("@/lib/leetcode/user-identity", () => ({
  getLeetCodeIdentity: vi.fn(async (username: string) => username),
}));
vi.mock("@/lib/leetcode/last-day-solved", () => ({ getLastDaySolvedQuestions: vi.fn() }));
vi.mock("@/lib/leetcode/accepted-history", () => ({ getAcceptedHistory: vi.fn() }));
vi.mock("@/lib/hackerrank/client", () => ({ getHackerRankProfile: vi.fn() }));
vi.mock("@/lib/gfg/client", () => ({ getGfgProfile: vi.fn() }));
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
function hrProfile(username = "hr_101", ids = ["old"], checkedAt = now) {
  const result = profileFixture(username, ids, checkedAt);
  result.problems = result.problems.map((problem) => ({
    ...problem,
    solvedAt: "2026-10-12T02:00:00.000Z",
  }));
  return result;
}
function gfgProfile(username = "gfg_101", ids = ["old"], checkedAt = now): GfgProfile {
  return {
    platform: "gfg",
    username,
    totalSolved: ids.length,
    checkedAt: checkedAt.toISOString(),
    historyComplete: true,
    difficultyBreakdown: { School: 0, Basic: 0, Easy: ids.length, Medium: 0, Hard: 0 },
    problems: ids.map((id) => ({
      id,
      title: id,
      difficulty: "Easy",
      status: "Accepted",
      acceptedAt: null,
      reportedSubmissionTime: "2026-10-12 22:40:00",
      url: `https://www.geeksforgeeks.org/problems/${id}/1`,
    })),
  };
}

function gfgDatedProfile(username = "gfg_101", ids = ["old"]) {
  const profile = gfgProfile(username, ids);
  profile.problems = profile.problems.map((problem) => ({
    ...problem,
    acceptedAt: "2026-10-12T02:00:00.000Z",
  }));
  return profile;
}
function leetcodeReport(username = "user_101", ids: string[] = []) {
  return {
    username,
    period: "lastday" as const,
    timezone: "Asia/Kolkata" as const,
    start: "2026-10-11T18:30:00.000Z",
    end: "2026-10-12T18:30:00.000Z",
    count: ids.length,
    mayBeIncomplete: false,
    questions: ids.map((id) => ({
      title: id,
      titleSlug: id,
      timestamp: String(Date.parse("2026-10-12T02:00:00Z") / 1000),
    })),
  };
}

beforeAll(async () => {
  for (const filename of (await readdir("migrations"))
    .filter((name) => name.endsWith(".sql"))
    .sort()) {
    const migration = (await readFile(`migrations/${filename}`, "utf8")).replace(
      /\btracking\b/g,
      namespace,
    );
    await admin.unsafe(migration);
  }
  // Postgres's real clock cannot be mocked by Vitest. Match this test-only default to the fixed clock.
  await admin.unsafe(
    `ALTER TABLE ${namespace}.deliveries ALTER COLUMN next_attempt_at SET DEFAULT '${now.toISOString()}'::timestamptz`,
  );
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
  vi.mocked(getAcceptedHistory).mockResolvedValue({ username: "user_101", submissions: [] });
  vi.mocked(getHackerRankProfile).mockImplementation(async (username, at = now) =>
    hrProfile(String(username), ["old"], at),
  );
  vi.mocked(getGfgProfile).mockImplementation(async (username, at = now) =>
    gfgProfile(String(username), ["old"], at),
  );
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

const accepted = (titleSlug: string, instant: string) => ({
  title: titleSlug,
  titleSlug,
  timestamp: String(Date.parse(instant) / 1000),
});
const record = (accountId: string, history: ReturnType<typeof accepted>[], at = now) =>
  db().transaction((tx) =>
    writeActivityObservation(tx, accountId, observeAcceptedHistory(history, at)),
  );
const onDay = (result: Awaited<ReturnType<typeof readActivity>>, date: string) =>
  result.days.find((day) => day.date === date)!;

describe("saved problem details and persistent weekly goals", () => {
  it("returns only the selected account's saved day and deduplicates weekly re-solves", async () => {
    const first = await activeAccount(101);
    const second = await activeAccount(102);
    await record(first.id, [
      accepted("same", "2026-10-12T01:00:00Z"),
      accepted("same", "2026-10-13T01:00:00Z"),
      accepted("another", "2026-10-12T02:00:00Z"),
      accepted("last-week", "2026-10-11T02:00:00Z"),
    ]);
    await record(second.id, [accepted("private-other", "2026-10-12T01:00:00Z")]);
    const details = await getActivityDay(first, "leetcode", "2026-10-12", now);
    expect(details).toEqual({
      date: "2026-10-12",
      basis: "accepted",
      problems: [
        { id: "another", title: "another", url: "https://leetcode.com/problems/another/" },
        { id: "same", title: "same", url: "https://leetcode.com/problems/same/" },
      ],
    });
    expect(
      (await getActivityDay(second, "leetcode", "2026-10-12", now)).problems.map(
        (problem) => problem.id,
      ),
    ).toEqual(["private-other"]);
    const result = await readActivity(first, now);
    expect(result.weekly.current.count).toBe(2);
    expect(result.weekly.previous.count).toBe(1);
    expect(result.weekly.previousToDate.count).toBe(0);
    expect(getAcceptedHistory).not.toHaveBeenCalled();
  });
  it("persists separate account and platform goals, updates atomically, and removes only the chosen target", async () => {
    const first = await activeAccount(101);
    const second = await activeAccount(102);
    await registerGfg(first, "gfg_101");
    const [registered] = await db().select().from(accounts).where(eq(accounts.id, first.id));
    expect(await getWeeklyGoal(registered, "leetcode")).toEqual({ weeklyTarget: null });
    await saveWeeklyGoal(registered, "leetcode", 5);
    await saveWeeklyGoal(registered, "gfg", 7);
    await saveWeeklyGoal(second, "leetcode", 12);
    await Promise.all([
      saveWeeklyGoal(registered, "leetcode", 10),
      saveWeeklyGoal(registered, "leetcode", 20),
    ]);
    expect([10, 20]).toContain((await getWeeklyGoal(registered, "leetcode")).weeklyTarget);
    expect(await db().select().from(activityGoals)).toHaveLength(3);
    expect(await getWeeklyGoal(registered, "gfg")).toEqual({ weeklyTarget: 7 });
    expect(await getWeeklyGoal(second, "leetcode")).toEqual({ weeklyTarget: 12 });
    await saveWeeklyGoal(registered, "leetcode", null);
    expect(await getWeeklyGoal(registered, "leetcode")).toEqual({ weeklyTarget: null });
    expect(await getWeeklyGoal(registered, "gfg")).toEqual({ weeklyTarget: 7 });
    expect(await getWeeklyGoal(second, "leetcode")).toEqual({ weeklyTarget: 12 });
  });
  it("requires platform registration and enforces target bounds in PostgreSQL", async () => {
    const user = await activeAccount();
    await expect(saveWeeklyGoal(user, "gfg", 5)).rejects.toMatchObject({ status: 409 });
    await expect(getActivityDay(user, "gfg", "2026-10-12", now)).rejects.toMatchObject({
      status: 409,
    });
    for (const target of [0, -1, 1001]) {
      await expect(
        db()
          .insert(activityGoals)
          .values({ accountId: user.id, platform: "leetcode", weeklyTarget: target }),
      ).rejects.toThrow();
    }
    expect(await db().select().from(activityGoals)).toHaveLength(0);
  });
  it("uses GFG observation dates, excludes the initial import, and does not fetch upstream on day selection", async () => {
    const user = await activeAccount();
    await registerGfg(user, "gfg_101");
    const [registered] = await db().select().from(accounts).where(eq(accounts.id, user.id));
    const later = new Date(now.getTime() + 6 * 60_000);
    vi.mocked(getGfgProfile).mockResolvedValueOnce(gfgProfile("gfg_101", ["old", "new"], later));
    const progress = await getGfgProgress(registered, undefined, later);
    expect(progress.weekly.current.count).toBe(1);
    const calls = vi.mocked(getGfgProfile).mock.calls.length;
    expect(await getActivityDay(registered, "gfg", "2026-10-13", later)).toEqual({
      date: "2026-10-13",
      basis: "observed",
      problems: [
        {
          id: "new",
          title: "new",
          difficulty: "Easy",
          url: "https://www.geeksforgeeks.org/problems/new/1",
        },
      ],
    });
    expect((await getActivityDay(registered, "gfg", "2026-10-12", later)).problems).toEqual([]);
    expect(getGfgProfile).toHaveBeenCalledTimes(calls);
  });
  it("uses the same GFG timestamp basis and IST boundaries for the calendar and day details", async () => {
    const user = await activeAccount();
    const data = gfgProfile("gfg_101", ["before", "after"]);
    data.problems[0].acceptedAt = "2026-10-11T18:29:59.000Z";
    data.problems[1].acceptedAt = "2026-10-11T18:30:00.000Z";
    vi.mocked(getGfgProfile).mockResolvedValueOnce(data);
    await registerGfg(user, "gfg_101");
    const [registered] = await db().select().from(accounts).where(eq(accounts.id, user.id));
    const progress = await getGfgProgress(registered, undefined, now);
    expect(progress.dateBasis).toBe("earliest_available_timestamp");
    expect(progress.weekly.current.count).toBe(1);
    const details = await getActivityDay(registered, "gfg", "2026-10-12", now);
    expect(details.basis).toBe("accepted");
    expect(details.problems.map((problem) => problem.id)).toEqual(["after"]);
    expect(progress.days.find((day) => day.date === details.date)?.count).toBe(
      details.problems.length,
    );
  });
});

describe("one shared empty-day reminder", () => {
  beforeEach(() => {
    vi.mocked(getLastDaySolvedQuestions).mockImplementation(async (username) =>
      leetcodeReport(username),
    );
    vi.mocked(getGfgProfile).mockImplementation(async (username) =>
      gfgProfile(String(username), []),
    );
    vi.mocked(getHackerRankProfile).mockImplementation(async (username) =>
      hrProfile(String(username), []),
    );
  });
  async function allPlatforms() {
    const user = await activeAccount();
    await registerGfg(user, "gfg_101");
    await registerHackerRank(user, "hr_101");
    return (await db().select().from(accounts).where(eq(accounts.id, user.id)))[0];
  }
  it("sends exactly one custom message when all three platforms have no yesterday problems", async () => {
    await allPlatforms();
    expect(await dispatchTracking({ now, pause: async () => {} })).toMatchObject({
      sent: 1,
      failed: 0,
    });
    expect(sendTrackingMessage).toHaveBeenCalledExactlyOnceWith(101, EMPTY_REPORT);
    const rows = await db().select().from(deliveries);
    expect(rows).toHaveLength(3);
    expect(rows.filter((row) => row.messages?.length)).toHaveLength(1);
    expect(rows.every((row) => row.status === "sent")).toBe(true);
    expect(await dispatchTracking({ now, pause: async () => {} })).toMatchObject({
      sent: 0,
      failed: 0,
    });
    expect(sendTrackingMessage).toHaveBeenCalledTimes(1);
  });
  it.each(["leetcode", "gfg", "hackerrank"] as const)(
    "uses the same single reminder for a %s-only account",
    async (platform) => {
      const user = platform === "leetcode" ? await activeAccount() : await account();
      if (platform !== "leetcode") {
        if (platform === "gfg") await registerGfg(user, "gfg_101");
        else await registerHackerRank(user, "hr_101");
        await db()
          .update(accounts)
          .set({ chatId: 101, status: "active", connectedAt: now })
          .where(eq(accounts.id, user.id));
      }
      expect((await dispatchTracking({ now, pause: async () => {} })).sent).toBe(1);
      expect(sendTrackingMessage).toHaveBeenCalledExactlyOnceWith(101, EMPTY_REPORT);
    },
  );
  it.each(["leetcode", "gfg", "hackerrank"] as const)(
    "sends only %s data when the other two platforms are empty",
    async (platform) => {
      const user = await allPlatforms();
      if (platform === "leetcode")
        vi.mocked(getLastDaySolvedQuestions).mockResolvedValueOnce(
          leetcodeReport("user_101", ["two-sum"]),
        );
      if (platform === "gfg")
        vi.mocked(getGfgProfile).mockResolvedValueOnce(gfgDatedProfile("gfg_101", ["two-sum"]));
      if (platform === "hackerrank")
        vi.mocked(getHackerRankProfile).mockResolvedValueOnce(hrProfile("hr_101", ["two-sum"]));
      expect(await dispatchTracking({ now, pause: async () => {} })).toMatchObject({
        sent: 1,
        failed: 0,
      });
      expect(sendTrackingMessage).toHaveBeenCalledExactlyOnceWith(
        101,
        expect.stringContaining("two-sum"),
      );
      expect(vi.mocked(sendTrackingMessage).mock.calls[0][1]).not.toContain(EMPTY_REPORT);
      const silent = platform === "leetcode" ? "gfg" : "leetcode";
      expect((await trackingStatus(user, silent)).lastDelivery).toMatchObject({
        status: "empty",
        sentAt: null,
      });
      expect((await dispatchTracking({ now, pause: async () => {} })).sent).toBe(0);
    },
  );
  it("sends both nonempty platform reports and no reminder for the empty platform", async () => {
    await allPlatforms();
    vi.mocked(getLastDaySolvedQuestions).mockResolvedValueOnce(
      leetcodeReport("user_101", ["two-sum"]),
    );
    vi.mocked(getHackerRankProfile).mockResolvedValueOnce(hrProfile("hr_101", ["challenge"]));
    expect((await dispatchTracking({ now, pause: async () => {} })).sent).toBe(2);
    expect(sendTrackingMessage).toHaveBeenCalledTimes(2);
    expect(
      vi
        .mocked(sendTrackingMessage)
        .mock.calls.every(([, message]) => !message.includes(EMPTY_REPORT)),
    ).toBe(true);
  });
  it("waits for a failed platform, then sends one reminder after an empty recovery", async () => {
    await allPlatforms();
    vi.mocked(getHackerRankProfile).mockRejectedValueOnce(new ApiError(502, "Unavailable"));
    expect(await dispatchTracking({ now, pause: async () => {} })).toMatchObject({
      sent: 0,
      failed: 1,
    });
    expect(sendTrackingMessage).not.toHaveBeenCalled();
    vi.setSystemTime(new Date(now.getTime() + 61_000));
    expect((await dispatchTracking({ now: new Date(), pause: async () => {} })).sent).toBe(1);
    expect(sendTrackingMessage).toHaveBeenCalledExactlyOnceWith(101, EMPTY_REPORT);
    expect(getLastDaySolvedQuestions).toHaveBeenCalledTimes(1);
    expect(getHackerRankProfile).toHaveBeenCalledTimes(3); // Registration, failure, recovery.
  });
  it("sends recovered data instead of a reminder after another platform was empty", async () => {
    await allPlatforms();
    vi.mocked(getGfgProfile).mockRejectedValueOnce(new ApiError(429, "Rate limited"));
    await dispatchTracking({ now, pause: async () => {} });
    expect(sendTrackingMessage).not.toHaveBeenCalled();
    vi.mocked(getGfgProfile).mockResolvedValueOnce(gfgDatedProfile("gfg_101", ["recovered"]));
    vi.setSystemTime(new Date(now.getTime() + 5 * 60_000));
    expect((await dispatchTracking({ now: new Date(), pause: async () => {} })).sent).toBe(1);
    expect(sendTrackingMessage).toHaveBeenCalledExactlyOnceWith(
      101,
      expect.stringContaining("/recovered/1"),
    );
  });
  it("retries the same shared message after a Telegram rate limit without fetching platforms again", async () => {
    await allPlatforms();
    vi.mocked(sendTrackingMessage).mockRejectedValueOnce(
      new TrackingTelegramError("rate_limit", 120),
    );
    expect(await dispatchTracking({ now, pause: async () => {} })).toMatchObject({
      sent: 0,
      failed: 1,
    });
    const calls = [
      vi.mocked(getLastDaySolvedQuestions).mock.calls.length,
      vi.mocked(getGfgProfile).mock.calls.length,
      vi.mocked(getHackerRankProfile).mock.calls.length,
    ];
    expect((await dispatchTracking({ now, pause: async () => {} })).sent).toBe(0);
    expect(sendTrackingMessage).toHaveBeenCalledTimes(1);
    vi.setSystemTime(new Date(now.getTime() + 120_000));
    expect((await dispatchTracking({ now: new Date(), pause: async () => {} })).sent).toBe(1);
    expect(sendTrackingMessage).toHaveBeenNthCalledWith(2, 101, EMPTY_REPORT);
    expect([
      vi.mocked(getLastDaySolvedQuestions).mock.calls.length,
      vi.mocked(getGfgProfile).mock.calls.length,
      vi.mocked(getHackerRankProfile).mock.calls.length,
    ]).toEqual(calls);
    expect((await dispatchTracking({ now: new Date(), pause: async () => {} })).sent).toBe(0);
  });
  it("recovers a crash after empty results were saved and prepares only one reminder concurrently", async () => {
    await allPlatforms();
    await prepareDeliveries(now);
    await db().update(deliveries).set({ messages: [], status: "sent", attempts: 3 });
    const prepared = await Promise.all([
      prepareEmptyDayReports("2026-10-12", now),
      prepareEmptyDayReports("2026-10-12", now),
    ]);
    expect(prepared.reduce((total, count) => total + count, 0)).toBe(1);
    expect((await dispatchTracking({ now, pause: async () => {} })).sent).toBe(1);
    expect(sendTrackingMessage).toHaveBeenCalledExactlyOnceWith(101, EMPTY_REPORT);
    expect(getLastDaySolvedQuestions).not.toHaveBeenCalled();
  });
  it("keeps reminders separate for each account", async () => {
    await activeAccount(101);
    await activeAccount(102);
    vi.mocked(getLastDaySolvedQuestions).mockImplementation(async (username) =>
      leetcodeReport(username, username === "user_101" ? ["two-sum"] : []),
    );
    expect((await dispatchTracking({ now, pause: async () => {} })).sent).toBe(2);
    expect(sendTrackingMessage).toHaveBeenCalledWith(101, expect.stringContaining("/two-sum/"));
    expect(sendTrackingMessage).toHaveBeenCalledWith(102, EMPTY_REPORT);
    expect(sendTrackingMessage).not.toHaveBeenCalledWith(101, EMPTY_REPORT);
  });
  it("does not schedule a reminder after the user pauses", async () => {
    await allPlatforms();
    await prepareDeliveries(now);
    await db().update(deliveries).set({ messages: [], status: "sent" });
    await processTrackingUpdate({ updateId: 1, userId: 101, chatId: 101, text: "/stop" });
    expect(await prepareEmptyDayReports("2026-10-12", now)).toBe(0);
    expect(sendTrackingMessage).not.toHaveBeenCalled();
  });
  it("sends yesterday's saved GFG observations without reporting new inventory first seen today", async () => {
    const user = await allPlatforms();
    await db()
      .insert(gfgProblems)
      .values({
        accountId: user.id,
        id: "yesterday",
        title: "Yesterday's observation",
        difficulty: "Easy",
        acceptedAt: null,
        firstObservedAt: new Date("2026-10-12T02:00:00Z"),
        baseline: false,
      });
    vi.mocked(getGfgProfile).mockResolvedValueOnce(gfgProfile("gfg_101", ["yesterday", "today"]));
    expect((await dispatchTracking({ now, pause: async () => {} })).sent).toBe(1);
    expect(sendTrackingMessage).toHaveBeenCalledExactlyOnceWith(
      101,
      expect.stringContaining("/yesterday/1"),
    );
    const message = vi.mocked(sendTrackingMessage).mock.calls[0][1];
    expect(message).toContain("solve dates unverified");
    expect(message).not.toContain("/today/1");
    expect(message).not.toContain(EMPTY_REPORT);
  });
});

describe("separate HackerRank registration, calendar, and reports", () => {
  async function registeredAccount(telegramId = 101) {
    const user = await account(telegramId);
    await registerHackerRank(user, `hr_${telegramId}`);
    return (await db().select().from(accounts).where(eq(accounts.id, user.id)))[0];
  }
  it("connects a HackerRank-only account through the existing bot and schedules only its opted-in report", async () => {
    const user = await registeredAccount();
    expect(user).toMatchObject({
      leetcodeUsername: null,
      gfgUsername: null,
      hackerRankUsername: "hr_101",
    });
    expect(
      await processTrackingUpdate({
        updateId: 99,
        userId: 101,
        chatId: 101,
        text: "/start invalid-token",
      }),
    ).toContain("/feature?platform=hackerrank");
    const link = await createConnectionLink(user);
    expect(
      await processTrackingUpdate({
        updateId: 1,
        userId: 101,
        chatId: 101,
        text: `/start ${startToken(link.url)}`,
      }),
    ).toContain("HackerRank hr_101");
    await prepareDeliveries(now);
    await prepareDeliveries(now);
    expect((await db().select().from(deliveries)).map((row) => row.platform)).toEqual([
      "hackerrank",
    ]);
    expect(
      (await trackingStatus((await db().select().from(accounts))[0], "hackerrank")).connected,
    ).toBe(true);
  });
  it("enforces permanent, case-insensitive usernames and registration timestamps in the database", async () => {
    const first = await registeredAccount();
    const second = await account(102);
    await expect(registerHackerRank(second, "HR_101")).rejects.toMatchObject({ status: 409 });
    await expect(registerHackerRank(first, "replacement")).rejects.toMatchObject({ status: 409 });
    await expect(
      db()
        .update(accounts)
        .set({ hackerRankUsername: "replacement" })
        .where(eq(accounts.id, first.id)),
    ).rejects.toThrow();
    await expect(
      db()
        .update(accounts)
        .set({ hackerRankRegisteredAt: new Date(now.getTime() + 1000) })
        .where(eq(accounts.id, first.id)),
    ).rejects.toThrow();
    expect(
      (await db().select().from(accounts).where(eq(accounts.id, second.id)))[0].hackerRankUsername,
    ).toBeNull();
  });
  it("rolls back registration when public verification fails", async () => {
    const user = await account();
    vi.mocked(getHackerRankProfile).mockRejectedValueOnce(new ApiError(404, "User not found"));
    await expect(registerHackerRank(user, "missing")).rejects.toMatchObject({ status: 404 });
    expect((await db().select().from(accounts))[0].hackerRankUsername).toBeNull();
    expect(await db().select().from(hackerRankProblems)).toEqual([]);
  });
  it("imports timestamped history, caches refreshes, and preserves older saved challenges", async () => {
    const user = await registeredAccount();
    const initial = await getHackerRankProgress(user, now);
    expect(initial).toMatchObject({ savedSolved: 1, solvedToday: 0, solvedThisWeek: 1 });
    expect(getHackerRankProfile).toHaveBeenCalledTimes(1);
    const later = new Date(now.getTime() + 6 * 60_000);
    vi.mocked(getHackerRankProfile).mockResolvedValueOnce(hrProfile("hr_101", ["new"], later));
    expect(await getHackerRankProgress(user, later)).toMatchObject({
      savedSolved: 2,
      refreshFailed: false,
    });
    const saved = await readHackerRankProblems(user.id);
    expect(saved.find((item) => item.slug === "old")?.baseline).toBe(true);
    expect(saved.find((item) => item.slug === "new")?.baseline).toBe(false);
    expect(await db().select().from(hackerRankSnapshots)).toHaveLength(1);
    expect(await claimHackerRankSync(user.id, "early", new Date(later.getTime() + 60_000))).toBe(
      false,
    );
  });
  it("leases concurrent refreshes and rolls back all writes from a lost lease", async () => {
    const user = await registeredAccount();
    const later = new Date(now.getTime() + 6 * 60_000);
    const claims = await Promise.all([
      claimHackerRankSync(user.id, "first", later),
      claimHackerRankSync(user.id, "second", later),
    ]);
    expect(claims.filter(Boolean)).toHaveLength(1);
    await expect(
      saveHackerRankSync(user.id, "forged", hrProfile("hr_101", ["uncommitted"], later)),
    ).rejects.toThrow("lease expired");
    expect((await readHackerRankProblems(user.id)).map((problem) => problem.slug)).toEqual(["old"]);
    expect((await db().select().from(hackerRankSnapshots))[0].availableSolved).toBe(1);
  });
  it("keeps saved data available and backs off after upstream rate limiting", async () => {
    const user = await registeredAccount();
    const later = new Date(now.getTime() + 6 * 60_000);
    vi.mocked(getHackerRankProfile).mockRejectedValueOnce(new ApiError(429, "Rate limited"));
    expect(await getHackerRankProgress(user, later)).toMatchObject({
      savedSolved: 1,
      refreshFailed: true,
      refreshing: false,
    });
    expect(await claimHackerRankSync(user.id, "early", new Date(later.getTime() + 60_000))).toBe(
      false,
    );
    expect(await db().select().from(hackerRankProblems)).toHaveLength(1);
  });
  it("uses the same IST boundaries for the calendar and own-account saved day links", async () => {
    const first = await account(101);
    const data = hrProfile("hr_101", ["before", "after"]);
    data.problems[0].solvedAt = "2026-10-11T18:29:59.000Z";
    data.problems[1].solvedAt = "2026-10-11T18:30:00.000Z";
    vi.mocked(getHackerRankProfile).mockResolvedValueOnce(data);
    await registerHackerRank(first, "hr_101");
    const user = (await db().select().from(accounts).where(eq(accounts.id, first.id)))[0];
    const other = await registeredAccount(102);
    const progress = await getHackerRankProgress(user, now);
    const calls = vi.mocked(getHackerRankProfile).mock.calls.length;
    const details = await getActivityDay(user, "hackerrank", "2026-10-12", now);
    expect(details).toMatchObject({
      basis: "solved",
      problems: [{ id: "master:after", url: "https://www.hackerrank.com/challenges/after" }],
    });
    expect(progress.days.find((day) => day.date === details.date)?.count).toBe(
      details.problems.length,
    );
    expect(
      (await getActivityDay(other, "hackerrank", "2026-10-12", now)).problems.map(
        (problem) => problem.id,
      ),
    ).toEqual(["master:old"]);
    expect(getHackerRankProfile).toHaveBeenCalledTimes(calls);
  });
  it("retains the earliest saved solve date when an upstream re-solve appears later", async () => {
    const user = await registeredAccount();
    const later = new Date(now.getTime() + 6 * 60_000);
    const data = hrProfile("hr_101", ["old"], later);
    data.problems[0].solvedAt = now.toISOString();
    vi.mocked(getHackerRankProfile).mockResolvedValueOnce(data);
    await getHackerRankProgress(user, later);
    expect((await readHackerRankProblems(user.id))[0].solvedAt).toBe("2026-10-12T02:00:00.000Z");
  });
  it("delivers each platform once, saves HackerRank report data, and does not resend on recovery", async () => {
    const user = await activeAccount();
    await registerGfg(user, "gfg_101");
    await registerHackerRank(user, "hr_101");
    vi.mocked(getLastDaySolvedQuestions).mockResolvedValue(leetcodeReport("user_101", ["two-sum"]));
    vi.mocked(getGfgProfile).mockResolvedValueOnce(gfgDatedProfile());
    vi.mocked(getHackerRankProfile).mockResolvedValueOnce(hrProfile("hr_101", ["old", "new"]));
    expect(await dispatchTracking({ now, pause: async () => {} })).toMatchObject({
      sent: 3,
      failed: 0,
    });
    const messages = vi.mocked(sendTrackingMessage).mock.calls.map(([, message]) => message);
    expect(
      messages.some(
        (message) =>
          message.includes("HackerRank daily recap") && message.includes("/challenges/new"),
      ),
    ).toBe(true);
    expect(await db().select().from(hackerRankProblems)).toHaveLength(2);
    expect((await db().select().from(hackerRankSync))[0].profile?.username).toBe("hr_101");
    expect(await dispatchTracking({ now, pause: async () => {} })).toMatchObject({
      sent: 0,
      failed: 0,
    });
    expect(sendTrackingMessage).toHaveBeenCalledTimes(3);
    expect((await trackingStatus(user, "hackerrank")).lastDelivery?.status).toBe("sent");
  });
  it("keeps LeetCode and GFG reports available when HackerRank is rate limited", async () => {
    const user = await activeAccount();
    await registerGfg(user, "gfg_101");
    await registerHackerRank(user, "hr_101");
    vi.mocked(getLastDaySolvedQuestions).mockResolvedValue(leetcodeReport("user_101", ["two-sum"]));
    vi.mocked(getGfgProfile).mockResolvedValueOnce(gfgDatedProfile());
    vi.mocked(getHackerRankProfile).mockRejectedValueOnce(new ApiError(429, "Rate limited"));
    expect(await dispatchTracking({ now, pause: async () => {} })).toMatchObject({
      sent: 2,
      failed: 1,
    });
    const failed = (
      await db().select().from(deliveries).where(eq(deliveries.platform, "hackerrank"))
    )[0];
    expect(failed).toMatchObject({ status: "failed", lastError: "lookup_429", messages: null });
    expect(failed.nextAttemptAt.getTime()).toBe(now.getTime() + 5 * 60_000);
  });
  it("resumes only unsent HackerRank parts and pauses pending reports on all platforms", async () => {
    const user = await activeAccount();
    await registerGfg(user, "gfg_101");
    await registerHackerRank(user, "hr_101");
    await prepareDeliveries(now);
    await db()
      .update(deliveries)
      .set({
        messages: ["already sent", "remaining HackerRank report"],
        sentParts: 1,
        status: "sending",
        leaseToken: "expired",
        leaseUntil: new Date(now.getTime() - 1),
      })
      .where(eq(deliveries.platform, "hackerrank"));
    expect((await dispatchTracking({ now, pause: async () => {} })).sent).toBe(1);
    const messages = vi.mocked(sendTrackingMessage).mock.calls.map(([, message]) => message);
    expect(messages).toContain("remaining HackerRank report");
    expect(messages).not.toContain("already sent");
    expect(getHackerRankProfile).toHaveBeenCalledTimes(1);
    // Start a fresh day's pending reports, then pause the shared bot connection.
    const tomorrow = new Date(now.getTime() + 86_400_000);
    await prepareDeliveries(tomorrow);
    await processTrackingUpdate({ updateId: 1, userId: 101, chatId: 101, text: "/stop" });
    expect(
      (await db().select().from(deliveries))
        .filter((row) => row.reportDate === "2026-10-13")
        .map((row) => row.status),
    ).toEqual(["cancelled", "cancelled", "cancelled"]);
  });
  it("excludes a HackerRank opt-in registered after the daily cutoff", async () => {
    const user = await activeAccount();
    vi.setSystemTime(new Date(now.getTime() + 60_000));
    await registerHackerRank(user, "hr_101");
    await prepareDeliveries(new Date(now.getTime() + 60_000));
    expect((await db().select().from(deliveries)).map((row) => row.platform)).toEqual(["leetcode"]);
  });
});

describe("separate GFG registration, observations, and delivery", () => {
  it("keeps LeetCode delivery available when the GFG upstream is rate limited", async () => {
    const user = await activeAccount();
    await registerGfg(user, "gfg_101");
    vi.mocked(getGfgProfile).mockRejectedValueOnce(new ApiError(429, "Rate limited"));
    vi.mocked(getLastDaySolvedQuestions).mockResolvedValue(leetcodeReport("user_101", ["two-sum"]));
    expect(await dispatchTracking({ now, pause: async () => {} })).toMatchObject({
      sent: 1,
      failed: 1,
    });
    const [failed] = await db().select().from(deliveries).where(eq(deliveries.platform, "gfg"));
    expect(failed).toMatchObject({ status: "failed", lastError: "lookup_429", messages: null });
    expect(failed.nextAttemptAt.getTime()).toBe(now.getTime() + 5 * 60_000);
    expect(sendTrackingMessage).toHaveBeenCalledExactlyOnceWith(
      101,
      expect.stringContaining("https://leetcode.com/problems/two-sum/"),
    );
  });
  it("supports a GFG-only account with the existing bot connection and no LeetCode registration", async () => {
    const user = await account();
    await registerGfg(user, "gfg_101");
    const registered = (await db().select().from(accounts).where(eq(accounts.id, user.id)))[0];
    const link = await createConnectionLink(registered);
    expect(
      await processTrackingUpdate({
        updateId: 99,
        userId: 101,
        chatId: 101,
        text: "/start invalid-token",
      }),
    ).toContain("/feature");
    expect(
      await processTrackingUpdate({
        updateId: 1,
        userId: 101,
        chatId: 101,
        text: `/start ${startToken(link.url)}`,
      }),
    ).toContain("GFG gfg_101");
    const connected = (await db().select().from(accounts).where(eq(accounts.id, user.id)))[0];
    expect(connected).toMatchObject({
      leetcodeUsername: null,
      gfgUsername: "gfg_101",
      chatId: 101,
      status: "active",
    });
    await prepareDeliveries(now);
    expect((await db().select().from(deliveries)).map((row) => row.platform)).toEqual(["gfg"]);
  });
  it("reserves GFG usernames case-insensitively and prevents account reassignment in the database", async () => {
    const first = await account(101);
    const second = await account(102);
    await registerGfg(first, "Gfg_101");
    await expect(registerGfg(second, "gfg_101")).rejects.toMatchObject({ status: 409 });
    const registered = (await db().select().from(accounts).where(eq(accounts.id, first.id)))[0];
    await expect(registerGfg(registered, "replacement")).rejects.toMatchObject({ status: 409 });
    await expect(
      db().update(accounts).set({ gfgUsername: "replacement" }).where(eq(accounts.id, first.id)),
    ).rejects.toThrow();
    expect(registered.leetcodeUsername).toBeNull();
  });
  it("imports a baseline, caches refreshes, saves newly observed IDs, and keeps one snapshot per day", async () => {
    const user = await activeAccount();
    await registerGfg(user, "gfg_101");
    const registered = (await db().select().from(accounts).where(eq(accounts.id, user.id)))[0];
    expect(await getGfgProgress(registered, undefined, now)).toMatchObject({
      totalSolved: 1,
      observedToday: 0,
      solvedToday: null,
    });
    expect(getGfgProfile).toHaveBeenCalledTimes(1);
    const later = new Date(now.getTime() + 6 * 60_000);
    vi.mocked(getGfgProfile).mockResolvedValueOnce(gfgProfile("gfg_101", ["old", "new"], later));
    expect(await getGfgProgress(registered, undefined, later)).toMatchObject({
      totalSolved: 2,
      observedToday: 1,
    });
    expect((await readGfgProblems(user.id)).find((item) => item.id === "old")?.baseline).toBe(true);
    expect((await readGfgProblems(user.id)).find((item) => item.id === "new")?.baseline).toBe(
      false,
    );
    expect(await db().select().from(gfgSnapshots)).toHaveLength(1);
    expect(await db().select().from(gfgProblems)).toHaveLength(2);
    expect(await claimGfgSync(user.id, "early", new Date(later.getTime() + 60_000))).toBe(false);
  });
  it("leases simultaneous refreshes and rolls back a snapshot belonging to a lost lease", async () => {
    const user = await activeAccount();
    await registerGfg(user, "gfg_101");
    const later = new Date(now.getTime() + 6 * 60_000);
    const claims = await Promise.all([
      claimGfgSync(user.id, "first", later),
      claimGfgSync(user.id, "second", later),
    ]);
    expect(claims.filter(Boolean)).toHaveLength(1);
    await expect(
      saveGfgSync(user.id, "forged", gfgProfile("gfg_101", ["old", "uncommitted"], later)),
    ).rejects.toThrow("lease expired");
    expect((await readGfgProblems(user.id)).map((item) => item.id)).toEqual(["old"]);
    expect((await db().select().from(gfgSnapshots))[0].totalSolved).toBe(1);
  });
  it("serves saved GFG data and backs off after an upstream rate limit", async () => {
    const user = await activeAccount();
    await registerGfg(user, "gfg_101");
    const registered = (await db().select().from(accounts).where(eq(accounts.id, user.id)))[0];
    const later = new Date(now.getTime() + 6 * 60_000);
    vi.mocked(getGfgProfile).mockRejectedValueOnce(new ApiError(429, "Rate limited"));
    expect(await getGfgProgress(registered, undefined, later)).toMatchObject({
      totalSolved: 1,
      refreshFailed: true,
      refreshing: false,
    });
    expect(await claimGfgSync(user.id, "too-soon", new Date(later.getTime() + 60_000))).toBe(false);
    expect(await db().select().from(gfgProblems)).toHaveLength(1);
  });
  it("creates one report per platform, pauses both, and preserves prepared-part recovery", async () => {
    const user = await activeAccount();
    await registerGfg(user, "gfg_101");
    await prepareDeliveries(now);
    await prepareDeliveries(now);
    const rows = await db().select().from(deliveries);
    expect(rows.map((row) => row.platform).sort()).toEqual(["gfg", "leetcode"]);
    await db()
      .update(deliveries)
      .set({
        messages: ["sent before interruption", "remaining GFG report"],
        sentParts: 1,
        status: "sending",
        leaseToken: "expired",
        leaseUntil: new Date(now.getTime() - 1),
      })
      .where(eq(deliveries.platform, "gfg"));
    expect((await dispatchTracking({ now, pause: async () => {} })).sent).toBe(1);
    expect(sendTrackingMessage).toHaveBeenCalledExactlyOnceWith(101, "remaining GFG report");
    await processTrackingUpdate({ updateId: 1, userId: 101, chatId: 101, text: "/stop" });
    expect(
      (await db().select().from(deliveries).where(eq(deliveries.platform, "leetcode")))[0].status,
    ).toBe("cancelled");
    expect(
      (await db().select().from(deliveries).where(eq(deliveries.platform, "gfg")))[0].status,
    ).toBe("sent");
  });
  it("delivers GFG problems without an empty LeetCode message or duplicate recovery", async () => {
    const user = await activeAccount();
    await registerGfg(user, "gfg_101");
    vi.mocked(getGfgProfile).mockResolvedValueOnce(gfgDatedProfile("gfg_101", ["old", "new"]));
    vi.mocked(getLastDaySolvedQuestions).mockResolvedValue({
      username: "user_101",
      period: "lastday",
      timezone: "Asia/Kolkata",
      start: "2026-10-11T18:30:00Z",
      end: "2026-10-12T18:30:00Z",
      count: 0,
      questions: [],
      mayBeIncomplete: false,
    });
    expect(await dispatchTracking({ now, pause: async () => {} })).toMatchObject({
      sent: 1,
      failed: 0,
    });
    const messages = vi.mocked(sendTrackingMessage).mock.calls.map((call) => call[1]);
    expect(messages).not.toContain(EMPTY_REPORT);
    expect(
      messages.some(
        (text) =>
          text.includes("GFG daily recap") &&
          text.includes("available accepted timestamp") &&
          text.includes("/new/1"),
      ),
    ).toBe(true);
    expect((await dispatchTracking({ now, pause: async () => {} })).sent).toBe(0);
  });
});

describe("account-scoped Accepted activity", () => {
  it.each([
    ["2026-10-12T02:59:59Z", "complete", false],
    ["2026-10-12T02:59:59Z", "complete", true],
    ["2026-10-12T03:00:00Z", "partial", false],
    ["2026-10-12T03:00:00Z", "partial", true],
    ["2026-10-12T04:00:00Z", "partial", false],
    ["2026-10-12T04:00:00Z", "partial", true],
  ] as const)(
    "merges coverage from %s as %s regardless of reverse write order (%s)",
    async (boundary, coverage, reverse) => {
      const user = await activeAccount();
      const earlier = () =>
        record(
          user.id,
          [accepted("old", "2026-10-11T02:00:00Z")],
          new Date("2026-10-12T03:00:00Z"),
        );
      const later = () => record(user.id, [accepted("new", boundary)]);
      for (const write of reverse ? [later, earlier] : [earlier, later]) await write();
      expect(onDay(await readActivity(user, now), "2026-10-12").coverage).toBe(coverage);
    },
  );
  it("deduplicates per account and day, retains newest titles, and counts unique problems across days", async () => {
    const first = await activeAccount(101);
    const second = await activeAccount(102);
    const history = [
      accepted("two-sum", "2026-10-11T01:00:00Z"),
      accepted("two-sum", "2026-10-11T02:00:00Z"),
      accepted("two-sum", "2026-10-12T02:00:00Z"),
      accepted("other", "2026-10-12T02:01:00Z"),
    ];
    await record(first.id, history);
    await record(first.id, history.slice(0, 1));
    await record(second.id, [accepted("private-other", "2026-10-12T02:00:00Z")]);
    const result = await readActivity(first, now);
    expect(onDay(result, "2026-10-11").count).toBe(1);
    expect(onDay(result, "2026-10-12").count).toBe(2);
    expect(result.uniqueQuestions).toBe(2);
    expect(result.activeDays).toBe(2);
    const rows = await db()
      .select()
      .from(acceptedActivity)
      .where(eq(acceptedActivity.accountId, first.id));
    expect(rows).toHaveLength(3);
    expect(rows.find((row) => row.date === "2026-10-11")?.acceptedAt.toISOString()).toBe(
      "2026-10-11T02:00:00.000Z",
    );
    expect((await readActivity(second, now)).uniqueQuestions).toBe(1);
  });
  it("marks the earliest day partial and covered later days complete, including confirmed zero days", async () => {
    const user = await activeAccount();
    await record(user.id, [accepted("first", "2026-10-11T02:00:00Z")]);
    const result = await readActivity(user, now);
    expect(onDay(result, "2026-10-10")).toMatchObject({ coverage: "unknown", count: 0 });
    expect(onDay(result, "2026-10-11")).toMatchObject({ coverage: "partial", count: 1 });
    expect(onDay(result, "2026-10-12")).toMatchObject({ coverage: "complete", count: 0 });
    expect(onDay(result, "2026-10-13").coverage).toBe("complete");
  });
  it("does not freeze today's coverage at midnight when the following observation has a gap", async () => {
    const user = await activeAccount();
    const earlier = new Date("2026-10-12T03:00:00Z");
    await record(user.id, [accepted("old", "2026-10-11T02:00:00Z")], earlier);
    expect(onDay(await readActivity(user, earlier), "2026-10-12").coverage).toBe("complete");
    expect(onDay(await readActivity(user, now), "2026-10-12").coverage).toBe("partial");
    await record(user.id, [accepted("new", "2026-10-12T10:00:00Z")]);
    expect(onDay(await readActivity(user, now), "2026-10-12").coverage).toBe("partial");
    await record(user.id, [accepted("bridge", "2026-10-12T02:59:59Z")]);
    expect(onDay(await readActivity(user, now), "2026-10-12").coverage).toBe("complete");
  });
  it("joins both sides when an overlapping bridge arrives after a later observation", async () => {
    const user = await activeAccount();
    await record(
      user.id,
      [accepted("old", "2026-10-11T02:00:00Z")],
      new Date("2026-10-12T03:00:00Z"),
    );
    await record(user.id, [accepted("late", "2026-10-12T10:00:00Z")]);
    await record(
      user.id,
      [accepted("bridge", "2026-10-12T02:59:59Z")],
      new Date("2026-10-12T11:00:00Z"),
    );
    expect(onDay(await readActivity(user, now), "2026-10-12").coverage).toBe("complete");
  });
  it("does not extend coverage through a later empty observation", async () => {
    const user = await activeAccount();
    await record(user.id, []);
    await record(
      user.id,
      [accepted("old", "2026-10-11T02:00:00Z")],
      new Date("2026-10-12T03:00:00Z"),
    );
    expect(onDay(await readActivity(user, now), "2026-10-12").coverage).toBe("partial");
  });
  it("never promotes empty history to proven zero or discards coverage after an older refresh", async () => {
    const user = await activeAccount();
    await record(user.id, []);
    expect(onDay(await readActivity(user, now), "2026-10-13")).toMatchObject({
      count: 0,
      coverage: "partial",
    });
    await record(user.id, [accepted("old", "2026-10-11T02:00:00Z")]);
    await record(user.id, [], new Date("2026-10-12T03:00:00Z"));
    expect(onDay(await readActivity(user, now), "2026-10-12").coverage).toBe("complete");
  });
  it("enforces the IST day in the database and rolls back observations for a lost lease", async () => {
    const user = await activeAccount();
    await expect(
      db()
        .insert(acceptedActivity)
        .values({
          accountId: user.id,
          date: "2026-10-12",
          titleSlug: "wrong-day",
          title: "Wrong day",
          acceptedAt: new Date("2026-10-12T18:30:00Z"),
        }),
    ).rejects.toThrow();
    await claimActivitySync(user.id, "owner", now);
    await expect(
      saveActivitySync(
        user.id,
        "forged",
        observeAcceptedHistory([accepted("never-committed", "2026-10-12T02:00:00Z")], now),
      ),
    ).rejects.toThrow("lease expired");
    expect(await db().select().from(acceptedActivity)).toHaveLength(0);
    expect(await db().select().from(activityDays)).toHaveLength(0);
  });
  it("leases and throttles simultaneous refreshes without leaking another account's activity", async () => {
    const user = await activeAccount();
    const other = await activeAccount(102);
    const claims = await Promise.all([
      claimActivitySync(user.id, "first", now),
      claimActivitySync(user.id, "second", now),
    ]);
    expect(claims.filter(Boolean)).toHaveLength(1);
    await saveActivitySync(
      user.id,
      claims[0] ? "first" : "second",
      observeAcceptedHistory([accepted("own", "2026-10-12T02:00:00Z")], now),
    );
    expect(await claimActivitySync(user.id, "early", new Date(now.getTime() + 59_000))).toBe(false);
    expect((await getAccountActivity(user, now)).uniqueQuestions).toBe(1);
    expect(getAcceptedHistory).not.toHaveBeenCalled();
    expect((await readActivity(other, now)).uniqueQuestions).toBe(0);
    expect(await claimActivitySync(user.id, "later", new Date(now.getTime() + 60_000))).toBe(true);
  });
  it("serves saved activity after upstream failure and backs off retries", async () => {
    const user = await activeAccount();
    vi.mocked(getAcceptedHistory).mockResolvedValueOnce({
      username: user.leetcodeUsername!,
      submissions: [accepted("known", "2026-10-12T02:00:00Z")],
    });
    expect((await getAccountActivity(user, now)).uniqueQuestions).toBe(1);
    vi.mocked(getAcceptedHistory).mockRejectedValueOnce(new ApiError(504, "Timed out"));
    const later = new Date(now.getTime() + 60_000);
    expect(await getAccountActivity(user, later)).toMatchObject({
      uniqueQuestions: 1,
      refreshFailed: true,
      refreshing: false,
    });
    expect((await getAccountActivity(user, new Date(later.getTime() + 10_000))).refreshFailed).toBe(
      true,
    );
    expect(getAcceptedHistory).toHaveBeenCalledTimes(2);
  });
  it("keeps first-refresh failures as errors and requires a registered connection", async () => {
    const pending = await account(102, "not-connected");
    await expect(getAccountActivity(pending, now)).rejects.toMatchObject({ status: 409 });
    const user = await activeAccount();
    vi.mocked(getAcceptedHistory).mockRejectedValue(new ApiError(502, "Malformed history"));
    await expect(getAccountActivity(user, now)).rejects.toMatchObject({ status: 502 });
    await expect(getAccountActivity(user, now)).rejects.toMatchObject({ status: 502 });
    expect(await db().select().from(acceptedActivity)).toHaveLength(0);
    expect(getAcceptedHistory).toHaveBeenCalledTimes(1);
  });
  it("saves report observations atomically with prepared messages and resumes without losing the calendar", async () => {
    const user = await activeAccount();
    await prepareDeliveries(now);
    const delivery = (await claimDelivery("2026-10-12", now))!;
    const result = {
      username: "user_101",
      period: "lastday" as const,
      timezone: "Asia/Kolkata" as const,
      start: "2026-10-11T18:30:00Z",
      end: "2026-10-12T18:30:00Z",
      count: 1,
      questions: [accepted("two-sum", "2026-10-12T02:00:00Z")],
      mayBeIncomplete: false,
    };
    await expect(
      prepareDeliveryReport({ ...delivery, leaseToken: "forged" }, ["report"], result),
    ).rejects.toThrow();
    expect(await db().select().from(acceptedActivity)).toHaveLength(0);
    await prepareDeliveryReport(delivery, ["report"], result);
    expect(onDay(await readActivity(user, now), "2026-10-12")).toMatchObject({
      count: 1,
      coverage: "complete",
    });
    expect((await db().select().from(deliveries))[0].messages).toEqual(["report"]);
  });
});

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
  it("returns the latest report as the same serializable status used by the API and pages", async () => {
    const user = await activeAccount();
    await prepareDeliveries(now);
    await db().update(deliveries).set({ status: "sent", sentAt: now });
    const status = await trackingStatus(user);
    expect(status).toEqual({
      username: user.leetcodeUsername,
      connected: true,
      status: "active",
      lastDelivery: { reportDate: "2026-10-12", status: "sent", sentAt: now.toISOString() },
    });
  });
  it("ignores a stale blocked response after the user pauses and resumes", async () => {
    const user = await activeAccount();
    await prepareDeliveries(now);
    const delivery = (await claimDelivery("2026-10-12", now))!;
    await processTrackingUpdate({ updateId: 1, userId: 101, chatId: 101, text: "/stop" });
    await processTrackingUpdate({ updateId: 2, userId: 101, chatId: 101, text: "/start" });
    await blockAccount(delivery);
    expect((await db().select().from(accounts).where(eq(accounts.id, user.id)))[0].status).toBe(
      "active",
    );
  });
  it("ignores a blocked response from a replaced delivery lease", async () => {
    const user = await activeAccount();
    await prepareDeliveries(now);
    const stale = (await claimDelivery("2026-10-12", now))!;
    vi.setSystemTime(new Date(now.getTime() + 8 * 60_000));
    const current = (await claimDelivery("2026-10-12", new Date()))!;
    await blockAccount(stale);
    expect((await db().select().from(accounts).where(eq(accounts.id, user.id)))[0].status).toBe(
      "active",
    );
    expect((await db().select().from(deliveries))[0]).toMatchObject({
      status: "sending",
      leaseToken: current.leaseToken,
    });
  });
  it("preserves a user pause during a concurrent blocked-delivery update", async () => {
    const user = await activeAccount();
    await prepareDeliveries(now);
    const delivery = (await claimDelivery("2026-10-12", now))!;
    await Promise.all([
      processTrackingUpdate({ updateId: 1, userId: 101, chatId: 101, text: "/stop" }),
      blockAccount(delivery),
    ]);
    expect((await db().select().from(accounts).where(eq(accounts.id, user.id)))[0].status).toBe(
      "paused",
    );
    expect((await db().select().from(deliveries))[0].status).toBe("cancelled");
  });
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
          status: "active" as const,
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
