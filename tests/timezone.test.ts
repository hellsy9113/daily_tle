import { describe, expect, it } from "vitest";
import { normalizeTimezone, localClock, localDayStart, localTime } from "@/lib/timezone";
import { getPreviousCalendarPeriod } from "@/lib/leetcode/calendar-periods";
import { activityDate, activityWindow } from "@/lib/activity/calendar";
import { observeAcceptedHistory } from "@/lib/activity/observations";

describe("account timezones", () => {
  it("defaults to India and canonicalizes its legacy alias", () => {
    expect(normalizeTimezone("Asia/Calcutta")).toBe("Asia/Kolkata");
    expect(localClock(new Date("2026-10-19T18:30:00Z")).date).toBe("2026-10-20");
  });
  it.each([null, "", "No/Such_Zone", "+05:30", "EST", 5])("rejects invalid zones %j", (value) => {
    expect(normalizeTimezone(value)).toBeNull();
  });
  it("uses the account's local date across UTC midnight", () => {
    const now = new Date("2026-10-20T03:00:00Z");
    expect(activityDate(now, "America/New_York")).toBe("2026-10-19");
    expect(activityDate(now, "Asia/Kolkata")).toBe("2026-10-20");
    expect(activityWindow(now, "America/New_York").today).toBe("2026-10-19");
  });
  it.each([
    ["2026-03-09T12:00:00Z", "2026-03-08T05:00:00.000Z", "2026-03-09T04:00:00.000Z", 23],
    ["2026-11-02T12:00:00Z", "2026-11-01T04:00:00.000Z", "2026-11-02T05:00:00.000Z", 25],
  ])("respects DST for %s", (instant, start, end, hours) => {
    const range = getPreviousCalendarPeriod("lastday", new Date(instant), "America/New_York");
    expect(range.start.toISOString()).toBe(start);
    expect(range.end.toISOString()).toBe(end);
    expect((range.end.getTime() - range.start.getTime()) / 3_600_000).toBe(hours);
  });
  it("schedules local morning time correctly on a DST transition day", () => {
    expect(localTime("2026-03-08", 510, "America/New_York").toISOString()).toBe(
      "2026-03-08T12:30:00.000Z",
    );
    expect(localTime("2026-11-01", 510, "America/New_York").toISOString()).toBe(
      "2026-11-01T13:30:00.000Z",
    );
    expect(localDayStart("2026-10-20", "Asia/Kolkata").toISOString()).toBe(
      "2026-10-19T18:30:00.000Z",
    );
  });
  it("retains separate accepts on different local days even when India sees the same day", () => {
    const result = observeAcceptedHistory(
      [
        {
          title: "Same",
          titleSlug: "same",
          timestamp: String(Date.parse("2026-10-19T03:30:00Z") / 1000),
        },
        {
          title: "Same",
          titleSlug: "same",
          timestamp: String(Date.parse("2026-10-19T04:30:00Z") / 1000),
        },
      ],
      new Date("2026-10-20T05:00:00Z"),
      "America/New_York",
    );
    expect(result.problems.map((p) => p.date)).toEqual(["2026-10-18", "2026-10-19"]);
    expect(result.timezone).toBe("America/New_York");
  });
});
