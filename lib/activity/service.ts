import "server-only";
import { ApiError } from "@/lib/http/api-error";
import type { Account } from "@/lib/db/schema";
import { getAcceptedHistory } from "@/lib/leetcode/accepted-history";
import { randomToken } from "@/lib/tracking/security";
import { observeAcceptedHistory } from "./observations";
import {
  activityState,
  claimActivitySync,
  failActivitySync,
  readActivity,
  saveActivitySync,
} from "./store";

export async function getAccountActivity(account: Account, now = new Date()) {
  if (!account.leetcodeUsername)
    throw new ApiError(409, "Enable LeetCode tracking on the Feature page first.");
  const token = randomToken();
  if (await claimActivitySync(account.id, token, now)) {
    try {
      const history = await getAcceptedHistory(account.leetcodeUsername);
      await saveActivitySync(account.id, token, observeAcceptedHistory(history.submissions, now));
    } catch (error) {
      await failActivitySync(
        account.id,
        token,
        error instanceof ApiError ? error.status : 503,
        now,
      );
      const stored = await readActivity(account, now);
      if (stored.lastSyncedAt) return stored;
      throw error;
    }
  }
  const result = await readActivity(account, now);
  if (!result.lastSyncedAt && !result.refreshing && result.refreshFailed) {
    const state = await activityState(account.id);
    throw new ApiError(
      state?.lastError ?? 503,
      "Accepted activity is temporarily unavailable. Try again shortly.",
    );
  }
  return result;
}
