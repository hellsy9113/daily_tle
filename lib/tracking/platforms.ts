import type { Account } from "@/lib/db/schema";
import {
  featureIds,
  featurePaths,
  type FeatureId,
  type ActivityFeatureId,
} from "@/lib/features/catalog";

/** The existing schema is intentionally isolated here; new storage requires a migration. */
export const platformFields = {
  leetcode: { username: "leetcodeUsername", registeredAt: "registeredAt" },
  gfg: { username: "gfgUsername", registeredAt: "gfgRegisteredAt" },
  hackerrank: { username: "hackerRankUsername", registeredAt: "hackerRankRegisteredAt" },
  codeforces: { username: "codeforcesUsername", registeredAt: "codeforcesRegisteredAt" },
} as const satisfies Record<
  ActivityFeatureId,
  { username: keyof Account; registeredAt: keyof Account }
>;

export function platformUsername(account: Account, platform: FeatureId) {
  if (platform === "notes") return account.notesRegisteredAt ? "Private notebook" : null;
  return account[platformFields[platform].username];
}
export function registeredFeatures(account: Account) {
  return featureIds.filter((id) => platformUsername(account, id));
}
export function accountSetupPath(account?: Account | null) {
  const first = account && registeredFeatures(account)[0];
  return first ? featurePaths[first] : "/feature";
}
