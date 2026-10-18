"use client";

import { ServiceControl } from "./service-control";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityInsights } from "./activity-insights";
import { ActivityPanelHeader } from "./activity-panel-header";
import { requestJson } from "@/lib/http/client";
import type { HackerRankProgress } from "@/lib/hackerrank/types";

const formatter = new Intl.DateTimeFormat("en-IN", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Kolkata",
});
export function HackerRankActivityPanel({
  username,
  registrationId,
}: {
  username: string;
  registrationId?: string;
}) {
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
      aria-busy={busy || progress?.refreshing}
    >
      <ActivityPanelHeader
        controls={
          registrationId ? (
            <ServiceControl platform="hackerrank" paused={false} registrationId={registrationId} />
          ) : undefined
        }
        titleId="hackerrank-activity-title"
        platform="HackerRank"
        username={username}
        busy={busy}
        onRefresh={() => {
          setBusy(true);
          setError("");
          void refresh();
        }}
      >
        <p>
          Counts use saved public solved-challenge timestamps. Public history may be incomplete and
          first-ever solve dates are not guaranteed.
        </p>
        <p>
          Saved unique problems reflects the challenges collected so far. HackerRank does not expose
          a verified overall solve total or difficulty breakdown in this feed.
        </p>
      </ActivityPanelHeader>
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
          <p className="activity-footer">
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
