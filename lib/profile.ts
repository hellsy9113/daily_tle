import "server-only";
import type { Account } from "@/lib/db/schema";
import { trackingStatus } from "@/lib/tracking/registration";

export async function profileSummary(account: Account) {
  const platforms = ["leetcode", "gfg", "hackerrank"] as const;
  const services = await Promise.all(
    platforms.map(async (platform) => ({ platform, ...(await trackingStatus(account, platform)) })),
  );
  return {
    telegramId: account.telegramId,
    createdAt: account.createdAt.toISOString(),
    connected: account.chatId !== null,
    status: account.status,
    theme: account.theme,
    services,
  };
}
export type ProfileSummary = Awaited<ReturnType<typeof profileSummary>>;
