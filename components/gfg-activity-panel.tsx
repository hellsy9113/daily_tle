"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityChart } from "./activity-chart";
import { requestJson } from "@/lib/http/client";
import type { GfgProgress } from "@/lib/gfg/types";

export function GfgActivityPanel({ username }: { username: string | null }) {
  const [progress, setProgress] = useState<GfgProgress | null>(null);
  const [busy, setBusy] = useState(Boolean(username));
  const [error, setError] = useState("");
  const request = useRef<AbortController | null>(null);
  const refresh = useCallback(() => {
    if (!username) return Promise.resolve();
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    return requestJson<GfgProgress>(`/api/gfg/${encodeURIComponent(username)}`, {
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
          setError(
            failure instanceof Error ? failure.message : "Could not refresh GFG. Try again.",
          );
      })
      .finally(() => {
        if (!controller.signal.aborted) setBusy(false);
      });
  }, [username]);
  useEffect(() => {
    if (username) void refresh();
    return () => request.current?.abort();
  }, [username, refresh]);
  useEffect(() => {
    if (!progress?.refreshing) return;
    const timer = setTimeout(() => void refresh(), 2000);
    return () => clearTimeout(timer);
  }, [progress, refresh]);
  return (
    <section
      className="activity-panel gfg-panel"
      aria-labelledby="gfg-activity-title"
      aria-busy={busy}
    >
      <div className="activity-heading">
        <div>
          <p className="eyebrow">GeeksforGeeks · Separate progress</p>
          <h2 id="gfg-activity-title">
            {username ? `GFG · ${username}` : "Add your GeeksforGeeks practice"}
          </h2>
        </div>
        {username ? (
          <button
            className="button secondary"
            onClick={() => {
              setBusy(true);
              setError("");
              void refresh();
            }}
            disabled={busy}
          >
            {busy ? "Refreshing GFG…" : "Refresh GFG"}
          </button>
        ) : (
          <Link className="button primary" href="/feature">
            Enable GFG tracking <span aria-hidden="true">→</span>
          </Link>
        )}
      </div>
      {!username ? (
        <p className="muted">
          Enable this feature once to add a separate GFG calendar and daily recap through Daily
          Grind.
        </p>
      ) : (
        <>
          {error && (
            <p className="inline-error" role="alert">
              {error} <Link href="/feature">GFG setup</Link>
            </p>
          )}
          {!progress ? (
            <p className="activity-empty" role="status">
              {busy
                ? "Loading your GFG progress…"
                : "GFG progress is unavailable. Use Refresh GFG to try again."}
            </p>
          ) : (
            <>
              <dl className="activity-stats">
                <div>
                  <dt>Total solved</dt>
                  <dd>{progress.totalSolved}</dd>
                </div>
                <div>
                  <dt>Solved today</dt>
                  <dd>{progress.solvedToday === null ? "—" : `≥ ${progress.solvedToday}`}</dd>
                </div>
                <div>
                  <dt>Solved this week</dt>
                  <dd>{progress.solvedThisWeek === null ? "—" : `≥ ${progress.solvedThisWeek}`}</dd>
                </div>
                <div>
                  <dt>Newly observed this week</dt>
                  <dd>{progress.observedThisWeek}</dd>
                </div>
              </dl>
              <p className="field-help">
                {Object.entries(progress.difficultyBreakdown)
                  .map(([difficulty, count]) => `${difficulty}: ${count}`)
                  .join(" · ")}
              </p>
              <p className="eyebrow">
                {progress.dateBasis === "observation"
                  ? "New problems observed since registration · Asia/Kolkata"
                  : "Available accepted timestamps · Asia/Kolkata"}
              </p>
              <ActivityChart
                days={progress.days}
                mode={progress.dateBasis === "observation" ? "observed" : "accepted"}
                label="GeeksforGeeks progress by day"
              />
              {progress.refreshing && (
                <p className="field-help" role="status">
                  Syncing GFG public progress…
                </p>
              )}
              {progress.refreshFailed && (
                <p className="inline-error" role="status">
                  GFG could not be refreshed. Showing your saved progress.
                </p>
              )}
              <p className="activity-coverage">
                {progress.dateBasis === "observation"
                  ? "This calendar records when additional solved problems were first observed. It does not assign guessed historical solve dates. The initial inventory is a baseline."
                  : "Counts use the earliest timezone-qualified timestamps available. GFG does not guarantee complete first-accept history."}{" "}
                A dash means the daily or weekly solve count is unavailable.
              </p>
              <p className="field-help">
                Last checked{" "}
                {new Intl.DateTimeFormat("en-IN", {
                  dateStyle: "medium",
                  timeStyle: "short",
                  timeZone: "Asia/Kolkata",
                }).format(new Date(progress.checkedAt))}{" "}
                IST.{" "}
                <a
                  href={`https://www.geeksforgeeks.org/profile/${encodeURIComponent(username)}/`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Open public GFG profile
                </a>
              </p>
            </>
          )}
        </>
      )}
    </section>
  );
}
