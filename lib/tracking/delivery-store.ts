import "server-only";
import { and, eq, getTableColumns, gt, isNotNull, lte, ne, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "@/lib/db/client";
import { ApiError } from "@/lib/http/api-error";
import {
  accounts,
  connectionTokens,
  deliveries,
  dispatchLock,
  loginAttempts,
  googleLoginAttempts,
  sessions,
  telegramUpdates,
  platformServices,
  dailyCollections,
  reportReminders,
  type Delivery,
} from "@/lib/db/schema";
import { getPreviousCalendarPeriod } from "@/lib/leetcode/calendar-periods";
import { randomToken } from "./security";
import { lockRegistration } from "./services";
import { writeCollectedResult, type CollectedResult } from "./result-store";
import { prepareCollections } from "./collection-store";
import { EMPTY_REPORT } from "./format-report";
import { weeklyReportPeriod } from "./weekly-period";

export type ClaimedDelivery = Delivery & { username: string; chatId: number };
const LEASE_MS = 7 * 60 * 1000;

export function reportPeriod(now: Date) {
  const range = getPreviousCalendarPeriod("lastday", now);
  const reportDate = new Date(range.start.getTime() + 330 * 60 * 1000).toISOString().slice(0, 10);
  return { ...range, reportDate, cutoff: new Date(range.end.getTime() + 8.5 * 60 * 60 * 1000) };
}

export async function acquireDispatchLock(now: Date) {
  const token = randomToken();
  const rows = await db()
    .insert(dispatchLock)
    .values({ id: 1, token, expiresAt: new Date(now.getTime() + LEASE_MS) })
    .onConflictDoUpdate({
      target: dispatchLock.id,
      set: { token, expiresAt: new Date(now.getTime() + LEASE_MS) },
      setWhere: and(lte(dispatchLock.expiresAt, now), eq(dispatchLock.enabled, true)),
    })
    .returning();
  return rows.length ? token : null;
}

export async function releaseDispatchLock(token: string) {
  await db()
    .delete(dispatchLock)
    .where(
      and(eq(dispatchLock.id, 1), eq(dispatchLock.token, token), eq(dispatchLock.enabled, true)),
    );
}

export async function prepareDeliveries(now: Date) {
  const range = reportPeriod(now);
  await db().transaction(async (transaction) => {
    await transaction.select({ id: accounts.id }).from(accounts).orderBy(accounts.id).for("update");
    await prepareCollections(transaction, now);
    await transaction.execute(sql`INSERT INTO ${deliveries} (account_id, platform, report_date, period_start, period_end)
    SELECT id, 'leetcode', ${range.reportDate}::date, ${range.start.toISOString()}::timestamptz, ${range.end.toISOString()}::timestamptz
    FROM ${accounts} WHERE status = 'active' AND daily_grind_registration_id IS NOT NULL AND NOT daily_grind_paused AND leetcode_username IS NOT NULL AND chat_id IS NOT NULL AND EXISTS (SELECT 1 FROM ${platformServices} s WHERE s.account_id = ${accounts}.id AND s.platform = 'leetcode' AND NOT s.paused) AND EXISTS (SELECT 1 FROM ${dailyCollections} c WHERE c.account_id = ${accounts}.id AND c.platform = 'leetcode' AND c.report_date = ${range.reportDate}::date AND c.recap_eligible)
    AND connected_at <= ${range.cutoff.toISOString()}::timestamptz
    AND registered_at <= ${range.cutoff.toISOString()}::timestamptz
    ON CONFLICT (account_id, platform, report_date, cadence) DO NOTHING`);
    await transaction.execute(sql`INSERT INTO ${deliveries} (account_id, platform, report_date, period_start, period_end)
    SELECT id, 'gfg', ${range.reportDate}::date, ${range.start.toISOString()}::timestamptz, ${range.end.toISOString()}::timestamptz
    FROM ${accounts} WHERE status = 'active' AND daily_grind_registration_id IS NOT NULL AND NOT daily_grind_paused AND gfg_username IS NOT NULL AND chat_id IS NOT NULL AND EXISTS (SELECT 1 FROM ${platformServices} s WHERE s.account_id = ${accounts}.id AND s.platform = 'gfg' AND NOT s.paused) AND EXISTS (SELECT 1 FROM ${dailyCollections} c WHERE c.account_id = ${accounts}.id AND c.platform = 'gfg' AND c.report_date = ${range.reportDate}::date AND c.recap_eligible)
      AND connected_at <= ${range.cutoff.toISOString()}::timestamptz
      AND gfg_registered_at <= ${range.cutoff.toISOString()}::timestamptz
    ON CONFLICT (account_id, platform, report_date, cadence) DO NOTHING`);
    await transaction.execute(sql`INSERT INTO ${deliveries} (account_id, platform, report_date, period_start, period_end)
    SELECT id, 'hackerrank', ${range.reportDate}::date, ${range.start.toISOString()}::timestamptz, ${range.end.toISOString()}::timestamptz
    FROM ${accounts} WHERE status = 'active' AND daily_grind_registration_id IS NOT NULL AND NOT daily_grind_paused AND hackerrank_username IS NOT NULL AND chat_id IS NOT NULL AND EXISTS (SELECT 1 FROM ${platformServices} s WHERE s.account_id = ${accounts}.id AND s.platform = 'hackerrank' AND NOT s.paused) AND EXISTS (SELECT 1 FROM ${dailyCollections} c WHERE c.account_id = ${accounts}.id AND c.platform = 'hackerrank' AND c.report_date = ${range.reportDate}::date AND c.recap_eligible)
    AND connected_at <= ${range.cutoff.toISOString()}::timestamptz
    AND hackerrank_registered_at <= ${range.cutoff.toISOString()}::timestamptz
    ON CONFLICT (account_id, platform, report_date, cadence) DO NOTHING`);
    await transaction.execute(sql`INSERT INTO ${deliveries} (account_id, platform, report_date, period_start, period_end)
    SELECT id, 'codeforces', ${range.reportDate}::date, ${range.start.toISOString()}::timestamptz, ${range.end.toISOString()}::timestamptz
    FROM ${accounts} WHERE status = 'active' AND daily_grind_registration_id IS NOT NULL AND NOT daily_grind_paused AND codeforces_username IS NOT NULL AND chat_id IS NOT NULL AND EXISTS (SELECT 1 FROM ${platformServices} s WHERE s.account_id = ${accounts}.id AND s.platform = 'codeforces' AND NOT s.paused) AND EXISTS (SELECT 1 FROM ${dailyCollections} c WHERE c.account_id = ${accounts}.id AND c.platform = 'codeforces' AND c.report_date = ${range.reportDate}::date AND c.recap_eligible)
    AND connected_at <= ${range.cutoff.toISOString()}::timestamptz
    AND codeforces_registered_at <= ${range.cutoff.toISOString()}::timestamptz
    ON CONFLICT (account_id, platform, report_date, cadence) DO NOTHING`);
    await transaction.execute(sql`UPDATE ${deliveries} SET status = 'failed', last_error = 'delivery_window_closed', lease_token = NULL, lease_until = NULL
    WHERE cadence = 'daily' AND report_date < ${range.reportDate}::date AND status IN ('pending', 'sending', 'failed') AND (lease_until IS NULL OR lease_until < ${now.toISOString()}::timestamptz)`);
  });
  return range.reportDate;
}

export async function prepareWeeklyDeliveries(now: Date) {
  const range = weeklyReportPeriod(now);
  await db().transaction(async (transaction) => {
    await transaction.select({ id: accounts.id }).from(accounts).orderBy(accounts.id).for("update");
    await transaction.execute(sql`
      INSERT INTO ${deliveries} (account_id, registration_id, platform, cadence, report_date, period_start, period_end, status, next_attempt_at)
      SELECT a.id, s.registration_id, s.platform, 'weekly', ${range.reportDate}::date,
        ${range.start.toISOString()}::timestamptz, ${range.end.toISOString()}::timestamptz,
        CASE WHEN a.status = 'active' AND NOT a.daily_grind_paused AND NOT s.paused THEN 'pending' ELSE 'cancelled' END,
        ${now.toISOString()}::timestamptz
      FROM ${accounts} a JOIN ${platformServices} s ON s.account_id = a.id
      WHERE a.chat_id IS NOT NULL AND a.daily_grind_registration_id IS NOT NULL
        AND CASE s.platform WHEN 'codeforces' THEN a.codeforces_username WHEN 'gfg' THEN a.gfg_username WHEN 'hackerrank' THEN a.hackerrank_username ELSE a.leetcode_username END IS NOT NULL
        AND CASE s.platform WHEN 'codeforces' THEN a.codeforces_registered_at WHEN 'gfg' THEN a.gfg_registered_at WHEN 'hackerrank' THEN a.hackerrank_registered_at ELSE a.registered_at END <= ${range.cutoff.toISOString()}::timestamptz
        AND a.connected_at <= ${range.cutoff.toISOString()}::timestamptz
      ON CONFLICT (account_id, platform, report_date, cadence) DO NOTHING
    `);
    await transaction.execute(sql`
      UPDATE ${deliveries} SET status = 'failed', last_error = 'delivery_window_closed', lease_token = NULL, lease_until = NULL
      WHERE cadence = 'weekly' AND report_date < ${range.reportDate}::date
        AND status IN ('pending', 'sending', 'failed')
        AND (lease_until IS NULL OR lease_until < ${now.toISOString()}::timestamptz)
    `);
  });
  return range.reportDate;
}

/** Reuse one completed empty delivery so the shared reminder has durable retry state. */
export async function prepareEmptyDayReports(reportDate: string, now: Date) {
  const rows = await db().execute(sql`
    UPDATE ${deliveries} AS target
    SET messages = ${JSON.stringify([EMPTY_REPORT])}::jsonb,
      status = 'pending', attempts = 0, sent_parts = 0, sent_at = NULL,
      next_attempt_at = ${now.toISOString()}::timestamptz,
      last_error = NULL, lease_token = NULL, lease_until = NULL
    FROM ${accounts} AS account
    WHERE target.account_id = account.id AND account.status = 'active' AND account.daily_grind_registration_id IS NOT NULL AND NOT account.daily_grind_paused AND account.chat_id IS NOT NULL
      AND EXISTS (SELECT 1 FROM ${platformServices} s WHERE s.registration_id = target.registration_id AND NOT s.paused)
      AND NOT EXISTS (SELECT 1 FROM ${reportReminders} reminder WHERE reminder.account_id = target.account_id AND reminder.report_date = target.report_date)
      AND target.cadence = 'daily' AND target.report_date = ${reportDate}::date AND target.status = 'sent' AND target.messages = '[]'::jsonb
      AND target.platform = (
        SELECT min(sibling.platform) FROM ${deliveries} AS sibling
        WHERE sibling.cadence = 'daily' AND sibling.account_id = target.account_id AND sibling.report_date = target.report_date
          AND EXISTS (SELECT 1 FROM ${platformServices} s WHERE s.registration_id = sibling.registration_id AND NOT s.paused)
      )
      AND NOT EXISTS (
        SELECT 1 FROM ${deliveries} AS sibling
        WHERE sibling.cadence = 'daily' AND sibling.account_id = target.account_id AND sibling.report_date = target.report_date
          AND EXISTS (SELECT 1 FROM ${platformServices} s WHERE s.registration_id = sibling.registration_id AND NOT s.paused)
          AND (sibling.messages IS NULL OR sibling.messages <> '[]'::jsonb OR sibling.status <> 'sent')
      )
    RETURNING target.id
  `);
  return rows.length;
}

export async function claimDelivery(
  reportDate: string,
  now: Date,
  allowGfg = true,
  allowHackerRank = true,
  preparedOnly = false,
  cadence: "daily" | "weekly" = "daily",
  allowCodeforces = true,
): Promise<ClaimedDelivery | null> {
  // A single SQL statement locks and claims the next row, avoiding network
  // round trips for a separate BEGIN, SELECT, UPDATE, and COMMIT per recipient.
  const candidateDelivery = alias(deliveries, "candidate_delivery");
  const candidate = db()
    .select({ id: candidateDelivery.id })
    .from(candidateDelivery)
    .innerJoin(accounts, eq(candidateDelivery.accountId, accounts.id))
    .innerJoin(
      platformServices,
      eq(candidateDelivery.registrationId, platformServices.registrationId),
    )
    .where(
      and(
        eq(candidateDelivery.reportDate, reportDate),
        eq(candidateDelivery.cadence, cadence),
        preparedOnly ? isNotNull(candidateDelivery.messages) : undefined,
        allowGfg ? undefined : ne(candidateDelivery.platform, "gfg"),
        allowHackerRank ? undefined : ne(candidateDelivery.platform, "hackerrank"),
        allowCodeforces ? undefined : ne(candidateDelivery.platform, "codeforces"),
        eq(accounts.status, "active"),
        isNotNull(accounts.dailyGrindRegistrationId),
        eq(accounts.dailyGrindPaused, false),
        eq(platformServices.paused, false),
        isNotNull(accounts.chatId),
        sql`CASE WHEN ${candidateDelivery.platform} = 'codeforces' THEN ${accounts.codeforcesUsername} WHEN ${candidateDelivery.platform} = 'hackerrank' THEN ${accounts.hackerRankUsername} WHEN ${candidateDelivery.platform} = 'gfg' THEN ${accounts.gfgUsername} ELSE ${accounts.leetcodeUsername} END IS NOT NULL`,
        sql`${candidateDelivery.attempts} < 3`,
        lte(candidateDelivery.nextAttemptAt, now),
        or(
          eq(candidateDelivery.status, "pending"),
          eq(candidateDelivery.status, "failed"),
          and(eq(candidateDelivery.status, "sending"), lte(candidateDelivery.leaseUntil, now)),
        ),
      ),
    )
    .orderBy(candidateDelivery.createdAt)
    .limit(1)
    .for("update", { of: candidateDelivery, skipLocked: true });
  const [claimed] = await db()
    .update(deliveries)
    .set({
      status: "sending",
      leaseToken: randomToken(),
      leaseUntil: new Date(now.getTime() + LEASE_MS),
      attempts: sql`${deliveries.attempts} + 1`,
    })
    .where(eq(deliveries.id, candidate))
    .returning({
      ...getTableColumns(deliveries),
      username: sql<string>`(SELECT CASE WHEN ${deliveries.platform} = 'codeforces' THEN codeforces_username WHEN ${deliveries.platform} = 'hackerrank' THEN hackerrank_username WHEN ${deliveries.platform} = 'gfg' THEN gfg_username ELSE leetcode_username END FROM ${accounts} WHERE id = ${deliveries.accountId})`,
      chatId:
        sql<number>`(SELECT chat_id FROM ${accounts} WHERE id = ${deliveries.accountId})`.mapWith(
          Number,
        ),
    });
  return claimed ?? null;
}

export async function deliveryIsActive(delivery: ClaimedDelivery) {
  const [row] = await db()
    .select({ id: deliveries.id })
    .from(deliveries)
    .innerJoin(accounts, eq(deliveries.accountId, accounts.id))
    .innerJoin(platformServices, eq(deliveries.registrationId, platformServices.registrationId))
    .where(
      and(
        eq(deliveries.id, delivery.id),
        eq(deliveries.leaseToken, delivery.leaseToken!),
        eq(deliveries.status, "sending"),
        eq(accounts.status, "active"),
        isNotNull(accounts.dailyGrindRegistrationId),
        eq(accounts.dailyGrindPaused, false),
        eq(platformServices.paused, false),
        gt(deliveries.leaseUntil, new Date()),
      ),
    )
    .limit(1);
  return Boolean(row);
}

/** Serialize the last eligibility check and network send with pause/revocation. */
export async function sendDeliveryPart(
  delivery: ClaimedDelivery,
  index: number,
  send: () => Promise<void>,
) {
  return db().transaction(async (transaction) => {
    let registration;
    try {
      registration = await lockRegistration(
        transaction,
        delivery.accountId,
        delivery.platform,
        delivery.registrationId,
      );
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) return false;
      throw error;
    }
    if (
      registration.service.paused ||
      !registration.account.dailyGrindRegistrationId ||
      registration.account.dailyGrindPaused ||
      registration.account.status !== "active"
    )
      return false;
    const [leased] = await transaction
      .select({ id: deliveries.id })
      .from(deliveries)
      .where(
        and(
          eq(deliveries.id, delivery.id),
          eq(deliveries.registrationId, delivery.registrationId),
          eq(deliveries.status, "sending"),
          eq(deliveries.leaseToken, delivery.leaseToken!),
          gt(deliveries.leaseUntil, new Date()),
        ),
      )
      .for("update");
    if (!leased) return false;
    const reminder = delivery.messages?.[index] === EMPTY_REPORT;
    if (reminder) {
      const [sent] = await transaction
        .select()
        .from(reportReminders)
        .where(
          and(
            eq(reportReminders.accountId, delivery.accountId),
            eq(reportReminders.reportDate, delivery.reportDate),
          ),
        );
      if (sent) {
        await transaction
          .update(deliveries)
          .set({ status: "cancelled", leaseToken: null, leaseUntil: null })
          .where(eq(deliveries.id, delivery.id));
        return false;
      }
    }
    await send();
    if (reminder)
      await transaction
        .insert(reportReminders)
        .values({ accountId: delivery.accountId, reportDate: delivery.reportDate })
        .onConflictDoNothing();
    await transaction
      .update(deliveries)
      .set({ sentParts: index + 1 })
      .where(eq(deliveries.id, delivery.id));
    return true;
  });
}

export async function updateDelivery(
  delivery: ClaimedDelivery,
  values: Partial<typeof deliveries.$inferInsert>,
) {
  const result = await db()
    .update(deliveries)
    .set(values)
    .where(
      and(
        eq(deliveries.id, delivery.id),
        eq(deliveries.leaseToken, delivery.leaseToken!),
        eq(deliveries.status, "sending"),
      ),
    )
    .returning({ id: deliveries.id });
  if (!result.length) throw new Error("Delivery is no longer leased.");
}

export async function prepareDeliveryReport(
  delivery: ClaimedDelivery,
  messages: string[],
  result: CollectedResult,
) {
  await db().transaction(async (transaction) => {
    await lockRegistration(
      transaction,
      delivery.accountId,
      delivery.platform,
      delivery.registrationId,
    );
    // Weekly results deduplicate across days and cannot establish daily coverage.
    if (delivery.cadence === "daily")
      await writeCollectedResult(transaction, delivery.accountId, result);
    const rows = await transaction
      .update(deliveries)
      .set({ messages })
      .where(
        and(
          eq(deliveries.id, delivery.id),
          eq(deliveries.leaseToken, delivery.leaseToken!),
          eq(deliveries.status, "sending"),
        ),
      )
      .returning({ id: deliveries.id });
    if (!rows.length) throw new Error("Delivery is no longer leased.");
  });
}

export async function failDelivery(delivery: ClaimedDelivery, reason: string, retryAfter = 60) {
  await db()
    .update(deliveries)
    .set({
      status: "failed",
      lastError: reason,
      nextAttemptAt: new Date(Date.now() + retryAfter * 1000),
      leaseToken: null,
      leaseUntil: null,
    })
    .where(
      and(
        eq(deliveries.id, delivery.id),
        eq(deliveries.leaseToken, delivery.leaseToken!),
        eq(deliveries.status, "sending"),
      ),
    );
}

export async function blockAccount(delivery: ClaimedDelivery) {
  await db().transaction(async (transaction) => {
    // Match the webhook's account-first lock order, then fence stale delivery failures.
    const [account] = await transaction
      .select({ id: accounts.id })
      .from(accounts)
      .where(
        and(
          eq(accounts.id, delivery.accountId),
          eq(accounts.status, "active"),
          isNotNull(accounts.dailyGrindRegistrationId),
          eq(accounts.dailyGrindPaused, false),
        ),
      )
      .for("update");
    if (!account) return;
    const [leased] = await transaction
      .select({ id: deliveries.id })
      .from(deliveries)
      .where(
        and(
          eq(deliveries.id, delivery.id),
          eq(deliveries.leaseToken, delivery.leaseToken!),
          eq(deliveries.status, "sending"),
          gt(deliveries.leaseUntil, new Date()),
        ),
      )
      .for("update");
    if (!leased) return;
    await transaction
      .update(accounts)
      .set({ status: "blocked" })
      .where(eq(accounts.id, delivery.accountId));
    await transaction
      .update(deliveries)
      .set({ status: "cancelled", lastError: "bot_blocked", leaseToken: null, leaseUntil: null })
      .where(and(eq(deliveries.accountId, delivery.accountId), ne(deliveries.status, "sent")));
  });
}

export async function cleanExpiredData(now: Date) {
  // Keep deduplication records beyond Telegram's update retention period.
  await db().execute(
    sql`DELETE FROM ${sessions} WHERE expires_at < ${now.toISOString()}::timestamptz`,
  );
  await db().execute(
    sql`DELETE FROM ${googleLoginAttempts} WHERE expires_at < ${now.toISOString()}::timestamptz`,
  );
  await db().execute(
    sql`DELETE FROM ${loginAttempts} WHERE expires_at < ${now.toISOString()}::timestamptz`,
  );
  await db().execute(
    sql`DELETE FROM ${connectionTokens} WHERE expires_at < ${now.toISOString()}::timestamptz`,
  );
  await db().execute(
    sql`DELETE FROM ${telegramUpdates} WHERE processed_at < ${now.toISOString()}::timestamptz - interval '30 days'`,
  );
}
