import "server-only";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { deliveries, platformServices, type Account } from "@/lib/db/schema";
import { platformUsername } from "@/lib/tracking/platforms";
import type { TrackingStatus } from "@/lib/tracking/types";
import { featureIds, type FeatureId } from "./catalog";

/** Two queries regardless of feature count; never cache private data across requests. */
export async function trackingStatuses(account: Account, ids: readonly FeatureId[] = featureIds) {
  const statuses: Partial<Record<FeatureId, TrackingStatus>> = {};
  if (!ids.length) return statuses;
  const [services, latest] = await Promise.all([
    db()
      .select()
      .from(platformServices)
      .where(
        and(
          eq(platformServices.accountId, account.id),
          inArray(platformServices.platform, [...ids]),
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
          inArray(deliveries.platform, [...ids]),
        ),
      )
      .orderBy(deliveries.platform, desc(deliveries.reportDate)),
  ]);
  for (const id of ids) {
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
