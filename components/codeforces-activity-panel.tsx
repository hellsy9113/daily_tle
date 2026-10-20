"use client";

import Link from "next/link";
import { ActivityInsights } from "./activity-insights";
import { ActivityPanelHeader } from "./activity-panel-header";
import { useJsonResource } from "@/lib/http/use-json-resource";
import { featurePaths } from "@/lib/features/catalog";
import type { CodeforcesProgress } from "@/lib/codeforces/types";

const formatter = new Intl.DateTimeFormat("en-IN", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Kolkata",
});

export function CodeforcesActivityPanel({ username }: { username: string }) {
  const {
    data: progress,
    busy,
    error,
    refresh,
  } = useJsonResource<CodeforcesProgress>(
    username ? `/api/codeforces/${encodeURIComponent(username)}` : null,
    { poll: true },
  );
  return (
    <section
      className="activity-panel"
      aria-labelledby="codeforces-activity-title"
      aria-busy={busy || progress?.refreshing}
    >
      <ActivityPanelHeader
        controls={
          <Link className="text-button" href={featurePaths.codeforces}>
            Manage service
          </Link>
        }
        titleId="codeforces-activity-title"
        platform="Codeforces"
        username={username}
        busy={busy}
        onRefresh={() => void refresh()}
      >
        <p>
          Counts use public Accepted submissions. Re-solving a problem on another day counts for
          that day; repeated accepts on the same day count once.
        </p>
        <p>
          Saved unique problems deduplicates the available history. Large histories may be partial,
          and missing public submissions are not a zero-solve day.
        </p>
      </ActivityPanelHeader>
      {error && (
        <p className="inline-error" role="alert">
          {error} <Link href={featurePaths.codeforces}>Codeforces setup</Link>
        </p>
      )}
      {!progress ? (
        <p className="activity-empty" role="status">
          {busy
            ? "Loading your Codeforces progress…"
            : "Codeforces progress is unavailable. Use Refresh Codeforces to try again."}
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
              <dd>
                {progress.historyComplete ? progress.solvedToday : `≥ ${progress.solvedToday}`}
              </dd>
            </div>
            <div>
              <dt>Solved this week</dt>
              <dd>
                {progress.historyComplete
                  ? progress.solvedThisWeek
                  : `≥ ${progress.solvedThisWeek}`}
              </dd>
            </div>
            <div>
              <dt>Contest rating</dt>
              <dd>{progress.rating ?? "Unrated"}</dd>
            </div>
            <div>
              <dt>Highest rating</dt>
              <dd>{progress.maxRating ?? "Unrated"}</dd>
            </div>
          </dl>
          <ActivityInsights
            platform="codeforces"
            days={progress.days}
            mode="accepted"
            version={progress.checkedAt}
          />
          {progress.refreshing && (
            <p className="field-help" role="status">
              Syncing Codeforces public progress…
            </p>
          )}
          {progress.refreshFailed && (
            <p className="inline-error" role="status">
              Codeforces could not be refreshed. Showing your saved progress.
            </p>
          )}
          <p className="activity-footer">
            Last checked {formatter.format(new Date(progress.checkedAt))} IST.{" "}
            <a
              href={`https://codeforces.com/profile/${encodeURIComponent(username)}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              Open public Codeforces profile
            </a>
          </p>
        </>
      )}
    </section>
  );
}
