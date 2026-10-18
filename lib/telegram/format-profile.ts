import type { UserProfileSummary } from "@/lib/leetcode/types";
import { splitMessage } from "./format-submissions";

export function formatProfile(username: string, profile: UserProfileSummary) {
  return splitMessage(
    [
      `LeetCode profile for ${username}`,
      `Total solved: ${profile.totalSolved}\nEasy: ${profile.easySolved}\nMedium: ${profile.mediumSolved}\nHard: ${profile.hardSolved}\nRanking: ${profile.ranking}`,
      `https://leetcode.com/u/${encodeURIComponent(username)}/`,
    ].join("\n\n"),
  );
}
