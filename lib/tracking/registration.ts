import "server-only";
import { ApiError } from "@/lib/http/api-error";
import { db } from "@/lib/db/client";
import { connectionTokens, type Account } from "@/lib/db/schema";
import { getLeetCodeIdentity } from "@/lib/leetcode/user-identity";
import { trackingBot } from "./config";
import { hashToken, randomToken } from "./security";
import { registerFeature } from "@/lib/features/registration";
import type { ConnectionLink, TrackingStatus } from "./types";
import { registeredFeatures } from "./platforms";

export { trackingStatus, trackingStatuses } from "@/lib/features/status";

export function registerUsername(account: Account, value: unknown): Promise<TrackingStatus> {
  return registerFeature(
    account,
    "leetcode",
    async () => {
      if (typeof value !== "string" || value.length > 100)
        throw new ApiError(400, "Enter a valid LeetCode username.");
      return getLeetCodeIdentity(value);
    },
    (username) => username,
  );
}

export async function createConnectionLink(account: Account): Promise<ConnectionLink> {
  if (!registeredFeatures(account).length)
    throw new ApiError(409, "Register a LeetCode, GFG, or HackerRank username first.");
  const bot = trackingBot();
  const token = randomToken();
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000);
  await db()
    .insert(connectionTokens)
    .values({ tokenHash: hashToken(token), accountId: account.id, expiresAt })
    .onConflictDoUpdate({
      target: connectionTokens.accountId,
      set: { tokenHash: hashToken(token), expiresAt },
    });
  return { url: `https://t.me/${bot.username}?start=${token}`, expiresAt: expiresAt.toISOString() };
}
