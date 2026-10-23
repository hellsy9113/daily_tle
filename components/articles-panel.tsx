"use client";
import { useEffect, useRef, useState } from "react";
import { requestJson } from "@/lib/http/client";
import { ApiError } from "@/lib/http/api-error";
import { useJsonResource } from "@/lib/http/use-json-resource";
import { articleTopicLabel, type DailyArticleFeed } from "@/lib/articles/topics";
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
    setRefreshError("");
    try {
      await requestJson("/api/articles/refresh", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ registrationId: data.registrationId }),
        signal: controller.signal,
      });
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
      aria-label="Daily Articles"
      aria-busy={busy || refreshing}
    >
      <div className="activity-heading">
        <div>
          <p className="eyebrow">Daily reading · Asia/Kolkata</p>
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
            Up to 6 unseen articles for your topics. Refresh for more matches. Links open the
            original article.
          </InfoPopover>
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
              <p>No new articles for your topics. Refresh or check again tomorrow.</p>
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
