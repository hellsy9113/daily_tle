import "server-only";
import { currentRegistration } from "@/lib/tracking/services";
import { gfgSync, type Account } from "@/lib/db/schema";
import { ApiError } from "@/lib/http/api-error";
import { registerFeature } from "@/lib/features/registration";
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

export function registerGfg(account: Account, value: unknown) {
  return registerFeature(
    account,
    "gfg",
    () => getGfgProfile(value),
    (profile) => profile.username,
    async (tx, accountId, profile) => {
      await writeGfgProfile(tx, accountId, profile);
      await tx
        .insert(gfgSync)
        .values({
          accountId,
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
    },
  );
}

export async function getGfgProgress(account: Account, query?: GfgQuery, now = new Date()) {
  if (!account.gfgUsername)
    throw new ApiError(409, "Enable GFG tracking on the Feature page first.");
  const registration = await currentRegistration(account.id, "gfg");
  const token = randomToken();
  if (await claimGfgSync(account.id, token, now, registration.service.registrationId)) {
    try {
      await saveGfgSync(account.id, token, await getGfgProfile(registration.username, now));
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
    ...buildGfgProgress(state.profile, problems, snapshots, now, query, account.timezone),
    refreshing: Boolean(state.leaseToken && state.leaseUntil && state.leaseUntil > now),
    refreshFailed: Boolean(state.lastError),
  };
}
