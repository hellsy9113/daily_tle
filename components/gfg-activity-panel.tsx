"use client";

import { ServiceControl } from "./service-control";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityInsights } from "./activity-insights";
import { ActivityPanelHeader } from "./activity-panel-header";
import { requestJson } from "@/lib/http/client";
import type { GfgProgress } from "@/lib/gfg/types";

const formatter = new Intl.DateTimeFormat("en-IN", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Kolkata",
});

export function GfgActivityPanel({
  username,
  registrationId,
}: {
  username: string | null;
  registrationId?: string;
}) {
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
      aria-busy={busy || progress?.refreshing}
    >
      {username ? (
        <ActivityPanelHeader
          controls={
            registrationId ? (
              <ServiceControl platform="gfg" paused={false} registrationId={registrationId} />
            ) : undefined
          }
          titleId="gfg-activity-title"
          platform="GFG"
          username={username}
          busy={busy}
          onRefresh={() => {
            setBusy(true);
            setError("");
            void refresh();
          }}
        >
          <p>
            {progress?.dateBasis !== "earliest_available_timestamp"
              ? "This calendar records when additional solved problems were first observed. It does not assign guessed historical solve dates. The initial inventory is a baseline and is excluded from newly observed activity."
              : "Counts use the earliest timezone-qualified accepted timestamps available. GFG does not guarantee complete first-accept history."}
          </p>
          <p>
            A dash means the daily or weekly solve count is unavailable. Newly observed activity
            does not establish when a problem was solved.
          </p>
        </ActivityPanelHeader>
      ) : (
        <div className="activity-heading">
          <h2 id="gfg-activity-title">Add your GeeksforGeeks practice</h2>
          <Link className="button primary" href="/feature">
            Enable GFG tracking <span aria-hidden="true">→</span>
          </Link>
        </div>
      )}
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
              <p className="activity-breakdown">
                {Object.entries(progress.difficultyBreakdown)
                  .map(([difficulty, count]) => `${difficulty}: ${count}`)
                  .join(" · ")}
              </p>
              <ActivityInsights
                platform="gfg"
                days={progress.days}
                version={progress.checkedAt}
                mode={progress.dateBasis === "observation" ? "observed" : "accepted"}
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
              <p className="activity-footer">
                Last checked {formatter.format(new Date(progress.checkedAt))} IST.{" "}
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
