import "server-only";
import { and, eq, ne } from "drizzle-orm";
import { db } from "@/lib/db/client";
import {
  accounts,
  platformServices,
  dailyCollections,
  deliveries,
  activityGoals,
  acceptedActivity,
  activityDays,
  activitySync,
  gfgProblems,
  gfgSnapshots,
  gfgSync,
  hackerRankProblems,
  hackerRankSnapshots,
  hackerRankSync,
} from "@/lib/db/schema";
import type { ActivityPlatform } from "@/lib/activity/types";
import { ApiError } from "@/lib/http/api-error";
import { platformUsername } from "./platforms";
import { AGREEMENT_VERSION } from "./agreement";

export type Transaction = Parameters<Parameters<ReturnType<typeof db>["transaction"]>[0]>[0];

/** Always acquire the account lock before a sync, service, or delivery lock. */
export async function lockRegistration(
  tx: Transaction,
  accountId: string,
  platform: ActivityPlatform,
  expectedId?: string,
) {
  const [account] = await tx
    .select()
    .from(accounts)
    .where(eq(accounts.id, accountId))
    .for("update");
  const [service] = await tx
    .select()
    .from(platformServices)
    .where(and(eq(platformServices.accountId, accountId), eq(platformServices.platform, platform)));
  if (
    !account ||
    !service ||
    !platformUsername(account, platform) ||
    (expectedId !== undefined && service.registrationId !== expectedId)
  )
    throw new ApiError(409, "This service registration has changed. Refresh and try again.");
  return { account, service, username: platformUsername(account, platform)! };
}

export async function currentRegistration(accountId: string, platform: ActivityPlatform) {
  // One read captures a consistent generation/username snapshot. Writers validate it
  // again under the account lock after any upstream work has finished.
  const [row] = await db()
    .select({ account: accounts, service: platformServices })
    .from(accounts)
    .innerJoin(platformServices, eq(platformServices.accountId, accounts.id))
    .where(and(eq(accounts.id, accountId), eq(platformServices.platform, platform)))
    .limit(1);
  if (!row || !platformUsername(row.account, platform))
    throw new ApiError(409, "This service registration has changed. Refresh and try again.");
  return { ...row, username: platformUsername(row.account, platform)! };
}

export async function recordAgreement(
  tx: Transaction,
  accountId: string,
  platform: ActivityPlatform,
) {
  await tx
    .update(platformServices)
    .set({ agreementVersion: AGREEMENT_VERSION, agreementAcceptedAt: new Date() })
    .where(and(eq(platformServices.accountId, accountId), eq(platformServices.platform, platform)));
}

export async function setServicePaused(
  accountId: string,
  platform: ActivityPlatform,
  registrationId: string,
  paused: boolean,
) {
  return db().transaction(async (tx) => {
    const { account } = await lockRegistration(tx, accountId, platform, registrationId);
    await tx
      .update(platformServices)
      .set({ paused })
      .where(eq(platformServices.registrationId, registrationId));
    if (paused) {
      await tx
        .update(deliveries)
        .set({
          status: "cancelled",
          leaseToken: null,
          leaseUntil: null,
          lastError: "service_paused",
        })
        .where(and(eq(deliveries.registrationId, registrationId), ne(deliveries.status, "sent")));
      await tx
        .update(dailyCollections)
        .set({ recapEligible: false })
        .where(eq(dailyCollections.registrationId, registrationId));
    }
    return account;
  });
}

export async function revokeService(
  accountId: string,
  platform: ActivityPlatform,
  registrationId: string,
) {
  return db().transaction(async (tx) => {
    await lockRegistration(tx, accountId, platform, registrationId);
    await tx
      .delete(deliveries)
      .where(and(eq(deliveries.accountId, accountId), eq(deliveries.platform, platform)));
    await tx.delete(dailyCollections).where(eq(dailyCollections.registrationId, registrationId));
    await tx
      .delete(activityGoals)
      .where(and(eq(activityGoals.accountId, accountId), eq(activityGoals.platform, platform)));
    const tables =
      platform === "leetcode"
        ? [acceptedActivity, activityDays, activitySync]
        : platform === "gfg"
          ? [gfgProblems, gfgSnapshots, gfgSync]
          : [hackerRankProblems, hackerRankSnapshots, hackerRankSync];
    for (const table of tables) await tx.delete(table).where(eq(table.accountId, accountId));
    const fields =
      platform === "leetcode"
        ? { leetcodeUsername: null, registeredAt: null }
        : platform === "gfg"
          ? { gfgUsername: null, gfgRegisteredAt: null }
          : { hackerRankUsername: null, hackerRankRegisteredAt: null };
    const [account] = await tx
      .update(accounts)
      .set(fields)
      .where(eq(accounts.id, accountId))
      .returning();
    // The account trigger deletes registration metadata and its generation atomically.
    return account;
  });
}
