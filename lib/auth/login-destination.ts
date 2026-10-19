import { featureIds, featurePaths } from "@/lib/features/catalog";

export const LOGIN_DESTINATION_COOKIE = "tracking_login_destination";
export function loginDestination(
  value?: string | null,
): "/feature" | (typeof featurePaths)[keyof typeof featurePaths] {
  for (const platform of featureIds) {
    if (value === platform || value === featurePaths[platform]) return featurePaths[platform];
  }
  if (value === "tracking" || value === "/tracking") return featurePaths.leetcode;
  return "/feature";
}
