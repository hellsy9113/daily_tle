import type { RecentSubmissions, Submission, UserProfileData } from "@/lib/leetcode/types";

export const submission: Submission = {
  title: "Two Sum",
  titleSlug: "two-sum",
  timestamp: "1710000000",
  statusDisplay: "Accepted",
  lang: "python3",
};

export const recentSubmissions: RecentSubmissions = {
  recentSubmissionList: [submission],
};

export function userProfileData(): UserProfileData {
  return {
    matchedUser: {
      submitStats: {
        acSubmissionNum: [
          { difficulty: "Hard", count: 50, submissions: 60 },
          { difficulty: "All", count: 350, submissions: 400 },
          { difficulty: "Medium", count: 200, submissions: 220 },
          { difficulty: "Easy", count: 100, submissions: 120 },
        ],
        totalSubmissionNum: [{ difficulty: "All", count: 400, submissions: 600 }],
      },
      submissionCalendar: '{"1710000000":2}',
      profile: { ranking: 1234, reputation: 10 },
      contributions: { points: 20 },
    },
    allQuestionsCount: [
      { difficulty: "Medium", count: 2000 },
      { difficulty: "Easy", count: 1000 },
      { difficulty: "Hard", count: 500 },
      { difficulty: "All", count: 3500 },
    ],
    recentSubmissionList: [submission],
  };
}
