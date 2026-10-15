import "server-only";
import { and, asc, eq, gte, isNotNull, lt, lte } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { acceptedActivity, gfgProblems, hackerRankProblems, type Account } from "@/lib/db/schema";
import { platformLabels, platformUsername } from "@/lib/tracking/platforms";
import { ApiError } from "@/lib/http/api-error";
import { ACTIVITY_DAY_MS, activityDayStart } from "./calendar";
import type { ActivityDayDetails, ActivityPlatform } from "./types";

export function requireActivityPlatform(account: Account, platform: ActivityPlatform) {
  if (!platformUsername(account, platform))
    throw new ApiError(409, `Register your ${platformLabels[platform]} username first.`);
}

/** Read saved observations only; selecting a day never makes an upstream request. */
export async function getActivityDay(
  account: Account,
  platform: ActivityPlatform,
  date: string,
  now = new Date(),
): Promise<ActivityDayDetails> {
  requireActivityPlatform(account, platform);
  if (platform === "hackerrank") {
    const start = activityDayStart(date);
    const end = new Date(start.getTime() + ACTIVITY_DAY_MS);
    const rows = await db()
      .select({
        id: hackerRankProblems.id,
        title: hackerRankProblems.title,
        slug: hackerRankProblems.slug,
        contest: hackerRankProblems.contest,
      })
      .from(hackerRankProblems)
      .where(
        and(
          eq(hackerRankProblems.accountId, account.id),
          gte(hackerRankProblems.solvedAt, start),
          lt(hackerRankProblems.solvedAt, end),
          lte(hackerRankProblems.solvedAt, now),
        ),
      )
      .orderBy(asc(hackerRankProblems.title));
    return {
      date,
      basis: "solved",
      problems: rows.map((row) => ({
        id: row.id,
        title: row.title,
        url:
          row.contest === "master"
            ? `https://www.hackerrank.com/challenges/${encodeURIComponent(row.slug)}`
            : `https://www.hackerrank.com/contests/${encodeURIComponent(row.contest)}/challenges/${encodeURIComponent(row.slug)}`,
      })),
    };
  }
  if (platform === "leetcode") {
    const rows = await db()
      .select({ id: acceptedActivity.titleSlug, title: acceptedActivity.title })
      .from(acceptedActivity)
      .where(and(eq(acceptedActivity.accountId, account.id), eq(acceptedActivity.date, date)))
      .orderBy(asc(acceptedActivity.title));
    return {
      date,
      basis: "accepted",
      problems: rows.map((row) => ({
        ...row,
        url: `https://leetcode.com/problems/${encodeURIComponent(row.id)}/`,
      })),
    };
  }
  const [dated] = await db()
    .select({ id: gfgProblems.id })
    .from(gfgProblems)
    .where(
      and(
        eq(gfgProblems.accountId, account.id),
        isNotNull(gfgProblems.acceptedAt),
        lte(gfgProblems.acceptedAt, now),
      ),
    )
    .limit(1);
  const start = activityDayStart(date);
  const end = new Date(start.getTime() + ACTIVITY_DAY_MS);
  const timestamp = dated ? gfgProblems.acceptedAt : gfgProblems.firstObservedAt;
  const rows = await db()
    .select({ id: gfgProblems.id, title: gfgProblems.title, difficulty: gfgProblems.difficulty })
    .from(gfgProblems)
    .where(
      and(
        eq(gfgProblems.accountId, account.id),
        dated ? undefined : eq(gfgProblems.baseline, false),
        gte(timestamp, start),
        lt(timestamp, end),
        lte(timestamp, now),
      ),
    )
    .orderBy(asc(gfgProblems.title));
  return {
    date,
    basis: dated ? "accepted" : "observed",
    problems: rows.map((row) => ({
      ...row,
      url: `https://www.geeksforgeeks.org/problems/${encodeURIComponent(row.id)}/1`,
    })),
  };
}
