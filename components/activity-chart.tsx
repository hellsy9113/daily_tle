"use client";

import { useEffect, useRef, useState } from "react";
import { activityLevel, activityWeeks } from "@/lib/activity/calendar";
import type { ActivityDay } from "@/lib/activity/types";

const dateLabel = (date: string) =>
  new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${date}T12:00:00Z`));

export function describeActivityDay(day: ActivityDay) {
  const count = `${day.count} unique Accepted ${day.count === 1 ? "problem" : "problems"}`;
  return `${dateLabel(day.date)}: ${day.coverage === "unknown" ? "history unavailable" : `${count}${day.coverage === "partial" ? " found; history incomplete" : ""}`}`;
}

export function ActivityChart({ days }: { days: ActivityDay[] }) {
  const [selectedDate, setSelectedDate] = useState(days.at(-1)?.date ?? "");
  const selected = days.find((day) => day.date === selectedDate) ?? days.at(-1);
  const buttons = useRef(new Map<string, HTMLButtonElement>());
  const scroller = useRef<HTMLDivElement>(null);
  const weeks = activityWeeks(days);
  const latestDate = days.at(-1)?.date;
  useEffect(() => {
    if (scroller.current) scroller.current.scrollLeft = scroller.current.scrollWidth;
  }, [latestDate]);

  function navigate(event: React.KeyboardEvent, day: ActivityDay) {
    const index = days.findIndex((item) => item.date === day.date);
    const weekday = new Date(`${day.date}T12:00:00Z`).getUTCDay();
    const target =
      event.key === "ArrowLeft"
        ? index - 7
        : event.key === "ArrowRight"
          ? index + 7
          : event.key === "ArrowUp"
            ? index - (weekday > 0 ? 1 : 0)
            : event.key === "ArrowDown"
              ? index + (weekday < 6 ? 1 : 0)
              : event.key === "Home"
                ? 0
                : event.key === "End"
                  ? days.length - 1
                  : null;
    if (target === null) return;
    event.preventDefault();
    const next = days[Math.max(0, Math.min(days.length - 1, target))];
    if (next) buttons.current.get(next.date)?.focus();
  }

  return (
    <>
      <p id="calendar-help" className="sr-only">
        Each square is one day in Asia/Kolkata. Use left and right arrow keys for weeks, up and down
        for days, and Home or End for the first or last day. Select a day for its count.
      </p>
      <div className="calendar-scroll" ref={scroller}>
        <div
          className="calendar"
          role="group"
          aria-label="Accepted problems by day"
          aria-describedby="calendar-help"
          style={{ gridTemplateColumns: `28px repeat(${weeks.length}, var(--calendar-cell))` }}
        >
          <div className="calendar-months" aria-hidden="true">
            <span />
            {weeks.map((week, index) => {
              const first =
                week.find((day) => day?.date.endsWith("-01")) ??
                (index === 0 ? week.find(Boolean) : null);
              return (
                <span key={index}>
                  {first
                    ? new Intl.DateTimeFormat("en-IN", { month: "short", timeZone: "UTC" }).format(
                        new Date(`${first.date}T12:00:00Z`),
                      )
                    : ""}
                </span>
              );
            })}
          </div>
          <div className="calendar-weekdays" aria-hidden="true">
            {["", "Mon", "", "Wed", "", "Fri", ""].map((day, i) => (
              <span key={i}>{day}</span>
            ))}
          </div>
          {weeks.map((week, index) => (
            <div className="calendar-week" key={index}>
              {week.map((day, weekday) =>
                day ? (
                  <button
                    type="button"
                    key={day.date}
                    ref={(element) => {
                      if (element) buttons.current.set(day.date, element);
                      else buttons.current.delete(day.date);
                    }}
                    className={`calendar-day activity-level-${activityLevel(day.count)} ${day.coverage === "unknown" ? "activity-unknown" : ""} ${day.coverage === "partial" ? "activity-partial" : ""}`}
                    tabIndex={day.date === selected?.date ? 0 : -1}
                    aria-label={describeActivityDay(day)}
                    aria-pressed={day.date === selected?.date}
                    title={describeActivityDay(day)}
                    onFocus={() => setSelectedDate(day.date)}
                    onClick={() => setSelectedDate(day.date)}
                    onKeyDown={(event) => navigate(event, day)}
                  />
                ) : (
                  <span key={weekday} />
                ),
              )}
            </div>
          ))}
        </div>
      </div>
      <div className="calendar-caption">
        <p role="status" aria-live="polite">
          {selected ? describeActivityDay(selected) : "No activity history yet."}
        </p>
        <div
          className="calendar-legend"
          aria-label="Color scale: zero, one, two to three, four to seven, eight or more problems"
        >
          <span>Less</span>
          {[0, 1, 2, 3, 4].map((level) => (
            <span
              key={level}
              className={`legend-cell activity-level-${level}`}
              aria-hidden="true"
            />
          ))}
          <span>More</span>
        </div>
      </div>
    </>
  );
}
