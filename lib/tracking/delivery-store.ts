import "server-only";
import { and, eq, getTableColumns, gt, isNotNull, lte, ne, or, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import {
  accounts,
  connectionTokens,
  deliveries,
  dispatchLock,
  loginAttempts,
  sessions,
  telegramUpdates,
  type Delivery,
} from "@/lib/db/schema";
import { getPreviousCalendarPeriod } from "@/lib/leetcode/calendar-periods";
import { randomToken } from "./security";

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
  await db()
    .execute(sql`INSERT INTO ${deliveries} (account_id, report_date, period_start, period_end)
    SELECT id, ${range.reportDate}::date, ${range.start.toISOString()}::timestamptz, ${range.end.toISOString()}::timestamptz
    FROM ${accounts} WHERE status = 'active' AND leetcode_username IS NOT NULL AND chat_id IS NOT NULL
    AND connected_at <= ${range.cutoff.toISOString()}::timestamptz
    ON CONFLICT (account_id, report_date) DO NOTHING`);
  await db()
    .execute(sql`UPDATE ${deliveries} SET status = 'failed', last_error = 'delivery_window_closed', lease_token = NULL, lease_until = NULL
    WHERE report_date < ${range.reportDate}::date AND status IN ('pending', 'sending', 'failed') AND (lease_until IS NULL OR lease_until < ${now.toISOString()}::timestamptz)`);
  return range.reportDate;
}

export async function claimDelivery(
  reportDate: string,
  now: Date,
): Promise<ClaimedDelivery | null> {
  // A single SQL statement locks and claims the next row, avoiding network
  // round trips for a separate BEGIN, SELECT, UPDATE, and COMMIT per recipient.
  const candidate = db()
    .select({ id: deliveries.id })
    .from(deliveries)
    .innerJoin(accounts, eq(deliveries.accountId, accounts.id))
    .where(
      and(
        eq(deliveries.reportDate, reportDate),
        eq(accounts.status, "active"),
        isNotNull(accounts.chatId),
        isNotNull(accounts.leetcodeUsername),
        sql`${deliveries.attempts} < 3`,
        lte(deliveries.nextAttemptAt, now),
        or(
          eq(deliveries.status, "pending"),
          eq(deliveries.status, "failed"),
          and(eq(deliveries.status, "sending"), lte(deliveries.leaseUntil, now)),
        ),
      ),
    )
    .orderBy(deliveries.createdAt)
    .limit(1)
    .for("update", { skipLocked: true });
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
      username: sql<string>`(SELECT leetcode_username FROM ${accounts} WHERE id = ${deliveries.accountId})`,
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
    .where(
      and(
        eq(deliveries.id, delivery.id),
        eq(deliveries.leaseToken, delivery.leaseToken!),
        eq(deliveries.status, "sending"),
        eq(accounts.status, "active"),
        gt(deliveries.leaseUntil, new Date()),
      ),
    )
    .limit(1);
  return Boolean(row);
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
    sql`DELETE FROM ${loginAttempts} WHERE expires_at < ${now.toISOString()}::timestamptz`,
  );
  await db().execute(
    sql`DELETE FROM ${connectionTokens} WHERE expires_at < ${now.toISOString()}::timestamptz`,
  );
  await db().execute(
    sql`DELETE FROM ${telegramUpdates} WHERE processed_at < ${now.toISOString()}::timestamptz - interval '30 days'`,
  );
}
