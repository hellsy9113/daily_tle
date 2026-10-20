import "server-only";
import { ApiError } from "@/lib/http/api-error";
import { isRecord } from "@/lib/http/validation";
import { reserveCodeforcesApiSlot } from "./rate-limit";
import { codeforcesProblemUrl } from "./urls";
import type { CodeforcesProblem, CodeforcesProfile } from "./types";

export const CODEFORCES_PAGE_SIZE = 1000;
export const CODEFORCES_MAX_PAGES = 5;
const origin = "https://codeforces.com";
const indexPattern = /^[A-Za-z0-9][A-Za-z0-9_-]{0,31}$/;

export function parseCodeforcesUsername(value: unknown): string {
  if (typeof value !== "string" || !/^[A-Za-z0-9_.-]{3,24}$/.test(value.trim()))
    throw new ApiError(
      400,
      "Enter a valid Codeforces handle (3–24 letters, digits, dots, underscores or hyphens).",
    );
  return value.trim();
}

function invalidResponse(): never {
  throw new ApiError(502, "Codeforces returned invalid public profile data.");
}

function positiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

function unixInstant(value: unknown): string {
  if (!positiveInteger(value) || value > 253402300799) invalidResponse();
  return new Date(value * 1000).toISOString();
}

function optionalRating(value: unknown): number | null {
  if (value === undefined) return null;
  if (typeof value !== "number" || !Number.isSafeInteger(value) || Math.abs(value) > 100000)
    invalidResponse();
  return value;
}

function apiResult(value: unknown): unknown[] {
  if (!isRecord(value)) invalidResponse();
  if (value.status === "FAILED") {
    const comment = typeof value.comment === "string" ? value.comment : "";
    if (/handle(?:s)?[^\n]*not found|user[^\n]*not found/i.test(comment))
      throw new ApiError(404, "Codeforces user was not found.");
    if (/limit exceeded|too many requests|call limit/i.test(comment))
      throw new ApiError(429, "Codeforces is rate limiting requests. Try again later.");
    throw new ApiError(502, "Codeforces is temporarily unavailable. Try again later.");
  }
  if (value.status !== "OK" || !Array.isArray(value.result)) invalidResponse();
  return value.result;
}

/** Includes the oldest attempted submission, even when no attempt was accepted. */
export function normalizeCodeforcesPage(value: unknown): {
  problems: CodeforcesProblem[];
  count: number;
  oldest: string | null;
  submissionIds: number[];
} {
  const submissions = apiResult(value);
  if (submissions.length > CODEFORCES_PAGE_SIZE) invalidResponse();
  let oldestMillis = Number.POSITIVE_INFINITY;
  const submissionIds: number[] = [];
  const problems: CodeforcesProblem[] = [];
  for (const submission of submissions) {
    if (!isRecord(submission) || !positiveInteger(submission.id)) invalidResponse();
    const solvedAt = unixInstant(submission.creationTimeSeconds);
    oldestMillis = Math.min(oldestMillis, Date.parse(solvedAt));
    submissionIds.push(submission.id);
    if (submission.verdict === undefined || submission.verdict === "TESTING") continue;
    if (typeof submission.verdict !== "string") invalidResponse();
    if (submission.verdict !== "OK") continue;
    const problem = submission.problem;
    if (!isRecord(problem)) invalidResponse();
    const contestId =
      problem.contestId ??
      submission.contestId ??
      (problem.problemsetName === "acmsguru" ? 99999 : undefined);
    if (
      !positiveInteger(contestId) ||
      contestId > 2147483647 ||
      typeof problem.index !== "string" ||
      !indexPattern.test(problem.index) ||
      typeof problem.name !== "string" ||
      !problem.name.trim() ||
      problem.name.length > 1000 ||
      !Array.isArray(problem.tags) ||
      problem.tags.length > 100 ||
      problem.tags.some((tag) => typeof tag !== "string" || !tag.trim() || tag.length > 100)
    )
      invalidResponse();
    if (positiveInteger(submission.contestId) && submission.contestId !== contestId)
      invalidResponse();
    problems.push({
      submissionId: submission.id,
      id: `${contestId}:${problem.index}`,
      contestId,
      index: problem.index,
      title: problem.name.trim(),
      url: codeforcesProblemUrl(contestId, problem.index),
      solvedAt,
      rating: optionalRating(problem.rating),
      tags: [...new Set(problem.tags as string[])],
    });
  }
  return {
    problems,
    count: submissions.length,
    oldest: Number.isFinite(oldestMillis) ? new Date(oldestMillis).toISOString() : null,
    submissionIds,
  };
}

async function request(url: URL, signal: AbortSignal): Promise<unknown> {
  try {
    await reserveCodeforcesApiSlot(signal);
    const response = await fetch(url, {
      cache: "no-store",
      headers: { Accept: "application/json", "User-Agent": "Track.it/0.1" },
      signal: AbortSignal.any([signal, AbortSignal.timeout(10_000)]),
    });
    if (response.status === 404) throw new ApiError(404, "Codeforces user was not found.");
    if (response.status === 429)
      throw new ApiError(429, "Codeforces is rate limiting requests. Try again later.");
    // Failed API calls use HTTP 400 with a structured FAILED envelope.
    if (response.status === 400) {
      apiResult(await response.json());
      throw new ApiError(502, "Codeforces returned an invalid API response.");
    }
    if (!response.ok)
      throw new ApiError(502, "Codeforces is temporarily unavailable. Try again later.");
    return await response.json();
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(
      signal.aborted || (error instanceof Error && error.name === "TimeoutError") ? 504 : 502,
      "Could not read Codeforces public activity. Try again shortly.",
    );
  }
}

export async function getCodeforcesProfile(
  value: unknown,
  now = new Date(),
): Promise<CodeforcesProfile> {
  const username = parseCodeforcesUsername(value);
  const signal = AbortSignal.timeout(30_000);
  const identityUrl = new URL("/api/user.info", origin);
  identityUrl.search = new URLSearchParams({ handles: username }).toString();
  const identities = apiResult(await request(identityUrl, signal));
  if (identities.length !== 1 || !isRecord(identities[0])) invalidResponse();
  const identity = identities[0];
  let canonical: string;
  try {
    canonical = parseCodeforcesUsername(identity.handle);
  } catch {
    invalidResponse();
  }
  if (canonical.toLowerCase() !== username.toLowerCase()) invalidResponse();
  const registeredAt = unixInstant(identity.registrationTimeSeconds);
  if (
    identity.rank !== undefined &&
    (typeof identity.rank !== "string" || !identity.rank.trim() || identity.rank.length > 100)
  )
    invalidResponse();
  const rating = optionalRating(identity.rating);
  const maxRating = optionalRating(identity.maxRating);
  const problems = new Map<number, CodeforcesProblem>();
  const seenSubmissions = new Set<number>();
  let historyStart: string | null = null;
  let historyComplete = false;
  for (let index = 0; index < CODEFORCES_MAX_PAGES; index++) {
    const url = new URL("/api/user.status", origin);
    url.search = new URLSearchParams({
      handle: canonical,
      from: String(index * CODEFORCES_PAGE_SIZE + 1),
      count: String(CODEFORCES_PAGE_SIZE),
    }).toString();
    const page = normalizeCodeforcesPage(await request(url, signal));
    let newSubmissions = 0;
    for (const id of page.submissionIds) {
      if (!seenSubmissions.has(id)) newSubmissions++;
      seenSubmissions.add(id);
    }
    if (page.count > 0 && newSubmissions === 0) invalidResponse();
    for (const problem of page.problems) problems.set(problem.submissionId, problem);
    if (page.oldest && (!historyStart || page.oldest < historyStart)) historyStart = page.oldest;
    if (page.count < CODEFORCES_PAGE_SIZE) {
      historyComplete = true;
      historyStart = registeredAt;
      break;
    }
  }
  return {
    platform: "codeforces",
    username: canonical,
    rating,
    maxRating,
    rank: typeof identity.rank === "string" ? identity.rank : null,
    problems: [...problems.values()],
    checkedSubmissionIds: [...seenSubmissions],
    historyComplete,
    historyStart,
    checkedAt: now.toISOString(),
  };
}
