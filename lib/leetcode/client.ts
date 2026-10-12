import { ApiError } from "@/lib/http/api-error";
import { isRecord } from "@/lib/http/validation";

const GRAPHQL_URL = "https://leetcode.com/graphql";
const REQUEST_TIMEOUT_MS = 10_000;

interface QueryVariables {
  username: string;
  limit?: number;
}

function isMissingUserError(value: unknown): boolean {
  return (
    isRecord(value) &&
    value.message === "That user does not exist." &&
    Array.isArray(value.path) &&
    value.path.length === 1 &&
    value.path[0] === "matchedUser"
  );
}

/** External responses remain unknown until the consuming service validates them. */
export async function queryLeetCode(query: string, variables: QueryVariables): Promise<unknown> {
  let response: Response;

  try {
    response = await fetch(GRAPHQL_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Referer: "https://leetcode.com" },
      body: JSON.stringify({ query, variables }),
      cache: "no-store",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (error) {
    if (error instanceof Error && error.name === "TimeoutError") {
      throw new ApiError(504, "LeetCode took too long to respond. Try again shortly.");
    }
    throw new ApiError(502, "Could not reach LeetCode. Try again shortly.");
  }

  if (!response.ok) {
    throw new ApiError(502, "LeetCode is temporarily unavailable. Try again shortly.");
  }

  let result: unknown;
  try {
    result = await response.json();
  } catch {
    throw new ApiError(502, "LeetCode returned an invalid response.");
  }

  if (!isRecord(result)) {
    throw new ApiError(502, "LeetCode returned an invalid response.");
  }
  if (result.errors !== undefined && (!Array.isArray(result.errors) || result.errors.length > 0)) {
    // LeetCode reports missing users as a field error rather than an error-free null result.
    if (
      isRecord(result.data) &&
      result.data.matchedUser === null &&
      Array.isArray(result.errors) &&
      result.errors.every(isMissingUserError)
    ) {
      throw new ApiError(404, "LeetCode user was not found.");
    }
    throw new ApiError(502, "LeetCode could not complete the request.");
  }
  if (result.data === undefined || result.data === null) {
    throw new ApiError(502, "LeetCode returned an invalid response.");
  }

  return result.data;
}
