import "server-only";
import { featureIds } from "@/lib/features/catalog";
import type { Account } from "@/lib/db/schema";
import { trackingStatuses } from "@/lib/tracking/registration";

export async function profileSummary(account: Account) {
  const statuses = await trackingStatuses(account);
  const services = featureIds.map((platform) => ({ platform, ...statuses[platform]! }));
  return {
    telegramId: account.telegramId,
    googleEmail: account.googleEmail ?? null,
    googleLinked: Boolean(account.googleId),
    createdAt: account.createdAt.toISOString(),
    connected: account.chatId !== null,
    status: account.status,
    theme: account.theme,
    services,
  };
}
export type ProfileSummary = Awaited<ReturnType<typeof profileSummary>>;
