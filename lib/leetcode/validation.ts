import { ApiError } from "@/lib/http/api-error";
import { isFiniteNumber, isNonNegativeInteger, isRecord } from "@/lib/http/validation";
import type { QuestionCount, Submission, SubmissionCount, UserProfileData } from "./types";

export function parseUsername(value: string): string {
  const username = value.trim();
  if (!username || /\s/.test(username)) {
    throw new ApiError(400, "Provide a LeetCode username without spaces.");
  }
  return username;
}

export function isSubmission(value: unknown): value is Submission {
  return (
    isRecord(value) &&
    typeof value.title === "string" &&
    typeof value.titleSlug === "string" &&
    typeof value.timestamp === "string" &&
    typeof value.statusDisplay === "string" &&
    typeof value.lang === "string"
  );
}

function isQuestionCount(value: unknown): value is QuestionCount {
  return (
    isRecord(value) &&
    typeof value.difficulty === "string" &&
    ["All", "Easy", "Medium", "Hard"].includes(value.difficulty) &&
    isNonNegativeInteger(value.count)
  );
}

function isSubmissionCount(value: unknown): value is SubmissionCount {
  return (
    isQuestionCount(value) && "submissions" in value && isNonNegativeInteger(value.submissions)
  );
}

export function isUserProfileData(value: unknown): value is UserProfileData {
  if (
    !isRecord(value) ||
    !isRecord(value.matchedUser) ||
    !Array.isArray(value.allQuestionsCount) ||
    !value.allQuestionsCount.every(isQuestionCount) ||
    !Array.isArray(value.recentSubmissionList) ||
    !value.recentSubmissionList.every(isSubmission)
  ) {
    return false;
  }

  const user = value.matchedUser;
  return (
    typeof user.submissionCalendar === "string" &&
    isRecord(user.profile) &&
    isFiniteNumber(user.profile.ranking) &&
    isFiniteNumber(user.profile.reputation) &&
    isRecord(user.contributions) &&
    isFiniteNumber(user.contributions.points) &&
    isRecord(user.submitStats) &&
    Array.isArray(user.submitStats.acSubmissionNum) &&
    user.submitStats.acSubmissionNum.every(isSubmissionCount) &&
    Array.isArray(user.submitStats.totalSubmissionNum) &&
    user.submitStats.totalSubmissionNum.every(isSubmissionCount)
  );
}
