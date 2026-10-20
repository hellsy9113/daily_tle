import "server-only";
import { and, eq, isNotNull, or } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { accounts } from "@/lib/db/schema";
import { getAccountActivity } from "@/lib/activity/service";
import { getGfgProgress } from "@/lib/gfg/service";
import { getHackerRankProgress } from "@/lib/hackerrank/service";
import { errorResponse } from "@/lib/http/api-error";
import { requireCron } from "./security";

/** Reuse dashboard sync leases and generation fencing without preparing or sending recaps. */
export async function collectNightlyActivity({
  budgetMs = 260_000,
  timezone,
}: { budgetMs?: number; timezone?: string } = {}) {
  const deadline = performance.now() + budgetMs;
  const registered = await db()
    .select()
    .from(accounts)
    .where(
      and(
        timezone ? eq(accounts.timezone, timezone) : undefined,
        or(
          isNotNull(accounts.leetcodeUsername),
          isNotNull(accounts.gfgUsername),
          isNotNull(accounts.hackerRankUsername),
        ),
      ),
    );
  const jobs = registered.flatMap((account) => [
    ...(account.leetcodeUsername ? [() => getAccountActivity(account)] : []),
    ...(account.gfgUsername ? [() => getGfgProgress(account)] : []),
    ...(account.hackerRankUsername ? [() => getHackerRankProgress(account)] : []),
  ]);
  let next = 0;
  const stats = { checked: 0, failed: 0, deferred: 0 };
  await Promise.all(
    Array.from({ length: 10 }, async () => {
      while (next < jobs.length && performance.now() + 30_000 < deadline) {
        const job = jobs[next++];
        try {
          const result = await job();
          if (result.refreshFailed) stats.failed++;
          else if (result.refreshing) stats.deferred++;
          else stats.checked++;
        } catch {
          // Other registrations must still be checked after a lookup failure or revocation.
          stats.failed++;
        }
      }
    }),
  );
  stats.deferred += jobs.length - next;
  console.info("tracking_nightly_collection_complete", stats);
  return stats;
}

export async function handleNightlyCollection(request: Request) {
  try {
    requireCron(request);
    const { runScheduledTracking } = await import("./scheduler");
    return Response.json(await runScheduledTracking(new Date(), 260_000, "collect"), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
