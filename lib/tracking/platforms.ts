import type { Account } from "@/lib/db/schema";
import type { ActivityPlatform } from "@/lib/activity/types";

export const platformLabels: Record<ActivityPlatform, string> = {
  leetcode: "LeetCode",
  gfg: "GFG",
  hackerrank: "HackerRank",
};
export const statusPaths: Record<ActivityPlatform, string> = {
  leetcode: "/api/tracking",
  gfg: "/api/tracking/gfg",
  hackerrank: "/api/tracking/hackerrank",
};
export const featurePaths = {
  leetcode: "/feature?platform=leetcode",
  gfg: "/feature?platform=gfg",
  hackerrank: "/feature?platform=hackerrank",
} as const satisfies Record<ActivityPlatform, string>;
export function platformUsername(account: Account, platform: ActivityPlatform) {
  return platform === "hackerrank"
    ? account.hackerRankUsername
    : platform === "gfg"
      ? account.gfgUsername
      : account.leetcodeUsername;
}
export function accountSetupPath(account?: Account | null) {
  return account?.leetcodeUsername
    ? featurePaths.leetcode
    : account?.gfgUsername
      ? featurePaths.gfg
      : account?.hackerRankUsername
        ? featurePaths.hackerrank
        : "/feature";
}
