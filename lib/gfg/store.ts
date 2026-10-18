import "server-only";
import { lockRegistration } from "@/lib/tracking/services";
import { and, eq, lte, or, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { gfgProblems, gfgSnapshots, gfgSync } from "@/lib/db/schema";
import { activityDate } from "@/lib/activity/calendar";
import type { GfgProfile, GfgProfileSummary, StoredGfgProblem } from "./types";

export const GFG_REFRESH_MS = 5 * 60_000;
type GfgWriter = Pick<ReturnType<typeof db>, "insert" | "select">;

export async function writeGfgProfile(writer: GfgWriter, accountId: string, profile: GfgProfile) {
  const [state] = await writer
    .select()
    .from(gfgSync)
    .where(eq(gfgSync.accountId, accountId))
    .limit(1)
    .for("update");
  const baseline = !state?.refreshedAt;
  for (let index = 0; index < profile.problems.length; index += 500) {
    await writer
      .insert(gfgProblems)
      .values(
        profile.problems.slice(index, index + 500).map((problem) => ({
          accountId,
          id: problem.id,
          title: problem.title,
          difficulty: problem.difficulty,
          acceptedAt: problem.acceptedAt ? new Date(problem.acceptedAt) : null,
          reportedSubmissionTime: problem.reportedSubmissionTime,
          firstObservedAt: new Date(profile.checkedAt),
          baseline,
        })),
      )
      .onConflictDoUpdate({
        target: [gfgProblems.accountId, gfgProblems.id],
        set: {
          title: sql`excluded.title`,
          difficulty: sql`excluded.difficulty`,
          acceptedAt: sql`least(${gfgProblems.acceptedAt}, excluded.accepted_at)`,
          firstObservedAt: sql`least(${gfgProblems.firstObservedAt}, excluded.first_observed_at)`,
          reportedSubmissionTime: sql`excluded.reported_submission_time`,
        },
      });
  }
  await writer
    .insert(gfgSnapshots)
    .values({
      accountId,
      date: activityDate(new Date(profile.checkedAt)),
      totalSolved: profile.totalSolved,
      difficultyBreakdown: profile.difficultyBreakdown,
      checkedAt: new Date(profile.checkedAt),
    })
    .onConflictDoUpdate({
      target: [gfgSnapshots.accountId, gfgSnapshots.date],
      set: {
        totalSolved: profile.totalSolved,
        difficultyBreakdown: profile.difficultyBreakdown,
        checkedAt: new Date(profile.checkedAt),
      },
      setWhere: lte(gfgSnapshots.checkedAt, new Date(profile.checkedAt)),
    });
}

export async function gfgState(accountId: string) {
  const [state] = await db()
    .select()
    .from(gfgSync)
    .where(eq(gfgSync.accountId, accountId))
    .limit(1);
  return state;
}

export async function readGfgProblems(accountId: string): Promise<StoredGfgProblem[]> {
  const rows = await db().select().from(gfgProblems).where(eq(gfgProblems.accountId, accountId));
  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    difficulty: row.difficulty,
    status: "Accepted",
    url: `https://www.geeksforgeeks.org/problems/${encodeURIComponent(row.id)}/1`,
    acceptedAt: row.acceptedAt?.toISOString() ?? null,
    reportedSubmissionTime: row.reportedSubmissionTime,
    firstObservedAt: row.firstObservedAt.toISOString(),
    baseline: row.baseline,
  }));
}

export async function claimGfgSync(
  accountId: string,
  token: string,
  now: Date,
  registrationId?: string,
) {
  return db().transaction(async (transaction) => {
    await lockRegistration(transaction, accountId, "gfg", registrationId);
    const rows = await transaction
      .insert(gfgSync)
      .values({ accountId, leaseToken: token, leaseUntil: new Date(now.getTime() + 60_000) })
      .onConflictDoUpdate({
        target: gfgSync.accountId,
        set: { leaseToken: token, leaseUntil: new Date(now.getTime() + 60_000) },
        setWhere: and(
          or(
            sql`${gfgSync.refreshedAt} IS NULL`,
            lte(gfgSync.refreshedAt, new Date(now.getTime() - GFG_REFRESH_MS)),
          ),
          or(sql`${gfgSync.leaseUntil} IS NULL`, lte(gfgSync.leaseUntil, now)),
        ),
      })
      .returning({ id: gfgSync.accountId });
    return rows.length > 0;
  });
}

export async function saveGfgSync(accountId: string, token: string, profile: GfgProfile) {
  await db().transaction(async (transaction) => {
    await lockRegistration(transaction, accountId, "gfg");
    const [lease] = await transaction
      .select()
      .from(gfgSync)
      .where(and(eq(gfgSync.accountId, accountId), eq(gfgSync.leaseToken, token)))
      .for("update");
    if (!lease) throw new Error("Refresh lease expired or service was revoked.");
    await writeGfgProfile(transaction, accountId, profile);
    const updated = await transaction
      .update(gfgSync)
      .set({
        profile: gfgSummary(profile),
        refreshedAt: new Date(profile.checkedAt),
        leaseToken: null,
        leaseUntil: null,
        lastError: null,
      })
      .where(
        and(
          eq(gfgSync.accountId, accountId),
          eq(gfgSync.leaseToken, token),
          or(
            sql`${gfgSync.refreshedAt} IS NULL`,
            lte(gfgSync.refreshedAt, new Date(profile.checkedAt)),
          ),
        ),
      )
      .returning({ id: gfgSync.accountId });
    if (!updated.length) throw new Error("GFG refresh lease expired.");
  });
}

export async function failGfgSync(accountId: string, token: string, status: number, now: Date) {
  await db()
    .update(gfgSync)
    .set({
      leaseToken: null,
      leaseUntil: new Date(now.getTime() + GFG_REFRESH_MS),
      lastError: status,
    })
    .where(and(eq(gfgSync.accountId, accountId), eq(gfgSync.leaseToken, token)));
}

export async function readGfgSnapshots(accountId: string) {
  return db()
    .select({ date: gfgSnapshots.date, totalSolved: gfgSnapshots.totalSolved })
    .from(gfgSnapshots)
    .where(eq(gfgSnapshots.accountId, accountId))
    .orderBy(gfgSnapshots.date);
}

export function gfgSummary(profile: GfgProfile): GfgProfileSummary {
  return {
    platform: profile.platform,
    username: profile.username,
    totalSolved: profile.totalSolved,
    difficultyBreakdown: profile.difficultyBreakdown,
    historyComplete: profile.historyComplete,
    checkedAt: profile.checkedAt,
  };
}
