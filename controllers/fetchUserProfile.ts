import { LeetcodeSubmission } from "@/types/weeklyQuestion";
import type { GraphQLParams, UserProfileResponse } from "../types/user";

const fetchUserProfile = async (
  query: string,
  params: GraphQLParams,
  formatFunction: (data:UserProfileResponse ) => unknown,
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
    throw new Error(result.errors[0]?.message ?? "GraphQL weekly submission error");
  }

  return formatFunction(result.data);
};

export default fetchUserProfile;