"use client";

import Link from "next/link";
import { ActivityInsights } from "./activity-insights";
import { ActivityPanelHeader } from "./activity-panel-header";
import { useJsonResource } from "@/lib/http/use-json-resource";
import { featurePaths } from "@/lib/features/catalog";
import type { GfgProgress } from "@/lib/gfg/types";

const formatter = new Intl.DateTimeFormat("en-IN", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Kolkata",
});

export function GfgActivityPanel({ username }: { username: string | null }) {
  const {
    data: progress,
    busy,
    error,
    refresh,
  } = useJsonResource<GfgProgress>(username ? `/api/gfg/${encodeURIComponent(username)}` : null, {
    poll: true,
  });
  return (
    <section
      className="activity-panel gfg-panel"
      aria-labelledby="gfg-activity-title"
      aria-busy={busy || progress?.refreshing}
    >
      {username ? (
        <ActivityPanelHeader
          controls={
            <Link className="text-button" href={featurePaths.gfg}>
              Manage service
            </Link>
          }
          titleId="gfg-activity-title"
          platform="GFG"
          username={username}
          busy={busy}
          onRefresh={() => void refresh()}
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
