import { describe, expect, it } from "vitest";
import { compareWeeks } from "@/lib/activity/weekly";
import { parseActivityDate, parseGoal } from "@/lib/activity/validation";
import { activityDate, ACTIVITY_DAY_MS, activityDayStart } from "@/lib/activity/calendar";
import type { ActivityDay } from "@/lib/activity/types";

function completeDays(start: string, count: number): ActivityDay[] {
  return Array.from({ length: count }, (_, index) => ({
    date: activityDate(new Date(activityDayStart(start).getTime() + index * ACTIVITY_DAY_MS)),
    count: 0,
    coverage: "complete",
  }));
}

describe("weekly comparisons", () => {
  it("deduplicates within each week and compares matching weekdays separately from the whole previous week", () => {
    const result = compareWeeks(
      [
        { id: "same", date: "2026-10-12" },
        { id: "same", date: "2026-10-13" },
        { id: "other", date: "2026-10-14" },
        { id: "same", date: "2026-10-05" },
        { id: "weekend", date: "2026-10-11" },
        { id: "future", date: "2026-10-15" },
      ],
      completeDays("2026-10-05", 10),
      new Date("2026-10-14T03:00:00Z"),
    );
    expect(result).toEqual({
      current: { start: "2026-10-12", end: "2026-10-15", count: 2, complete: true },
      previous: { start: "2026-10-05", end: "2026-10-12", count: 2, complete: true },
      previousToDate: { start: "2026-10-05", end: "2026-10-08", count: 1, complete: true },
    });
  });
  it("rolls into Monday at midnight IST and handles the year boundary", () => {
    const before = compareWeeks([], [], new Date("2026-01-04T18:29:59Z"));
    const after = compareWeeks(
      [{ id: "new", date: "2026-01-05" }],
      [],
      new Date("2026-01-04T18:30:00Z"),
    );
    expect(before.current).toMatchObject({ start: "2025-12-29", end: "2026-01-05" });
    expect(after.current).toMatchObject({ start: "2026-01-05", end: "2026-01-06", count: 1 });
    expect(after.previousToDate).toMatchObject({ start: "2025-12-29", end: "2025-12-30" });
  });
  it("does not treat missing or partial coverage as a proven zero", () => {
    const days = completeDays("2026-10-05", 10);
    days[0].coverage = "unknown";
    days.at(-1)!.coverage = "partial";
    const result = compareWeeks([], days, new Date("2026-10-14T03:00:00Z"));
    expect(result.current).toMatchObject({ count: 0, complete: false });
    expect(result.previousToDate.complete).toBe(false);
  });
});

describe("activity input validation", () => {
  it.each([null, "0000-01-01", "2026-02-30", "2026-2-03", "not-a-date", "2026-01-01T00:00:00Z"])(
    "rejects invalid day %s",
    (date) => {
      expect(() => parseActivityDate(date)).toThrow("valid date");
    },
  );
  it("accepts a leap day and validates bounded, separate platform targets", () => {
    expect(parseActivityDate("2024-02-29")).toBe("2024-02-29");
    expect(parseGoal({ platform: "gfg", weeklyTarget: 10 })).toEqual({
      platform: "gfg",
      weeklyTarget: 10,
    });
    expect(parseGoal({ platform: "leetcode", weeklyTarget: null }).weeklyTarget).toBeNull();
  });
  it.each([0, -1, 1.5, 1001, "5", undefined, true])(
    "rejects invalid weekly target %s",
    (weeklyTarget) => {
      expect(() => parseGoal({ platform: "leetcode", weeklyTarget })).toThrow("weekly target");
    },
  );
});
