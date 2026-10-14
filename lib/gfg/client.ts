import "server-only";
import { ApiError } from "@/lib/http/api-error";
import { isRecord } from "@/lib/http/validation";
import { normalizeGfgProfile } from "./transform";
import { parseGfgUsername } from "./validation";

async function gfgRequest(url: URL, options: RequestInit = {}): Promise<unknown> {
  let response: Response;
  let body: unknown;
  try {
    response = await fetch(url, {
      ...options,
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "User-Agent": "DSA-Tracker/0.1",
      },
    });
    if (response.status === 429)
      throw new ApiError(429, "GFG is rate limiting requests. Try again later.");
    if (response.status === 404) throw new ApiError(404, "GFG user was not found.");
    body = await response.json();
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (error instanceof Error && error.name === "TimeoutError")
      throw new ApiError(504, "GFG took too long to respond. Try again shortly.");
    throw new ApiError(502, "Could not read GFG's public profile. Try again shortly.");
  }
  if (response.status === 429)
    throw new ApiError(429, "GFG is rate limiting requests. Try again later.");
  if (
    response.status === 404 ||
    ([400, 406].includes(response.status) && isRecord(body) && body.message === "User not found!")
  )
    throw new ApiError(404, "GFG user was not found.");
  if (!response.ok) throw new ApiError(502, "GFG is temporarily unavailable. Try again shortly.");
  return body;
}

export async function getGfgProfile(value: unknown, now = new Date()) {
  const username = parseGfgUsername(value);
  const url = new URL("https://authapi.geeksforgeeks.org/api-get/user-profile-info/");
  url.search = new URLSearchParams({
    handle: username,
    article_count: "false",
    redirect: "true",
  }).toString();
  const profile = await gfgRequest(url);
  if (!isRecord(profile) || !isRecord(profile.data))
    throw new ApiError(502, "GFG returned an invalid public profile.");
  const submissions = await gfgRequest(
    new URL("https://practiceapi.geeksforgeeks.org/api/v1/user/problems/submissions/"),
    {
      method: "POST",
      body: JSON.stringify({ handle: username, requestType: "", year: "", month: "" }),
    },
  );
  return normalizeGfgProfile(username, profile, submissions, now);
}
