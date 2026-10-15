"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityInsights } from "./activity-insights";
import { requestJson } from "@/lib/http/client";
import type { HackerRankProgress } from "@/lib/hackerrank/types";

const formatter = new Intl.DateTimeFormat("en-IN", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Kolkata",
});
export function HackerRankActivityPanel({ username }: { username: string }) {
  const [progress, setProgress] = useState<HackerRankProgress | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const request = useRef<AbortController | null>(null);
  const refresh = useCallback(() => {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    return requestJson<HackerRankProgress>(`/api/hackerrank/${encodeURIComponent(username)}`, {
      signal: controller.signal,
    })
      .then((next) => {
        if (!controller.signal.aborted) {
          setProgress(next);
          setError("");
        }
      })
      .catch((failure: unknown) => {
        if (!controller.signal.aborted)
          setError(failure instanceof Error ? failure.message : "Could not refresh HackerRank.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setBusy(false);
      });
  }, [username]);
  useEffect(() => {
    void refresh();
    return () => request.current?.abort();
  }, [refresh]);
  useEffect(() => {
    if (!progress?.refreshing) return;
    const timer = setTimeout(() => void refresh(), 2000);
    return () => clearTimeout(timer);
  }, [progress, refresh]);
  return (
    <section
      className="activity-panel"
      aria-labelledby="hackerrank-activity-title"
      aria-busy={busy}
    >
      <div className="activity-heading">
        <div>
          <p className="eyebrow">HackerRank · Separate progress</p>
          <h2 id="hackerrank-activity-title">HackerRank · {username}</h2>
        </div>
        <button
          className="button secondary"
          disabled={busy}
          onClick={() => {
            setBusy(true);
            setError("");
            void refresh();
          }}
        >
          {busy ? "Refreshing HackerRank…" : "Refresh HackerRank"}
        </button>
      </div>
      {error && (
        <p className="inline-error" role="alert">
          {error} <Link href="/feature?platform=hackerrank">HackerRank setup</Link>
        </p>
      )}
      {!progress ? (
        <p className="activity-empty" role="status">
          {busy
            ? "Loading your HackerRank progress…"
            : "HackerRank progress is unavailable. Use Refresh HackerRank to try again."}
        </p>
      ) : (
        <>
          <dl className="activity-stats">
            <div>
              <dt>Saved unique problems</dt>
              <dd>{progress.savedSolved}</dd>
            </div>
            <div>
              <dt>Solved today</dt>
              <dd>≥ {progress.solvedToday}</dd>
            </div>
            <div>
              <dt>Solved this week</dt>
              <dd>≥ {progress.solvedThisWeek}</dd>
            </div>
          </dl>
          <p className="eyebrow">Available solved activity · Asia/Kolkata</p>
          <ActivityInsights
            platform="hackerrank"
            days={progress.days}
            mode="solved"
            version={progress.checkedAt}
          />
          {progress.refreshing && (
            <p className="field-help" role="status">
              Syncing HackerRank public progress…
            </p>
          )}
          {progress.refreshFailed && (
            <p className="inline-error" role="status">
              HackerRank could not be refreshed. Showing your saved progress.
            </p>
          )}
          <p className="activity-coverage">
            Counts use available public solved-challenge timestamps. Public history may be
            incomplete and first-ever solve dates are not guaranteed. Hatched dates have no
            available history; counts are lower bounds. HackerRank does not expose a verified
            overall solve total or difficulty breakdown in this feed.
          </p>
          <p className="field-help">
            Last checked {formatter.format(new Date(progress.checkedAt))} IST.{" "}
            <a
              href={`https://www.hackerrank.com/profile/${encodeURIComponent(username)}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              Open public HackerRank profile
            </a>
          </p>
        </>
      )}
    </section>
  );
}
