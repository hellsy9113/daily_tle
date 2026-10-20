import "server-only";
import { and, eq, lte, or, isNull } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { articleCatalog, articleSourceState } from "@/lib/db/schema";
import { randomToken } from "@/lib/tracking/security";
import { ARTICLE_SOURCES, type ArticleSource } from "./sources";
import { parseArticleSource } from "./parse";
import { articleRobotsPolicy } from "./robots";

const USER_AGENT = "DailyTLE-Articles/1.0 (+https://github.com/hellsy9113/daily_tle)";
const HOUR = 3_600_000;
class SourceFailure extends Error {
  constructor(
    readonly reason: string,
    readonly retrySeconds = 300,
  ) {
    super(reason);
  }
}
function retryAfter(response: Response, now: Date) {
  const header = response.headers.get("retry-after");
  const delay =
    header && /^\d+$/.test(header)
      ? Number(header)
      : header
        ? Math.ceil((Date.parse(header) - now.getTime()) / 1000)
        : 300;
  return Math.min(7 * 86400, Math.max(300, Number.isFinite(delay) ? delay : 300));
}
async function boundedBody(response: Response, cap: number) {
  const reader = response.body?.getReader();
  if (!reader) throw new SourceFailure("empty_response");
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > cap) {
        await reader.cancel();
        throw new SourceFailure("response_too_large");
      }
      chunks.push(value);
    }
    return Buffer.concat(chunks).toString("utf8");
  } finally {
    reader.releaseLock();
  }
}
async function sourceRequest(
  url: string,
  fetcher: typeof fetch,
  headers: Record<string, string> = {},
) {
  const host = new URL(url).hostname;
  let current = url;
  const signal = AbortSignal.timeout(5000);
  for (let redirect = 0; redirect <= 2; redirect++) {
    const response = await fetcher(current, {
      headers: { "User-Agent": USER_AGENT, ...headers },
      signal,
      redirect: "manual",
      cache: "no-store",
    });
    if (![301, 302, 303, 307, 308].includes(response.status)) return response;
    const location = response.headers.get("location");
    await response.body?.cancel();
    if (!location) break;
    const next = new URL(location, current);
    // Never turn a trusted feed or robots request into arbitrary upstream access.
    if (
      next.protocol !== "https:" ||
      next.hostname !== host ||
      next.username ||
      next.password ||
      next.port
    )
      throw new SourceFailure("unsafe_redirect");
    current = next.href;
  }
  throw new SourceFailure("redirect_limit");
}
export async function claimArticleSource(id: string, now: Date) {
  await db().insert(articleSourceState).values({ id }).onConflictDoNothing();
  const [claimed] = await db()
    .update(articleSourceState)
    .set({ leaseToken: randomToken(), leaseUntil: new Date(now.getTime() + 120000) })
    .where(
      and(
        eq(articleSourceState.id, id),
        lte(articleSourceState.nextFetchAt, now),
        or(isNull(articleSourceState.leaseUntil), lte(articleSourceState.leaseUntil, now)),
      ),
    )
    .returning();
  return claimed;
}

/** Once-daily Hobby cron; sequential fixed sources, five-second requests, bounded work. */
export async function refreshArticleCatalog({
  now = new Date(),
  budgetMs = 40000,
  fetcher = fetch,
  sources = ARTICLE_SOURCES,
}: { now?: Date; budgetMs?: number; fetcher?: typeof fetch; sources?: ArticleSource[] } = {}) {
  const started = performance.now();
  const stats = { sources: 0, inserted: 0, failed: 0, skipped: 0, deferred: 0 };
  // Cold/failed sources first so a slow source cannot permanently starve others.
  const states = await db().select().from(articleSourceState);
  const ordered = [...sources].sort(
    (a, b) =>
      (states.find((s) => s.id === a.id)?.lastSuccessAt?.getTime() ?? 0) -
        (states.find((s) => s.id === b.id)?.lastSuccessAt?.getTime() ?? 0) ||
      (states.find((s) => s.id === a.id)?.nextFetchAt.getTime() ?? 0) -
        (states.find((s) => s.id === b.id)?.nextFetchAt.getTime() ?? 0),
  );
  for (const source of ordered) {
    // Each source may need two bounded requests. Leave headroom below the 60s route cap.
    if (performance.now() - started + 22000 > Math.min(budgetMs, 40000)) {
      stats.deferred++;
      continue;
    }
    const state = await claimArticleSource(source.id, now);
    if (!state) {
      stats.skipped++;
      continue;
    }
    stats.sources++;
    const fence = and(
      eq(articleSourceState.id, source.id),
      eq(articleSourceState.leaseToken, state.leaseToken!),
    );
    try {
      if (!state.robotsCheckedAt || state.robotsCheckedAt.getTime() + 24 * HOUR <= now.getTime()) {
        const robots = await sourceRequest(new URL("/robots.txt", source.url).href, fetcher);
        let policy = { allowed: true, delaySeconds: 0 };
        if (robots.status === 401 || robots.status === 403) policy.allowed = false;
        else if (robots.status !== 404 && robots.status !== 410) {
          if (!robots.ok)
            throw new SourceFailure(`robots_${robots.status}`, retryAfter(robots, now));
          policy = articleRobotsPolicy(await boundedBody(robots, 128 * 1024), source.url);
        }
        await robots.body?.cancel().catch(() => {});
        await db()
          .update(articleSourceState)
          .set({
            robotsAllowed: policy.allowed,
            robotsCheckedAt: now,
            robotsDelaySeconds: policy.delaySeconds,
          })
          .where(fence);
        state.robotsAllowed = policy.allowed;
        state.robotsDelaySeconds = policy.delaySeconds;
        // Defer after robots when the publisher requests spacing; the cached policy is reused.
        if (!policy.allowed || policy.delaySeconds > 10) {
          await db()
            .update(articleSourceState)
            .set({
              nextFetchAt: new Date(
                now.getTime() +
                  (policy.allowed ? Math.max(300, policy.delaySeconds) * 1000 : 24 * HOUR),
              ),
              lastError: policy.allowed ? "crawl_delay" : "robots_disallowed",
              leaseToken: null,
              leaseUntil: null,
            })
            .where(fence);
          stats.skipped++;
          continue;
        }
        if (policy.delaySeconds > 0)
          await new Promise<void>((resolve) => setTimeout(resolve, policy.delaySeconds * 1000));
      }
      if (state.robotsAllowed === false) throw new SourceFailure("robots_disallowed", 86400);
      const headers: Record<string, string> = {
        Accept:
          source.kind === "api"
            ? "application/json"
            : "application/atom+xml, application/rss+xml, application/xml, text/xml",
      };
      if (state.etag) headers["If-None-Match"] = state.etag;
      if (state.lastModified) headers["If-Modified-Since"] = state.lastModified;
      const response = await sourceRequest(source.url, fetcher, headers);
      if (response.status !== 304 && !response.ok) {
        await response.body?.cancel();
        throw new SourceFailure(`http_${response.status}`, retryAfter(response, now));
      }
      const articles =
        response.status === 304
          ? []
          : parseArticleSource(await boundedBody(response, 2 * 1024 * 1024), source, now);
      await db().transaction(async (tx) => {
        const [owned] = await tx.select().from(articleSourceState).where(fence).for("update");
        if (!owned || !owned.leaseUntil || owned.leaseUntil <= new Date()) return;
        if (articles.length) {
          const inserted = await tx
            .insert(articleCatalog)
            .values(articles.map((article) => ({ ...article, ingestedAt: now })))
            .onConflictDoNothing({ target: articleCatalog.canonicalUrl })
            .returning({ id: articleCatalog.id });
          stats.inserted += inserted.length;
        }
        await tx
          .update(articleSourceState)
          .set({
            etag: response.headers.get("etag")?.slice(0, 500) ?? state.etag,
            lastModified:
              response.headers.get("last-modified")?.slice(0, 200) ?? state.lastModified,
            lastSuccessAt: now,
            failures: 0,
            lastError: null,
            nextFetchAt: new Date(
              now.getTime() + Math.max(6 * HOUR, state.robotsDelaySeconds * 1000),
            ),
            leaseToken: null,
            leaseUntil: null,
          })
          .where(fence);
      });
    } catch (error) {
      stats.failed++;
      const failures = state.failures + 1;
      const retrySeconds = Math.max(
        error instanceof SourceFailure ? error.retrySeconds : 300,
        Math.min(86400, 300 * 2 ** Math.min(failures - 1, 8)),
      );
      await db()
        .update(articleSourceState)
        .set({
          failures,
          lastError: error instanceof SourceFailure ? error.reason : "source_unavailable",
          nextFetchAt: new Date(now.getTime() + retrySeconds * 1000),
          leaseToken: null,
          leaseUntil: null,
        })
        .where(fence);
    }
  }
  return stats;
}
