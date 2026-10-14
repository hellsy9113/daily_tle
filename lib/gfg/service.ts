import "server-only";
import { and, eq, isNull } from "drizzle-orm";
import { accounts, gfgSync, type Account } from "@/lib/db/schema";
import { db } from "@/lib/db/client";
import { ApiError } from "@/lib/http/api-error";
import { trackingStatus } from "@/lib/tracking/registration";
import { requireRegistrationAvailable } from "@/lib/tracking/config";
import { randomToken } from "@/lib/tracking/security";
import { getGfgProfile } from "./client";
import { buildGfgProgress } from "./progress";
import {
  claimGfgSync,
  failGfgSync,
  gfgState,
  gfgSummary,
  readGfgProblems,
  readGfgSnapshots,
  saveGfgSync,
  writeGfgProfile,
} from "./store";
import type { GfgQuery } from "./types";

export async function registerGfg(account: Account, value: unknown) {
  requireRegistrationAvailable();
  if (account.gfgUsername)
    throw new ApiError(409, "Your GFG username is already registered and cannot be changed.");
  const profile = await getGfgProfile(value);
  try {
    const registered = await db().transaction(async (transaction) => {
      const [updated] = await transaction
        .update(accounts)
        .set({ gfgUsername: profile.username, gfgRegisteredAt: new Date() })
        .where(and(eq(accounts.id, account.id), isNull(accounts.gfgUsername)))
        .returning();
      if (!updated)
        throw new ApiError(409, "Your GFG username is already registered and cannot be changed.");
      await writeGfgProfile(transaction, account.id, profile);
      await transaction
        .insert(gfgSync)
        .values({
          accountId: account.id,
          profile: gfgSummary(profile),
          refreshedAt: new Date(profile.checkedAt),
        })
        .onConflictDoUpdate({
          target: gfgSync.accountId,
          set: {
            profile: gfgSummary(profile),
            refreshedAt: new Date(profile.checkedAt),
            lastError: null,
          },
        });
      return updated;
    });
    return trackingStatus(registered, "gfg");
  } catch (error) {
    let cause: unknown = error;
    for (let depth = 0; depth < 4 && cause && typeof cause === "object"; depth++) {
      if ("code" in cause && cause.code === "23505")
        throw new ApiError(409, "This GFG username is already registered.");
      cause = "cause" in cause ? cause.cause : null;
    }
    throw error;
  }
}

export async function getGfgProgress(account: Account, query?: GfgQuery, now = new Date()) {
  if (!account.gfgUsername)
    throw new ApiError(409, "Enable GFG tracking on the Feature page first.");
  const token = randomToken();
  if (await claimGfgSync(account.id, token, now)) {
    try {
      await saveGfgSync(account.id, token, await getGfgProfile(account.gfgUsername, now));
    } catch (error) {
      await failGfgSync(account.id, token, error instanceof ApiError ? error.status : 503, now);
      if (!(await gfgState(account.id))?.profile) throw error;
    }
  }
  const [state, problems, snapshots] = await Promise.all([
    gfgState(account.id),
    readGfgProblems(account.id),
    readGfgSnapshots(account.id),
  ]);
  if (!state?.profile) throw new ApiError(503, "GFG is synchronizing. Try again shortly.");
  return {
    ...buildGfgProgress(state.profile, problems, snapshots, now, query),
    refreshing: Boolean(state.leaseToken && state.leaseUntil && state.leaseUntil > now),
    refreshFailed: Boolean(state.lastError),
  };
}
