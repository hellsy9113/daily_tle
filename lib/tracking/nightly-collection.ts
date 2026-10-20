import "server-only";
import { isNotNull, or } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { accounts } from "@/lib/db/schema";
import { getAccountActivity } from "@/lib/activity/service";
import { getGfgProgress } from "@/lib/gfg/service";
import { getHackerRankProgress } from "@/lib/hackerrank/service";
import { getCodeforcesProgress } from "@/lib/codeforces/service";
import { errorResponse } from "@/lib/http/api-error";
import { requireCron } from "./security";

/** Reuse dashboard sync leases and generation fencing without preparing or sending recaps. */
export async function collectNightlyActivity({ budgetMs = 260_000 } = {}) {
  const deadline = performance.now() + budgetMs;
  const registered = await db()
    .select()
    .from(accounts)
    .where(
      or(
        isNotNull(accounts.leetcodeUsername),
        isNotNull(accounts.gfgUsername),
        isNotNull(accounts.hackerRankUsername),
        isNotNull(accounts.codeforcesUsername),
      ),
    );
  const jobs = registered.flatMap((account) => [
    ...(account.leetcodeUsername ? [() => getAccountActivity(account)] : []),
    ...(account.gfgUsername ? [() => getGfgProgress(account)] : []),
    ...(account.hackerRankUsername ? [() => getHackerRankProgress(account)] : []),
  ]);
  // Keep the strict Codeforces API queue short while other platforms sync in parallel.
  const codeforcesJobs = registered
    .filter((account) => account.codeforcesUsername)
    .map((account) => () => getCodeforcesProgress(account));
  let next = 0;
  let nextCodeforces = 0;
  const stats = { checked: 0, failed: 0, deferred: 0 };
  const check = async (job: () => Promise<{ refreshFailed: boolean; refreshing: boolean }>) => {
    try {
      const result = await job();
      if (result.refreshFailed) stats.failed++;
      else if (result.refreshing) stats.deferred++;
      else stats.checked++;
    } catch {
      // Other registrations must still be checked after a lookup failure or revocation.
      stats.failed++;
    }
  };
  await Promise.all([
    ...Array.from({ length: 10 }, async () => {
      while (next < jobs.length && performance.now() + 30_000 < deadline) {
        await check(jobs[next++]);
      }
    }),
    (async () => {
      while (nextCodeforces < codeforcesJobs.length && performance.now() + 32_000 < deadline) {
        await check(codeforcesJobs[nextCodeforces++]);
      }
    })(),
  ]);
  stats.deferred += jobs.length - next + codeforcesJobs.length - nextCodeforces;
  console.info("tracking_nightly_collection_complete", stats);
  return stats;
}

export async function handleNightlyCollection(request: Request) {
  try {
    requireCron(request);
    return Response.json(await collectNightlyActivity(), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
