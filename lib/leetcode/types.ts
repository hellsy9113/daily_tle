export type Difficulty = "All" | "Easy" | "Medium" | "Hard";

export interface QuestionCount {
  difficulty: Difficulty;
  count: number;
}

export interface SubmissionCount extends QuestionCount {
  submissions: number;
}

export interface Submission {
  title: string;
  titleSlug: string;
  /** LeetCode supplies Unix seconds as a string. */
  timestamp: string;
  statusDisplay: string;
  lang: string;
}

export interface RecentSubmissions {
  recentSubmissionList: Submission[];
}

export interface AcceptedSubmission {
  title: string;
  titleSlug: string;
  /** Unix seconds, retained in LeetCode's string format. */
  timestamp: string;
}

export type SolvedPeriod = "lastweek" | "lastday";

export interface SolvedQuestionsResult {
  username: string;
  period: SolvedPeriod;
  timezone: "Asia/Kolkata";
  /** UTC ISO boundaries: start is inclusive and end is exclusive. */
  start: string;
  end: string;
  count: number;
  questions: AcceptedSubmission[];
  mayBeIncomplete: boolean;
}

export interface SubmissionStats {
  acSubmissionNum: SubmissionCount[];
  totalSubmissionNum: SubmissionCount[];
}

export interface UserProfileData {
  matchedUser: {
    submitStats: SubmissionStats;
    submissionCalendar: string;
    profile: { ranking: number; reputation: number };
    contributions: { points: number };
  };
  allQuestionsCount: QuestionCount[];
  recentSubmissionList: Submission[];
}

export interface UserProfileSummary {
  totalSolved: number;
  totalSubmissions: SubmissionCount[];
  totalQuestions: number;
  easySolved: number;
  totalEasy: number;
  mediumSolved: number;
  totalMedium: number;
  hardSolved: number;
  totalHard: number;
  ranking: number;
  /** Legacy public field name, retained for API compatibility. */
  contributionPoint: number;
  reputation: number;
  submissionCalendar: Record<string, number>;
  recentSubmissions: Submission[];
  matchedUserStats: SubmissionStats;
}
