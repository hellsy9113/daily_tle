import { sql } from "drizzle-orm";
import type { AccountStatus, DeliveryStatus } from "@/lib/tracking/types";
import type { GfgDifficulty, GfgProfileSummary } from "@/lib/gfg/types";
import type { ActivityPlatform } from "@/lib/activity/types";
import type { HackerRankSummary } from "@/lib/hackerrank/types";
import {
  bigint,
  boolean,
  check,
  date,
  integer,
  jsonb,
  pgSchema,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

const schemaName =
  process.env.NODE_ENV === "test" ? (process.env.TRACKING_TEST_SCHEMA ?? "tracking") : "tracking";
export const tracking = pgSchema(schemaName);
const time = (name: string) => timestamp(name, { withTimezone: true });

export const accounts = tracking.table(
  "accounts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    telegramId: bigint("telegram_id", { mode: "number" }).notNull().unique(),
    leetcodeUsername: text("leetcode_username"),
    gfgUsername: text("gfg_username"),
    gfgUsernameKey: text("gfg_username_key").generatedAlwaysAs(sql`lower(gfg_username)`),
    gfgRegisteredAt: time("gfg_registered_at"),
    hackerRankUsername: text("hackerrank_username"),
    hackerRankUsernameKey: text("hackerrank_username_key").generatedAlwaysAs(
      sql`lower(hackerrank_username)`,
    ),
    hackerRankRegisteredAt: time("hackerrank_registered_at"),
    usernameKey: text("username_key").generatedAlwaysAs(sql`lower(leetcode_username)`),
    chatId: bigint("chat_id", { mode: "number" }).unique(),
    status: text("status").$type<AccountStatus>().notNull().default("pending"),
    registeredAt: time("registered_at"),
    connectedAt: time("connected_at"),
    createdAt: time("created_at").notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("accounts_username_key_unique").on(table.usernameKey),
    uniqueIndex("accounts_gfg_username_key_unique").on(table.gfgUsernameKey),
    uniqueIndex("accounts_hackerrank_username_key_unique").on(table.hackerRankUsernameKey),
    check(
      "accounts_status_check",
      sql`${table.status} IN ('pending', 'active', 'paused', 'blocked')`,
    ),
  ],
);

export const sessions = tracking.table("sessions", {
  tokenHash: text("token_hash").primaryKey(),
  accountId: uuid("account_id")
    .notNull()
    .references(() => accounts.id),
  expiresAt: time("expires_at").notNull(),
});

export const loginAttempts = tracking.table("login_attempts", {
  tokenHash: text("token_hash").primaryKey(),
  state: text("state").notNull(),
  nonce: text("nonce").notNull(),
  verifier: text("verifier").notNull(),
  expiresAt: time("expires_at").notNull(),
});

export const connectionTokens = tracking.table("connection_tokens", {
  tokenHash: text("token_hash").primaryKey(),
  accountId: uuid("account_id")
    .notNull()
    .unique()
    .references(() => accounts.id),
  expiresAt: time("expires_at").notNull(),
});

export const telegramUpdates = tracking.table("telegram_updates", {
  updateId: bigint("update_id", { mode: "number" }).primaryKey(),
  processedAt: time("processed_at").notNull().defaultNow(),
});

export const deliveries = tracking.table(
  "deliveries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    accountId: uuid("account_id")
      .notNull()
      .references(() => accounts.id),
    reportDate: date("report_date").notNull(),
    platform: text("platform").$type<ActivityPlatform>().notNull().default("leetcode"),
    start: time("period_start").notNull(),
    end: time("period_end").notNull(),
    status: text("status").$type<DeliveryStatus>().notNull().default("pending"),
    messages: jsonb("messages").$type<string[]>(),
    sentParts: integer("sent_parts").notNull().default(0),
    attempts: integer("attempts").notNull().default(0),
    nextAttemptAt: time("next_attempt_at").notNull().defaultNow(),
    leaseToken: text("lease_token"),
    leaseUntil: time("lease_until"),
    sentAt: time("sent_at"),
    lastError: text("last_error"),
    createdAt: time("created_at").notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("deliveries_account_platform_date_unique").on(
      table.accountId,
      table.platform,
      table.reportDate,
    ),
    check(
      "deliveries_status_check",
      sql`${table.status} IN ('pending', 'sending', 'sent', 'failed', 'cancelled')`,
    ),
  ],
);

export const dispatchLock = tracking.table("dispatch_lock", {
  id: integer("id").primaryKey(),
  token: text("token").notNull(),
  expiresAt: time("expires_at").notNull(),
  enabled: boolean("enabled").notNull().default(true),
});

export const acceptedActivity = tracking.table(
  "accepted_activity",
  {
    accountId: uuid("account_id")
      .notNull()
      .references(() => accounts.id),
    date: date("activity_date").notNull(),
    titleSlug: text("title_slug").notNull(),
    title: text("title").notNull(),
    acceptedAt: time("accepted_at").notNull(),
  },
  (table) => [primaryKey({ columns: [table.accountId, table.date, table.titleSlug] })],
);

export const activityDays = tracking.table(
  "activity_days",
  {
    accountId: uuid("account_id")
      .notNull()
      .references(() => accounts.id),
    date: date("activity_date").notNull(),
    observedFrom: time("observed_from"),
    observedUntil: time("observed_until").notNull(),
    coveredUntil: time("covered_until"),
    checkedAt: time("checked_at").notNull(),
  },
  (table) => [primaryKey({ columns: [table.accountId, table.date] })],
);

export const activitySync = tracking.table("activity_sync", {
  accountId: uuid("account_id")
    .primaryKey()
    .references(() => accounts.id),
  refreshedAt: time("refreshed_at"),
  leaseToken: text("lease_token"),
  leaseUntil: time("lease_until"),
  lastError: integer("last_error"),
});

export const gfgProblems = tracking.table(
  "gfg_problems",
  {
    accountId: uuid("account_id")
      .notNull()
      .references(() => accounts.id),
    id: text("problem_id").notNull(),
    title: text("title").notNull(),
    difficulty: text("difficulty").$type<GfgDifficulty>().notNull(),
    acceptedAt: time("accepted_at"),
    reportedSubmissionTime: text("reported_submission_time"),
    firstObservedAt: time("first_observed_at").notNull(),
    baseline: boolean("baseline").notNull(),
  },
  (table) => [primaryKey({ columns: [table.accountId, table.id] })],
);

export const gfgSync = tracking.table("gfg_sync", {
  accountId: uuid("account_id")
    .primaryKey()
    .references(() => accounts.id),
  profile: jsonb("profile").$type<GfgProfileSummary>(),
  refreshedAt: time("refreshed_at"),
  leaseToken: text("lease_token"),
  leaseUntil: time("lease_until"),
  lastError: integer("last_error"),
});

export const gfgSnapshots = tracking.table(
  "gfg_snapshots",
  {
    accountId: uuid("account_id")
      .notNull()
      .references(() => accounts.id),
    date: date("snapshot_date").notNull(),
    totalSolved: integer("total_solved").notNull(),
    difficultyBreakdown: jsonb("difficulty_breakdown")
      .$type<GfgProfileSummary["difficultyBreakdown"]>()
      .notNull(),
    checkedAt: time("checked_at").notNull(),
  },
  (table) => [primaryKey({ columns: [table.accountId, table.date] })],
);

export const hackerRankProblems = tracking.table(
  "hackerrank_problems",
  {
    accountId: uuid("account_id")
      .notNull()
      .references(() => accounts.id),
    id: text("problem_id").notNull(),
    title: text("title").notNull(),
    slug: text("slug").notNull(),
    contest: text("contest").notNull(),
    solvedAt: time("solved_at").notNull(),
    firstObservedAt: time("first_observed_at").notNull(),
    baseline: boolean("baseline").notNull(),
  },
  (table) => [primaryKey({ columns: [table.accountId, table.id] })],
);
export const hackerRankSync = tracking.table("hackerrank_sync", {
  accountId: uuid("account_id")
    .primaryKey()
    .references(() => accounts.id),
  profile: jsonb("profile").$type<HackerRankSummary>(),
  refreshedAt: time("refreshed_at"),
  leaseToken: text("lease_token"),
  leaseUntil: time("lease_until"),
  lastError: integer("last_error"),
});
export const hackerRankSnapshots = tracking.table(
  "hackerrank_snapshots",
  {
    accountId: uuid("account_id")
      .notNull()
      .references(() => accounts.id),
    date: date("snapshot_date").notNull(),
    availableSolved: integer("available_solved").notNull(),
    historyComplete: boolean("history_complete").notNull(),
    checkedAt: time("checked_at").notNull(),
  },
  (table) => [primaryKey({ columns: [table.accountId, table.date] })],
);

export const activityGoals = tracking.table(
  "activity_goals",
  {
    accountId: uuid("account_id")
      .notNull()
      .references(() => accounts.id),
    platform: text("platform").$type<ActivityPlatform>().notNull(),
    weeklyTarget: integer("weekly_target").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.accountId, table.platform] }),
    check(
      "activity_goals_platform_check",
      sql`${table.platform} IN ('leetcode', 'gfg', 'hackerrank')`,
    ),
    check("activity_goals_target_check", sql`${table.weeklyTarget} BETWEEN 1 AND 1000`),
  ],
);

export type Account = typeof accounts.$inferSelect;
export type Delivery = typeof deliveries.$inferSelect;
