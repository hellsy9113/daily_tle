import type { GraphQLParams } from "../types/user";

const fetchWeeklyQuestion = async (
  query: string,
  params: GraphQLParams
) => {
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
  });

  const result = await response.json();

  if (!response.ok) {
    throw new Error(`LeetCode API returned ${response.status}`);
  }

  if (result.errors) {
    throw new Error(result.errors[0]?.message ?? "GraphQL error");
  }
 return result.data;

};

export default fetchWeeklyQuestion;