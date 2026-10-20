import "server-only";
import { registeredFeatures, platformUsername } from "./platforms";
import { platformLabels, featureById } from "@/lib/features/catalog";
import { and, eq, gt, ne } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { accounts, connectionTokens, deliveries, telegramUpdates } from "@/lib/db/schema";
import { ApiError, errorResponse } from "@/lib/http/api-error";
import { isRecord } from "@/lib/http/validation";
import { appUrl, trackingBot } from "./config";
import { hashToken, secretsEqual, validToken } from "./security";
import { sendTrackingMessage, TrackingTelegramError } from "./telegram-client";

type TrackingUpdate =
  | { updateId: number; userId: number; chatId: number; text: string }
  | { updateId: number; userId: number; chatId: number; blocked: boolean };
const positiveId = (value: unknown): value is number =>
  typeof value === "number" && Number.isSafeInteger(value) && value > 0;

export function parseTrackingUpdate(value: unknown): TrackingUpdate | null {
  if (
    !isRecord(value) ||
    typeof value.update_id !== "number" ||
    !Number.isSafeInteger(value.update_id) ||
    value.update_id < 0
  )
    return null;
  const message = value.message;
  if (
    isRecord(message) &&
    isRecord(message.chat) &&
    message.chat.type === "private" &&
    positiveId(message.chat.id) &&
    isRecord(message.from) &&
    positiveId(message.from.id) &&
    message.from.is_bot === false &&
    message.from.id === message.chat.id &&
    typeof message.text === "string"
  ) {
    return {
      updateId: value.update_id,
      userId: message.from.id,
      chatId: message.chat.id,
      text: message.text.trim(),
    };
  }
  const member = value.my_chat_member;
  if (
    isRecord(member) &&
    isRecord(member.chat) &&
    member.chat.type === "private" &&
    positiveId(member.chat.id) &&
    isRecord(member.from) &&
    member.from.id === member.chat.id &&
    isRecord(member.new_chat_member) &&
    ["kicked", "member"].includes(String(member.new_chat_member.status))
  ) {
    return {
      updateId: value.update_id,
      userId: member.chat.id,
      chatId: member.chat.id,
      blocked: member.new_chat_member.status === "kicked",
    };
  }
  return null;
}

export async function processTrackingUpdate(update: TrackingUpdate): Promise<string | null> {
  return db().transaction(async (transaction) => {
    const inserted = await transaction
      .insert(telegramUpdates)
      .values({ updateId: update.updateId })
      .onConflictDoNothing()
      .returning();
    if (!inserted.length) return null;
    const command =
      "text" in update
        ? /^\/(start|stop)(?:@([A-Za-z0-9_]+))?(?:\s+(\S+))?$/i.exec(update.text)
        : null;
    const token = command?.[1].toLowerCase() === "start" ? command[3] : undefined;
    const [connection] =
      token && validToken(token)
        ? await transaction
            .select()
            .from(connectionTokens)
            .where(
              and(
                eq(connectionTokens.tokenHash, hashToken(token)),
                gt(connectionTokens.expiresAt, new Date()),
              ),
            )
        : [];
    const [telegramAccount] = await transaction
      .select()
      .from(accounts)
      .where(eq(accounts.telegramId, update.userId))
      .limit(1);
    const accountId = connection?.accountId ?? telegramAccount?.id;
    const [account] = accountId
      ? await transaction.select().from(accounts).where(eq(accounts.id, accountId)).for("update")
      : [];
    const setupUrl = new URL("/feature?platform=daily-grind", appUrl()).href;
    const setup = `Enable Daily Grind at ${setupUrl}`;
    if (!account?.dailyGrindRegistrationId) return "text" in update ? setup : null;
    if (
      (account.telegramId !== null && account.telegramId !== update.userId) ||
      (telegramAccount && telegramAccount.id !== account.id)
    )
      return "text" in update
        ? `This Telegram account belongs to a different Track.it account. Sign in with Telegram to manage that account at ${setupUrl}`
        : null;
    if (token && (!connection || connection.registrationId !== account.dailyGrindRegistrationId))
      return `This connection link is invalid or expired. Get a new link at ${setupUrl}`;
    const recapIds = registeredFeatures(account).filter((id) => featureById[id].recaps);
    if ("blocked" in update) {
      if (account.chatId !== update.chatId) return null;
      // Telegram may deliver the membership event after /start. Joining must
      // not pause a newly activated account; only an existing block is cleared.
      if (!update.blocked && account.status !== "blocked") return null;
      await transaction
        .update(accounts)
        .set({ status: update.blocked ? "blocked" : "paused" })
        .where(eq(accounts.id, account.id));
      await transaction
        .update(deliveries)
        .set({ status: "cancelled", leaseToken: null, leaseUntil: null })
        .where(and(eq(deliveries.accountId, account.id), ne(deliveries.status, "sent")));
      return null;
    }
    if (
      !command ||
      (command[2] && command[2].toLowerCase() !== trackingBot().username.toLowerCase())
    )
      return "Daily reports arrive automatically. Use /stop to pause or /start to resume.";
    if (command[1].toLowerCase() === "stop") {
      if (account.chatId !== update.chatId) return setup;
      await transaction
        .update(accounts)
        .set({ status: "paused" })
        .where(eq(accounts.id, account.id));
      await transaction
        .update(deliveries)
        .set({ status: "cancelled", leaseToken: null, leaseUntil: null })
        .where(and(eq(deliveries.accountId, account.id), ne(deliveries.status, "sent")));
      return "Daily recaps are paused for all services. Daily data is still saved. Send /start to resume recaps.";
    }
    if (account.dailyGrindPaused)
      return `Daily Grind is paused on the website. Resume it at ${setupUrl}`;
    if (token) {
      if (!validToken(token))
        return `This connection link is invalid or expired. Get a new link at ${setupUrl}`;
      const consumed = await transaction
        .delete(connectionTokens)
        .where(
          and(
            eq(connectionTokens.tokenHash, hashToken(token)),
            eq(connectionTokens.accountId, account.id),
            eq(connectionTokens.registrationId, account.dailyGrindRegistrationId),
            gt(connectionTokens.expiresAt, new Date()),
          ),
        )
        .returning();
      if (!consumed.length)
        return `This connection link is invalid or expired. Get a new link at ${setupUrl}`;
    } else if (account.chatId !== update.chatId) {
      return setup;
    }
    await transaction
      .update(accounts)
      .set({
        telegramId: update.userId,
        chatId: update.chatId,
        status: "active",
        connectedAt: account.connectedAt ?? new Date(),
      })
      .where(eq(accounts.id, account.id));
    const names = recapIds
      .map((id) =>
        id === "leetcode"
          ? platformUsername(account, id)
          : `${platformLabels[id]} ${platformUsername(account, id)}`,
      )
      .join(" and ");
    return `Daily Grind is active${names ? ` for ${names}` : ". Enable a coding platform on Feature to receive recaps"}. Daily reports arrive between 8:30 and 9:30 a.m. Asia/Kolkata. Use /stop to pause all recaps. Individual platform pause choices stay unchanged; manage them on the Feature page.`;
  });
}

export async function handleTrackingWebhook(request: Request) {
  try {
    const { secret } = trackingBot();
    if (!secretsEqual(request.headers.get("x-telegram-bot-api-secret-token"), secret))
      throw new ApiError(401, "Unauthorized");
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      throw new ApiError(400, "Invalid JSON");
    }
    const update = parseTrackingUpdate(body);
    if (update) {
      const reply = await processTrackingUpdate(update);
      if (reply) {
        try {
          await sendTrackingMessage(update.chatId, reply);
        } catch (error) {
          if (!(error instanceof TrackingTelegramError)) throw error;
          // Activation is already committed. A duplicate update must not bind or reply twice.
          console.warn("tracking_webhook_reply_failed", { kind: error.kind });
        }
      }
    }
    return Response.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
