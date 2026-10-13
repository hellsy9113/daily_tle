import { sql } from "drizzle-orm";
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
    usernameKey: text("username_key").generatedAlwaysAs(sql`lower(leetcode_username)`),
    chatId: bigint("chat_id", { mode: "number" }).unique(),
    status: text("status").notNull().default("pending"),
    registeredAt: time("registered_at"),
    connectedAt: time("connected_at"),
    createdAt: time("created_at").notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("accounts_username_key_unique").on(table.usernameKey),
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
    start: time("period_start").notNull(),
    end: time("period_end").notNull(),
    status: text("status").notNull().default("pending"),
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
    uniqueIndex("deliveries_account_date_unique").on(table.accountId, table.reportDate),
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

export type Account = typeof accounts.$inferSelect;
export type Delivery = typeof deliveries.$inferSelect;
