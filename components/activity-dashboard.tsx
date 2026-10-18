"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityInsights } from "./activity-insights";
import { ActivityPanelHeader } from "./activity-panel-header";
import type { TrackingStatus } from "@/lib/tracking/types";
import { accountStatusLabels, deliveryStatusLabels } from "@/lib/tracking/presentation";
import { ApiError } from "@/lib/http/api-error";
import { requestJson } from "@/lib/http/client";
import { featurePaths, statusPaths } from "@/lib/tracking/platforms";
import type { ActivityPlatform } from "@/lib/activity/types";
import type { ActivityResult } from "@/lib/activity/types";

async function readDashboardData<T>(path: string, signal: AbortSignal): Promise<T> {
  try {
    return await requestJson<T>(path, { signal });
  } catch (error) {
    throw new Error(
      error instanceof ApiError && error.status === 401
        ? "Your session expired. Sign in again to continue."
        : "Could not refresh your activity. Please try again shortly.",
    );
  }
}

const syncDateFormatter = new Intl.DateTimeFormat("en-IN", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Kolkata",
});

export function ActivityDashboard({
  initialStatus,
  botUrl,
  leetcodeEnabled = true,
  children,
  statusPlatform = leetcodeEnabled ? "leetcode" : "gfg",
}: {
  initialStatus: TrackingStatus;
  botUrl: string;
  leetcodeEnabled?: boolean;
  children?: React.ReactNode;
  statusPlatform?: ActivityPlatform;
}) {
  const [status, setStatus] = useState(initialStatus);
  const [activity, setActivity] = useState<ActivityResult | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const request = useRef<AbortController | null>(null);
  const refresh = useCallback(() => {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    return Promise.allSettled([
      readDashboardData<TrackingStatus>(statusPaths[statusPlatform], controller.signal),
      leetcodeEnabled
        ? readDashboardData<ActivityResult>("/api/tracking/activity", controller.signal)
        : Promise.resolve(null),
    ]).then((results) => {
      if (controller.signal.aborted) return;
      setError("");
      if (results[0].status === "fulfilled") setStatus(results[0].value);
      if (results[1].status === "fulfilled") setActivity(results[1].value);
      const failure = results.find((result) => result.status === "rejected");
      if (failure?.status === "rejected")
        setError(
          failure.reason instanceof Error
            ? failure.reason.message
            : "Could not refresh. Try again.",
        );
      setBusy(false);
    });
  }, [leetcodeEnabled, statusPlatform]);
  useEffect(() => {
    void refresh();
    return () => request.current?.abort();
  }, [refresh]);
  useEffect(() => {
    if (!activity?.refreshing) return;
    const timer = setTimeout(() => void refresh(), 2000);
    return () => clearTimeout(timer);
  }, [activity, refresh]);

  const latest = status.lastDelivery;
  return (
    <div className="dashboard-layout">
      <h1 className="sr-only">Your practice, day by day.</h1>
      <section className="bot-status-panel" aria-label="Telegram bot status">
        <div className="bot-status-heading">
          <div>
            <p className="eyebrow">Daily tracking</p>
            <span className={`badge ${status.status === "active" ? "badge-active" : ""}`}>
              {accountStatusLabels[status.status]}
            </span>
          </div>
          <div className="dashboard-actions">
            {status.connected ? (
              <a
                className="button secondary"
                href={botUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                Open bot <span aria-hidden="true">↗</span>
              </a>
            ) : (
              <a className="button secondary" href={featurePaths[statusPlatform]}>
                Connect Daily Grind <span aria-hidden="true">→</span>
              </a>
            )}
            <button
              className="text-button"
              onClick={() => {
                setBusy(true);
                setError("");
                void refresh();
              }}
              disabled={busy}
            >
              {busy ? "Refreshing…" : "Refresh"}
            </button>
          </div>
        </div>
        <dl className="bot-status-details">
          <div>
            <dt>Daily report</dt>
            <dd>8:30–9:30 a.m. IST</dd>
          </div>
          <div>
            <dt>Latest report</dt>
            <dd>
              {latest
                ? `${latest.reportDate} · ${deliveryStatusLabels[latest.status]}`
                : status.connected
                  ? "Scheduled for the next morning"
                  : "Connect Daily Grind to schedule reports"}
            </dd>
          </div>
        </dl>
        <p className="field-help">
          {!status.connected
            ? "Your service is enabled. Connect Daily Grind once to receive Telegram recaps for all enabled services."
            : status.status === "blocked"
              ? "Unblock the bot and send /start to resume reports."
              : status.status === "paused"
                ? "Send /start in the bot to resume reports."
                : "Send /stop in the bot to pause, or /start to resume."}{" "}
          Delayed reports may arrive by 10:30 a.m. IST.
        </p>
      </section>

      {error && (
        <p className="inline-error" role="alert">
          {error} <a href="/feature">Sign-in &amp; services</a>
        </p>
      )}

      {leetcodeEnabled && (
        <section
          className="activity-panel"
          aria-labelledby="activity-title"
          aria-busy={busy || activity?.refreshing}
        >
          <ActivityPanelHeader
            titleId="activity-title"
            platform="LeetCode"
            username={activity?.username ?? initialStatus.username}
            busy={busy}
            onRefresh={() => {
              setBusy(true);
              setError("");
              void refresh();
            }}
          >
            <p>
              Each square counts distinct Accepted problems for that day. The same problem counts
              once per day, and once in the unique-problems total.
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
                  Last checked {syncDateFormatter.format(new Date(activity.lastSyncedAt))} IST.
                </p>
              )}
            </>
          )}
        </section>
      )}
      {children}
    </div>
  );
}
