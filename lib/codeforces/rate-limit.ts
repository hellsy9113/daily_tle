import "server-only";
import { setTimeout as delay } from "node:timers/promises";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { codeforcesApiRate } from "@/lib/db/schema";
import { ApiError } from "@/lib/http/api-error";

export const CODEFORCES_REQUEST_INTERVAL_MS = 2100;

/** Reserve starts in one shared database row, including across server instances. */
export async function reserveCodeforcesApiSlot(signal: AbortSignal) {
  signal.throwIfAborted();
  const [slot] = await db()
    .insert(codeforcesApiRate)
    .values({ id: 1, nextRequestAt: sql`clock_timestamp() + interval '2100 milliseconds'` })
    .onConflictDoUpdate({
      target: codeforcesApiRate.id,
      set: {
        nextRequestAt: sql`greatest(clock_timestamp(), ${codeforcesApiRate.nextRequestAt}) + interval '2100 milliseconds'`,
      },
      // Bound queueing so an overloaded upstream cannot consume request budgets indefinitely.
      setWhere: sql`${codeforcesApiRate.nextRequestAt} <= clock_timestamp() + interval '15 seconds'`,
    })
    .returning({ nextRequestAt: codeforcesApiRate.nextRequestAt });
  if (!slot) throw new ApiError(429, "Codeforces requests are busy. Try again shortly.");
  const wait = slot.nextRequestAt.getTime() - CODEFORCES_REQUEST_INTERVAL_MS - Date.now();
  if (wait > 0) await delay(wait, undefined, { signal });
  signal.throwIfAborted();
}
