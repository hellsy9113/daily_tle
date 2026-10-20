import type { ActivityDay } from "@/lib/activity/types";

/** Public accepted submission metadata only; source code is never imported. */
export interface CodeforcesProblem {
  submissionId: number;
  id: string;
  contestId: number;
  index: string;
  title: string;
  url: string;
  solvedAt: string;
  rating: number | null;
  tags: string[];
}

export interface CodeforcesProfile {
  platform: "codeforces";
  username: string;
  rating: number | null;
  maxRating: number | null;
  rank: string | null;
  problems: CodeforcesProblem[];
  /** Allows a later rejudge of a fetched submission to remove an obsolete acceptance. */
  checkedSubmissionIds?: number[];
  historyComplete: boolean;
  /** Earliest boundary actually covered by the fetched submission feed. */
  historyStart: string | null;
  checkedAt: string;
}

export type CodeforcesSummary = Omit<CodeforcesProfile, "problems" | "checkedSubmissionIds">;

export interface StoredCodeforcesProblem extends CodeforcesProblem {
  firstObservedAt: string;
  baseline: boolean;
}

export interface CodeforcesSnapshot {
  date: string;
  historyStart: Date | null;
  checkedAt: Date;
  historyComplete: boolean;
}

export interface CodeforcesProgress extends CodeforcesSummary {
  timezone: "Asia/Kolkata";
  savedSolved: number;
  solvedToday: number;
  solvedThisWeek: number;
  days: ActivityDay[];
  refreshing: boolean;
  refreshFailed: boolean;
}
