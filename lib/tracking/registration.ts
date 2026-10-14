import "server-only";
import { and, desc, eq, isNull } from "drizzle-orm";
import { ApiError } from "@/lib/http/api-error";
import { db } from "@/lib/db/client";
import { accounts, connectionTokens, deliveries, type Account } from "@/lib/db/schema";
import { getLeetCodeIdentity } from "@/lib/leetcode/user-identity";
import { trackingBot, requireRegistrationAvailable } from "./config";
import { hashToken, randomToken } from "./security";
import type { ConnectionLink, TrackingStatus } from "./types";

function databaseCode(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null) return;
  if ("code" in error && typeof error.code === "string") return error.code;
  if ("cause" in error) return databaseCode(error.cause);
}

export async function registerUsername(account: Account, value: unknown): Promise<TrackingStatus> {
  requireRegistrationAvailable();
  if (account.leetcodeUsername)
    throw new ApiError(409, "Your LeetCode username is already registered and cannot be changed.");
  if (typeof value !== "string" || value.length > 100)
    throw new ApiError(400, "Enter a valid LeetCode username.");
  const username = await getLeetCodeIdentity(value);
  try {
    const [registered] = await db()
      .update(accounts)
      .set({ leetcodeUsername: username, registeredAt: new Date() })
      .where(and(eq(accounts.id, account.id), isNull(accounts.leetcodeUsername)))
      .returning();
    if (!registered)
      throw new ApiError(
        409,
        "Your LeetCode username is already registered and cannot be changed.",
      );
    return trackingStatus(registered);
  } catch (error) {
    if (databaseCode(error) === "23505")
      throw new ApiError(409, "This LeetCode username is already registered.");
    throw error;
  }
}

export async function trackingStatus(
  account: Account,
  platform: "leetcode" | "gfg" = "leetcode",
): Promise<TrackingStatus> {
  const [latest] = await db()
    .select({
      reportDate: deliveries.reportDate,
      status: deliveries.status,
      sentAt: deliveries.sentAt,
    })
    .from(deliveries)
    .where(and(eq(deliveries.accountId, account.id), eq(deliveries.platform, platform)))
    .orderBy(desc(deliveries.reportDate))
    .limit(1);
  return {
    username: platform === "gfg" ? account.gfgUsername : account.leetcodeUsername,
    connected: account.chatId !== null,
    status: account.status,
    lastDelivery: latest ? { ...latest, sentAt: latest.sentAt?.toISOString() ?? null } : null,
  };
}

export async function createConnectionLink(account: Account): Promise<ConnectionLink> {
  if (!account.leetcodeUsername && !account.gfgUsername)
    throw new ApiError(409, "Register your LeetCode or GFG username first.");
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
