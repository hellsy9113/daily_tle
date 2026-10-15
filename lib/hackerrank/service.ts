import "server-only";
import { and, eq, isNull } from "drizzle-orm";
import { accounts, hackerRankSync, type Account } from "@/lib/db/schema";
import { db } from "@/lib/db/client";
import { ApiError } from "@/lib/http/api-error";
import { trackingStatus } from "@/lib/tracking/registration";
import { requireRegistrationAvailable } from "@/lib/tracking/config";
import { randomToken } from "@/lib/tracking/security";
import { getHackerRankProfile } from "./client";
import { buildHackerRankProgress } from "./progress";
import {
  claimHackerRankSync,
  failHackerRankSync,
  hackerRankState,
  hackerRankSummary,
  readHackerRankProblems,
  readHackerRankSnapshots,
  saveHackerRankSync,
  writeHackerRankProfile,
} from "./store";

export async function registerHackerRank(account: Account, value: unknown) {
  requireRegistrationAvailable();
  if (account.hackerRankUsername)
    throw new ApiError(
      409,
      "Your HackerRank username is already registered and cannot be changed.",
    );
  const profile = await getHackerRankProfile(value);
  try {
    const registered = await db().transaction(async (transaction) => {
      const [updated] = await transaction
        .update(accounts)
        .set({ hackerRankUsername: profile.username, hackerRankRegisteredAt: new Date() })
        .where(and(eq(accounts.id, account.id), isNull(accounts.hackerRankUsername)))
        .returning();
      if (!updated)
        throw new ApiError(
          409,
          "Your HackerRank username is already registered and cannot be changed.",
        );
      await writeHackerRankProfile(transaction, account.id, profile);
      await transaction
        .insert(hackerRankSync)
        .values({
          accountId: account.id,
          profile: hackerRankSummary(profile),
          refreshedAt: new Date(profile.checkedAt),
        })
        .onConflictDoUpdate({
          target: hackerRankSync.accountId,
          set: {
            profile: hackerRankSummary(profile),
            refreshedAt: new Date(profile.checkedAt),
            lastError: null,
          },
        });
      return updated;
    });
    return trackingStatus(registered, "hackerrank");
  } catch (error) {
    let cause: unknown = error;
    for (let depth = 0; depth < 4 && cause && typeof cause === "object"; depth++) {
      if ("code" in cause && cause.code === "23505")
        throw new ApiError(409, "This HackerRank username is already registered.");
      cause = "cause" in cause ? cause.cause : null;
    }
    throw error;
  }
}

export async function getHackerRankProgress(account: Account, now = new Date()) {
  if (!account.hackerRankUsername)
    throw new ApiError(409, "Enable HackerRank tracking on the Feature page first.");
  const token = randomToken();
  if (await claimHackerRankSync(account.id, token, now)) {
    try {
      await saveHackerRankSync(
        account.id,
        token,
        await getHackerRankProfile(account.hackerRankUsername, now),
      );
    } catch (error) {
      await failHackerRankSync(
        account.id,
        token,
        error instanceof ApiError ? error.status : 503,
        now,
      );
      if (!(await hackerRankState(account.id))?.profile) throw error;
    }
  }
  const [state, problems, snapshots] = await Promise.all([
    hackerRankState(account.id),
    readHackerRankProblems(account.id),
    readHackerRankSnapshots(account.id),
  ]);
  if (!state?.profile) throw new ApiError(503, "HackerRank is synchronizing. Try again shortly.");
  return {
    ...buildHackerRankProgress(state.profile, problems, snapshots, now),
    refreshing: Boolean(state.leaseToken && state.leaseUntil && state.leaseUntil > now),
    refreshFailed: Boolean(state.lastError),
  };
}
