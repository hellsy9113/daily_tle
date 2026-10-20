import { addCalendarDays } from "@/lib/timezone";
import "server-only";
import { lockRegistration } from "@/lib/tracking/services";
import { and, eq, gte, lt, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { acceptedActivity, activityDays, activitySync, type Account } from "@/lib/db/schema";
import {
  ACTIVITY_TIMEZONE,
  activityDate,
  activityDayStart,
  activityWindow,
  streaks,
} from "./calendar";
import type { ActivityObservation, ActivityResult } from "./types";
import { compareWeeks } from "./weekly";

type ActivityWriter = Pick<ReturnType<typeof db>, "insert">;

/** Call inside a transaction so counts and their coverage proof become visible together. */
export async function writeActivityObservation(
  writer: ActivityWriter,
  accountId: string,
  observation: ActivityObservation,
) {
  const timezone = observation.timezone ?? ACTIVITY_TIMEZONE;
  if (observation.problems.length) {
    await writer
      .insert(acceptedActivity)
      .values(observation.problems.map((problem) => ({ ...problem, accountId, timezone })))
      .onConflictDoUpdate({
        target: [
          acceptedActivity.accountId,
          acceptedActivity.date,
          acceptedActivity.titleSlug,
          acceptedActivity.timezone,
        ],
        set: {
          title: sql`CASE WHEN excluded.accepted_at >= ${acceptedActivity.acceptedAt} THEN excluded.title ELSE ${acceptedActivity.title} END`,
          acceptedAt: sql`greatest(${acceptedActivity.acceptedAt}, excluded.accepted_at)`,
        },
      });
  }
  if (observation.days.length) {
    await writer
      .insert(activityDays)
      .values(
        observation.days.map((day) => ({
          accountId,
          date: day.date,
          timezone,
          observedFrom: day.from,
          observedUntil: day.until,
          coveredUntil:
            day.from && day.from < activityDayStart(day.date, timezone) ? day.until : null,
          checkedAt: observation.checkedAt,
        })),
      )
      .onConflictDoUpdate({
        target: [activityDays.accountId, activityDays.date, activityDays.timezone],
        set: {
          observedFrom: sql`CASE WHEN excluded.observed_until >= ${activityDays.observedUntil} THEN excluded.observed_from ELSE ${activityDays.observedFrom} END`,
          observedUntil: sql`greatest(${activityDays.observedUntil}, excluded.observed_until)`,
          // Join overlapping intervals in either write order, while preserving gaps.
          coveredUntil: sql`CASE
          WHEN excluded.covered_until IS NOT NULL
            OR ${activityDays.coveredUntil} > excluded.observed_from
          THEN greatest(${activityDays.coveredUntil}, excluded.observed_until,
            CASE WHEN ${activityDays.observedFrom} < greatest(${activityDays.coveredUntil}, excluded.observed_until)
              THEN ${activityDays.observedUntil} END)
          ELSE ${activityDays.coveredUntil} END`,
          checkedAt: sql`greatest(${activityDays.checkedAt}, excluded.checked_at)`,
        },
      });
  }
}

export async function readActivity(account: Account, now: Date): Promise<ActivityResult> {
  const timezone = account.timezone ?? ACTIVITY_TIMEZONE;
  const range = activityWindow(now, timezone);
  const withinRange = and(
    gte(acceptedActivity.acceptedAt, activityDayStart(range.start, timezone)),
    lt(acceptedActivity.acceptedAt, activityDayStart(range.end, timezone)),
    lt(acceptedActivity.acceptedAt, now),
  );
  const [problems, coverage, states] = await Promise.all([
    db()
      .select({
        date: acceptedActivity.date,
        titleSlug: acceptedActivity.titleSlug,
        acceptedAt: acceptedActivity.acceptedAt,
      })
      .from(acceptedActivity)
      .where(and(eq(acceptedActivity.accountId, account.id), withinRange)),
    db()
      .select()
      .from(activityDays)
      .where(
        and(
          eq(activityDays.accountId, account.id),
          gte(activityDays.date, addCalendarDays(range.start, -2)),
          lt(activityDays.date, addCalendarDays(range.end, 2)),
        ),
      ),
    db().select().from(activitySync).where(eq(activitySync.accountId, account.id)).limit(1),
  ]);
  const regrouped = [
    ...new Map(
      problems.map((problem) => {
        const date = activityDate(problem.acceptedAt, timezone);
        return [`${date}:${problem.titleSlug}`, { ...problem, date }];
      }),
    ).values(),
  ];
  const counts = new Map<string, number>();
  for (const problem of regrouped) counts.set(problem.date, (counts.get(problem.date) ?? 0) + 1);
  const days = range.dates.map((date) => {
    const start = activityDayStart(date, timezone);
    const end = activityDayStart(addCalendarDays(date, 1), timezone);
    const requiredUntil = end <= now ? end : now;
    const matching = coverage.filter(
      (row) =>
        row.observedUntil &&
        row.observedUntil > start &&
        (row.observedFrom
          ? row.observedFrom < end
          : activityDayStart(row.date, row.timezone) < end),
    );
    const complete = matching.some(
      (row) =>
        row.timezone === timezone &&
        row.date === date &&
        row.coveredUntil &&
        row.coveredUntil >= requiredUntil,
    );
    return {
      date,
      count: counts.get(date) ?? 0,
      coverage: complete
        ? ("complete" as const)
        : matching.length || counts.has(date)
          ? ("partial" as const)
          : ("unknown" as const),
    };
  });
  const state = states[0];
  const updatedAt = coverage.reduce<Date | null>(
    (latest, day) => (!latest || day.checkedAt > latest ? day.checkedAt : latest),
    state?.refreshedAt ?? null,
  );
  return {
    username: account.leetcodeUsername!,
    timezone,
    start: range.start,
    end: range.end,
    days,
    weekly: compareWeeks(
      regrouped.map((problem) => ({ id: problem.titleSlug, date: problem.date })),
      days,
      now,
      timezone,
    ),
    uniqueQuestions: new Set(problems.map((problem) => problem.titleSlug)).size,
    activeDays: days.filter((day) => day.count > 0).length,
    ...streaks(days),
    mayBeIncomplete: days.some((day) => day.coverage !== "complete"),
    lastSyncedAt: updatedAt?.toISOString() ?? null,
    refreshing: Boolean(state?.leaseToken && state.leaseUntil && state.leaseUntil > now),
    refreshFailed: Boolean(state?.lastError),
  };
}

export async function activityState(accountId: string) {
  const [state] = await db()
    .select()
    .from(activitySync)
    .where(eq(activitySync.accountId, accountId))
    .limit(1);
  return state;
}

export async function claimActivitySync(
  accountId: string,
  token: string,
  now: Date,
  registrationId?: string,
) {
  return db().transaction(async (transaction) => {
    await lockRegistration(transaction, accountId, "leetcode", registrationId);
    const rows = await transaction
      .insert(activitySync)
      .values({ accountId, leaseToken: token, leaseUntil: new Date(now.getTime() + 60_000) })
      .onConflictDoUpdate({
        target: activitySync.accountId,
        set: { leaseToken: token, leaseUntil: new Date(now.getTime() + 60_000) },
        setWhere: and(
          sql`(${activitySync.refreshedAt} IS NULL OR ${activitySync.refreshedAt} <= ${new Date(now.getTime() - 60_000).toISOString()}::timestamptz)`,
          sql`(${activitySync.leaseUntil} IS NULL OR ${activitySync.leaseUntil} <= ${now.toISOString()}::timestamptz)`,
        ),
      })
      .returning({ accountId: activitySync.accountId });
    return rows.length > 0;
  });
}

export async function saveActivitySync(
  accountId: string,
  token: string,
  observation: ActivityObservation,
) {
  await db().transaction(async (transaction) => {
    await lockRegistration(transaction, accountId, "leetcode");
    const [lease] = await transaction
      .select()
      .from(activitySync)
      .where(and(eq(activitySync.accountId, accountId), eq(activitySync.leaseToken, token)))
      .for("update");
    if (!lease) throw new Error("Refresh lease expired or service was revoked.");
    await writeActivityObservation(transaction, accountId, observation);
    const rows = await transaction
      .update(activitySync)
      .set({
        refreshedAt: observation.checkedAt,
        leaseToken: null,
        leaseUntil: null,
        lastError: null,
      })
      .where(and(eq(activitySync.accountId, accountId), eq(activitySync.leaseToken, token)))
      .returning({ accountId: activitySync.accountId });
    if (!rows.length) throw new Error("Activity refresh lease expired.");
  });
}

export async function failActivitySync(
  accountId: string,
  token: string,
  status: number,
  now: Date,
) {
  await db()
    .update(activitySync)
    .set({
      leaseToken: null,
      leaseUntil: new Date(now.getTime() + 60_000),
      lastError: [404, 502, 504].includes(status) ? status : 503,
    })
    .where(and(eq(activitySync.accountId, accountId), eq(activitySync.leaseToken, token)));
}
