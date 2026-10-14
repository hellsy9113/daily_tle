"use client";

import { useEffect, useId, useRef, useState } from "react";
import { ActivityChart } from "./activity-chart";
import { requestJson } from "@/lib/http/client";
import { ACTIVITY_DAY_MS, activityDate, activityDayStart } from "@/lib/activity/calendar";
import type {
  ActivityBasis,
  ActivityDay,
  ActivityDayDetails,
  ActivityPlatform,
  WeeklyComparison,
  WeeklyGoal,
} from "@/lib/activity/types";

const dateFormatter = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  month: "short",
  timeZone: "UTC",
});
const fullDateFormatter = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});
const formatDate = (date: string) => dateFormatter.format(new Date(`${date}T12:00:00Z`));
const lastDate = (end: string) =>
  activityDate(new Date(activityDayStart(end).getTime() - ACTIVITY_DAY_MS));

export function ActivityInsights({
  days,
  weekly,
  platform,
  mode = "accepted",
  version,
}: {
  days: ActivityDay[];
  weekly: WeeklyComparison;
  platform: ActivityPlatform;
  mode?: ActivityBasis;
  version: string | null;
}) {
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const selected = days.find((day) => day.date === selectedDate);
  const detailsId = useId();
  const difference = weekly.current.count - weekly.previousToDate.count;
  const comparable = weekly.current.complete && weekly.previousToDate.complete;
  const count = (value: number, complete: boolean) =>
    `${mode === "accepted" && !complete ? "≥ " : ""}${value}`;
  return (
    <>
      <div className="weekly-summary">
        <h3>{mode === "observed" ? "Weekly observations" : "Weekly practice"}</h3>
        <dl className="weekly-stats">
          <div>
            <dt>This week so far</dt>
            <dd>{count(weekly.current.count, weekly.current.complete)}</dd>
            <span>
              {formatDate(weekly.current.start)}–{formatDate(lastDate(weekly.current.end))}
            </span>
          </div>
          <div>
            <dt>Last week</dt>
            <dd>{count(weekly.previous.count, weekly.previous.complete)}</dd>
            <span>
              {formatDate(weekly.previous.start)}–{formatDate(lastDate(weekly.previous.end))}
            </span>
          </div>
          <div>
            <dt>Same days last week</dt>
            <dd>{count(weekly.previousToDate.count, weekly.previousToDate.complete)}</dd>
            <span>
              {formatDate(weekly.previousToDate.start)}–
              {formatDate(lastDate(weekly.previousToDate.end))}
            </span>
          </div>
        </dl>
        <p className="field-help">
          {mode === "observed"
            ? `${difference === 0 ? "The same number of newly observed problems as on the same days last week." : `${Math.abs(difference)} ${difference < 0 ? "fewer" : "more"} newly observed problems than on the same days last week.`} Observation totals depend on when your profile was checked; they are not verified solve dates.`
            : comparable
              ? difference === 0
                ? "The same number of unique problems as on the same days last week."
                : `${Math.abs(difference)} ${difference < 0 ? "fewer" : "more"} unique problems than on the same days last week.`
              : "Incomplete history makes these counts lower bounds. A reliable increase or decrease cannot yet be determined."}{" "}
          Weeks run Monday–Sunday in IST. Today is still in progress. Each problem counts once per
          week.
        </p>
        <WeeklyGoalPanel platform={platform} count={weekly.current.count} mode={mode} />
      </div>
      <ActivityChart
        days={days}
        mode={mode}
        label={platform === "gfg" ? "GeeksforGeeks progress by day" : "Accepted problems by day"}
        onSelectDay={(day) => setSelectedDate(day.date)}
        detailsId={detailsId}
      />
      <div id={detailsId} className="day-details">
        {selected ? (
          <DayProblems
            key={`${platform}:${selected.date}:${version}`}
            platform={platform}
            day={selected}
          />
        ) : (
          <p className="field-help">Select a calendar day to see its saved problems and links.</p>
        )}
      </div>
    </>
  );
}

function DayProblems({ platform, day }: { platform: ActivityPlatform; day: ActivityDay }) {
  const headingId = useId();
  const [details, setDetails] = useState<ActivityDayDetails | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    void requestJson<ActivityDayDetails>(
      `/api/tracking/activity/day?platform=${platform}&date=${day.date}`,
      { signal: controller.signal },
    )
      .then((next) => {
        if (!controller.signal.aborted) setDetails(next);
      })
      .catch((failure: unknown) => {
        if (!controller.signal.aborted)
          setError(failure instanceof Error ? failure.message : "Could not load saved problems.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setBusy(false);
      });
    return () => controller.abort();
  }, [platform, day.date, attempt]);
  return (
    <div role="region" aria-labelledby={headingId} aria-busy={busy}>
      <h3 id={headingId}>
        Saved problems · {fullDateFormatter.format(new Date(`${day.date}T12:00:00Z`))}
      </h3>
      {busy && (
        <p className="field-help" role="status">
          Loading saved problems…
        </p>
      )}
      {error && (
        <p className="inline-error" role="alert">
          {error}{" "}
          <button
            className="text-button"
            disabled={busy}
            onClick={() => {
              setError("");
              setBusy(true);
              setAttempt((value) => value + 1);
            }}
          >
            Retry
          </button>
        </p>
      )}
      {details && (
        <>
          <p className="field-help" role="status">
            {details.basis === "observed"
              ? "Newly observed on this date; solve dates are unverified. The initial import is excluded."
              : platform === "gfg"
                ? "Based on available accepted timestamps; first-ever solve dates are not guaranteed."
                : "Saved Accepted problems. Missing public history may leave this list incomplete."}
          </p>
          {details.problems.length ? (
            <ul className="day-problems">
              {details.problems.map((problem) => (
                <li key={problem.id}>
                  <a href={problem.url} target="_blank" rel="noopener noreferrer">
                    {problem.title}
                    <span className="sr-only"> (opens in a new tab)</span>
                    <span aria-hidden="true"> ↗</span>
                  </a>
                  {problem.difficulty && <span className="badge">{problem.difficulty}</span>}
                </li>
              ))}
            </ul>
          ) : (
            <p className="field-help">
              {details.basis === "observed"
                ? "No new problems were observed on this date. This does not establish a zero-solve day."
                : day.coverage === "complete"
                  ? "No Accepted problems were recorded for this day."
                  : "No saved problems for this date. Public history may be missing."}
            </p>
          )}
        </>
      )}
    </div>
  );
}

function WeeklyGoalPanel({
  platform,
  count,
  mode,
}: {
  platform: ActivityPlatform;
  count: number;
  mode: ActivityBasis;
}) {
  const inputId = useId();
  const helpId = useId();
  const request = useRef<AbortController | null>(null);
  const [goal, setGoal] = useState<WeeklyGoal | null>(null);
  const [target, setTarget] = useState("5");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    request.current = controller;
    void requestJson<WeeklyGoal>(`/api/tracking/goal?platform=${platform}`, {
      signal: controller.signal,
    })
      .then((next) => {
        if (!controller.signal.aborted) {
          setGoal(next);
          setTarget(String(next.weeklyTarget ?? 5));
          setLoadFailed(false);
        }
      })
      .catch((failure: unknown) => {
        if (!controller.signal.aborted) {
          setError(
            failure instanceof Error ? failure.message : "Could not load your weekly target.",
          );
          setLoadFailed(true);
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => {
      controller.abort();
      request.current?.abort();
    };
  }, [platform, attempt]);

  async function save(weeklyTarget: number | null) {
    setSaving(true);
    setError("");
    setMessage("");
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    try {
      const next = await requestJson<WeeklyGoal>("/api/tracking/goal", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ platform, weeklyTarget }),
        signal: controller.signal,
      });
      if (!controller.signal.aborted) {
        setGoal(next);
        setMessage(
          weeklyTarget === null
            ? "Weekly target removed."
            : "Weekly target saved for your account.",
        );
      }
    } catch (failure) {
      if (!controller.signal.aborted)
        setError(failure instanceof Error ? failure.message : "Could not save your weekly target.");
    } finally {
      if (!controller.signal.aborted) setSaving(false);
    }
  }

  const weeklyTarget = goal?.weeklyTarget;
  const validTarget = /^\d+$/.test(target) && Number(target) >= 1 && Number(target) <= 1000;
  return (
    <div className="weekly-goal" aria-busy={loading || saving}>
      <h4>{mode === "observed" ? "Weekly observation target" : "Weekly problem target"}</h4>
      {weeklyTarget != null && (
        <>
          <p>
            {count} / {weeklyTarget} {mode === "observed" ? "newly observed" : "saved unique"}{" "}
            problems
            {count >= weeklyTarget ? " · Target reached!" : ` · ${weeklyTarget - count} to go`}
          </p>
          <progress
            value={Math.min(count, weeklyTarget)}
            max={weeklyTarget}
            aria-label={`${platform === "gfg" ? "GFG" : "LeetCode"} weekly goal progress`}
          />
        </>
      )}
      <form
        className="goal-form"
        onSubmit={(event) => {
          event.preventDefault();
          if (validTarget && !loading && !saving && !loadFailed) void save(Number(target));
        }}
      >
        <label htmlFor={inputId}>Problems per week</label>
        <input
          id={inputId}
          type="number"
          min={1}
          max={1000}
          step={1}
          value={target}
          onChange={(event) => setTarget(event.target.value)}
          required
          disabled={loading || saving || loadFailed}
          aria-describedby={helpId}
        />
        <button
          className="button secondary"
          type="submit"
          disabled={loading || saving || loadFailed || !validTarget}
        >
          {loading ? "Loading target…" : saving ? "Saving…" : "Save target"}
        </button>
        {weeklyTarget != null && (
          <button
            className="text-button"
            type="button"
            onClick={() => void save(null)}
            disabled={loading || saving}
          >
            Remove target
          </button>
        )}
      </form>
      <p id={helpId} className="field-help">
        Optional, saved to your account, and repeated each week.{" "}
        {mode === "observed"
          ? "GFG progress counts newly observed problems, not verified solve dates."
          : "Progress uses saved unique problems; incomplete history can undercount."}
      </p>
      {error && (
        <p className="inline-error" role="alert">
          {error}{" "}
          {loadFailed && (
            <button
              className="text-button"
              onClick={() => {
                setError("");
                setLoading(true);
                setAttempt((value) => value + 1);
              }}
              disabled={loading}
            >
              Retry target
            </button>
          )}
        </p>
      )}
      {message && (
        <p className="field-help" role="status">
          {message}
        </p>
      )}
    </div>
  );
}
