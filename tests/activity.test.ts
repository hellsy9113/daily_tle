import { describe, expect, it } from "vitest";
import {
  activityDate,
  activityWindow,
  activityWeeks,
  activityLevel,
  streaks,
} from "@/lib/activity/calendar";
import { observeAcceptedHistory, observeSolvedPeriod } from "@/lib/activity/observations";
import type { AcceptedSubmission } from "@/lib/leetcode/types";
import type { ActivityDay } from "@/lib/activity/types";

const accepted = (titleSlug: string, instant: string): AcceptedSubmission => ({
  title: titleSlug,
  titleSlug,
  timestamp: String(Date.parse(instant) / 1000),
});
const day = (
  date: string,
  count: number,
  coverage: ActivityDay["coverage"] = "complete",
): ActivityDay => ({ date, count, coverage });

describe("Accepted activity calendar", () => {
  it.each([
    ["2026-12-31T18:29:59Z", "2026-12-31"],
    ["2026-12-31T18:30:00Z", "2027-01-01"],
    ["2024-02-28T18:30:00Z", "2024-02-29"],
    ["2024-02-29T18:30:00Z", "2024-03-01"],
  ])("maps %s to IST day %s", (instant, date) =>
    expect(activityDate(new Date(instant))).toBe(date),
  );
  it("returns 365 consecutive days, including today across a leap year", () => {
    const range = activityWindow(new Date("2024-03-01T00:00:00Z"));
    expect(range.start).toBe("2023-03-03");
    expect(range.end).toBe("2024-03-02");
    expect(range.dates).toHaveLength(365);
    expect(range.dates).toContain("2024-02-29");
    expect(range.dates.at(-1)).toBe("2024-03-01");
  });
  it("pads weekly columns from Sunday through Saturday", () => {
    const weeks = activityWeeks([day("2026-10-12", 1), day("2026-10-13", 2)]);
    expect(weeks).toHaveLength(1);
    expect(weeks[0]).toHaveLength(7);
    expect(weeks[0][0]).toBeNull();
    expect(weeks[0][1]?.date).toBe("2026-10-12");
  });
  it("increases intensity with Accepted counts", () => {
    expect([0, 1, 2, 3, 4, 7, 8, 20].map(activityLevel)).toEqual([0, 1, 2, 2, 3, 3, 4, 4]);
  });
  it("keeps yesterday's streak until today finishes and breaks at a known zero", () => {
    expect(
      streaks([
        day("2026-10-10", 0),
        day("2026-10-11", 1),
        day("2026-10-12", 3),
        day("2026-10-13", 0),
      ]),
    ).toMatchObject({ currentStreak: 2, currentStreakMayBeLonger: false, longestStreak: 2 });
  });
  it("does not claim zero streaks where history is unknown", () => {
    expect(
      streaks([day("2026-10-12", 0, "unknown"), day("2026-10-13", 0, "partial")]),
    ).toMatchObject({ currentStreak: null, longestStreakMayBeLonger: true });
    expect(
      streaks([day("2026-10-11", 0, "unknown"), day("2026-10-12", 1), day("2026-10-13", 1)]),
    ).toMatchObject({ currentStreak: 2, currentStreakMayBeLonger: true });
  });
});

describe("Accepted observations", () => {
  const now = new Date("2026-10-14T03:00:00Z");
  it("deduplicates within a day while retaining re-solves on different days", () => {
    const result = observeAcceptedHistory(
      [
        accepted("two-sum", "2026-10-12T19:00:00Z"),
        accepted("two-sum", "2026-10-13T02:00:00Z"),
        accepted("two-sum", "2026-10-13T19:00:00Z"),
        accepted("another", "2026-10-14T02:00:00Z"),
      ],
      now,
    );
    expect(result.problems).toHaveLength(3);
    expect(result.problems[0]).toMatchObject({
      date: "2026-10-13",
      titleSlug: "two-sum",
      acceptedAt: new Date("2026-10-13T02:00:00Z"),
    });
    expect(result.problems[1].date).toBe("2026-10-14");
  });
  it("includes the range start and excludes the captured clock and future entries", () => {
    const range = activityWindow(now);
    const result = observeAcceptedHistory(
      [
        accepted("first", `${range.start}T00:00:00+05:30`),
        accepted(
          "too-old",
          new Date(Date.parse(`${range.start}T00:00:00+05:30`) - 1000).toISOString(),
        ),
        accepted("now", now.toISOString()),
        accepted("future", "2026-10-15T02:00:00Z"),
      ],
      now,
    );
    expect(result.problems.map((item) => item.titleSlug)).toEqual(["first"]);
    expect(result.days.at(-1)?.until).toEqual(now);
  });
  it("does not infer coverage from an empty history", () => {
    expect(observeAcceptedHistory([], now)).toMatchObject({
      problems: [],
      days: [{ date: "2026-10-14", from: null, until: now }],
    });
  });
  it("retains the oldest timestamp as the coverage boundary without claiming earlier days", () => {
    const result = observeAcceptedHistory([accepted("first", "2026-10-12T18:30:00Z")], now);
    expect(result.days.map((item) => item.date)).toEqual(["2026-10-13", "2026-10-14"]);
    expect(result.days[0].from).toEqual(new Date("2026-10-12T18:30:00Z"));
  });
  it.each([true, false])(
    "reuses complete or incomplete report coverage (%s)",
    (mayBeIncomplete) => {
      const result = observeSolvedPeriod(
        {
          username: "user",
          period: "lastday",
          timezone: "Asia/Kolkata",
          start: "2026-10-12T18:30:00Z",
          end: "2026-10-13T18:30:00Z",
          count: 0,
          questions: [],
          mayBeIncomplete,
        },
        now,
      );
      expect(result.days[0]).toEqual({
        date: "2026-10-13",
        from: mayBeIncomplete ? null : new Date("2026-10-12T18:29:59.999Z"),
        until: new Date("2026-10-13T18:30:00Z"),
      });
    },
  );
});
