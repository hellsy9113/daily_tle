import "server-only";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { activityGoals, type Account } from "@/lib/db/schema";
import { requireActivityPlatform } from "./details";
import type { ActivityPlatform, WeeklyGoal } from "./types";

export async function getWeeklyGoal(
  account: Account,
  platform: ActivityPlatform,
): Promise<WeeklyGoal> {
  requireActivityPlatform(account, platform);
  const [goal] = await db()
    .select({ weeklyTarget: activityGoals.weeklyTarget })
    .from(activityGoals)
    .where(and(eq(activityGoals.accountId, account.id), eq(activityGoals.platform, platform)));
  return { weeklyTarget: goal?.weeklyTarget ?? null };
}

export async function saveWeeklyGoal(
  account: Account,
  platform: ActivityPlatform,
  weeklyTarget: number | null,
): Promise<WeeklyGoal> {
  requireActivityPlatform(account, platform);
  if (weeklyTarget === null) {
    await db()
      .delete(activityGoals)
      .where(and(eq(activityGoals.accountId, account.id), eq(activityGoals.platform, platform)));
  } else {
    await db()
      .insert(activityGoals)
      .values({ accountId: account.id, platform, weeklyTarget })
      .onConflictDoUpdate({
        target: [activityGoals.accountId, activityGoals.platform],
        set: { weeklyTarget },
      });
  }
  return { weeklyTarget };
}
