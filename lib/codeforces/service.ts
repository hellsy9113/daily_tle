import "server-only";
import { currentRegistration } from "@/lib/tracking/services";
import { codeforcesSync, type Account } from "@/lib/db/schema";
import { ApiError } from "@/lib/http/api-error";
import { registerFeature } from "@/lib/features/registration";
import { randomToken } from "@/lib/tracking/security";
import { getCodeforcesProfile } from "./client";
import { buildCodeforcesProgress } from "./progress";
import {
  claimCodeforcesSync,
  failCodeforcesSync,
  codeforcesState,
  codeforcesSummary,
  readCodeforcesProblems,
  readCodeforcesSnapshots,
  saveCodeforcesSync,
  writeCodeforcesProfile,
} from "./store";

export function registerCodeforces(account: Account, value: unknown) {
  return registerFeature(
    account,
    "codeforces",
    () => getCodeforcesProfile(value),
    (profile) => profile.username,
    async (tx, accountId, profile) => {
      await writeCodeforcesProfile(tx, accountId, profile);
      await tx
        .insert(codeforcesSync)
        .values({
          accountId,
          profile: codeforcesSummary(profile),
          refreshedAt: new Date(profile.checkedAt),
        })
        .onConflictDoUpdate({
          target: codeforcesSync.accountId,
          set: {
            profile: codeforcesSummary(profile),
            refreshedAt: new Date(profile.checkedAt),
            lastError: null,
          },
        });
    },
  );
}

export async function getCodeforcesProgress(account: Account, now = new Date()) {
  if (!account.codeforcesUsername)
    throw new ApiError(409, "Enable Codeforces tracking on the Feature page first.");
  const registration = await currentRegistration(account.id, "codeforces");
  const token = randomToken();
  if (await claimCodeforcesSync(account.id, token, now, registration.service.registrationId)) {
    try {
      await saveCodeforcesSync(
        account.id,
        token,
        await getCodeforcesProfile(registration.username, now),
      );
    } catch (error) {
      await failCodeforcesSync(
        account.id,
        token,
        error instanceof ApiError ? error.status : 503,
        now,
      );
      if (!(await codeforcesState(account.id))?.profile) throw error;
    }
  }
  const [state, problems, snapshots] = await Promise.all([
    codeforcesState(account.id),
    readCodeforcesProblems(account.id),
    readCodeforcesSnapshots(account.id),
  ]);
  if (!state?.profile) throw new ApiError(503, "Codeforces is synchronizing. Try again shortly.");
  return {
    ...buildCodeforcesProgress(state.profile, problems, snapshots, now),
    refreshing: Boolean(state.leaseToken && state.leaseUntil && state.leaseUntil > now),
    refreshFailed: Boolean(state.lastError),
  };
}
