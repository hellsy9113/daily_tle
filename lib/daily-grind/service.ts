import "server-only";
import { randomUUID } from "node:crypto";
import { and, eq, ne } from "drizzle-orm";
import { db } from "@/lib/db/client";
import {
  accounts,
  connectionTokens,
  dailyCollections,
  deliveries,
  type Account,
} from "@/lib/db/schema";
import { ApiError } from "@/lib/http/api-error";
import { isRecord } from "@/lib/http/validation";
import { trackingBot } from "@/lib/tracking/config";
import type { TrackingStatus } from "@/lib/tracking/types";

export function parseDailyGrindConsent(input: unknown) {
  if (
    !isRecord(input) ||
    Object.keys(input).some((key) => !["agreementVersion", "acceptedAgreement"].includes(key)) ||
    input.agreementVersion !== "1" ||
    input.acceptedAgreement !== true
  )
    throw new ApiError(400, "Accept the Daily Grind delivery agreement to enable it.");
  return input;
}
export async function dailyGrindStatus(account: Account): Promise<TrackingStatus> {
  return {
    username: account.dailyGrindRegistrationId ? "Telegram recaps" : null,
    registrationId: account.dailyGrindRegistrationId ?? null,
    paused: account.dailyGrindPaused ?? false,
    connected: account.chatId !== null,
    status: account.status,
    lastDelivery: null,
  };
}
export async function registerDailyGrind(account: Account) {
  trackingBot();
  const updated = await db().transaction(async (tx) => {
    const [current] = await tx
      .select()
      .from(accounts)
      .where(eq(accounts.id, account.id))
      .for("update");
    if (!current || current.dailyGrindRegistrationId)
      throw new ApiError(409, "Daily Grind is already enabled. Refresh to manage it.");
    const [next] = await tx
      .update(accounts)
      .set({
        dailyGrindRegistrationId: randomUUID(),
        dailyGrindRegisteredAt: new Date(),
        dailyGrindAgreementVersion: "1",
        dailyGrindPaused: false,
      })
      .where(eq(accounts.id, account.id))
      .returning();
    return next;
  });
  return dailyGrindStatus(updated);
}
export async function manageDailyGrind(
  accountId: string,
  registrationId: string,
  action: boolean | "revoke",
) {
  return db().transaction(async (tx) => {
    const [account] = await tx
      .select()
      .from(accounts)
      .where(eq(accounts.id, accountId))
      .for("update");
    if (!account || account.dailyGrindRegistrationId !== registrationId)
      throw new ApiError(409, "This Daily Grind registration has changed. Refresh and try again.");
    if (action === "revoke") {
      await tx.delete(connectionTokens).where(eq(connectionTokens.accountId, accountId));
      await tx.delete(deliveries).where(eq(deliveries.accountId, accountId));
    } else if (action) {
      await tx
        .update(deliveries)
        .set({
          status: "cancelled",
          leaseToken: null,
          leaseUntil: null,
          lastError: "daily_grind_paused",
        })
        .where(and(eq(deliveries.accountId, accountId), ne(deliveries.status, "sent")));
    }
    if (action === "revoke" || action)
      await tx
        .update(dailyCollections)
        .set({ recapEligible: false })
        .where(eq(dailyCollections.accountId, accountId));
    const [updated] = await tx
      .update(accounts)
      .set(
        action === "revoke"
          ? {
              dailyGrindRegistrationId: null,
              dailyGrindRegisteredAt: null,
              dailyGrindAgreementVersion: null,
              dailyGrindPaused: false,
              chatId: null,
              connectedAt: null,
              status: "pending",
            }
          : { dailyGrindPaused: action },
      )
      .where(eq(accounts.id, accountId))
      .returning();
    return updated;
  });
}
