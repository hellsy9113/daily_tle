"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { requestJson } from "@/lib/http/client";
import { ApiError } from "@/lib/http/api-error";
import { useJsonResource } from "@/lib/http/use-json-resource";
import {
  articleTopicLabel,
  type DailyArticleFeed,
  type ArticleRefreshResult,
} from "@/lib/articles/topics";
import { InfoPopover } from "./info-popover";

const feedError = (failure: unknown) =>
  failure instanceof ApiError && [401, 403, 409, 423].includes(failure.status)
    ? `Access unavailable. ${failure.message}`
    : "Could not load your articles. Please retry. Your saved selection will stay unchanged.";
export function ArticlesPanel() {
  const { data, busy, error, refresh } = useJsonResource<DailyArticleFeed>("/api/articles", {
    errorMessage: feedError,
  });
  const [refreshing, setRefreshing] = useState(false);
  const [notice, setNotice] = useState("");
  const [refreshError, setRefreshError] = useState("");
  const pending = useRef<AbortController | null>(null);
  useEffect(() => () => pending.current?.abort(), []);
  const unavailable =
    error.startsWith("Access unavailable.") || refreshError.startsWith("Access unavailable.");
  async function refreshCatalog() {
    if (pending.current || busy) return;
    if (!data || unavailable) {
      await refresh();
      setRefreshError("");
      return;
    }
    const controller = new AbortController();
    pending.current = controller;
    setRefreshing(true);
    setNotice("");
    setRefreshError("");
    try {
      const result = await requestJson<ArticleRefreshResult>("/api/articles/refresh", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ registrationId: data.registrationId }),
        signal: controller.signal,
      });
      setNotice(
        result.failed || result.deferred
          ? `Catalog refresh finished with some sources unavailable or deferred. ${result.inserted} new articles saved. Available articles fill empty slots in today's list, up to six.`
          : result.inserted
            ? `${result.inserted} new articles saved to the catalog. Empty slots in today's list are filled where available, up to six articles.`
            : "The catalog is up to date or sources are cooling down. Available articles fill empty slots in today's list, up to six.",
      );
      await refresh();
    } catch (failure) {
      if (!controller.signal.aborted)
        setRefreshError(
          failure instanceof ApiError && [401, 403, 409, 423].includes(failure.status)
            ? `Access unavailable. ${failure.message}`
            : failure instanceof ApiError && failure.status === 429
              ? failure.message
              : "Could not refresh the catalog. Your saved reading list is still available. Please try again later.",
        );
    } finally {
      if (!controller.signal.aborted) setRefreshing(false);
      pending.current = null;
    }
  }
  return (
    <section
      className="activity-panel articles-panel"
      aria-labelledby="daily-articles-title"
      aria-busy={busy || refreshing}
    >
      <div className="activity-heading">
        <div>
          <p className="eyebrow">Daily reading · Asia/Kolkata</p>
          <h2 id="daily-articles-title">Daily Articles</h2>
        </div>
        <div className="activity-panel-actions">
          <button
            className="button secondary"
            aria-label="Refresh articles"
            disabled={busy || refreshing}
            onClick={() => void refreshCatalog()}
          >
            {refreshing ? "Refreshing…" : busy ? "Loading…" : "Refresh articles"}
          </button>
          <InfoPopover label="Daily Articles information">
            Recent unseen articles come first, then unseen evergreen reading. Refresh fetches
            articles for your saved topics, stores them in the shared catalog and fills empty slots
            in today&apos;s list, up to six. Existing selections stay in place. Publisher and
            account cooldowns apply. Links open the original article in a new tab.
          </InfoPopover>
          <Link className="text-button" href="/feature?platform=articles">
            Manage service
          </Link>
        </div>
      </div>
      {(error || refreshError) && (
        <div>
          <p className="inline-error" role="alert">
            {refreshError || error}
          </p>
          <button
            className="text-button"
            disabled={busy || refreshing}
            onClick={async () => {
              await refresh();
              setRefreshError("");
            }}
          >
            Retry reading list
          </button>
        </div>
      )}
      {notice && (
        <p className="profile-notice" role="status">
          {notice}
        </p>
      )}
      {data && new Date(data.nextRefreshAt).getTime() > 0 && (
        <p className="field-help">
          Catalog refresh cooldown ends at{" "}
          {new Date(data.nextRefreshAt).toLocaleTimeString("en-IN", {
            timeZone: "Asia/Kolkata",
            hour: "2-digit",
            minute: "2-digit",
          })}{" "}
          IST.
        </p>
      )}
      {busy && !data && <p role="status">Loading today&apos;s reading…</p>}
      {data && !unavailable && (
        <>
          <p className="field-help">
            {data.date} · {data.articles.length} / 6 articles ·{" "}
            {data.selectedTopics.map(articleTopicLabel).join(" · ")}
          </p>
          {JSON.stringify(data.topics) !== JSON.stringify(data.selectedTopics) && (
            <p className="field-help">Your new topics apply to the next daily selection.</p>
          )}
          {!data.articles.length && (
            <div className="article-empty">
              <h3>No unseen matches today</h3>
              <p>
                There are no suitable unseen articles in the shared catalog for this selection. Try
                Refresh to fetch more articles and fill empty slots, or try again tomorrow.
                Previously selected articles will not be repeated.
              </p>
            </div>
          )}
          <div className="article-grid">
            {data.articles.slice(0, 6).map((article) => (
              <article className="article-card" key={article.id}>
                <div className="article-meta">
                  <span className="badge">{articleTopicLabel(article.topic)}</span>
                  <span>{article.source}</span>
                </div>
                <h3>
                  <a
                    href={article.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    referrerPolicy="no-referrer"
                  >
                    {article.title}
                  </a>
                </h3>
                <p className="field-help">
                  Published{" "}
                  {article.publishedAt ? (
                    <time dateTime={article.publishedAt}>
                      {new Date(article.publishedAt).toLocaleDateString("en-IN", {
                        timeZone: "Asia/Kolkata",
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })}
                    </time>
                  ) : (
                    "date unavailable"
                  )}
                </p>
                <p>
                  {article.summary ||
                    "The publisher did not provide an excerpt. Read the original for details."}
                </p>
                <a
                  className="text-button"
                  href={article.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  referrerPolicy="no-referrer"
                >
                  Read original <span aria-hidden="true">↗</span>
                </a>
              </article>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
