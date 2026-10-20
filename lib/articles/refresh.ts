import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { articleSubscriptions } from "@/lib/db/schema";
import { localClock } from "@/lib/timezone";
import { ApiError } from "@/lib/http/api-error";
import { lockArticles, fillDailyArticleSlots, rotateDailyArticles } from "./service";
import { articleSourcesForTopics } from "./sources";
import { refreshArticleCatalog } from "./ingest";
import type { ArticleRefreshResult } from "./topics";

const COOLDOWN_MS = 15 * 60 * 1000;
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
    // nextRefreshAt retains the original first-refresh timestamp plus 15 minutes.
    const lastRefresh = new Date(subscription.nextRefreshAt.getTime() - COOLDOWN_MS);
    if (
      subscription.nextRefreshAt.getTime() > 0 &&
      localClock(lastRefresh).date === localClock(now).date
    )
      return {
        topics: subscription.topics,
        nextRefreshAt: subscription.nextRefreshAt,
        catalogOnly: true,
      };
    const nextRefreshAt = new Date(now.getTime() + COOLDOWN_MS);
    await tx
      .update(articleSubscriptions)
      .set({ nextRefreshAt })
      .where(eq(articleSubscriptions.id, subscription.id));
    return { topics: subscription.topics, nextRefreshAt, catalogOnly: false };
  });
  if (claim.catalogOnly) {
    await rotateDailyArticles(accountId, registrationId, now);
    return {
      inserted: 0,
      sources: 0,
      failed: 0,
      skipped: 0,
      deferred: 0,
      nextRefreshAt: claim.nextRefreshAt.toISOString(),
      mode: "catalog",
    };
  }
  const stats = await refreshArticleCatalog({
    now,
    fetcher,
    sources: articleSourcesForTopics(claim.topics),
  });
  // Fill and generation/pause validation share the account-first transaction with ordinary reads.
  await fillDailyArticleSlots(accountId, registrationId, now);
  return { ...stats, mode: "upstream", nextRefreshAt: claim.nextRefreshAt.toISOString() };
}
