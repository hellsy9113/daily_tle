import type { ActivityDay } from "@/lib/activity/types";

export type GfgDifficulty = "School" | "Basic" | "Easy" | "Medium" | "Hard";
export type GfgDifficultyBreakdown = Record<GfgDifficulty, number>;

export interface GfgProblem {
  id: string;
  title: string;
  difficulty: GfgDifficulty;
  url: string;
  status: "Accepted";
  acceptedAt: string | null;
  reportedSubmissionTime: string | null;
}

export interface GfgProfile {
  platform: "gfg";
  username: string;
  totalSolved: number;
  difficultyBreakdown: GfgDifficultyBreakdown;
  historyComplete: boolean;
  checkedAt: string;
  problems: GfgProblem[];
}

export type GfgProfileSummary = Omit<GfgProfile, "problems">;
export interface StoredGfgProblem extends GfgProblem {
  firstObservedAt: string;
  baseline: boolean;
}

export interface GfgProgress extends GfgProfileSummary {
  timezone: "Asia/Kolkata";
  dateBasis: "earliest_available_timestamp" | "observation";
  solvedToday: number | null;
  solvedThisWeek: number | null;
  dailySolved: { date: string; count: number }[] | null;
  weeklySolved: { weekStart: string; count: number }[] | null;
  observedToday: number;
  observedThisWeek: number;
  days: ActivityDay[];
  snapshots: { date: string; totalSolved: number }[];
  refreshing: boolean;
  refreshFailed: boolean;
  limitations: string[];
  solvedProblems?: GfgProblem[];
}

export interface GfgQuery {
  period: "daily" | "weekly" | "all";
  includeProblems: boolean;
  startDate?: string;
  endDate?: string;
}
