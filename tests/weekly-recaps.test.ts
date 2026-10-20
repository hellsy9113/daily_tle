import { dispatchTracking } from "@/lib/tracking/dispatch";
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { weeklyReportPeriod, isSundayInIst } from "@/lib/tracking/weekly-period";
import { GET as weeklyCron } from "@/app/api/cron/tracking/weekly/route";
import { GET as weeklyRetry } from "@/app/api/cron/tracking/weekly-retry/route";
import { formatGfgDailyReport } from "@/lib/gfg/format-report";
import { formatHackerRankDailyReport } from "@/lib/hackerrank/format-report";
import type { GfgProfile } from "@/lib/gfg/types";
import { hackerRankProfile } from "./hackerrank-fixtures";

const sunday = new Date("2026-10-18T17:30:00Z");
const range = weeklyReportPeriod(sunday);
afterEach(() => vi.useRealTimers());

describe("Sunday weekly recap boundaries and schedule", () => {
  it("freezes Monday midnight through Sunday 23:00 IST for both primary and recovery", () => {
    expect(range.start.toISOString()).toBe("2026-10-11T18:30:00.000Z");
    expect(range.end.toISOString()).toBe("2026-10-18T17:30:00.000Z");
    expect(range.reportDate).toBe("2026-10-12");
    expect(weeklyReportPeriod(new Date("2026-10-18T18:00:00Z"))).toEqual(range);
  });
  it.each([
    ["2026-10-17T18:29:59Z", false],
    ["2026-10-17T18:30:00Z", true],
    ["2026-10-18T18:29:59Z", true],
    ["2026-10-18T18:30:00Z", false],
  ])("uses the IST Sunday at %s", (instant, expected) => {
    expect(isSundayInIst(new Date(instant))).toBe(expected);
  });
  it("handles month and year boundaries", () => {
    const week = weeklyReportPeriod(new Date("2027-01-03T17:30:00Z"));
    expect(week.start.toISOString()).toBe("2026-12-27T18:30:00.000Z");
    expect(week.end.toISOString()).toBe("2027-01-03T17:30:00.000Z");
  });
  it("uses a frequent timezone-aware scheduler for all local notification windows", () => {
    const config = JSON.parse(readFileSync("vercel.json", "utf8"));
    expect(config.crons).toEqual([{ path: "/api/cron/tracking/tick", schedule: "*/15 * * * *" }]);
  });
  it.each([weeklyCron, weeklyRetry])(
    "requires cron authentication before any weekly work",
    async (handler) => {
      vi.stubEnv("CRON_SECRET", "cron-test");
      expect(
        (await handler(new Request("https://example.com/api/cron/tracking/weekly"))).status,
      ).toBe(401);
    },
  );
  it.each(["2026-10-18T17:29:59Z", "2026-10-19T17:30:00Z"])(
    "skips unscheduled time %s without requiring database or bot access",
    async (instant) => {
      vi.useFakeTimers({ toFake: ["Date"] });
      vi.setSystemTime(new Date(instant));
      vi.stubEnv("CRON_SECRET", "cron-test");
      expect(await dispatchTracking({ now: new Date(instant), cadence: "weekly" })).toEqual({
        skipped: true,
        sent: 0,
        failed: 0,
      });
    },
  );
});

describe("weekly platform messages", () => {
  it("shows saved GFG observations for the week and excludes the initial import and final hour", () => {
    const profile: GfgProfile = {
      platform: "gfg",
      username: "gfg_user",
      totalSolved: 3,
      checkedAt: sunday.toISOString(),
      historyComplete: false,
      difficultyBreakdown: { School: 0, Basic: 0, Easy: 3, Medium: 0, Hard: 0 },
      problems: [],
    };
    const saved = [
      {
        id: "old",
        title: "Initial import",
        baseline: true,
        firstObservedAt: "2026-10-13T00:00:00Z",
      },
      {
        id: "week",
        title: "Observed midweek",
        baseline: false,
        firstObservedAt: "2026-10-14T00:00:00Z",
      },
      {
        id: "late",
        title: "After cutoff",
        baseline: false,
        firstObservedAt: "2026-10-18T17:31:00Z",
      },
    ].map((problem) => ({
      ...problem,
      difficulty: "Easy" as const,
      status: "Accepted" as const,
      acceptedAt: null,
      reportedSubmissionTime: null,
      url: `https://example.com/${problem.id}`,
    }));
    const message = formatGfgDailyReport(profile, saved, range.end, range).join("\n");
    expect(message).toContain("GFG weekly recap");
    expect(message).toContain("Observed midweek");
    expect(message).not.toContain("Initial import");
    expect(message).not.toContain("After cutoff");
    expect(message).toContain("solve dates unverified");
    expect(message).toContain("incomplete");
    expect(message).not.toContain("yesterday");
  });
  it("includes HackerRank solves across the week, while preserving daily filtering", () => {
    const profile = hackerRankProfile("hr_user", ["monday", "saturday", "late"], sunday);
    profile.problems.forEach((problem, index) => {
      problem.solvedAt = ["2026-10-12T00:00:00Z", "2026-10-17T00:00:00Z", "2026-10-18T17:31:00Z"][
        index
      ];
    });
    const weekly = formatHackerRankDailyReport(profile, [], range.end, range).join("\n");
    expect(weekly).toContain("HackerRank weekly recap");
    expect(weekly).toContain(profile.problems[0].title);
    expect(weekly).toContain(profile.problems[1].title);
    expect(weekly).not.toContain(profile.problems[2].title);
    const daily = formatHackerRankDailyReport(profile, [], range.end).join("\n");
    expect(daily).not.toContain(profile.problems[0].title);
    expect(daily).toContain("daily recap");
  });
  it("provides an honest empty weekly message without changing silent daily behavior", () => {
    const profile = hackerRankProfile("hr_user", [], sunday);
    expect(formatHackerRankDailyReport(profile, [], range.end)).toEqual([]);
    expect(formatHackerRankDailyReport(profile, [], range.end, range).join("\n")).toContain(
      "0 unique solved challenges found in saved public activity",
    );
  });
});
