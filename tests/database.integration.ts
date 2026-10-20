import { readFile, readdir } from "node:fs/promises";
import postgres from "postgres";
import { and, eq } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { db, closeDatabase } from "@/lib/db/client";
import {
  accounts,
  platformServices,
  dailyCollections,
  activitySync,
  gfgSync,
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
import { revokeService, setServicePaused } from "@/lib/tracking/services";
import {
  claimCollection,
  completeCollection,
  failCollection,
} from "@/lib/tracking/collection-store";
import { profileSummary } from "@/lib/profile";
import { hashToken } from "@/lib/tracking/security";
import { processTrackingUpdate } from "@/lib/tracking/webhook";
import {
  acquireDispatchLock,
  blockAccount,
  claimDelivery,
  prepareDeliveries,
  prepareWeeklyDeliveries,
  prepareEmptyDayReports,
  prepareDeliveryReport,
  releaseDispatchLock,
  sendDeliveryPart,
} from "@/lib/tracking/delivery-store";
import { weeklyReportPeriod } from "@/lib/tracking/weekly-period";
import { trackingStatus as featureTrackingStatus } from "@/lib/features/status";
import { EMPTY_REPORT } from "@/lib/tracking/format-report";
import { dispatchTracking } from "@/lib/tracking/dispatch";
import { sendTrackingMessage, TrackingTelegramError } from "@/lib/tracking/telegram-client";
import { notebooks, notesSessions, notesLoginLimits } from "@/lib/db/schema";
import { requireAccount } from "@/lib/auth/session";
import {
  notebookForAccount,
  requireNotebook,
  setNotesCode,
  unlockNotes,
  NOTES_COOKIE,
} from "@/lib/notes/access";
import { createNote, listNotes } from "@/lib/notes/store";
import { GET as getNotes, POST as postNote } from "@/app/api/notes/route";
import { PATCH as patchNote, DELETE as removeNote } from "@/app/api/notes/[id]/route";
import {
  POST as registerNotesCode,
  DELETE as disableNotesCode,
} from "@/app/api/notes/access/route";
import { POST as loginNotes, DELETE as logoutNotes } from "@/app/api/notes/session/route";
import { registerNotes, manageNotes, notesStatus } from "@/lib/notes/service";
import { notes as savedNotes } from "@/lib/db/schema";
import { handleFeature } from "@/lib/features/handlers";
import { POST as websiteLogout } from "@/app/api/auth/logout/route";

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
  connect_timeout: 30,
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
  console.info("tracking_test_schema", namespace);
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
    `TRUNCATE ${namespace}.accounts, ${namespace}.login_attempts, ${namespace}.telegram_updates, ${namespace}.dispatch_lock, ${namespace}.notes_login_limits CASCADE`,
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

describe("fixed India timezone", () => {
  it("uses India days and schedules accounts even if an obsolete timezone preference remains", async () => {
    const created = await activeAccount();
    const [user] = await db()
      .update(accounts)
      .set({ timezone: "America/New_York" })
      .where(eq(accounts.id, created.id))
      .returning();
    await db()
      .insert(acceptedActivity)
      .values({
        accountId: user.id,
        date: "2026-10-12",
        timezone: "America/New_York",
        titleSlug: "saved-before-removal",
        title: "Saved before removal",
        acceptedAt: new Date("2026-10-12T23:00:00Z"),
      });
    const progress = await readActivity(user, now);
    expect(progress.timezone).toBe("Asia/Kolkata");
    expect(onDay(progress, "2026-10-13").count).toBe(1);
    expect(
      (await getActivityDay(user, "leetcode", "2026-10-13", now)).problems.map(
        (problem) => problem.id,
      ),
    ).toEqual(["saved-before-removal"]);
    await prepareDeliveries(now);
    const [delivery] = await db()
      .select()
      .from(deliveries)
      .where(eq(deliveries.accountId, user.id));
    expect(delivery.timezone).toBe("Asia/Kolkata");
    expect(delivery.start.toISOString()).toBe("2026-10-11T18:30:00.000Z");
    expect(delivery.end.toISOString()).toBe("2026-10-12T18:30:00.000Z");
  });
});

describe("platform lifecycle and permanent deletion", () => {
  it("backfills existing accounts and reports when upgrading the old schema", async () => {
    const upgrade = `${namespace}_upgrade`;
    try {
      const filenames = (await readdir("migrations"))
        .filter((name) => name.endsWith(".sql"))
        .sort();
      for (const name of filenames.filter((name) => name < "0006")) {
        await admin.unsafe(
          (await readFile(`migrations/${name}`, "utf8")).replace(/\btracking\b/g, upgrade),
        );
      }
      const [legacy] = await admin.unsafe(
        `INSERT INTO ${upgrade}.accounts (telegram_id, chat_id, status, connected_at, leetcode_username, registered_at, gfg_username, gfg_registered_at, hackerrank_username, hackerrank_registered_at) VALUES (991, 991, 'active', now(), 'legacy_lc', now(), 'legacy_gfg', now(), 'legacy_hr', now()) RETURNING id`,
      );
      await admin.unsafe(
        `INSERT INTO ${upgrade}.deliveries (account_id, platform, report_date, period_start, period_end, status, messages, sent_parts, sent_at) VALUES ($1, 'leetcode', '2026-10-12', '2026-10-11T18:30:00Z', '2026-10-12T18:30:00Z', 'sent', jsonb_build_array($2::text), 1, now())`,
        [legacy.id, EMPTY_REPORT],
      );
      await admin.unsafe(
        (await readFile("migrations/0006_profile_and_services.sql", "utf8")).replace(
          /\btracking\b/g,
          upgrade,
        ),
      );
      const services = await admin.unsafe(`SELECT * FROM ${upgrade}.platform_services`);
      expect(services).toHaveLength(3);
      expect(
        services.every(
          (service) =>
            !service.paused &&
            service.agreement_version === null &&
            service.agreement_accepted_at === null,
        ),
      ).toBe(true);
      const [report] = await admin.unsafe(
        `SELECT d.registration_id, s.platform FROM ${upgrade}.deliveries d JOIN ${upgrade}.platform_services s ON d.registration_id = s.registration_id`,
      );
      expect(report.platform).toBe("leetcode");
      expect(report.registration_id).toBeTruthy();
      expect(await admin.unsafe(`SELECT * FROM ${upgrade}.report_reminders`)).toHaveLength(1);
      await expect(
        admin.unsafe(
          `UPDATE ${upgrade}.accounts SET leetcode_username = 'replacement' WHERE id = $1`,
          [legacy.id],
        ),
      ).rejects.toMatchObject({ code: "23514" });
    } finally {
      await admin.unsafe(`DROP SCHEMA IF EXISTS ${upgrade} CASCADE`);
    }
  });
  const freshAccount = async (id: string) =>
    (await db().select().from(accounts).where(eq(accounts.id, id)))[0];
  const ownRows = (
    table:
      | typeof acceptedActivity
      | typeof activityDays
      | typeof activitySync
      | typeof gfgProblems
      | typeof gfgSync
      | typeof gfgSnapshots
      | typeof hackerRankProblems
      | typeof hackerRankSync
      | typeof hackerRankSnapshots,
    id: string,
  ) => db().select().from(table).where(eq(table.accountId, id));
  it("starts legacy registrations unpaused without fabricating agreement acceptance and persists the account theme", async () => {
    const user = await activeAccount();
    expect((await db().select().from(platformServices))[0]).toMatchObject({
      paused: false,
      agreementVersion: null,
      agreementAcceptedAt: null,
    });
    await db().update(accounts).set({ theme: "dark" }).where(eq(accounts.id, user.id));
    await registerGfg(user, "gfg_101");
    const summary = await profileSummary(await freshAccount(user.id));
    expect(summary.theme).toBe("dark");
    expect(summary.services.filter((service) => service.username)).toHaveLength(2);
    const service = (
      await db().select().from(platformServices).where(eq(platformServices.platform, "gfg"))
    )[0];
    expect(service.agreementVersion).toBe("1");
    expect(service.agreementAcceptedAt).not.toBeNull();
  });
  it.each(["pending", "paused", "blocked"] as const)(
    "collects daily activity with Telegram status %s without delivering recaps",
    async (status) => {
      const user = status === "pending" ? await account(101, "user_101") : await activeAccount();
      if (status !== "pending")
        await db().update(accounts).set({ status }).where(eq(accounts.id, user.id));
      vi.mocked(getLastDaySolvedQuestions).mockResolvedValue(
        leetcodeReport("user_101", ["daily-saved"]),
      );
      await dispatchTracking({ now, pause: async () => {} });
      expect(await ownRows(acceptedActivity, user.id)).toHaveLength(1);
      expect((await db().select().from(dailyCollections))[0].status).toBe("complete");
      expect(sendTrackingMessage).not.toHaveBeenCalled();
      expect(await db().select().from(deliveries)).toHaveLength(0);
    },
  );
  it("keeps collecting a paused platform, suppresses even empty reminders, and resumes only future recaps", async () => {
    const user = await activeAccount();
    const service = await trackingStatus(user);
    await prepareDeliveries(now);
    await setServicePaused(user.id, "leetcode", service.registrationId!, true);
    vi.mocked(getLastDaySolvedQuestions).mockResolvedValue(
      leetcodeReport("user_101", ["during-pause"]),
    );
    await dispatchTracking({ now, pause: async () => {} });
    expect(await ownRows(acceptedActivity, user.id)).toHaveLength(1);
    expect(sendTrackingMessage).not.toHaveBeenCalled();
    expect((await db().select().from(accounts))[0].status).toBe("active");
    await setServicePaused(user.id, "leetcode", service.registrationId!, false);
    await dispatchTracking({ now, pause: async () => {} });
    expect(sendTrackingMessage).not.toHaveBeenCalled();
    expect((await readActivity(user, now)).uniqueQuestions).toBe(1);
  });
  it("does not repeat a shared reminder after its original platform is paused or revoked", async () => {
    const user = await activeAccount();
    await registerGfg(user, "gfg_101");
    vi.mocked(getLastDaySolvedQuestions).mockResolvedValue(leetcodeReport());
    await dispatchTracking({ now, pause: async () => {} });
    expect(sendTrackingMessage).toHaveBeenCalledTimes(1);
    const [reminder] = await db().select().from(deliveries).where(eq(deliveries.sentParts, 1));
    const service = await trackingStatus(await freshAccount(user.id), reminder.platform);
    await setServicePaused(user.id, reminder.platform, service.registrationId!, true);
    await dispatchTracking({ now, pause: async () => {} });
    expect(sendTrackingMessage).toHaveBeenCalledTimes(1);
    await revokeService(user.id, reminder.platform, service.registrationId!);
    await dispatchTracking({ now, pause: async () => {} });
    expect(sendTrackingMessage).toHaveBeenCalledTimes(1);
  });
  it("keeps platform controls independent of other platforms and the bot's global pause", async () => {
    const user = await activeAccount();
    await registerGfg(user, "gfg_101");
    const lc = await trackingStatus(await freshAccount(user.id));
    await setServicePaused(user.id, "leetcode", lc.registrationId!, true);
    expect((await trackingStatus(await freshAccount(user.id), "gfg")).paused).toBe(false);
    await processTrackingUpdate({ updateId: 991, userId: 101, chatId: 101, text: "/stop" });
    await setServicePaused(user.id, "leetcode", lc.registrationId!, false);
    expect((await freshAccount(user.id)).status).toBe("paused");
    await setServicePaused(user.id, "leetcode", lc.registrationId!, true);
    await processTrackingUpdate({ updateId: 992, userId: 101, chatId: 101, text: "/start" });
    expect((await trackingStatus(await freshAccount(user.id))).paused).toBe(true);
  });
  it.each(["leetcode", "gfg", "hackerrank"] as const)(
    "deletes every saved %s record while preserving other platforms, accounts and sessions",
    async (platform) => {
      const user = await activeAccount();
      const other = await activeAccount(102);
      await registerGfg(user, "gfg_101");
      await registerHackerRank(user, "hr_101");
      const current = await freshAccount(user.id);
      await getAccountActivity(current, now);
      await record(user.id, [accepted("my-solve", "2026-10-12T02:00:00Z")]);
      await record(other.id, [accepted("other-solve", "2026-10-12T02:00:00Z")]);
      for (const service of ["leetcode", "gfg", "hackerrank"] as const)
        await saveWeeklyGoal(current, service, 5);
      const token = await createSession(user.id);
      await prepareDeliveries(now);
      const service = await trackingStatus(current, platform);
      await revokeService(user.id, platform, service.registrationId!);
      const tables =
        platform === "leetcode"
          ? [acceptedActivity, activityDays, activitySync]
          : platform === "gfg"
            ? [gfgProblems, gfgSnapshots, gfgSync]
            : [hackerRankProblems, hackerRankSnapshots, hackerRankSync];
      for (const table of tables) expect(await ownRows(table, user.id)).toHaveLength(0);
      expect(
        await db()
          .select()
          .from(activityGoals)
          .where(and(eq(activityGoals.accountId, user.id), eq(activityGoals.platform, platform))),
      ).toHaveLength(0);
      expect(
        await db()
          .select()
          .from(deliveries)
          .where(and(eq(deliveries.accountId, user.id), eq(deliveries.platform, platform))),
      ).toHaveLength(0);
      expect(
        await db()
          .select()
          .from(dailyCollections)
          .where(eq(dailyCollections.registrationId, service.registrationId!)),
      ).toHaveLength(0);
      expect(
        await db()
          .select()
          .from(platformServices)
          .where(eq(platformServices.registrationId, service.registrationId!)),
      ).toHaveLength(0);
      const remaining = await freshAccount(user.id);
      expect((await trackingStatus(remaining, platform)).username).toBeNull();
      expect(remaining).toMatchObject({ telegramId: 101, chatId: 101, status: "active" });
      expect((await accountForToken(token))?.id).toBe(user.id);
      expect(
        (await profileSummary(remaining)).services.filter((entry) => entry.username),
      ).toHaveLength(2);
      expect(await ownRows(acceptedActivity, other.id)).toHaveLength(1);
      expect(
        await db().select().from(activityGoals).where(eq(activityGoals.accountId, user.id)),
      ).toHaveLength(2);
    },
  );
  it.each(["leetcode", "gfg", "hackerrank"] as const)(
    "fences old %s sync results and jobs even after re-registering",
    async (platform) => {
      let user = await account();
      if (platform === "leetcode") await registerUsername(user, "user_101");
      else if (platform === "gfg") await registerGfg(user, "gfg_101");
      else await registerHackerRank(user, "hr_101");
      user = await freshAccount(user.id);
      const service = await trackingStatus(user, platform);
      const later = new Date(now.getTime() + 6 * 60_000);
      const claim =
        platform === "leetcode"
          ? claimActivitySync
          : platform === "gfg"
            ? claimGfgSync
            : claimHackerRankSync;
      expect(await claim(user.id, "old-sync", later, service.registrationId!)).toBe(true);
      await prepareDeliveries(now);
      const job = (await claimCollection("2026-10-12", now))!;
      await revokeService(user.id, platform, service.registrationId!);
      const revoked = await freshAccount(user.id);
      if (platform === "leetcode") await registerUsername(revoked, "user_101");
      else if (platform === "gfg") await registerGfg(revoked, "gfg_101");
      else await registerHackerRank(revoked, "hr_101");
      const current = await trackingStatus(await freshAccount(user.id), platform);
      expect(current.registrationId).not.toBe(service.registrationId);
      await expect(
        setServicePaused(user.id, platform, service.registrationId!, true),
      ).rejects.toMatchObject({ status: 409 });
      await expect(revokeService(user.id, platform, service.registrationId!)).rejects.toMatchObject(
        { status: 409 },
      );
      await expect(
        claim(user.id, "stale-claim", later, service.registrationId!),
      ).rejects.toMatchObject({ status: 409 });
      if (platform === "leetcode")
        await expect(
          saveActivitySync(
            user.id,
            "old-sync",
            observeAcceptedHistory([accepted("stale", "2026-10-12T02:00:00Z")], later),
          ),
        ).rejects.toThrow();
      else if (platform === "gfg")
        await expect(
          saveGfgSync(user.id, "old-sync", gfgProfile("gfg_101", ["stale"], later)),
        ).rejects.toThrow();
      else
        await expect(
          saveHackerRankSync(user.id, "old-sync", hrProfile("hr_101", ["stale"], later)),
        ).rejects.toThrow();
      await expect(
        completeCollection(job, ["stale-report"], leetcodeReport("user_101", ["stale"])),
      ).rejects.toMatchObject({ status: 409 });
      const tables =
        platform === "leetcode"
          ? acceptedActivity
          : platform === "gfg"
            ? gfgProblems
            : hackerRankProblems;
      const saved = await ownRows(tables, user.id);
      expect(JSON.stringify(saved)).not.toContain("stale");
    },
  );
  it("rejects another account's registration ID and permits removal of the last service", async () => {
    const user = await activeAccount();
    const other = await activeAccount(102);
    const service = await trackingStatus(user);
    await expect(
      revokeService(other.id, "leetcode", service.registrationId!),
    ).rejects.toMatchObject({ status: 409 });
    await revokeService(user.id, "leetcode", service.registrationId!);
    expect(await freshAccount(user.id)).toMatchObject({
      status: "active",
      chatId: 101,
      leetcodeUsername: null,
      registeredAt: null,
    });
    expect((await trackingStatus(other)).username).toBe("user_102");
    await registerUsername(await freshAccount(user.id), "new_profile");
    expect((await trackingStatus(await freshAccount(user.id))).username).toBe("new_profile");
  });
  it("rolls back the entire deletion if clearing the registration fails", async () => {
    const user = await activeAccount();
    await record(user.id, [accepted("retained", "2026-10-12T02:00:00Z")]);
    await saveWeeklyGoal(user, "leetcode", 5);
    await prepareDeliveries(now);
    const service = await trackingStatus(user);
    await admin.unsafe(
      `CREATE FUNCTION ${namespace}.reject_test_revoke() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.leetcode_username IS NULL THEN RAISE EXCEPTION 'test failure'; END IF; RETURN NEW; END; $$; CREATE TRIGGER reject_test_revoke BEFORE UPDATE ON ${namespace}.accounts FOR EACH ROW EXECUTE FUNCTION ${namespace}.reject_test_revoke()`,
    );
    try {
      await expect(revokeService(user.id, "leetcode", service.registrationId!)).rejects.toThrow();
      expect(await ownRows(acceptedActivity, user.id)).toHaveLength(1);
      expect(await db().select().from(activityGoals)).toHaveLength(1);
      expect(await db().select().from(deliveries)).toHaveLength(1);
      expect(await db().select().from(dailyCollections)).toHaveLength(1);
      expect((await trackingStatus(await freshAccount(user.id))).registrationId).toBe(
        service.registrationId,
      );
    } finally {
      await admin.unsafe(
        `DROP TRIGGER reject_test_revoke ON ${namespace}.accounts; DROP FUNCTION ${namespace}.reject_test_revoke()`,
      );
    }
  });
  it("serializes collection completion with revocation without resurrecting data", async () => {
    const user = await activeAccount();
    const service = await trackingStatus(user);
    await prepareDeliveries(now);
    const job = (await claimCollection("2026-10-12", now))!;
    const results = await Promise.allSettled([
      completeCollection(job, ["report"], leetcodeReport("user_101", ["racing-solve"])),
      revokeService(user.id, "leetcode", service.registrationId!),
    ]);
    expect(results[1].status).toBe("fulfilled");
    expect(await ownRows(acceptedActivity, user.id)).toHaveLength(0);
    expect(await db().select().from(deliveries)).toHaveLength(0);
    expect(await db().select().from(dailyCollections)).toHaveLength(0);
  });
});

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
  it("requires a registered service and preserves first-refresh errors", async () => {
    const pending = await account(102);
    await expect(getAccountActivity(pending, now)).rejects.toMatchObject({ status: 409 });
    const user = await activeAccount();
    vi.mocked(getAcceptedHistory).mockRejectedValue(new ApiError(502, "Malformed history"));
    await expect(getAccountActivity(user, now)).rejects.toMatchObject({ status: 502 });
    await expect(getAccountActivity(user, now)).rejects.toMatchObject({ status: 502 });
    expect(await db().select().from(acceptedActivity)).toHaveLength(0);
    expect(getAcceptedHistory).toHaveBeenCalledTimes(1);
  });
  it("loads LeetCode activity for a registered service before connecting Daily Grind", async () => {
    const user = await account(101, "not-connected");
    expect(user.chatId).toBeNull();
    vi.mocked(getAcceptedHistory).mockResolvedValueOnce({
      username: user.leetcodeUsername!,
      submissions: [accepted("known", "2026-10-12T02:00:00Z")],
    });
    expect(await getAccountActivity(user, now)).toMatchObject({
      username: "not-connected",
      uniqueQuestions: 1,
    });
    expect((await db().select().from(accounts))[0]).toMatchObject({
      chatId: null,
      status: "pending",
    });
    expect(await db().select().from(deliveries)).toHaveLength(0);
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
  it("preserves the Telegram retry budget after collection failures", async () => {
    await activeAccount();
    await prepareDeliveries(now);
    for (let attempt = 0; attempt < 2; attempt++) {
      const job = (await claimCollection("2026-10-12", now))!;
      await failCollection(job, "lookup_502", 0);
    }
    const job = (await claimCollection("2026-10-12", now))!;
    expect(job.attempts).toBe(3);
    await completeCollection(job, ["report"], leetcodeReport("user_101", ["saved"]));
    const report = (await claimDelivery("2026-10-12", now, true, true, true))!;
    expect(report.attempts).toBe(1);
  });
  it("returns the latest report as the same serializable status used by the API and pages", async () => {
    const user = await activeAccount();
    await prepareDeliveries(now);
    await db().update(deliveries).set({ status: "sent", sentAt: now });
    const status = await trackingStatus(user);
    expect(status).toEqual({
      paused: false,
      registrationId: expect.any(String),
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

describe("private notes and code access", () => {
  const secret = "Note123";
  const replacement = "New456";
  function request(
    path = "/api/notes",
    method = "GET",
    cookie = "",
    body?: unknown,
    origin = "http://localhost:3000",
  ) {
    return new Request(`http://localhost:3000${path}`, {
      method,
      headers: {
        origin,
        cookie,
        "Content-Type": "application/json",
        "x-forwarded-for": "127.0.0.5",
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  }
  async function signedIn() {
    const owner = await account();
    await registerNotes(owner, secret);
    return { owner, cookie: `tracking_session=${await createSession(owner.id)}` };
  }
  async function codeCookie(ownerId: string) {
    await setNotesCode(ownerId, secret, (await notebookForAccount(ownerId)).id);
    return `${NOTES_COOKIE}=${await unlockNotes(secret)}`;
  }
  it("allows signed-in accounts with no tracking services to create, edit and delete notes", async () => {
    const { cookie } = await signedIn();
    const created = await postNote(
      request(undefined, "POST", cookie, {
        text: "Remember binary search",
        links: ["https://example.com"],
      }),
    );
    expect(created.status).toBe(201);
    const note = await created.json();
    expect(note.notebookId).toBeUndefined();
    const result = await getNotes(request(undefined, "GET", cookie));
    expect(result.headers.get("Cache-Control")).toBe("no-store");
    expect(await result.json()).toMatchObject({
      signedIn: true,
      expiresAt: null,
      codeEnabled: true,
      notes: [{ id: note.id, text: "Remember binary search" }],
    });
    const context = { params: Promise.resolve({ id: note.id }) };
    expect(
      (
        await patchNote(
          request(undefined, "PATCH", cookie, { text: "Try again", links: [] }),
          context,
        )
      ).status,
    ).toBe(200);
    expect((await removeNote(request(undefined, "DELETE", cookie), context)).status).toBe(204);
    expect((await (await getNotes(request(undefined, "GET", cookie))).json()).notes).toEqual([]);
  });
  it("requires website sign-in to register or disable a code and rejects foreign origins", async () => {
    const { owner, cookie } = await signedIn();
    const guest = await codeCookie(owner.id);
    expect(
      (await registerNotesCode(request(undefined, "POST", "", { code: replacement }))).status,
    ).toBe(401);
    expect(
      (await registerNotesCode(request(undefined, "POST", guest, { code: replacement }))).status,
    ).toBe(401);
    expect((await disableNotesCode(request(undefined, "DELETE", guest))).status).toBe(401);
    expect(
      (
        await registerNotesCode(
          request(undefined, "POST", cookie, { code: replacement }, "https://attacker.example"),
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await postNote(
          request(
            undefined,
            "POST",
            cookie,
            { text: "attack", links: [] },
            "https://attacker.example",
          ),
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await loginNotes(
          request(undefined, "POST", "", { code: secret }, "https://attacker.example"),
        )
      ).status,
    ).toBe(403);
  });
  it("issues a separate 20-minute cookie, never a website session, and enforces fixed expiry", async () => {
    const { owner } = await signedIn();
    await setNotesCode(owner.id, secret, (await notebookForAccount(owner.id)).id);
    const result = await loginNotes(request(undefined, "POST", "", { code: secret }));
    expect(result.status).toBe(200);
    const header = result.headers.get("set-cookie")!;
    expect(header).toContain("Max-Age=1200");
    expect(header).toContain("HttpOnly");
    expect(header).toContain("SameSite=lax");
    expect(header).not.toContain("tracking_session");
    const cookie = header.split(";")[0];
    await expect(requireAccount(request(undefined, "GET", cookie))).rejects.toMatchObject({
      status: 401,
    });
    expect(await (await getNotes(request(undefined, "GET", cookie))).json()).toMatchObject({
      signedIn: false,
      expiresAt: new Date(now.getTime() + 1200000).toISOString(),
    });
    vi.setSystemTime(new Date(now.getTime() + 1199999));
    expect((await getNotes(request(undefined, "GET", cookie))).status).toBe(200);
    vi.setSystemTime(new Date(now.getTime() + 1200000));
    expect((await getNotes(request(undefined, "GET", cookie))).status).toBe(401);
    expect(
      (await postNote(request(undefined, "POST", cookie, { text: "too late", links: [] }))).status,
    ).toBe(401);
    expect((await db().select().from(notesSessions))[0].expiresAt.getTime()).toBe(
      now.getTime() + 1200000,
    );
  });
  it("gives the signed-in account priority and never applies the code timer to website sessions", async () => {
    const { owner, cookie } = await signedIn();
    const guest = await codeCookie(owner.id);
    const other = await account(202);
    await registerNotes(other, "Other789");
    const otherCookie = `tracking_session=${await createSession(other.id)}`;
    const notebook = await notebookForAccount(other.id);
    await createNote(notebook.id, { text: "Other account's private note", links: [] });
    const access = await requireNotebook(request(undefined, "GET", `${otherCookie}; ${guest}`));
    expect(access.notebook.accountId).toBe(other.id);
    expect(access.signedIn).toBe(true);
    vi.setSystemTime(new Date(now.getTime() + 21 * 60 * 1000));
    expect((await getNotes(request(undefined, "GET", cookie))).status).toBe(200);
    expect((await loginNotes(request(undefined, "POST", cookie, { code: secret }))).status).toBe(
      409,
    );
  });
  it("prevents one notebook from reading, editing or deleting another's notes", async () => {
    const { owner, cookie } = await signedIn();
    const guest = await codeCookie(owner.id);
    const other = await account(202);
    await registerNotes(other, "Other789");
    const notebook = await notebookForAccount(other.id);
    const note = await createNote(notebook.id, { text: "Private to the other account", links: [] });
    for (const credential of [cookie, guest]) {
      expect((await (await getNotes(request(undefined, "GET", credential))).json()).notes).toEqual(
        [],
      );
      const context = { params: Promise.resolve({ id: note.id }) };
      expect(
        (
          await patchNote(
            request(undefined, "PATCH", credential, { text: "changed", links: [] }),
            context,
          )
        ).status,
      ).toBe(404);
      expect((await removeNote(request(undefined, "DELETE", credential), context)).status).toBe(
        404,
      );
      expect(
        (
          await postNote(
            request(undefined, "POST", credential, {
              text: "injected",
              links: [],
              notebookId: notebook.id,
            }),
          )
        ).status,
      ).toBe(400);
    }
    expect((await listNotes(notebook.id)).notes[0].text).toBe("Private to the other account");
  });
  it("revokes old sessions on replacement and pause while preserving notes", async () => {
    const { owner, cookie } = await signedIn();
    const guest = await codeCookie(owner.id);
    const notebook = await notebookForAccount(owner.id);
    await createNote(notebook.id, { text: "Keep this note", links: [] });
    expect(
      (
        await registerNotesCode(
          request(undefined, "POST", cookie, { code: replacement, registrationId: notebook.id }),
        )
      ).status,
    ).toBe(200);
    expect((await getNotes(request(undefined, "GET", guest))).status).toBe(401);
    await expect(unlockNotes(secret)).rejects.toMatchObject({ status: 401 });
    const freshCookie = `${NOTES_COOKIE}=${await unlockNotes(replacement)}`;
    await manageNotes(owner.id, notebook.id, true);
    expect((await getNotes(request(undefined, "GET", freshCookie))).status).toBe(401);
    await expect(unlockNotes(replacement)).rejects.toMatchObject({ status: 401 });
    expect((await listNotes(notebook.id)).notes[0].text).toBe("Keep this note");
  });
  it("handles duplicate codes without damaging existing code sessions or storing plaintext", async () => {
    const { owner } = await signedIn();
    const guest = await codeCookie(owner.id);
    const other = await account(202);
    await registerNotes(other, "Other789");
    await expect(
      setNotesCode(other.id, secret, (await notebookForAccount(other.id)).id),
    ).rejects.toMatchObject({ status: 409 });
    expect((await getNotes(request(undefined, "GET", guest))).status).toBe(200);
    const rows = await db().select().from(notebooks);
    expect(rows.find((row) => row.accountId === owner.id)?.codeHash).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.stringify(rows)).not.toContain(secret);
    const sessionRows = await db().select().from(notesSessions);
    expect(sessionRows[0].tokenHash).not.toBe(guest.split("=")[1]);
  });
  it("locks code sessions explicitly and clears the browser cookie", async () => {
    const { owner } = await signedIn();
    const guest = await codeCookie(owner.id);
    const result = await logoutNotes(request(undefined, "DELETE", guest));
    expect(result.status).toBe(200);
    expect(result.headers.get("set-cookie")).toContain("Max-Age=0");
    expect((await getNotes(request(undefined, "GET", guest))).status).toBe(401);
  });
  it("website sign-out revokes both website and code sessions in this browser", async () => {
    const { owner, cookie } = await signedIn();
    const guest = await codeCookie(owner.id);
    const result = await websiteLogout(request(undefined, "POST", `${cookie}; ${guest}`));
    expect(result.status).toBe(303);
    expect(result.headers.get("set-cookie")).toContain("tracking_session=;");
    expect(result.headers.get("set-cookie")).toContain("notes_session=;");
    expect((await getNotes(request(undefined, "GET", guest))).status).toBe(401);
    await expect(requireAccount(request(undefined, "GET", cookie))).rejects.toMatchObject({
      status: 401,
    });
  });
  it("enforces word limits on the server and paginates notes without exposing other notebooks", async () => {
    const { owner, cookie } = await signedIn();
    expect(
      (
        await postNote(
          request(undefined, "POST", cookie, {
            text: Array(101).fill("word").join(" "),
            links: [],
          }),
        )
      ).status,
    ).toBe(400);
    const notebook = await notebookForAccount(owner.id);
    for (let i = 0; i < 51; i++) await createNote(notebook.id, { text: `note ${i}`, links: [] });
    const first = await (await getNotes(request(undefined, "GET", cookie))).json();
    const second = await (await getNotes(request("/api/notes?offset=50", "GET", cookie))).json();
    expect(first.notes).toHaveLength(50);
    expect(first.nextOffset).toBe(50);
    expect(second.notes).toHaveLength(1);
    expect(second.nextOffset).toBeNull();
    expect(new Set([...first.notes, ...second.notes].map((note) => note.id)).size).toBe(51);
  });
  it("limits code guessing persistently and allows another attempt after the window", async () => {
    for (let i = 0; i < 10; i++)
      expect((await loginNotes(request(undefined, "POST", "", { code: secret }))).status).toBe(401);
    expect((await loginNotes(request(undefined, "POST", "", { code: secret }))).status).toBe(429);
    expect((await db().select().from(notesLoginLimits))[0].attempts).toBe(11);
    vi.setSystemTime(new Date(now.getTime() + 15 * 60 * 1000 + 1));
    expect((await loginNotes(request(undefined, "POST", "", { code: secret }))).status).toBe(401);
  });
});

describe("Sunday weekly recaps", () => {
  const sunday = new Date("2026-10-18T17:30:00Z");
  const recovery = new Date("2026-10-18T18:00:00Z");
  const weeklyDate = "2026-10-12";
  async function weeklyUser() {
    const user = await activeAccount();
    await registerGfg(user, "gfg_101");
    await registerHackerRank(user, "hr_101");
    vi.setSystemTime(sunday);
    vi.mocked(sendTrackingMessage).mockClear();
    return (await db().select().from(accounts).where(eq(accounts.id, user.id)))[0];
  }
  const runWeekly = () =>
    dispatchTracking({ now: new Date(), cadence: "weekly", pause: async () => {} });
  it("sends all three weekly recaps and never resends completed reports", async () => {
    await weeklyUser();
    vi.mocked(getAcceptedHistory).mockResolvedValue({
      username: "user_101",
      submissions: [
        accepted("week-solve", "2026-10-14T12:00:00Z"),
        accepted("week-solve", "2026-10-15T12:00:00Z"),
        accepted("too-late", "2026-10-18T17:31:00Z"),
      ],
    });
    expect(await runWeekly()).toMatchObject({ sent: 3, failed: 0 });
    const messages = vi
      .mocked(sendTrackingMessage)
      .mock.calls.map((call) => call[1])
      .join("\n");
    expect(messages).toContain("LeetCode weekly recap");
    expect(messages).toContain("GFG weekly recap");
    expect(messages).toContain("HackerRank weekly recap");
    expect(messages).toContain("1 unique Accepted problem");
    expect(messages).not.toContain("too-late");
    const rows = await db().select().from(deliveries);
    expect(rows).toHaveLength(3);
    expect(rows.every((row) => row.cadence === "weekly" && row.status === "sent")).toBe(true);
    vi.setSystemTime(recovery);
    expect(await runWeekly()).toMatchObject({ sent: 0, failed: 0 });
    expect(sendTrackingMessage).toHaveBeenCalledTimes(3);
    expect(await db().select().from(dailyCollections)).toHaveLength(0);
    expect(await db().select().from(acceptedActivity)).toHaveLength(0);
    expect(await db().select().from(activityDays)).toHaveLength(0);
  });
  it("keeps daily and weekly delivery identities, claims, failures, and status separate", async () => {
    const user = await weeklyUser();
    const [lc] = await db()
      .select()
      .from(platformServices)
      .where(eq(platformServices.platform, "leetcode"));
    await db()
      .insert(deliveries)
      .values({
        accountId: user.id,
        registrationId: lc.registrationId,
        platform: "leetcode",
        reportDate: weeklyDate,
        start: new Date("2026-10-11T18:30:00Z"),
        end: new Date("2026-10-12T18:30:00Z"),
        messages: ["daily only"],
      });
    await prepareWeeklyDeliveries(sunday);
    const first = await claimDelivery(weeklyDate, sunday);
    expect(first?.cadence).toBe("daily");
    expect(first?.messages).toEqual(["daily only"]);
    expect((await claimDelivery(weeklyDate, sunday, true, true, false, "weekly"))?.cadence).toBe(
      "weekly",
    );
    expect((await featureTrackingStatus(user)).lastDelivery?.reportDate).toBe(weeklyDate);
    await prepareDeliveries(sunday);
    expect(
      (await db().select().from(deliveries).where(eq(deliveries.cadence, "weekly"))).every(
        (row) => row.lastError !== "delivery_window_closed",
      ),
    ).toBe(true);
  });
  it("recovers failed lookups with exactly the same Monday–Sunday cutoff", async () => {
    await weeklyUser();
    vi.mocked(getAcceptedHistory).mockRejectedValueOnce(
      new ApiError(502, "Temporary upstream failure"),
    );
    expect(await runWeekly()).toMatchObject({ sent: 2, failed: 1 });
    const before = (
      await db()
        .select()
        .from(deliveries)
        .where(and(eq(deliveries.cadence, "weekly"), eq(deliveries.platform, "leetcode")))
    )[0];
    expect(before.status).toBe("failed");
    vi.mocked(getAcceptedHistory).mockResolvedValue({
      username: "user_101",
      submissions: [accepted("after-cutoff", "2026-10-18T17:45:00Z")],
    });
    vi.setSystemTime(recovery);
    expect(await runWeekly()).toMatchObject({ sent: 1, failed: 0 });
    const after = (await db().select().from(deliveries).where(eq(deliveries.id, before.id)))[0];
    expect(after.start).toEqual(before.start);
    expect(after.end).toEqual(weeklyReportPeriod(sunday).end);
    expect(after.messages?.join("\n")).not.toContain("after-cutoff");
    expect(after.attempts).toBe(2);
  });
  it("retries prepared message parts without repeating already completed parts or upstream calls", async () => {
    await weeklyUser();
    await prepareWeeklyDeliveries(sunday);
    await db()
      .update(deliveries)
      .set({ messages: ["part one", "part two"], sentParts: 1, status: "failed" })
      .where(and(eq(deliveries.cadence, "weekly"), eq(deliveries.platform, "leetcode")));
    const [service] = await db()
      .select()
      .from(platformServices)
      .where(eq(platformServices.platform, "gfg"));
    await setServicePaused(service.accountId, "gfg", service.registrationId, true);
    const [hr] = await db()
      .select()
      .from(platformServices)
      .where(eq(platformServices.platform, "hackerrank"));
    await setServicePaused(hr.accountId, "hackerrank", hr.registrationId, true);
    vi.mocked(getAcceptedHistory).mockClear();
    expect(await runWeekly()).toMatchObject({ sent: 1, failed: 0 });
    expect(sendTrackingMessage).toHaveBeenCalledExactlyOnceWith(101, "part two");
    expect(getAcceptedHistory).not.toHaveBeenCalled();
  });
  it("keeps paused services and stopped accounts silent without replaying after resume", async () => {
    const user = await weeklyUser();
    const [service] = await db()
      .select()
      .from(platformServices)
      .where(eq(platformServices.platform, "gfg"));
    await setServicePaused(user.id, "gfg", service.registrationId, true);
    await db().update(accounts).set({ status: "paused" }).where(eq(accounts.id, user.id));
    expect(await runWeekly()).toMatchObject({ sent: 0, failed: 0 });
    await db().update(accounts).set({ status: "active" }).where(eq(accounts.id, user.id));
    await setServicePaused(user.id, "gfg", service.registrationId, false);
    vi.setSystemTime(recovery);
    expect(await runWeekly()).toMatchObject({ sent: 0, failed: 0 });
    expect(sendTrackingMessage).not.toHaveBeenCalled();
  });
  it("fences a leased weekly send after pause or service revocation", async () => {
    const user = await weeklyUser();
    await prepareWeeklyDeliveries(sunday);
    const leased = (await claimDelivery(weeklyDate, sunday, true, true, false, "weekly"))!;
    const send = vi.fn();
    await setServicePaused(user.id, leased.platform, leased.registrationId, true);
    expect(await sendDeliveryPart(leased, 0, send)).toBe(false);
    expect(send).not.toHaveBeenCalled();
    await revokeService(user.id, leased.platform, leased.registrationId);
    expect(await sendDeliveryPart(leased, 0, send)).toBe(false);
    expect((await db().select().from(deliveries)).some((row) => row.id === leased.id)).toBe(false);
  });
  it("respects Telegram blocking and rate limits for weekly reports", async () => {
    await weeklyUser();
    vi.mocked(sendTrackingMessage).mockRejectedValue(new TrackingTelegramError("rate_limit", 120));
    expect((await runWeekly()).failed).toBeGreaterThan(0);
    const attempted = await db().select().from(deliveries).where(eq(deliveries.status, "failed"));
    expect(attempted.length).toBeGreaterThan(0);
    expect(
      attempted.every((row) => row.nextAttemptAt.getTime() === sunday.getTime() + 120000),
    ).toBe(true);
    vi.setSystemTime(recovery);
    vi.mocked(sendTrackingMessage).mockRejectedValue(new TrackingTelegramError("blocked"));
    await runWeekly();
    expect((await db().select().from(accounts))[0].status).toBe("blocked");
    expect((await db().select().from(deliveries)).every((row) => row.status === "cancelled")).toBe(
      true,
    );
  });
  it("reconciles a missed primary run and skips early or non-Sunday invocation", async () => {
    await weeklyUser();
    vi.setSystemTime(new Date("2026-10-18T17:29:59Z"));
    expect((await runWeekly()).skipped).toBe(true);
    expect(await db().select().from(deliveries)).toHaveLength(0);
    vi.setSystemTime(recovery);
    expect(await runWeekly()).toMatchObject({ sent: 3, failed: 0 });
    vi.setSystemTime(new Date("2026-10-18T18:30:00Z"));
    expect((await runWeekly()).skipped).toBe(true);
  });
});

describe("Notes opt-in service lifecycle", () => {
  function request(cookie: string, method = "GET", body?: unknown) {
    return new Request("http://localhost:3000/api/tracking/services/notes", {
      method,
      headers: {
        cookie,
        origin: "http://localhost:3000",
        "Content-Type": "application/json",
        "x-forwarded-for": "127.0.0.20",
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  }
  async function owner() {
    const user = await account();
    return { user, cookie: `tracking_session=${await createSession(user.id)}` };
  }
  it("requires Feature registration and its secret code before accessing Notes", async () => {
    const { user, cookie } = await owner();
    expect((await getNotes(request(cookie))).status).toBe(403);
    expect(
      (await postNote(request(cookie, "POST", { text: "No registration", links: [] }))).status,
    ).toBe(403);
    expect(await db().select().from(notebooks)).toHaveLength(0);
    for (const code of ["1234", "1234567890", "abc_def"])
      expect((await handleFeature(request(cookie, "POST", { code }), "notes")).status).toBe(400);
    const registered = await handleFeature(request(cookie, "POST", { code: "12345" }), "notes");
    expect(registered.status).toBe(201);
    expect(await registered.json()).toMatchObject({
      username: "Private notebook",
      registrationId: expect.any(String),
    });
    expect((await getNotes(request(cookie))).status).toBe(200);
    expect(
      (await handleFeature(request(cookie, "POST", { code: "Again123" }), "notes")).status,
    ).toBe(409);
    expect(
      (await db().select().from(accounts).where(eq(accounts.id, user.id)))[0].notesRegisteredAt,
    ).not.toBeNull();
  });
  it("preserves previously saved notes when the account registers the new service", async () => {
    const { user, cookie } = await owner();
    const legacy = await notebookForAccount(user.id);
    await db()
      .insert(savedNotes)
      .values({ notebookId: legacy.id, text: "An existing note", links: ["https://example.com/"] });
    expect((await getNotes(request(cookie))).status).toBe(403);
    expect((await handleFeature(request(cookie, "POST", { code: "Old123" }), "notes")).status).toBe(
      201,
    );
    const result = await (await getNotes(request(cookie))).json();
    expect(result.notes).toMatchObject([{ text: "An existing note" }]);
    expect((await notebookForAccount(user.id)).id).toBe(legacy.id);
  });
  it("allows code changes only for the current signed-in registration and revokes old tokens", async () => {
    const { user, cookie } = await owner();
    const status = await registerNotes(user, "First123");
    const guest = `notes_session=${await unlockNotes("First123")}`;
    const body = { registrationId: status.registrationId, code: "Next456" };
    expect((await registerNotesCode(request(guest, "POST", body))).status).toBe(401);
    expect((await registerNotesCode(request(cookie, "POST", { code: "Next456" }))).status).toBe(
      400,
    );
    expect((await registerNotesCode(request(cookie, "POST", body))).status).toBe(200);
    expect((await getNotes(request(guest))).status).toBe(401);
    await expect(unlockNotes("First123")).rejects.toMatchObject({ status: 401 });
    expect(await unlockNotes("Next456")).toMatch(/^[a-z0-9_-]{43}$/i);
    expect((await disableNotesCode(request(cookie, "DELETE"))).status).toBe(405);
  });
  it("pauses access and saved writes, revokes guest sessions, and resumes without losing notes", async () => {
    const { user, cookie } = await owner();
    const status = await registerNotes(user, "Pause123");
    const notebookId = status.registrationId!;
    await createNote(notebookId, { text: "Saved before pause", links: ["binary search"] });
    const guest = `notes_session=${await unlockNotes("Pause123")}`;
    const paused = await handleFeature(
      request(cookie, "PATCH", { registrationId: notebookId, paused: true }),
      "notes",
    );
    expect(paused.status).toBe(200);
    expect((await paused.json()).paused).toBe(true);
    expect((await getNotes(request(cookie))).status).toBe(423);
    expect((await getNotes(request(guest))).status).toBe(401);
    await expect(createNote(notebookId, { text: "Stale write", links: [] })).rejects.toMatchObject({
      status: 423,
    });
    await expect(unlockNotes("Pause123")).rejects.toMatchObject({ status: 401 });
    expect(
      (
        await handleFeature(
          request(cookie, "PATCH", { registrationId: notebookId, paused: false }),
          "notes",
        )
      ).status,
    ).toBe(200);
    expect((await (await getNotes(request(cookie))).json()).notes[0].text).toBe(
      "Saved before pause",
    );
    expect((await getNotes(request(guest))).status).toBe(401);
  });
  it("revokes only Notes, deletes its data, and rejects stale management after re-registration", async () => {
    const { user, cookie } = await owner();
    const status = await registerNotes(user, "Delete123");
    await createNote(status.registrationId!, { text: "Delete me", links: [] });
    const guest = `notes_session=${await unlockNotes("Delete123")}`;
    await registerUsername(user, "keep_leetcode");
    const deleted = await handleFeature(
      request(cookie, "DELETE", {
        registrationId: status.registrationId,
        confirmPermanentDeletion: true,
      }),
      "notes",
    );
    expect(deleted.status).toBe(200);
    expect(await db().select().from(savedNotes)).toHaveLength(0);
    expect((await getNotes(request(guest))).status).toBe(401);
    const updated = (await db().select().from(accounts).where(eq(accounts.id, user.id)))[0];
    expect(updated.leetcodeUsername).toBe("keep_leetcode");
    expect((await notesStatus(updated)).registrationId).toBeNull();
    const fresh = await registerNotes(updated, "Again123");
    expect(fresh.registrationId).not.toBe(status.registrationId);
    expect(
      (
        await registerNotesCode(
          request(cookie, "POST", { code: "Stale123", registrationId: status.registrationId }),
        )
      ).status,
    ).toBe(409);
    await expect(manageNotes(user.id, status.registrationId!, true)).rejects.toMatchObject({
      status: 409,
    });
    await expect(
      createNote(status.registrationId!, { text: "Late write", links: [] }),
    ).rejects.toMatchObject({ status: 409 });
  });
});
