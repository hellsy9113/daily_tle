import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import {
  accounts,
  articleSubscriptions,
  articleCatalog,
  articleFeedDays,
  articleFeedItems,
  articleSeen,
  type Account,
} from "@/lib/db/schema";
import { ApiError } from "@/lib/http/api-error";
import type { TrackingStatus } from "@/lib/tracking/types";
import type { Transaction } from "@/lib/tracking/services";
import { localClock, localDayStart } from "@/lib/timezone";
import {
  parseArticleTopics,
  DAILY_ARTICLE_LIMIT,
  type ArticleTopic,
  type DailyArticleFeed,
} from "./topics";

export async function articlesStatus(account: Account): Promise<TrackingStatus> {
  if (!account.articlesRegisteredAt)
    return {
      username: null,
      registrationId: null,
      paused: false,
      connected: false,
      status: "pending",
      lastDelivery: null,
    };
  const [subscription] = await db()
    .select()
    .from(articleSubscriptions)
    .where(eq(articleSubscriptions.accountId, account.id));
  return {
    username: subscription ? "Daily reading" : null,
    registrationId: subscription?.id ?? null,
    topics: subscription?.topics,
    paused: subscription?.paused ?? false,
    connected: false,
    status: "pending",
    lastDelivery: null,
  };
}
export async function lockArticles(tx: Transaction, accountId: string, registrationId?: string) {
  const [account] = await tx
    .select()
    .from(accounts)
    .where(eq(accounts.id, accountId))
    .for("update");
  const [subscription] = await tx
    .select()
    .from(articleSubscriptions)
    .where(eq(articleSubscriptions.accountId, accountId))
    .for("update");
  if (
    !account?.articlesRegisteredAt ||
    !subscription ||
    (registrationId !== undefined && subscription.id !== registrationId)
  )
    throw new ApiError(
      409,
      "This Daily Articles registration has changed. Register or refresh on Feature.",
    );
  return { account, subscription };
}
export async function registerArticles(account: Account, input: unknown) {
  const topics = parseArticleTopics({ topics: input });
  const updated = await db().transaction(async (tx) => {
    const [owner] = await tx
      .select()
      .from(accounts)
      .where(eq(accounts.id, account.id))
      .for("update");
    if (!owner || owner.articlesRegisteredAt)
      throw new ApiError(409, "Daily Articles is already registered. Manage topics on Feature.");
    await tx.insert(articleSubscriptions).values({ accountId: account.id, topics });
    const [result] = await tx
      .update(accounts)
      .set({ articlesRegisteredAt: new Date() })
      .where(eq(accounts.id, account.id))
      .returning();
    return result;
  });
  return articlesStatus(updated);
}
export async function updateArticleTopics(
  accountId: string,
  registrationId: string,
  input: unknown,
) {
  const topics = parseArticleTopics({ topics: input });
  const updated = await db().transaction(async (tx) => {
    const { account, subscription } = await lockArticles(tx, accountId, registrationId);
    await tx
      .update(articleSubscriptions)
      .set({ topics })
      .where(eq(articleSubscriptions.id, subscription.id));
    return account;
  });
  return articlesStatus(updated);
}
export async function manageArticles(
  accountId: string,
  registrationId: string,
  paused: boolean | "revoke",
) {
  return db().transaction(async (tx) => {
    const { account, subscription } = await lockArticles(tx, accountId, registrationId);
    if (paused === "revoke") {
      await tx.delete(articleSubscriptions).where(eq(articleSubscriptions.id, subscription.id));
      const [updated] = await tx
        .update(accounts)
        .set({ articlesRegisteredAt: null })
        .where(eq(accounts.id, accountId))
        .returning();
      return updated;
    }
    await tx
      .update(articleSubscriptions)
      .set({ paused })
      .where(eq(articleSubscriptions.id, subscription.id));
    return account;
  });
}

/** No upstream I/O. Account-first locks serialize selection, topic changes, pause and revoke. */
export function dailyArticles(accountId: string, now = new Date()): Promise<DailyArticleFeed> {
  return readDailyArticles(accountId, now);
}

/** Explicit manual refresh may append unseen articles, never replace the day's saved items. */
export function fillDailyArticleSlots(accountId: string, registrationId: string, now = new Date()) {
  return readDailyArticles(accountId, now, { fill: true, registrationId });
}

/** Replace the visible list only when unseen catalog matches are available. */
export function rotateDailyArticles(accountId: string, registrationId: string, now = new Date()) {
  return readDailyArticles(accountId, now, { rotate: true, registrationId });
}

async function readDailyArticles(
  accountId: string,
  now: Date,
  {
    fill = false,
    rotate = false,
    registrationId,
  }: {
    fill?: boolean;
    rotate?: boolean;
    registrationId?: string;
  } = {},
): Promise<DailyArticleFeed> {
  const date = localClock(now).date;
  return db().transaction(async (tx) => {
    const { subscription } = await lockArticles(tx, accountId, registrationId);
    if (subscription.paused)
      throw new ApiError(423, "Daily Articles is paused. Resume it on Feature.");
    let [day] = await tx
      .select()
      .from(articleFeedDays)
      .where(
        and(eq(articleFeedDays.subscriptionId, subscription.id), eq(articleFeedDays.date, date)),
      );
    const creating = !day;
    if (!day) {
      [day] = await tx
        .insert(articleFeedDays)
        .values({
          subscriptionId: subscription.id,
          date,
          topics: subscription.topics,
          generatedAt: now,
        })
        .returning();
    }
    if (creating || fill || rotate) {
      const existing =
        fill && !rotate
          ? await tx
              .select({ position: articleFeedItems.position })
              .from(articleFeedItems)
              .where(eq(articleFeedItems.dayId, day.id))
          : [];
      const emptySlots = Array.from(
        { length: DAILY_ARTICLE_LIMIT },
        (_, index) => index + 1,
      ).filter((position) => !existing.some((item) => item.position === position));
      const topicsArray = `{${day.topics.join(",")}}`;
      const recentCutoff = new Date(localDayStart(date).getTime() - 30 * 86_400_000);
      const choices = emptySlots.length
        ? await tx.execute<{ id: string; topic: ArticleTopic }>(sql`
        SELECT c.id,
          (SELECT t FROM unnest(c.topics) t WHERE t = ANY(${topicsArray}::text[])
            ORDER BY array_position(${topicsArray}::text[], t) LIMIT 1) AS topic
        FROM ${articleCatalog} c
        WHERE c.topics && ${topicsArray}::text[]
          AND (c.published_at IS NULL OR c.published_at <= ${now.toISOString()}::timestamptz)
          AND (c.published_at >= ${recentCutoff.toISOString()}::timestamptz OR c.evergreen)
          AND NOT EXISTS (SELECT 1 FROM ${articleSeen} h WHERE h.subscription_id = ${subscription.id} AND h.article_id = c.id)
        ORDER BY CASE WHEN c.published_at >= ${recentCutoff.toISOString()}::timestamptz THEN 0 ELSE 1 END,
          c.published_at DESC NULLS LAST, c.canonical_url ASC
        LIMIT ${emptySlots.length}
      `)
        : [];
      if (choices.length) {
        if (rotate) {
          await tx.delete(articleFeedItems).where(eq(articleFeedItems.dayId, day.id));
          [day] = await tx
            .update(articleFeedDays)
            .set({ generatedAt: now })
            .where(eq(articleFeedDays.id, day.id))
            .returning();
        }
        await tx.insert(articleFeedItems).values(
          choices.map((choice, index) => ({
            dayId: day.id,
            subscriptionId: subscription.id,
            articleId: choice.id,
            position: emptySlots[index],
            topic: choice.topic,
          })),
        );
        await tx
          .insert(articleSeen)
          .values(
            choices.map((choice) => ({
              subscriptionId: subscription.id,
              articleId: choice.id,
              selectedAt: now,
            })),
          )
          .onConflictDoNothing();
      }
    }
    const rows = await tx
      .select({ article: articleCatalog, topic: articleFeedItems.topic })
      .from(articleFeedItems)
      .innerJoin(articleCatalog, eq(articleFeedItems.articleId, articleCatalog.id))
      .where(
        and(
          eq(articleFeedItems.dayId, day.id),
          eq(articleFeedItems.subscriptionId, subscription.id),
        ),
      )
      .orderBy(articleFeedItems.position)
      .limit(DAILY_ARTICLE_LIMIT);
    return {
      date,
      registrationId: subscription.id,
      nextRefreshAt: subscription.nextRefreshAt.toISOString(),
      timezone: "Asia/Kolkata",
      topics: subscription.topics,
      selectedTopics: day.topics,
      generatedAt: day.generatedAt.toISOString(),
      articles: rows.map(({ article, topic }) => ({
        id: article.id,
        title: article.title,
        source: article.source,
        publishedAt: article.publishedAt?.toISOString() ?? null,
        topic,
        summary: article.summary,
        url: article.canonicalUrl,
      })),
    };
  });
}
