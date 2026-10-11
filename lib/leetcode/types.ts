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
