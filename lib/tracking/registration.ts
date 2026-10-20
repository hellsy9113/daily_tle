import "server-only";
import { ApiError } from "@/lib/http/api-error";
import { db } from "@/lib/db/client";
import { accounts, connectionTokens, type Account } from "@/lib/db/schema";
import { getLeetCodeIdentity } from "@/lib/leetcode/user-identity";
import { trackingBot } from "./config";
import { hashToken, randomToken } from "./security";
import { registerFeature } from "@/lib/features/registration";
import type { ConnectionLink, TrackingStatus } from "./types";
import { eq } from "drizzle-orm";

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

export async function createConnectionLink(
  account: Account,
  registrationId = account.dailyGrindRegistrationId,
): Promise<ConnectionLink> {
  const bot = trackingBot();
  const token = randomToken();
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000);
  await db().transaction(async (tx) => {
    const [current] = await tx
      .select()
      .from(accounts)
      .where(eq(accounts.id, account.id))
      .for("update");
    if (!current?.dailyGrindRegistrationId || current.dailyGrindRegistrationId !== registrationId)
      throw new ApiError(409, "Enable Daily Grind on Feature first.");
    if (current.dailyGrindPaused)
      throw new ApiError(423, "Resume Daily Grind before connecting Telegram.");
    await tx
      .insert(connectionTokens)
      .values({
        tokenHash: hashToken(token),
        accountId: current.id,
        registrationId: current.dailyGrindRegistrationId,
        expiresAt,
      })
      .onConflictDoUpdate({
        target: connectionTokens.accountId,
        set: {
          tokenHash: hashToken(token),
          registrationId: current.dailyGrindRegistrationId,
          expiresAt,
        },
      });
  });
  return { url: `https://t.me/${bot.username}?start=${token}`, expiresAt: expiresAt.toISOString() };
}
