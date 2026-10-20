import type { ActivityDay } from "@/lib/activity/types";

export interface HackerRankProblem {
  id: string;
  title: string;
  slug: string;
  contest: string;
  url: string;
  solvedAt: string;
}
export interface HackerRankProfile {
  platform: "hackerrank";
  username: string;
  problems: HackerRankProblem[];
  historyComplete: boolean;
  checkedAt: string;
}
export type HackerRankSummary = Omit<HackerRankProfile, "problems">;
export interface StoredHackerRankProblem extends HackerRankProblem {
  firstObservedAt: string;
  baseline: boolean;
}
export interface HackerRankProgress extends HackerRankSummary {
  timezone: "Asia/Kolkata";
  savedSolved: number;
  solvedToday: number;
  solvedThisWeek: number;
  days: ActivityDay[];
  refreshing: boolean;
  refreshFailed: boolean;
}
