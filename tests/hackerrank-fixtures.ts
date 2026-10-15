import type { HackerRankProfile, StoredHackerRankProblem } from "@/lib/hackerrank/types";

export const hackerRankNow = new Date("2026-10-14T03:00:00Z");
export const challenge = (
  slug = "two-sum",
  createdAt = "2026-10-13T22:00:00.000+00:00",
  contest = "master",
) => ({
  name: slug,
  ch_slug: slug,
  con_slug: contest,
  created_at: createdAt,
  url: contest === "master" ? `/challenges/${slug}` : `/contests/${contest}/challenges/${slug}`,
});
export const hackerRankPage = (models = [challenge()], cursor = "", lastPage = true) => ({
  models,
  cursor,
  last_page: lastPage,
  response_version: "v2",
});
export function hackerRankProfile(
  username = "hr_user",
  slugs = ["two-sum"],
  checkedAt = hackerRankNow,
): HackerRankProfile {
  return {
    platform: "hackerrank",
    username,
    historyComplete: true,
    checkedAt: checkedAt.toISOString(),
    problems: slugs.map((slug) => ({
      id: `master:${slug}`,
      slug,
      contest: "master",
      title: slug,
      url: `https://www.hackerrank.com/challenges/${slug}`,
      solvedAt: "2026-10-13T02:00:00.000Z",
    })),
  };
}
export const storedHackerRank = (profile: HackerRankProfile): StoredHackerRankProblem[] =>
  profile.problems.map((problem) => ({
    ...problem,
    firstObservedAt: profile.checkedAt,
    baseline: true,
  }));
