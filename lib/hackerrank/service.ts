import "server-only";
import { currentRegistration } from "@/lib/tracking/services";
import { hackerRankSync, type Account } from "@/lib/db/schema";
import { ApiError } from "@/lib/http/api-error";
import { registerFeature } from "@/lib/features/registration";
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

export function registerHackerRank(account: Account, value: unknown) {
  return registerFeature(
    account,
    "hackerrank",
    () => getHackerRankProfile(value),
    (profile) => profile.username,
    async (tx, accountId, profile) => {
      await writeHackerRankProfile(tx, accountId, profile);
      await tx
        .insert(hackerRankSync)
        .values({
          accountId,
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
    },
  );
}

export async function getHackerRankProgress(account: Account, now = new Date()) {
  if (!account.hackerRankUsername)
    throw new ApiError(409, "Enable HackerRank tracking on the Feature page first.");
  const registration = await currentRegistration(account.id, "hackerrank");
  const token = randomToken();
  if (await claimHackerRankSync(account.id, token, now, registration.service.registrationId)) {
    try {
      await saveHackerRankSync(
        account.id,
        token,
        await getHackerRankProfile(registration.username, now),
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
    ...buildHackerRankProgress(state.profile, problems, snapshots, now, account.timezone),
    refreshing: Boolean(state.leaseToken && state.leaseUntil && state.leaseUntil > now),
    refreshFailed: Boolean(state.lastError),
  };
}
