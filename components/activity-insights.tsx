"use client";

import { useEffect, useId, useState } from "react";
import { ActivityChart } from "./activity-chart";
import { requestJson } from "@/lib/http/client";
import type {
  ActivityBasis,
  ActivityDay,
  ActivityDayDetails,
  ActivityPlatform,
} from "@/lib/activity/types";

const fullDateFormatter = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

export function ActivityInsights({
  days,
  platform,
  mode = "accepted",
  version,
}: {
  days: ActivityDay[];
  platform: ActivityPlatform;
  mode?: ActivityBasis;
  version: string | null;
}) {
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const selected = days.find((day) => day.date === selectedDate);
  const detailsId = useId();
  return (
    <>
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
          {/* <p className="field-help" role="status">
            {details.basis === "observed"
              ? "Newly observed on this date; solve dates are unverified. The initial import is excluded."
              : platform === "gfg"
                ? "Based on available accepted timestamps; first-ever solve dates are not guaranteed."
                : "Saved Accepted problems. Missing public history may leave this list incomplete."}
          </p> */}
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
