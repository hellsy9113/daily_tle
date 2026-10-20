"use client";
import Link from "next/link";
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
  const unavailable = error.startsWith("Access unavailable.");
  return (
    <section
      className="activity-panel articles-panel"
      aria-labelledby="daily-articles-title"
      aria-busy={busy}
    >
      <div className="activity-heading">
        <div>
          <p className="eyebrow">Daily reading · Asia/Kolkata</p>
          <h2 id="daily-articles-title">Daily Articles</h2>
        </div>
        <div className="activity-panel-actions">
          <button className="button secondary" disabled={busy} onClick={() => void refresh()}>
            {busy ? "Loading…" : "Retry / refresh"}
          </button>
          <InfoPopover label="Daily Articles information">
            Your first selection each day stays fixed. Recent unseen articles come first, then
            unseen evergreen reading. Sources refresh in the background; opening this page never
            fetches publishers. Links open the original article in a new tab.
          </InfoPopover>
          <Link className="text-button" href="/feature?platform=articles">
            Manage service
          </Link>
        </div>
      </div>
      {error && (
        <p className="inline-error" role="alert">
          {error}
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
                again tomorrow, or manage your topics. We will not repeat old selections or invent
                articles.
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
