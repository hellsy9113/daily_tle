import { ApiError } from "@/lib/http/api-error";
import { isNonNegativeInteger, isRecord } from "@/lib/http/validation";
import { queryLeetCode } from "./client";
import { USER_PROFILE_QUERY } from "./queries";
import type { Difficulty, QuestionCount, UserProfileData, UserProfileSummary } from "./types";
import { isUserProfileData, parseUsername } from "./validation";

function countForDifficulty(counts: QuestionCount[], difficulty: Difficulty): number {
  return counts.find((entry) => entry.difficulty === difficulty)?.count ?? 0;
}

function parseSubmissionCalendar(value: string): Record<string, number> {
  let calendar: unknown;
  try {
    calendar = JSON.parse(value);
  } catch {
    throw new ApiError(502, "LeetCode returned an invalid submission calendar.");
  }
  if (!isRecord(calendar) || !Object.values(calendar).every(isNonNegativeInteger)) {
    throw new ApiError(502, "LeetCode returned an invalid submission calendar.");
  }
  return calendar as Record<string, number>;
}

export function formatUserProfile(data: UserProfileData): UserProfileSummary {
  const user = data.matchedUser;
  const solved = user.submitStats.acSubmissionNum;
  const questions = data.allQuestionsCount;
  return {
    totalSolved: countForDifficulty(solved, "All"),
    totalSubmissions: user.submitStats.totalSubmissionNum,
    totalQuestions: countForDifficulty(questions, "All"),
    easySolved: countForDifficulty(solved, "Easy"),
    totalEasy: countForDifficulty(questions, "Easy"),
    mediumSolved: countForDifficulty(solved, "Medium"),
    totalMedium: countForDifficulty(questions, "Medium"),
    hardSolved: countForDifficulty(solved, "Hard"),
    totalHard: countForDifficulty(questions, "Hard"),
    ranking: user.profile.ranking,
    contributionPoint: user.contributions.points,
    reputation: user.profile.reputation,
    submissionCalendar: parseSubmissionCalendar(user.submissionCalendar),
    recentSubmissions: data.recentSubmissionList,
    matchedUserStats: user.submitStats,
  };
}

export async function getUserProfile(username: string): Promise<UserProfileSummary> {
  const data = await queryLeetCode(USER_PROFILE_QUERY, { username: parseUsername(username) });
  if (isRecord(data) && data.matchedUser === null) {
    throw new ApiError(404, "LeetCode user was not found.");
  }
  if (!isUserProfileData(data)) {
    throw new ApiError(502, "LeetCode returned an invalid user profile.");
  }
  return formatUserProfile(data);
}
