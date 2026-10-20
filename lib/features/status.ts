import "server-only";
import { dailyGrindStatus } from "@/lib/daily-grind/service";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { deliveries, platformServices, type Account } from "@/lib/db/schema";
import { platformUsername } from "@/lib/tracking/platforms";
import type { TrackingStatus } from "@/lib/tracking/types";
import { featureIds, isActivityFeatureId, type FeatureId } from "./catalog";
import { articlesStatus } from "@/lib/articles/service";
import { notesStatus } from "@/lib/notes/service";

/** Two batched activity queries plus the account-owned Notes status when registered. */
export async function trackingStatuses(account: Account, ids: readonly FeatureId[] = featureIds) {
  const statuses: Partial<Record<FeatureId, TrackingStatus>> = {};
  if (!ids.length) return statuses;
  const activityIds = ids.filter(isActivityFeatureId);
  const [services, latest] = await Promise.all([
    db()
      .select()
      .from(platformServices)
      .where(
        and(
          eq(platformServices.accountId, account.id),
          inArray(platformServices.platform, activityIds),
        ),
      ),
    db()
      .selectDistinctOn([deliveries.platform], {
        platform: deliveries.platform,
        reportDate: deliveries.reportDate,
        status: deliveries.status,
        sentAt: deliveries.sentAt,
        empty: sql<boolean>`coalesce(jsonb_array_length(${deliveries.messages}) = 0, false)`,
      })
      .from(deliveries)
      .where(
        and(
          eq(deliveries.accountId, account.id),
          eq(deliveries.cadence, "daily"),
          inArray(deliveries.platform, activityIds),
        ),
      )
      .orderBy(deliveries.platform, desc(deliveries.reportDate)),
  ]);
  for (const id of ids) {
    if (id === "daily-grind") {
      statuses[id] = await dailyGrindStatus(account);
      continue;
    }
    if (id === "articles") {
      statuses.articles = await articlesStatus(account);
      continue;
    }
    if (id === "notes") {
      statuses.notes = await notesStatus(account);
      continue;
    }
    const service = services.find((row) => row.platform === id);
    const delivery = latest.find((row) => row.platform === id);
    statuses[id] = {
      paused: service?.paused ?? false,
      registrationId: service?.registrationId ?? null,
      username: platformUsername(account, id),
      connected: account.chatId !== null,
      status: account.status,
      lastDelivery: delivery
        ? {
            reportDate: delivery.reportDate,
            status: delivery.status === "sent" && delivery.empty ? "empty" : delivery.status,
            sentAt: delivery.sentAt?.toISOString() ?? null,
          }
        : null,
    };
  }
  return statuses;
}

export async function trackingStatus(
  account: Account,
  platform: FeatureId = "leetcode",
): Promise<TrackingStatus> {
  return (await trackingStatuses(account, [platform]))[platform]!;
}
