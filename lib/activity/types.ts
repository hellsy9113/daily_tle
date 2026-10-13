export type ActivityCoverage = "complete" | "partial" | "unknown";

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
