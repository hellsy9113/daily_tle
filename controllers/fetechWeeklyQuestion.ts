import type { GraphQLParams } from "../types/user";
import type { LeetcodeWeeklyQuestion } from "../types/weeklyQuestion";

const fetchWeeklyQuestion = async (
  query: string,
  params: GraphQLParams
): Promise<LeetcodeWeeklyQuestion> => {
  const response = await fetch("https://leetcode.com/graphql", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Referer: "https://leetcode.com",
    },
    body: JSON.stringify({
      query,
      variables: params,
    }),
    signal: AbortSignal.timeout(10_000),
  });

  const result: {
    data?: LeetcodeWeeklyQuestion;
    errors?: { message?: string }[];
  } = await response.json();

  if (!response.ok) {
    throw new Error(`LeetCode API returned ${response.status}`);
  }

  if (result.errors) {
    throw new Error(result.errors[0]?.message ?? "GraphQL error");
  }

  if (!result.data || !Array.isArray(result.data.recentSubmissionList)) {
    throw new Error("LeetCode returned an invalid submission list");
  }

  return result.data;

};

export default fetchWeeklyQuestion;
