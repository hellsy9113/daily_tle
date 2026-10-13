"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityChart } from "./activity-chart";
import type { TrackingStatus } from "./tracking-panel";
import type { ActivityResult } from "@/lib/activity/types";

async function read<T>(path: string, signal: AbortSignal): Promise<T> {
  let response: Response;
  let data: T;
  try {
    response = await fetch(path, { cache: "no-store", signal });
    data = await response.json();
  } catch {
    throw new Error("Could not refresh your activity. Please try again shortly.");
  }
  if (!response.ok)
    throw new Error(
      response.status === 401
        ? "Your session expired. Sign in again to continue."
        : "Could not refresh your activity. Please try again shortly.",
    );
  return data;
}

export function ActivityDashboard({
  initialStatus,
  botUrl,
}: {
  initialStatus: TrackingStatus;
  botUrl: string;
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
      read<TrackingStatus>("/api/tracking", controller.signal),
      read<ActivityResult>("/api/tracking/activity", controller.signal),
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
  }, []);
  useEffect(() => {
    void refresh();
    return () => request.current?.abort();
  }, [refresh]);
  useEffect(() => {
    if (!activity?.refreshing) return;
    const timer = setTimeout(() => void refresh(), 2000);
    return () => clearTimeout(timer);
  }, [activity, refresh]);

  const botStatus =
    status.status === "active"
      ? "Connected"
      : status.status === "paused"
        ? "Paused"
        : status.status === "blocked"
          ? "Blocked"
          : "Awaiting connection";
  const latest = status.lastDelivery;
  const reportStatus =
    latest?.status === "sent"
      ? "Delivered"
      : latest?.status === "failed"
        ? "Could not deliver"
        : latest?.status === "cancelled"
          ? "Paused"
          : "Pending";
  return (
    <div className="dashboard-layout">
      <section className="bot-status-panel" aria-label="Telegram bot status">
        <div className="bot-status-heading">
          <div>
            <p className="eyebrow">Daily tracking</p>
            <span className={`badge ${status.status === "active" ? "badge-active" : ""}`}>
              {botStatus}
            </span>
          </div>
          <div className="dashboard-actions">
            <a className="button secondary" href={botUrl} target="_blank" rel="noopener noreferrer">
              Open bot <span aria-hidden="true">↗</span>
            </a>
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
            <dt>LeetCode username</dt>
            <dd className="mono">{status.username}</dd>
          </div>
          <div>
            <dt>Daily report</dt>
            <dd>8:30–9:30 a.m. IST</dd>
          </div>
          <div>
            <dt>Latest report</dt>
            <dd>
              {latest ? `${latest.reportDate} · ${reportStatus}` : "Scheduled for the next morning"}
            </dd>
          </div>
        </dl>
        <p className="field-help">
          {status.status === "blocked"
            ? "Unblock the bot and send /start to resume reports."
            : status.status === "paused"
              ? "Send /start in the bot to resume reports."
              : "Send /stop in the bot to pause, or /start to resume."}{" "}
          Delayed reports may arrive by 10:30 a.m. IST.
        </p>
      </section>

      <section
        className="activity-panel"
        aria-labelledby="activity-title"
        aria-busy={busy || activity?.refreshing}
      >
        <div className="activity-heading">
          <div>
            <p className="eyebrow">Last 365 days · Asia/Kolkata</p>
            <h1 id="activity-title">Your practice, day by day.</h1>
          </div>
          <p className="field-help">Distinct Accepted problems per day.</p>
        </div>
        {error && (
          <p className="inline-error" role="alert">
            {error} <a href="/tracking">Sign-in &amp; setup</a>
          </p>
        )}
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
            <ActivityChart days={activity.days} />
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
            <p className="activity-coverage">
              {activity.mayBeIncomplete
                ? "Public history is limited. Hatched squares have no available history; dotted squares are partial. Counts and streaks are the minimum we can confirm."
                : "Available history covers every displayed day."}{" "}
              The same problem counts once per day, and once in the unique-problems total.
            </p>
            {activity.lastSyncedAt && (
              <p className="field-help">
                Last checked{" "}
                {new Intl.DateTimeFormat("en-IN", {
                  dateStyle: "medium",
                  timeStyle: "short",
                  timeZone: "Asia/Kolkata",
                }).format(new Date(activity.lastSyncedAt))}{" "}
                IST.
              </p>
            )}
          </>
        )}
      </section>
    </div>
  );
}
