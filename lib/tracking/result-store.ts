import "server-only";
import { lte, or, sql } from "drizzle-orm";
import { gfgSync } from "@/lib/db/schema";
import { writeActivityObservation } from "@/lib/activity/store";
import { observeSolvedPeriod } from "@/lib/activity/observations";
import { gfgSummary, writeGfgProfile } from "@/lib/gfg/store";
import { cacheHackerRankProfile, writeHackerRankProfile } from "@/lib/hackerrank/store";
import type { SolvedQuestionsResult } from "@/lib/leetcode/types";
import type { GfgProfile } from "@/lib/gfg/types";
import type { HackerRankProfile } from "@/lib/hackerrank/types";
import type { Transaction } from "./services";
export type CollectedResult = SolvedQuestionsResult | GfgProfile | HackerRankProfile;
export async function writeCollectedResult(
  transaction: Transaction,
  accountId: string,
  result: CollectedResult,
) {
  if ("platform" in result && result.platform === "hackerrank") {
    await writeHackerRankProfile(transaction, accountId, result);
    await cacheHackerRankProfile(transaction, accountId, result);
  } else if ("platform" in result) {
    await writeGfgProfile(transaction, accountId, result);
    await transaction
      .insert(gfgSync)
      .values({
        accountId: accountId,
        profile: gfgSummary(result),
        refreshedAt: new Date(result.checkedAt),
      })
      .onConflictDoUpdate({
        target: gfgSync.accountId,
        set: {
          profile: gfgSummary(result),
          refreshedAt: new Date(result.checkedAt),
          lastError: null,
        },
        setWhere: or(
          sql`${gfgSync.refreshedAt} IS NULL`,
          lte(gfgSync.refreshedAt, new Date(result.checkedAt)),
        ),
      });
  } else {
    await writeActivityObservation(transaction, accountId, observeSolvedPeriod(result, new Date()));
  }
}
