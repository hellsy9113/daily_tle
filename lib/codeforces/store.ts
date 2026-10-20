import "server-only";
import { lockRegistration } from "@/lib/tracking/services";
import { and, eq, inArray, lte, or, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { codeforcesProblems, codeforcesSnapshots, codeforcesSync } from "@/lib/db/schema";
import { activityDate } from "@/lib/activity/calendar";
import { codeforcesProblemUrl } from "./urls";
import type {
  CodeforcesProfile,
  CodeforcesSnapshot,
  CodeforcesSummary,
  StoredCodeforcesProblem,
} from "./types";

export const CODEFORCES_REFRESH_MS = 5 * 60_000;
type CodeforcesWriter = Pick<ReturnType<typeof db>, "insert" | "select" | "delete">;

export async function writeCodeforcesProfile(
  writer: CodeforcesWriter,
  accountId: string,
  profile: CodeforcesProfile,
) {
  const [state] = await writer
    .select()
    .from(codeforcesSync)
    .where(eq(codeforcesSync.accountId, accountId))
    .limit(1)
    .for("update");
  // Out-of-order collection completion must not overwrite a newer upstream observation.
  if (state?.refreshedAt && state.refreshedAt > new Date(profile.checkedAt)) return;
  const baseline = !state?.refreshedAt;
  const accepted = new Set(profile.problems.map((problem) => problem.submissionId));
  const rejudged = (profile.checkedSubmissionIds ?? []).filter((id) => !accepted.has(id));
  for (let index = 0; index < rejudged.length; index += 500)
    await writer
      .delete(codeforcesProblems)
      .where(
        and(
          eq(codeforcesProblems.accountId, accountId),
          inArray(codeforcesProblems.submissionId, rejudged.slice(index, index + 500)),
        ),
      );
  for (let index = 0; index < profile.problems.length; index += 500) {
    await writer
      .insert(codeforcesProblems)
      .values(
        profile.problems.slice(index, index + 500).map((problem) => ({
          accountId,
          submissionId: problem.submissionId,
          id: problem.id,
          contestId: problem.contestId,
          index: problem.index,
          title: problem.title,
          solvedAt: new Date(problem.solvedAt),
          firstObservedAt: new Date(profile.checkedAt),
          baseline,
          rating: problem.rating,
          tags: problem.tags,
        })),
      )
      .onConflictDoUpdate({
        target: [codeforcesProblems.accountId, codeforcesProblems.submissionId],
        set: {
          title: sql`excluded.title`,
          rating: sql`excluded.rating`,
          tags: sql`excluded.tags`,
          solvedAt: sql`excluded.solved_at`,
          firstObservedAt: sql`least(${codeforcesProblems.firstObservedAt}, excluded.first_observed_at)`,
        },
      });
  }
  const values = {
    accountId,
    date: activityDate(new Date(profile.checkedAt)),
    availableSolved: new Set(profile.problems.map((problem) => problem.id)).size,
    historyComplete: profile.historyComplete,
    historyStart: profile.historyStart ? new Date(profile.historyStart) : null,
    checkedAt: new Date(profile.checkedAt),
  };
  await writer
    .insert(codeforcesSnapshots)
    .values(values)
    .onConflictDoUpdate({
      target: [codeforcesSnapshots.accountId, codeforcesSnapshots.date],
      set: {
        availableSolved: values.availableSolved,
        historyComplete: values.historyComplete,
        historyStart: values.historyStart,
        checkedAt: values.checkedAt,
      },
      setWhere: lte(codeforcesSnapshots.checkedAt, values.checkedAt),
    });
}

export async function codeforcesState(accountId: string) {
  const [state] = await db()
    .select()
    .from(codeforcesSync)
    .where(eq(codeforcesSync.accountId, accountId))
    .limit(1);
  return state;
}

export async function readCodeforcesProblems(
  accountId: string,
): Promise<StoredCodeforcesProblem[]> {
  const rows = await db()
    .select()
    .from(codeforcesProblems)
    .where(eq(codeforcesProblems.accountId, accountId));
  return rows.map((row) => ({
    submissionId: row.submissionId,
    id: row.id,
    contestId: row.contestId,
    index: row.index,
    title: row.title,
    url: codeforcesProblemUrl(row.contestId, row.index),
    solvedAt: row.solvedAt.toISOString(),
    firstObservedAt: row.firstObservedAt.toISOString(),
    baseline: row.baseline,
    rating: row.rating,
    tags: row.tags,
  }));
}

export async function claimCodeforcesSync(
  accountId: string,
  token: string,
  now: Date,
  registrationId?: string,
) {
  return db().transaction(async (tx) => {
    await lockRegistration(tx, accountId, "codeforces", registrationId);
    const rows = await tx
      .insert(codeforcesSync)
      .values({ accountId, leaseToken: token, leaseUntil: new Date(now.getTime() + 60_000) })
      .onConflictDoUpdate({
        target: codeforcesSync.accountId,
        set: { leaseToken: token, leaseUntil: new Date(now.getTime() + 60_000) },
        setWhere: and(
          or(
            sql`${codeforcesSync.refreshedAt} IS NULL`,
            lte(codeforcesSync.refreshedAt, new Date(now.getTime() - CODEFORCES_REFRESH_MS)),
          ),
          or(sql`${codeforcesSync.leaseUntil} IS NULL`, lte(codeforcesSync.leaseUntil, now)),
        ),
      })
      .returning({ id: codeforcesSync.accountId });
    return rows.length > 0;
  });
}

export async function saveCodeforcesSync(
  accountId: string,
  token: string,
  profile: CodeforcesProfile,
) {
  await db().transaction(async (tx) => {
    await lockRegistration(tx, accountId, "codeforces");
    const [lease] = await tx
      .select()
      .from(codeforcesSync)
      .where(and(eq(codeforcesSync.accountId, accountId), eq(codeforcesSync.leaseToken, token)))
      .for("update");
    if (!lease) throw new Error("Refresh lease expired or service was revoked.");
    await writeCodeforcesProfile(tx, accountId, profile);
    const updated = await tx
      .update(codeforcesSync)
      .set({
        profile: codeforcesSummary(profile),
        refreshedAt: new Date(profile.checkedAt),
        leaseToken: null,
        leaseUntil: null,
        lastError: null,
      })
      .where(
        and(
          eq(codeforcesSync.accountId, accountId),
          eq(codeforcesSync.leaseToken, token),
          or(
            sql`${codeforcesSync.refreshedAt} IS NULL`,
            lte(codeforcesSync.refreshedAt, new Date(profile.checkedAt)),
          ),
        ),
      )
      .returning({ id: codeforcesSync.accountId });
    if (!updated.length) throw new Error("Codeforces refresh lease expired.");
  });
}

export async function failCodeforcesSync(
  accountId: string,
  token: string,
  status: number,
  now: Date,
) {
  await db()
    .update(codeforcesSync)
    .set({
      leaseToken: null,
      leaseUntil: new Date(now.getTime() + CODEFORCES_REFRESH_MS),
      lastError: status,
    })
    .where(and(eq(codeforcesSync.accountId, accountId), eq(codeforcesSync.leaseToken, token)));
}

export async function readCodeforcesSnapshots(accountId: string): Promise<CodeforcesSnapshot[]> {
  return db()
    .select({
      date: codeforcesSnapshots.date,
      historyStart: codeforcesSnapshots.historyStart,
      checkedAt: codeforcesSnapshots.checkedAt,
      historyComplete: codeforcesSnapshots.historyComplete,
    })
    .from(codeforcesSnapshots)
    .where(eq(codeforcesSnapshots.accountId, accountId))
    .orderBy(codeforcesSnapshots.date);
}

export function codeforcesSummary(profile: CodeforcesProfile): CodeforcesSummary {
  return {
    platform: profile.platform,
    username: profile.username,
    rating: profile.rating,
    maxRating: profile.maxRating,
    rank: profile.rank,
    historyComplete: profile.historyComplete,
    historyStart: profile.historyStart,
    checkedAt: profile.checkedAt,
  };
}

export async function cacheCodeforcesProfile(
  writer: Pick<ReturnType<typeof db>, "insert">,
  accountId: string,
  profile: CodeforcesProfile,
) {
  await writer
    .insert(codeforcesSync)
    .values({
      accountId,
      profile: codeforcesSummary(profile),
      refreshedAt: new Date(profile.checkedAt),
    })
    .onConflictDoUpdate({
      target: codeforcesSync.accountId,
      set: {
        profile: codeforcesSummary(profile),
        refreshedAt: new Date(profile.checkedAt),
        lastError: null,
      },
      setWhere: or(
        sql`${codeforcesSync.refreshedAt} IS NULL`,
        lte(codeforcesSync.refreshedAt, new Date(profile.checkedAt)),
      ),
    });
}
