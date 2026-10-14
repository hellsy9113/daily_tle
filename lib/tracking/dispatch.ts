import "server-only";
import { ApiError, errorResponse } from "@/lib/http/api-error";
import { getLastDaySolvedQuestions } from "@/lib/leetcode/last-day-solved";
import {
  acquireDispatchLock,
  blockAccount,
  claimDelivery,
  cleanExpiredData,
  deliveryIsActive,
  failDelivery,
  prepareDeliveries,
  prepareDeliveryReport,
  releaseDispatchLock,
  updateDelivery,
  type ClaimedDelivery,
} from "./delivery-store";
import { formatDailyReport } from "./format-report";
import { requireCron } from "./security";
import { trackingBot } from "./config";
import { sendTrackingMessage, TrackingTelegramError } from "./telegram-client";
import { getGfgProfile } from "@/lib/gfg/client";
import { GFG_REFRESH_MS, gfgState, readGfgProblems } from "@/lib/gfg/store";
import { formatGfgDailyReport } from "@/lib/gfg/format-report";

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Reserve slots synchronously so concurrent workers share one rate limit. */
export function createMessagePacer(pause = sleep) {
  let nextGlobal = 0;
  const nextChat = new Map<number, number>();
  return async (chatId: number) => {
    const slot = Math.max(Date.now(), nextGlobal, nextChat.get(chatId) ?? 0);
    nextGlobal = slot + 200; // Five messages per second across this dispatcher.
    nextChat.set(chatId, slot + 1000);
    await pause(Math.max(0, slot - Date.now()));
  };
}

export async function dispatchTracking({
  now = new Date(),
  budgetMs = 260_000,
  pause = sleep,
} = {}) {
  trackingBot();
  const lock = await acquireDispatchLock(now);
  if (!lock) return { skipped: true, sent: 0, failed: 0 };
  const deadline = performance.now() + budgetMs;
  const stats = { skipped: false, sent: 0, failed: 0 };
  let rateLimitedUntil = 0;
  let gfgRateLimitedUntil = 0;
  const pace = createMessagePacer(pause);
  const ensureTime = (reserveMs = 12_000) => {
    if (performance.now() + reserveMs >= deadline) throw new Error("Dispatch budget exhausted.");
  };
  try {
    const reportDate = await prepareDeliveries(now);
    const processDelivery = async (delivery: ClaimedDelivery) => {
      try {
        ensureTime();
        let messages = delivery.messages;
        if (!messages) {
          // Retry against the stored calendar period, even if the wall clock changes.
          if (delivery.platform === "gfg") {
            ensureTime(24_000);
            const [saved, state] = await Promise.all([
              readGfgProblems(delivery.accountId),
              gfgState(delivery.accountId),
            ]);
            const result = await getGfgProfile(delivery.username);
            messages = formatGfgDailyReport(
              result,
              saved,
              new Date(delivery.end),
              Boolean(state?.refreshedAt),
            );
            await prepareDeliveryReport(delivery, messages, result);
          } else {
            const result = await getLastDaySolvedQuestions(
              delivery.username,
              new Date(delivery.end),
            );
            messages = formatDailyReport(result);
            await prepareDeliveryReport(delivery, messages, result);
          }
        }
        for (let index = delivery.sentParts; index < messages.length; index++) {
          ensureTime();
          if (!(await deliveryIsActive(delivery))) return;
          await pace(delivery.chatId);
          ensureTime();
          if (Date.now() < rateLimitedUntil)
            throw new TrackingTelegramError(
              "rate_limit",
              Math.ceil((rateLimitedUntil - Date.now()) / 1000),
            );
          if (!(await deliveryIsActive(delivery))) return;
          await sendTrackingMessage(delivery.chatId, messages[index]);
          await updateDelivery(delivery, { sentParts: index + 1 });
        }
        await updateDelivery(delivery, {
          status: "sent",
          sentAt: new Date(),
          lastError: null,
          leaseToken: null,
          leaseUntil: null,
        });
        stats.sent++;
      } catch (error) {
        stats.failed++;
        if (delivery.platform === "gfg" && error instanceof ApiError && error.status === 429)
          gfgRateLimitedUntil = Math.max(gfgRateLimitedUntil, Date.now() + GFG_REFRESH_MS);
        if (error instanceof TrackingTelegramError && error.kind === "rate_limit")
          rateLimitedUntil = Math.max(rateLimitedUntil, Date.now() + error.retryAfter * 1000);
        if (error instanceof TrackingTelegramError && error.kind === "blocked")
          await blockAccount(delivery);
        else
          await failDelivery(
            delivery,
            error instanceof TrackingTelegramError
              ? `telegram_${error.kind}`
              : error instanceof ApiError
                ? `lookup_${error.status}`
                : "delivery_interrupted",
            error instanceof TrackingTelegramError
              ? error.retryAfter
              : error instanceof ApiError && error.status === 429
                ? GFG_REFRESH_MS / 1000
                : 60,
          );
      }
    };
    const workers = await Promise.allSettled(
      Array.from({ length: 10 }, async () => {
        while (performance.now() + 12_000 < deadline && Date.now() >= rateLimitedUntil) {
          const delivery = await claimDelivery(
            reportDate,
            new Date(),
            Date.now() >= gfgRateLimitedUntil,
          );
          if (!delivery) return;
          await processDelivery(delivery);
        }
      }),
    );
    if (workers.some((worker) => worker.status === "rejected"))
      throw new ApiError(503, "Daily tracking will retry during recovery.");
    if (performance.now() + 30_000 < deadline) await cleanExpiredData(new Date());
    console.info("tracking_dispatch_complete", stats);
    return stats;
  } finally {
    await releaseDispatchLock(lock);
  }
}

export async function handleTrackingCron(request: Request) {
  try {
    requireCron(request);
    return Response.json(await dispatchTracking(), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}
