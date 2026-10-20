import { DEFAULT_TIMEZONE, localClock, localTime } from "@/lib/timezone";
import "server-only";
import { and, eq, getTableColumns, lte, ne, or, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { accounts, dailyCollections, deliveries, platformServices } from "@/lib/db/schema";
import { getPreviousCalendarPeriod } from "@/lib/leetcode/calendar-periods";
import { lockRegistration, type Transaction } from "./services";
import { randomToken } from "./security";
import { writeCollectedResult, type CollectedResult } from "./result-store";

export type ClaimedCollection = typeof dailyCollections.$inferSelect & { username: string };

export async function prepareCollections(tx: Transaction, now: Date, timezone = DEFAULT_TIMEZONE) {
  const range = getPreviousCalendarPeriod("lastday", now, timezone);
  const reportDate = localClock(range.start, timezone).date;
  const cutoff = localTime(localClock(range.end, timezone).date, 510, timezone);
  await tx.execute(sql`
    INSERT INTO ${dailyCollections} (account_id, registration_id, platform, timezone, report_date, period_start, period_end, recap_eligible, next_attempt_at)
    SELECT a.id, s.registration_id, s.platform, ${timezone}, ${reportDate}::date, ${range.start.toISOString()}::timestamptz, ${range.end.toISOString()}::timestamptz,
      coalesce((a.status = 'active' AND NOT s.paused AND a.chat_id IS NOT NULL
        AND a.connected_at <= ${cutoff.toISOString()}::timestamptz
        AND CASE s.platform WHEN 'gfg' THEN a.gfg_registered_at WHEN 'hackerrank' THEN a.hackerrank_registered_at ELSE a.registered_at END <= ${cutoff.toISOString()}::timestamptz), false),
      ${now.toISOString()}::timestamptz
    FROM ${accounts} a JOIN ${platformServices} s ON s.account_id = a.id
    WHERE a.timezone = ${timezone}
    ON CONFLICT (registration_id, report_date) DO NOTHING
  `);
  // A prepared legacy report already committed its activity in the same transaction.
  // Reuse that proof during rollout/recovery instead of fetching the platform again.
  await tx.execute(sql`
    UPDATE ${dailyCollections} c SET status = 'complete', lease_token = NULL, lease_until = NULL, last_error = NULL
    FROM ${deliveries} d
    WHERE c.registration_id = d.registration_id AND c.report_date = d.report_date
      AND c.timezone = ${timezone} AND c.report_date = ${reportDate}::date AND c.status IN ('pending', 'failed')
      AND d.cadence = 'daily' AND d.messages IS NOT NULL
  `);
}

export async function claimCollection(
  reportDate: string,
  now: Date,
  allowGfg = true,
  allowHackerRank = true,
  timezone?: string,
  recover = true,
): Promise<ClaimedCollection | null> {
  // Lock only the job here. Saving always locks the account first and rechecks the lease.
  const candidate = db()
    .select({ id: dailyCollections.id })
    .from(dailyCollections)
    .where(
      and(
        eq(dailyCollections.reportDate, reportDate),
        timezone
          ? sql`${dailyCollections.accountId} IN (SELECT id FROM ${accounts} WHERE timezone = ${timezone})`
          : undefined,
        sql`${dailyCollections.attempts} < 3`,
        recover ? undefined : eq(dailyCollections.attempts, 0),
        allowGfg ? undefined : ne(dailyCollections.platform, "gfg"),
        allowHackerRank ? undefined : ne(dailyCollections.platform, "hackerrank"),
        lte(dailyCollections.nextAttemptAt, now),
        or(
          eq(dailyCollections.status, "pending"),
          eq(dailyCollections.status, "failed"),
          and(eq(dailyCollections.status, "collecting"), lte(dailyCollections.leaseUntil, now)),
        ),
      ),
    )
    .orderBy(dailyCollections.reportDate, dailyCollections.id)
    .limit(1)
    .for("update", { skipLocked: true });
  const [row] = await db()
    .update(dailyCollections)
    .set({
      status: "collecting",
      attempts: sql`${dailyCollections.attempts} + 1`,
      leaseToken: randomToken(),
      leaseUntil: new Date(now.getTime() + 7 * 60_000),
    })
    .where(eq(dailyCollections.id, candidate))
    .returning({
      ...getTableColumns(dailyCollections),
      username: sql<string>`(SELECT CASE ${dailyCollections.platform} WHEN 'gfg' THEN gfg_username WHEN 'hackerrank' THEN hackerrank_username ELSE leetcode_username END FROM ${accounts} WHERE id = ${dailyCollections.accountId})`,
    });
  return row ?? null;
}

export async function completeCollection(
  job: ClaimedCollection,
  messages: string[],
  result: CollectedResult,
) {
  await db().transaction(async (tx) => {
    const { account, service } = await lockRegistration(
      tx,
      job.accountId,
      job.platform,
      job.registrationId,
    );
    const [leased] = await tx
      .select()
      .from(dailyCollections)
      .where(
        and(
          eq(dailyCollections.id, job.id),
          eq(dailyCollections.leaseToken, job.leaseToken!),
          eq(dailyCollections.status, "collecting"),
        ),
      )
      .for("update");
    if (!leased) throw new Error("Collection is no longer leased.");
    await writeCollectedResult(tx, job.accountId, result);
    if (
      leased.recapEligible &&
      !service.paused &&
      account.status === "active" &&
      account.chatId !== null
    ) {
      await tx
        .insert(deliveries)
        .values({
          accountId: job.accountId,
          registrationId: job.registrationId,
          platform: job.platform,
          reportDate: job.reportDate,
          timezone: leased.timezone,
          start: job.start,
          end: job.end,
          messages,
        })
        .onConflictDoUpdate({
          target: [
            deliveries.accountId,
            deliveries.platform,
            deliveries.reportDate,
            deliveries.cadence,
          ],
          set: { messages },
          setWhere: and(
            eq(deliveries.registrationId, job.registrationId),
            sql`${deliveries.messages} IS NULL`,
            ne(deliveries.status, "cancelled"),
            ne(deliveries.status, "sent"),
          ),
        });
    }
    await tx
      .update(dailyCollections)
      .set({ status: "complete", leaseToken: null, leaseUntil: null, lastError: null })
      .where(eq(dailyCollections.id, job.id));
  });
}

export async function failCollection(job: ClaimedCollection, error: string, retryAfter = 60) {
  await db()
    .update(deliveries)
    .set({
      status: "failed",
      lastError: error,
      nextAttemptAt: new Date(Date.now() + retryAfter * 1000),
    })
    .where(
      and(
        eq(deliveries.registrationId, job.registrationId),
        eq(deliveries.reportDate, job.reportDate),
        eq(deliveries.cadence, "daily"),
        sql`${deliveries.messages} IS NULL`,
        ne(deliveries.status, "cancelled"),
        ne(deliveries.status, "sent"),
      ),
    );
  await db()
    .update(dailyCollections)
    .set({
      status: "failed",
      lastError: error,
      nextAttemptAt: new Date(Date.now() + retryAfter * 1000),
      leaseToken: null,
      leaseUntil: null,
    })
    .where(and(eq(dailyCollections.id, job.id), eq(dailyCollections.leaseToken, job.leaseToken!)));
}
