import "server-only";
import {
  claimCollection,
  completeCollection,
  failCollection,
  type ClaimedCollection,
} from "./collection-store";
import { getHackerRankProfile } from "@/lib/hackerrank/client";
import { readHackerRankProblems, HACKERRANK_REFRESH_MS } from "@/lib/hackerrank/store";
import { formatHackerRankDailyReport } from "@/lib/hackerrank/format-report";
import { ApiError, errorResponse } from "@/lib/http/api-error";
import { getLastDaySolvedQuestions } from "@/lib/leetcode/last-day-solved";
import {
  acquireDispatchLock,
  blockAccount,
  claimDelivery,
  cleanExpiredData,
  deliveryIsActive,
  sendDeliveryPart,
  failDelivery,
  prepareDeliveries,
  prepareEmptyDayReports,
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
import { GFG_REFRESH_MS, readGfgProblems } from "@/lib/gfg/store";
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
  let hackerRankRateLimitedUntil = 0;
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
          if (delivery.platform === "hackerrank") {
            ensureTime(24_000);
            const saved = await readHackerRankProblems(delivery.accountId);
            const result = await getHackerRankProfile(delivery.username);
            messages = formatHackerRankDailyReport(result, saved, new Date(delivery.end));
            await prepareDeliveryReport(delivery, messages, result);
          } else if (delivery.platform === "gfg") {
            ensureTime(24_000);
            const saved = await readGfgProblems(delivery.accountId);
            const result = await getGfgProfile(delivery.username);
            messages = formatGfgDailyReport(result, saved, new Date(delivery.end));
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
          if (
            !(await sendDeliveryPart(delivery, index, () =>
              sendTrackingMessage(delivery.chatId, messages[index]),
            ))
          )
            return;
        }
        await updateDelivery(delivery, {
          status: "sent",
          sentAt: messages.length ? new Date() : null,
          lastError: null,
          leaseToken: null,
          leaseUntil: null,
        });
        if (messages.length) stats.sent++;
      } catch (error) {
        stats.failed++;
        if (delivery.platform === "hackerrank" && error instanceof ApiError && error.status === 429)
          hackerRankRateLimitedUntil = Math.max(
            hackerRankRateLimitedUntil,
            Date.now() + HACKERRANK_REFRESH_MS,
          );
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
    const processCollection = async (job: ClaimedCollection) => {
      try {
        ensureTime(job.platform === "leetcode" ? 12_000 : 24_000);
        if (job.platform === "gfg") {
          const saved = await readGfgProblems(job.accountId);
          const result = await getGfgProfile(job.username);
          await completeCollection(
            job,
            formatGfgDailyReport(result, saved, new Date(job.end)),
            result,
          );
        } else if (job.platform === "hackerrank") {
          const saved = await readHackerRankProblems(job.accountId);
          const result = await getHackerRankProfile(job.username);
          await completeCollection(
            job,
            formatHackerRankDailyReport(result, saved, new Date(job.end)),
            result,
          );
        } else {
          const result = await getLastDaySolvedQuestions(job.username, new Date(job.end));
          await completeCollection(job, formatDailyReport(result), result);
        }
      } catch (error) {
        stats.failed++;
        if (error instanceof ApiError && error.status === 429) {
          if (job.platform === "gfg") gfgRateLimitedUntil = Date.now() + GFG_REFRESH_MS;
          if (job.platform === "hackerrank")
            hackerRankRateLimitedUntil = Date.now() + HACKERRANK_REFRESH_MS;
        }
        await failCollection(
          job,
          error instanceof ApiError ? `lookup_${error.status}` : "collection_interrupted",
          error instanceof ApiError && error.status === 429 ? GFG_REFRESH_MS / 1000 : 60,
        );
      }
    };
    const runWorkers = async () => {
      const workers = await Promise.allSettled(
        Array.from({ length: 10 }, async () => {
          while (performance.now() + 12_000 < deadline) {
            const delivery =
              Date.now() >= rateLimitedUntil
                ? await claimDelivery(
                    reportDate,
                    new Date(),
                    Date.now() >= gfgRateLimitedUntil,
                    Date.now() >= hackerRankRateLimitedUntil,
                    true,
                  )
                : null;
            if (delivery) {
              await processDelivery(delivery);
              continue;
            }
            const job = await claimCollection(
              reportDate,
              new Date(),
              Date.now() >= gfgRateLimitedUntil,
              Date.now() >= hackerRankRateLimitedUntil,
            );
            if (!job) return;
            await processCollection(job);
          }
        }),
      );
      const failedWorker = workers.find((worker) => worker.status === "rejected");
      if (failedWorker?.status === "rejected")
        throw Object.assign(new ApiError(503, "Daily tracking will retry during recovery."), {
          cause: failedWorker.reason,
        });
    };
    await runWorkers();
    if (
      performance.now() + 12_000 < deadline &&
      Date.now() >= rateLimitedUntil &&
      (await prepareEmptyDayReports(reportDate, new Date()))
    )
      await runWorkers();
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
