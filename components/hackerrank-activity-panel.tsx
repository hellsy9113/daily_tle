"use client";

import Link from "next/link";
import { ActivityInsights } from "./activity-insights";
import { ActivityPanelHeader } from "./activity-panel-header";
import { useJsonResource } from "@/lib/http/use-json-resource";
import { featurePaths } from "@/lib/features/catalog";
import type { HackerRankProgress } from "@/lib/hackerrank/types";

const formatter = new Intl.DateTimeFormat("en-IN", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Kolkata",
});
export function HackerRankActivityPanel({ username }: { username: string }) {
  const {
    data: progress,
    busy,
    error,
    refresh,
  } = useJsonResource<HackerRankProgress>(
    username ? `/api/hackerrank/${encodeURIComponent(username)}` : null,
    { poll: true },
  );
  return (
    <section
      className="activity-panel"
      aria-labelledby="hackerrank-activity-title"
      aria-busy={busy || progress?.refreshing}
    >
      <ActivityPanelHeader
        controls={
          <Link className="text-button" href={featurePaths.hackerrank}>
            Manage service
          </Link>
        }
        titleId="hackerrank-activity-title"
        platform="HackerRank"
        username={username}
        busy={busy}
        onRefresh={() => void refresh()}
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
