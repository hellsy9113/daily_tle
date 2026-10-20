"use client";
import { useTimezone } from "./timezone-provider";

import { ActivityInsights } from "./activity-insights";
import { ActivityPanelHeader } from "./activity-panel-header";
import { featurePaths } from "@/lib/features/catalog";
import { useJsonResource, dashboardError } from "@/lib/http/use-json-resource";
import type { ActivityResult } from "@/lib/activity/types";

export function LeetcodeActivityPanel({ username }: { username: string }) {
  const timezone = useTimezone();
  const syncDateFormatter = new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: timezone,
  });
  const {
    data: activity,
    busy,
    error,
    refresh,
  } = useJsonResource<ActivityResult>("/api/tracking/activity", {
    poll: true,
    errorMessage: dashboardError,
  });
  return (
    <>
      {error && (
        <p className="inline-error" role="alert">
          {error} <a href="/feature">Sign-in &amp; services</a>
        </p>
      )}
      <section
        className="activity-panel"
        aria-labelledby="activity-title"
        aria-busy={busy || activity?.refreshing}
      >
        <ActivityPanelHeader
          titleId="activity-title"
          controls={
            <a className="text-button" href={featurePaths.leetcode}>
              Manage service
            </a>
          }
          platform="LeetCode"
          username={activity?.username ?? username}
          busy={busy}
          onRefresh={() => void refresh()}
        >
          <p>
            Each square counts distinct Accepted problems for that day. The same problem counts once
            per day, and once in the unique-problems total.
          </p>
          <p>
            {activity?.mayBeIncomplete !== false
              ? "Public history is limited. Counts and streaks are the minimum we can confirm."
              : "Available history covers every displayed day."}
          </p>
        </ActivityPanelHeader>
        {!activity ? (
          <div className="activity-empty" role="status">
            {busy
              ? "Loading your Accepted activity…"
              : "Activity is unavailable right now. Use Refresh to try again."}
          </div>
        ) : (
          <>
            <dl className="activity-stats">
              <div>
                <dt>Unique problems</dt>
                <dd>
                  {activity.mayBeIncomplete ? "≥ " : ""}
                  {activity.uniqueQuestions}
                </dd>
              </div>
              <div>
                <dt>Active days</dt>
                <dd>
                  {activity.mayBeIncomplete ? "≥ " : ""}
                  {activity.activeDays}
                </dd>
              </div>
              <div>
                <dt>Current streak</dt>
                <dd>
                  {activity.currentStreak === null
                    ? "—"
                    : `${activity.currentStreakMayBeLonger ? "≥ " : ""}${activity.currentStreak}`}
                  <span> days</span>
                </dd>
              </div>
              <div>
                <dt>Longest streak</dt>
                <dd>
                  {activity.longestStreakMayBeLonger ? "≥ " : ""}
                  {activity.longestStreak}
                  <span> days</span>
                </dd>
              </div>
            </dl>
            <ActivityInsights
              platform="leetcode"
              days={activity.days}
              version={activity.lastSyncedAt}
            />
            {activity.refreshing && (
              <p className="field-help" role="status">
                Syncing recent Accepted activity…
              </p>
            )}
            {activity.refreshFailed && (
              <p className="inline-error" role="status">
                LeetCode could not be refreshed. Showing your saved activity.
              </p>
            )}
            {!activity.refreshing && activity.activeDays === 0 && (
              <p className="activity-empty-note">
                No Accepted problems found in the history available so far. Your next solve is a
                fresh start.
              </p>
            )}
            {activity.lastSyncedAt && (
              <p className="activity-footer">
                Last checked {syncDateFormatter.format(new Date(activity.lastSyncedAt))} ({timezone}
                ).
              </p>
            )}
          </>
        )}
      </section>
    </>
  );
}
