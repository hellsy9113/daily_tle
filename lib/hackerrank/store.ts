import "server-only";
import { and, eq, lte, or, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { hackerRankProblems, hackerRankSnapshots, hackerRankSync } from "@/lib/db/schema";
import { activityDate } from "@/lib/activity/calendar";
import type { HackerRankProfile, HackerRankSummary, StoredHackerRankProblem } from "./types";

export const HACKERRANK_REFRESH_MS = 5 * 60_000;
type HackerRankWriter = Pick<ReturnType<typeof db>, "insert" | "select">;

export async function writeHackerRankProfile(
  writer: HackerRankWriter,
  accountId: string,
  profile: HackerRankProfile,
) {
  const [state] = await writer
    .select()
    .from(hackerRankSync)
    .where(eq(hackerRankSync.accountId, accountId))
    .limit(1)
    .for("update");
  const baseline = !state?.refreshedAt;
  for (let index = 0; index < profile.problems.length; index += 500) {
    await writer
      .insert(hackerRankProblems)
      .values(
        profile.problems.slice(index, index + 500).map((problem) => ({
          accountId,
          id: problem.id,
          title: problem.title,
          slug: problem.slug,
          contest: problem.contest,
          solvedAt: new Date(problem.solvedAt),
          firstObservedAt: new Date(profile.checkedAt),
          baseline,
        })),
      )
      .onConflictDoUpdate({
        target: [hackerRankProblems.accountId, hackerRankProblems.id],
        set: {
          title: sql`excluded.title`,
          solvedAt: sql`least(${hackerRankProblems.solvedAt}, excluded.solved_at)`,
          firstObservedAt: sql`least(${hackerRankProblems.firstObservedAt}, excluded.first_observed_at)`,
        },
      });
  }
  await writer
    .insert(hackerRankSnapshots)
    .values({
      accountId,
      date: activityDate(new Date(profile.checkedAt)),
      availableSolved: profile.problems.length,
      historyComplete: profile.historyComplete,
      checkedAt: new Date(profile.checkedAt),
    })
    .onConflictDoUpdate({
      target: [hackerRankSnapshots.accountId, hackerRankSnapshots.date],
      set: {
        availableSolved: profile.problems.length,
        historyComplete: profile.historyComplete,
        checkedAt: new Date(profile.checkedAt),
      },
      setWhere: lte(hackerRankSnapshots.checkedAt, new Date(profile.checkedAt)),
    });
}

export async function hackerRankState(accountId: string) {
  const [state] = await db()
    .select()
    .from(hackerRankSync)
    .where(eq(hackerRankSync.accountId, accountId))
    .limit(1);
  return state;
}

export async function readHackerRankProblems(
  accountId: string,
): Promise<StoredHackerRankProblem[]> {
  const rows = await db()
    .select()
    .from(hackerRankProblems)
    .where(eq(hackerRankProblems.accountId, accountId));
  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    slug: row.slug,
    contest: row.contest,
    url:
      row.contest === "master"
        ? `https://www.hackerrank.com/challenges/${encodeURIComponent(row.slug)}`
        : `https://www.hackerrank.com/contests/${encodeURIComponent(row.contest)}/challenges/${encodeURIComponent(row.slug)}`,
    solvedAt: row.solvedAt.toISOString(),
    firstObservedAt: row.firstObservedAt.toISOString(),
    baseline: row.baseline,
  }));
}

export async function claimHackerRankSync(accountId: string, token: string, now: Date) {
  const rows = await db()
    .insert(hackerRankSync)
    .values({ accountId, leaseToken: token, leaseUntil: new Date(now.getTime() + 60_000) })
    .onConflictDoUpdate({
      target: hackerRankSync.accountId,
      set: { leaseToken: token, leaseUntil: new Date(now.getTime() + 60_000) },
      setWhere: and(
        or(
          sql`${hackerRankSync.refreshedAt} IS NULL`,
          lte(hackerRankSync.refreshedAt, new Date(now.getTime() - HACKERRANK_REFRESH_MS)),
        ),
        or(sql`${hackerRankSync.leaseUntil} IS NULL`, lte(hackerRankSync.leaseUntil, now)),
      ),
    })
    .returning({ id: hackerRankSync.accountId });
  return rows.length > 0;
}

export async function saveHackerRankSync(
  accountId: string,
  token: string,
  profile: HackerRankProfile,
) {
  await db().transaction(async (transaction) => {
    await writeHackerRankProfile(transaction, accountId, profile);
    const updated = await transaction
      .update(hackerRankSync)
      .set({
        profile: hackerRankSummary(profile),
        refreshedAt: new Date(profile.checkedAt),
        leaseToken: null,
        leaseUntil: null,
        lastError: null,
      })
      .where(
        and(
          eq(hackerRankSync.accountId, accountId),
          eq(hackerRankSync.leaseToken, token),
          or(
            sql`${hackerRankSync.refreshedAt} IS NULL`,
            lte(hackerRankSync.refreshedAt, new Date(profile.checkedAt)),
          ),
        ),
      )
      .returning({ id: hackerRankSync.accountId });
    if (!updated.length) throw new Error("HackerRank refresh lease expired.");
  });
}

export async function failHackerRankSync(
  accountId: string,
  token: string,
  status: number,
  now: Date,
) {
  await db()
    .update(hackerRankSync)
    .set({
      leaseToken: null,
      leaseUntil: new Date(now.getTime() + HACKERRANK_REFRESH_MS),
      lastError: status,
    })
    .where(and(eq(hackerRankSync.accountId, accountId), eq(hackerRankSync.leaseToken, token)));
}

export async function readHackerRankSnapshots(accountId: string) {
  return db()
    .select({ date: hackerRankSnapshots.date })
    .from(hackerRankSnapshots)
    .where(eq(hackerRankSnapshots.accountId, accountId))
    .orderBy(hackerRankSnapshots.date);
}

export function hackerRankSummary(profile: HackerRankProfile): HackerRankSummary {
  return {
    platform: profile.platform,
    username: profile.username,
    historyComplete: profile.historyComplete,
    checkedAt: profile.checkedAt,
  };
}

export async function cacheHackerRankProfile(
  writer: Pick<ReturnType<typeof db>, "insert">,
  accountId: string,
  profile: HackerRankProfile,
) {
  await writer
    .insert(hackerRankSync)
    .values({
      accountId,
      profile: hackerRankSummary(profile),
      refreshedAt: new Date(profile.checkedAt),
    })
    .onConflictDoUpdate({
      target: hackerRankSync.accountId,
      set: {
        profile: hackerRankSummary(profile),
        refreshedAt: new Date(profile.checkedAt),
        lastError: null,
      },
      setWhere: or(
        sql`${hackerRankSync.refreshedAt} IS NULL`,
        lte(hackerRankSync.refreshedAt, new Date(profile.checkedAt)),
      ),
    });
}
