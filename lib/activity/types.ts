export type ActivityCoverage = "complete" | "partial" | "unknown";
export type ActivityPlatform = "leetcode" | "gfg" | "hackerrank";
export type ActivityBasis = "accepted" | "observed" | "solved";

export interface SavedProblem {
  id: string;
  title: string;
  url: string;
  difficulty?: string;
}

export interface ActivityDayDetails {
  date: string;
  basis: ActivityBasis;
  problems: SavedProblem[];
}

export interface ActivityWeek {
  start: string;
  end: string;
  count: number;
  complete: boolean;
}

export interface WeeklyComparison {
  current: ActivityWeek;
  previous: ActivityWeek;
  previousToDate: ActivityWeek;
}

export interface WeeklyGoal {
  weeklyTarget: number | null;
}

export interface ActivityDay {
  date: string;
  count: number;
  coverage: ActivityCoverage;
}

export interface ActivityResult {
  username: string;
  timezone: "Asia/Kolkata";
  start: string;
  end: string;
  days: ActivityDay[];
  weekly: WeeklyComparison;
  uniqueQuestions: number;
  activeDays: number;
  currentStreak: number | null;
  currentStreakMayBeLonger: boolean;
  longestStreak: number;
  longestStreakMayBeLonger: boolean;
  mayBeIncomplete: boolean;
  lastSyncedAt: string | null;
  refreshing: boolean;
  refreshFailed: boolean;
}

export interface AcceptedProblemObservation {
  date: string;
  titleSlug: string;
  title: string;
  acceptedAt: Date;
}

export interface DayObservation {
  date: string;
  from: Date | null;
  until: Date;
}

export interface ActivityObservation {
  problems: AcceptedProblemObservation[];
  days: DayObservation[];
  checkedAt: Date;
}
