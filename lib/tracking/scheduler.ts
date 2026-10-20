import "server-only";
import { db } from "@/lib/db/client";
import { accounts } from "@/lib/db/schema";
import { localClock } from "@/lib/timezone";
import { errorResponse } from "@/lib/http/api-error";
import { dispatchTracking } from "./dispatch";
import { collectNightlyActivity } from "./nightly-collection";
import { requireCron } from "./security";

export function scheduledWork(now: Date, timezone: string) {
  const clock = localClock(now, timezone);
  const sunday = new Date(`${clock.date}T12:00:00Z`).getUTCDay() === 0;
  if (clock.minutes >= 510 && clock.minutes < 630) return "daily";
  if (clock.minutes >= 1365 && clock.minutes < 1380) return "collect";
  if (sunday && clock.minutes >= 1380) return "weekly";
  return null;
}

/** Frequent ticks find local windows; durable delivery keys prevent duplicate reports. */
export async function runScheduledTracking(
  now = new Date(),
  budgetMs = 260_000,
  only?: "daily" | "weekly" | "collect",
) {
  const deadline = performance.now() + budgetMs;
  const zones = await db().selectDistinct({ timezone: accounts.timezone }).from(accounts);
  const results = [];
  for (const { timezone } of zones) {
    const work = scheduledWork(now, timezone);
    if (!work || (only && work !== only) || performance.now() + 30_000 >= deadline) continue;
    const remaining = Math.max(0, deadline - performance.now());
    try {
      results.push({
        timezone,
        work,
        result:
          work === "collect"
            ? await collectNightlyActivity({ budgetMs: remaining, timezone })
            : await dispatchTracking({
                now,
                budgetMs: remaining,
                cadence: work,
                timezone,
                recover: localClock(now, timezone).minutes >= (work === "daily" ? 570 : 1410),
              }),
      });
    } catch {
      // A broken upstream/configuration for one zone must not hide another zone's work.
      results.push({ timezone, work, failed: true });
    }
  }
  return results;
}

export async function handleScheduledTracking(request: Request) {
  try {
    requireCron(request);
    return Response.json(await runScheduledTracking(), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
