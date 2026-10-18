import { ACCEPTED_HISTORY_LIMIT, getAcceptedHistory } from "./accepted-history";
import type { RecentSolvedQuestions } from "./types";

export async function getRecentSolvedQuestions(
  username: string,
  now = new Date(),
): Promise<RecentSolvedQuestions> {
  const history = await getAcceptedHistory(username);
  const unique = new Map<string, RecentSolvedQuestions["questions"][number]>();
  for (const problem of [...history.submissions].sort(
    (a, b) => Number(b.timestamp) - Number(a.timestamp),
  )) {
    if (Number(problem.timestamp) * 1000 <= now.getTime() && !unique.has(problem.titleSlug))
      unique.set(problem.titleSlug, problem);
  }
  const questions = [...unique.values()];
  return {
    username: history.username,
    questions,
    count: questions.length,
    sourceLimit: ACCEPTED_HISTORY_LIMIT,
    checkedAt: now.toISOString(),
  };
}
