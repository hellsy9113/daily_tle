import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { articleSubscriptions } from "@/lib/db/schema";
import { ApiError } from "@/lib/http/api-error";
import { lockArticles, fillDailyArticleSlots } from "./service";
import { articleSourcesForTopics } from "./sources";
import { refreshArticleCatalog } from "./ingest";
import type { ArticleRefreshResult } from "./topics";

const COOLDOWN_MS = 15 * 60 * 1000;
export class ArticleRefreshCooldown extends ApiError {
  constructor(readonly retryAfter: number) {
    const minutes = Math.ceil(retryAfter / 60);
    super(
      429,
      `Please wait ${minutes} ${minutes === 1 ? "minute" : "minutes"} before refreshing the catalog again.`,
    );
  }
}

/** No account locks are held during publisher I/O; global source leases/cooldowns also apply. */
export async function refreshAccountArticles(
  accountId: string,
  registrationId: string,
  { now = new Date(), fetcher = fetch }: { now?: Date; fetcher?: typeof fetch } = {},
): Promise<ArticleRefreshResult> {
  const claim = await db().transaction(async (tx) => {
    const { subscription } = await lockArticles(tx, accountId, registrationId);
    if (subscription.paused)
      throw new ApiError(423, "Daily Articles is paused. Resume it on Feature.");
    if (subscription.nextRefreshAt > now)
      throw new ArticleRefreshCooldown(
        Math.max(1, Math.ceil((subscription.nextRefreshAt.getTime() - now.getTime()) / 1000)),
      );
    const nextRefreshAt = new Date(now.getTime() + COOLDOWN_MS);
    await tx
      .update(articleSubscriptions)
      .set({ nextRefreshAt })
      .where(eq(articleSubscriptions.id, subscription.id));
    return { topics: subscription.topics, nextRefreshAt };
  });
  const stats = await refreshArticleCatalog({
    now,
    fetcher,
    sources: articleSourcesForTopics(claim.topics),
  });
  // Fill and generation/pause validation share the account-first transaction with ordinary reads.
  await fillDailyArticleSlots(accountId, registrationId);
  return { ...stats, nextRefreshAt: claim.nextRefreshAt.toISOString() };
}
