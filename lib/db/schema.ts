import { sql } from "drizzle-orm";
import type { AccountStatus, DeliveryStatus } from "@/lib/tracking/types";
import type { GfgDifficulty, GfgProfileSummary } from "@/lib/gfg/types";
import type { ActivityPlatform } from "@/lib/activity/types";
import type { HackerRankSummary } from "@/lib/hackerrank/types";
import type { CodeforcesSummary } from "@/lib/codeforces/types";
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
    timezone: text("timezone").notNull().default("Asia/Kolkata"),
    theme: text("theme").$type<"light" | "dark">(),
    articlesRegisteredAt: time("articles_registered_at"),
    notesRegisteredAt: time("notes_registered_at"),
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
    codeforcesUsername: text("codeforces_username"),
    codeforcesUsernameKey: text("codeforces_username_key").generatedAlwaysAs(
      sql`lower(codeforces_username)`,
    ),
    codeforcesRegisteredAt: time("codeforces_registered_at"),
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
    uniqueIndex("accounts_codeforces_username_key_unique").on(table.codeforcesUsernameKey),
    check(
      "accounts_status_check",
      sql`${table.status} IN ('pending', 'active', 'paused', 'blocked')`,
    ),
  ],
);

export const platformServices = tracking.table(
  "platform_services",
  {
    registrationId: uuid("registration_id").primaryKey().defaultRandom(),
    accountId: uuid("account_id")
      .notNull()
      .references(() => accounts.id),
    platform: text("platform").$type<ActivityPlatform>().notNull(),
    paused: boolean("paused").notNull().default(false),
    agreementVersion: text("agreement_version"),
    agreementAcceptedAt: time("agreement_accepted_at"),
  },
  (table) => [
    uniqueIndex("platform_services_account_id_platform_key").on(table.accountId, table.platform),
  ],
);

export const dailyCollections = tracking.table(
  "daily_collections",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    accountId: uuid("account_id")
      .notNull()
      .references(() => accounts.id),
    registrationId: uuid("registration_id")
      .notNull()
      .references(() => platformServices.registrationId, { onDelete: "cascade" }),
    platform: text("platform").$type<ActivityPlatform>().notNull(),
    timezone: text("timezone").notNull().default("Asia/Kolkata"),
    reportDate: date("report_date").notNull(),
    start: time("period_start").notNull(),
    end: time("period_end").notNull(),
    recapEligible: boolean("recap_eligible").notNull(),
    status: text("status")
      .$type<"pending" | "collecting" | "complete" | "failed">()
      .notNull()
      .default("pending"),
    attempts: integer("attempts").notNull().default(0),
    nextAttemptAt: time("next_attempt_at").notNull().defaultNow(),
    leaseToken: text("lease_token"),
    leaseUntil: time("lease_until"),
    lastError: text("last_error"),
  },
  (table) => [
    uniqueIndex("daily_collections_registration_id_report_date_key").on(
      table.registrationId,
      table.reportDate,
    ),
  ],
);

export const reportReminders = tracking.table(
  "report_reminders",
  {
    accountId: uuid("account_id")
      .notNull()
      .references(() => accounts.id),
    reportDate: date("report_date").notNull(),
    sentAt: time("sent_at").notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.accountId, table.reportDate] })],
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
    registrationId: uuid("registration_id")
      .notNull()
      .references(() => platformServices.registrationId, { onDelete: "cascade" }),
    timezone: text("timezone").notNull().default("Asia/Kolkata"),
    reportDate: date("report_date").notNull(),
    platform: text("platform").$type<ActivityPlatform>().notNull().default("leetcode"),
    cadence: text("cadence").$type<"daily" | "weekly">().notNull().default("daily"),
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
    uniqueIndex("deliveries_account_platform_date_cadence_unique").on(
      table.accountId,
      table.platform,
      table.reportDate,
      table.cadence,
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
    timezone: text("timezone").notNull().default("Asia/Kolkata"),
    titleSlug: text("title_slug").notNull(),
    title: text("title").notNull(),
    acceptedAt: time("accepted_at").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.accountId, table.date, table.titleSlug, table.timezone] }),
  ],
);

export const activityDays = tracking.table(
  "activity_days",
  {
    accountId: uuid("account_id")
      .notNull()
      .references(() => accounts.id),
    date: date("activity_date").notNull(),
    timezone: text("timezone").notNull().default("Asia/Kolkata"),
    observedFrom: time("observed_from"),
    observedUntil: time("observed_until").notNull(),
    coveredUntil: time("covered_until"),
    checkedAt: time("checked_at").notNull(),
  },
  (table) => [primaryKey({ columns: [table.accountId, table.date, table.timezone] })],
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
      sql`${table.platform} IN ('leetcode', 'gfg', 'hackerrank', 'codeforces')`,
    ),
    check("activity_goals_target_check", sql`${table.weeklyTarget} BETWEEN 1 AND 1000`),
  ],
);

/** Accepted submissions retain re-solves; calendar/report readers deduplicate per problem/day. */
export const codeforcesProblems = tracking.table(
  "codeforces_problems",
  {
    accountId: uuid("account_id")
      .notNull()
      .references(() => accounts.id),
    submissionId: bigint("submission_id", { mode: "number" }).notNull(),
    id: text("problem_id").notNull(),
    contestId: integer("contest_id").notNull(),
    index: text("problem_index").notNull(),
    title: text("title").notNull(),
    solvedAt: time("solved_at").notNull(),
    firstObservedAt: time("first_observed_at").notNull(),
    baseline: boolean("baseline").notNull(),
    rating: integer("rating"),
    tags: jsonb("tags").$type<string[]>().notNull().default([]),
  },
  (table) => [primaryKey({ columns: [table.accountId, table.submissionId] })],
);

export const codeforcesSync = tracking.table("codeforces_sync", {
  accountId: uuid("account_id")
    .primaryKey()
    .references(() => accounts.id),
  profile: jsonb("profile").$type<CodeforcesSummary>(),
  refreshedAt: time("refreshed_at"),
  leaseToken: text("lease_token"),
  leaseUntil: time("lease_until"),
  lastError: integer("last_error"),
});

export const codeforcesSnapshots = tracking.table(
  "codeforces_snapshots",
  {
    accountId: uuid("account_id")
      .notNull()
      .references(() => accounts.id),
    date: date("snapshot_date").notNull(),
    availableSolved: integer("available_solved").notNull(),
    historyComplete: boolean("history_complete").notNull(),
    historyStart: time("history_start"),
    checkedAt: time("checked_at").notNull(),
  },
  (table) => [primaryKey({ columns: [table.accountId, table.date] })],
);

/** One durable row coordinates the upstream request budget across application instances. */
export const codeforcesApiRate = tracking.table("codeforces_api_rate", {
  id: integer("id").primaryKey(),
  nextRequestAt: time("next_request_at").notNull().defaultNow(),
});

export type Account = typeof accounts.$inferSelect;
export type Delivery = typeof deliveries.$inferSelect;

export const notebooks = tracking.table("notebooks", {
  id: uuid("id").primaryKey().defaultRandom(),
  accountId: uuid("account_id")
    .notNull()
    .unique()
    .references(() => accounts.id, { onDelete: "cascade" }),
  codeHash: text("code_hash").unique(),
  paused: boolean("paused").notNull().default(false),
  createdAt: time("created_at").notNull().defaultNow(),
});

export const notes = tracking.table("notes", {
  id: uuid("id").primaryKey().defaultRandom(),
  notebookId: uuid("notebook_id")
    .notNull()
    .references(() => notebooks.id, { onDelete: "cascade" }),
  text: text("content").notNull(),
  links: jsonb("links").$type<string[]>().notNull().default([]),
  createdAt: time("created_at").notNull().defaultNow(),
  updatedAt: time("updated_at").notNull().defaultNow(),
});

export const notesSessions = tracking.table("notes_sessions", {
  tokenHash: text("token_hash").primaryKey(),
  notebookId: uuid("notebook_id")
    .notNull()
    .references(() => notebooks.id, { onDelete: "cascade" }),
  expiresAt: time("expires_at").notNull(),
});

export const notesLoginLimits = tracking.table("notes_login_limits", {
  key: text("key").primaryKey(),
  attempts: integer("attempts").notNull(),
  resetAt: time("reset_at").notNull(),
});

export const articleCatalog = tracking.table("article_catalog", {
  id: uuid("id").primaryKey().defaultRandom(),
  canonicalUrl: text("canonical_url").notNull().unique(),
  title: text("title").notNull(),
  source: text("source").notNull(),
  publishedAt: time("published_at"),
  topics: text("topics").array().$type<import("@/lib/articles/topics").ArticleTopic[]>().notNull(),
  summary: text("summary").notNull().default(""),
  evergreen: boolean("evergreen").notNull().default(false),
  ingestedAt: time("ingested_at").notNull().defaultNow(),
});
export const articleSubscriptions = tracking.table("article_subscriptions", {
  id: uuid("id").primaryKey().defaultRandom(),
  accountId: uuid("account_id")
    .notNull()
    .unique()
    .references(() => accounts.id, { onDelete: "cascade" }),
  topics: text("topics").array().$type<import("@/lib/articles/topics").ArticleTopic[]>().notNull(),
  paused: boolean("paused").notNull().default(false),
  createdAt: time("created_at").notNull().defaultNow(),
});
export const articleFeedDays = tracking.table(
  "article_feed_days",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    subscriptionId: uuid("subscription_id")
      .notNull()
      .references(() => articleSubscriptions.id, { onDelete: "cascade" }),
    date: date("feed_date").notNull(),
    topics: text("topics")
      .array()
      .$type<import("@/lib/articles/topics").ArticleTopic[]>()
      .notNull(),
    generatedAt: time("generated_at").notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("article_feed_days_subscription_date_key").on(table.subscriptionId, table.date),
  ],
);
export const articleFeedItems = tracking.table(
  "article_feed_items",
  {
    dayId: uuid("day_id").notNull(),
    subscriptionId: uuid("subscription_id").notNull(),
    articleId: uuid("article_id")
      .notNull()
      .references(() => articleCatalog.id),
    position: integer("position").notNull(),
    topic: text("topic").$type<import("@/lib/articles/topics").ArticleTopic>().notNull(),
  },
  (table) => [primaryKey({ columns: [table.dayId, table.position] })],
);
export const articleSeen = tracking.table(
  "article_seen",
  {
    subscriptionId: uuid("subscription_id")
      .notNull()
      .references(() => articleSubscriptions.id, { onDelete: "cascade" }),
    articleId: uuid("article_id")
      .notNull()
      .references(() => articleCatalog.id),
    selectedAt: time("selected_at").notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.subscriptionId, table.articleId] })],
);
export const articleSourceState = tracking.table("article_source_state", {
  id: text("id").primaryKey(),
  etag: text("etag"),
  lastModified: text("last_modified"),
  lastSuccessAt: time("last_success_at"),
  nextFetchAt: time("next_fetch_at").notNull().default(new Date(0)),
  failures: integer("failures").notNull().default(0),
  lastError: text("last_error"),
  leaseToken: text("lease_token"),
  leaseUntil: time("lease_until"),
  robotsCheckedAt: time("robots_checked_at"),
  robotsAllowed: boolean("robots_allowed"),
  robotsDelaySeconds: integer("robots_delay_seconds").notNull().default(0),
});
