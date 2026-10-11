export interface LeetcodeSubmission{
     title: string;
  titleSlug: string;
  timestamp: string; // Note: LeetCode returns this as a stringified Unix timestamp
  statusDisplay: string; // e.g., "Accepted", "Wrong Answer"
  lang: string;
}

export  interface LeetcodeWeeklyQuestion {
  recentSubmissionList: LeetcodeSubmission[];
}