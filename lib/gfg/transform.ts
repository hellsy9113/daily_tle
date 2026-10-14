import { ApiError } from "@/lib/http/api-error";
import { isNonNegativeInteger, isRecord } from "@/lib/http/validation";
import type { GfgDifficulty, GfgProblem, GfgProfile } from "./types";

const difficulties: GfgDifficulty[] = ["School", "Basic", "Easy", "Medium", "Hard"];

/** Plain upstream timestamps have no timezone; retain them without guessing an offset. */
export function gfgTimestamp(value: unknown): string | null {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value)
  )
    return null;
  const instant = Date.parse(value);
  const date = new Date(`${value.slice(0, 10)}T00:00:00Z`);
  return Number.isFinite(instant) &&
    Number.isFinite(date.getTime()) &&
    date.toISOString().slice(0, 10) === value.slice(0, 10)
    ? new Date(instant).toISOString()
    : null;
}

export function normalizeGfgProfile(
  username: string,
  profile: unknown,
  submissions: unknown,
  now: Date,
): GfgProfile {
  if (
    !isRecord(profile) ||
    !isRecord(profile.data) ||
    !isNonNegativeInteger(profile.data.total_problems_solved)
  )
    throw new ApiError(502, "GFG returned an invalid public profile.");
  if (
    !isRecord(submissions) ||
    submissions.status !== "success" ||
    !isRecord(submissions.result) ||
    !isNonNegativeInteger(submissions.count)
  )
    throw new ApiError(502, "GFG returned an invalid solved-problem history.");
  const unique = new Map<string, GfgProblem>();
  for (const [difficulty, bucket] of Object.entries(submissions.result)) {
    if (!difficulties.includes(difficulty as GfgDifficulty) || !isRecord(bucket))
      throw new ApiError(502, "GFG returned an invalid difficulty breakdown.");
    for (const value of Object.values(bucket)) {
      if (
        !isRecord(value) ||
        typeof value.slug !== "string" ||
        !/^[A-Za-z0-9_-]+$/.test(value.slug) ||
        typeof value.pname !== "string" ||
        !value.pname.trim()
      )
        throw new ApiError(502, "GFG returned an invalid solved problem.");
      // The verified endpoint is a solved inventory, not an attempt log.
      if (
        value.status !== undefined &&
        !["Accepted", "accepted", "Solved", "solved"].includes(String(value.status))
      )
        continue;
      const acceptedAt = gfgTimestamp(value.user_subtime);
      const previous = unique.get(value.slug);
      if (previous && (!acceptedAt || (previous.acceptedAt && previous.acceptedAt <= acceptedAt)))
        continue;
      unique.set(value.slug, {
        id: value.slug,
        title: value.pname.trim(),
        difficulty: difficulty as GfgDifficulty,
        url: `https://www.geeksforgeeks.org/problems/${encodeURIComponent(value.slug)}/1`,
        status: "Accepted",
        acceptedAt,
        reportedSubmissionTime: typeof value.user_subtime === "string" ? value.user_subtime : null,
      });
    }
  }
  const problems = [...unique.values()];
  const difficultyBreakdown = { School: 0, Basic: 0, Easy: 0, Medium: 0, Hard: 0 };
  for (const problem of problems) difficultyBreakdown[problem.difficulty]++;
  return {
    platform: "gfg",
    username,
    totalSolved: profile.data.total_problems_solved,
    difficultyBreakdown,
    problems,
    historyComplete:
      problems.length === profile.data.total_problems_solved &&
      problems.length === submissions.count,
    checkedAt: now.toISOString(),
  };
}
