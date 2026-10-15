import "server-only";
import { ApiError } from "@/lib/http/api-error";
import { isRecord } from "@/lib/http/validation";
import type { HackerRankProblem, HackerRankProfile } from "./types";

export const HACKERRANK_MAX_PAGES = 5;
const origin = "https://www.hackerrank.com";
const slugPattern = /^[A-Za-z0-9_-]{1,200}$/;

export function parseHackerRankUsername(value: unknown): string {
  if (typeof value !== "string" || !/^[A-Za-z0-9_][A-Za-z0-9_.-]{0,99}$/.test(value.trim()))
    throw new ApiError(400, "Enter a valid HackerRank username.");
  return value.trim();
}

function invalidResponse(): never {
  throw new ApiError(502, "HackerRank returned invalid public profile data.");
}

export function normalizeHackerRankPage(value: unknown): {
  problems: HackerRankProblem[];
  cursor: string;
  lastPage: boolean;
} {
  if (
    !isRecord(value) ||
    !Array.isArray(value.models) ||
    typeof value.cursor !== "string" ||
    value.cursor.length > 2048 ||
    typeof value.last_page !== "boolean"
  )
    invalidResponse();
  const problems = value.models.map((item): HackerRankProblem => {
    if (
      !isRecord(item) ||
      typeof item.name !== "string" ||
      !item.name.trim() ||
      item.name.length > 1000 ||
      typeof item.ch_slug !== "string" ||
      !slugPattern.test(item.ch_slug) ||
      typeof item.con_slug !== "string" ||
      !slugPattern.test(item.con_slug) ||
      typeof item.created_at !== "string" ||
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(item.created_at)
    )
      invalidResponse();
    const instant = new Date(item.created_at);
    const date = new Date(`${item.created_at.slice(0, 10)}T00:00:00Z`);
    if (
      item.created_at.startsWith("0000-") ||
      !Number.isFinite(instant.getTime()) ||
      !Number.isFinite(date.getTime()) ||
      date.toISOString().slice(0, 10) !== item.created_at.slice(0, 10)
    )
      invalidResponse();
    const path =
      item.con_slug === "master"
        ? `/challenges/${item.ch_slug}`
        : `/contests/${item.con_slug}/challenges/${item.ch_slug}`;
    if (item.url !== path) invalidResponse();
    return {
      id: `${item.con_slug}:${item.ch_slug}`,
      slug: item.ch_slug,
      contest: item.con_slug,
      title: item.name.trim(),
      url: origin + path,
      solvedAt: instant.toISOString(),
    };
  });
  if (!value.last_page && (!value.cursor || !problems.length)) invalidResponse();
  return { problems, cursor: value.cursor, lastPage: value.last_page };
}

async function request(url: URL, signal: AbortSignal): Promise<unknown> {
  try {
    const response = await fetch(url, {
      cache: "no-store",
      headers: { Accept: "application/json", "User-Agent": "DSA-Tracker/0.1" },
      signal: AbortSignal.any([signal, AbortSignal.timeout(10_000)]),
    });
    if (response.status === 404) throw new ApiError(404, "HackerRank user was not found.");
    if (response.status === 429)
      throw new ApiError(429, "HackerRank is rate limiting requests. Try again later.");
    if (!response.ok)
      throw new ApiError(502, "HackerRank is temporarily unavailable. Try again later.");
    return await response.json();
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(
      error instanceof Error && error.name === "TimeoutError" ? 504 : 502,
      "Could not read HackerRank's public profile. Try again shortly.",
    );
  }
}

export async function getHackerRankProfile(
  value: unknown,
  now = new Date(),
): Promise<HackerRankProfile> {
  const username = parseHackerRankUsername(value);
  const signal = AbortSignal.timeout(20_000);
  const profile = await request(
    new URL(`/rest/hackers/${encodeURIComponent(username)}`, origin),
    signal,
  );
  if (
    !isRecord(profile) ||
    profile.status !== true ||
    !isRecord(profile.model) ||
    typeof profile.model.username !== "string"
  )
    invalidResponse();
  if (profile.model.deleted === true) throw new ApiError(404, "HackerRank user was not found.");
  let canonical: string;
  try {
    canonical = parseHackerRankUsername(profile.model.username);
  } catch {
    invalidResponse();
  }
  if (canonical.toLowerCase() !== username.toLowerCase()) invalidResponse();
  const problems = new Map<string, HackerRankProblem>();
  const cursors = new Set<string>();
  let cursor = "";
  let historyComplete = false;
  for (let index = 0; index < HACKERRANK_MAX_PAGES; index++) {
    const url = new URL(`/rest/hackers/${encodeURIComponent(canonical)}/recent_challenges`, origin);
    url.search = new URLSearchParams({
      limit: "20",
      response_version: "v2",
      ...(cursor ? { cursor } : {}),
    }).toString();
    const page = normalizeHackerRankPage(await request(url, signal));
    for (const problem of page.problems) {
      const saved = problems.get(problem.id);
      if (!saved || problem.solvedAt < saved.solvedAt) problems.set(problem.id, problem);
    }
    if (page.lastPage) {
      historyComplete = true;
      break;
    }
    if (cursors.has(page.cursor)) invalidResponse();
    cursors.add(page.cursor);
    cursor = page.cursor;
  }
  return {
    platform: "hackerrank",
    username: canonical,
    problems: [...problems.values()],
    historyComplete,
    checkedAt: now.toISOString(),
  };
}
