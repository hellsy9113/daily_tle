/** Browser-safe feature metadata. Keep database and upstream imports out of this module. */
export interface FeatureDefinition {
  id: string;
  name: string;
  label: string;
  description: string;
  coverage: string;
  readyMessage: string;
  dashboard?: boolean;
  activity?: boolean;
  recaps?: boolean;
}

export const features = [
  {
    id: "leetcode",
    name: "LeetCode",
    label: "LeetCode",
    description:
      "Revisit Accepted problems with a daily calendar, saved links, and Telegram recaps.",
    coverage:
      "LeetCode exposes recent Accepted history only. Saved activity builds over time; older solves may be missing.",
    readyMessage:
      "You're set. Yesterday's solved questions will arrive automatically. No daily commands needed.",
    dashboard: true,
    activity: true,
    recaps: true,
  },
  {
    id: "gfg",
    name: "GeeksforGeeks",
    label: "GFG",
    description: "Follow your solved inventory and newly observed practice in a separate calendar.",
    coverage:
      "GFG publishes totals and a solved inventory. Its timestamps currently omit a timezone, so newly observed activity is clearly labeled and historical daily counts remain unavailable.",
    readyMessage:
      "You're set. GFG progress recaps will arrive automatically. Problems without verified solve dates are labeled as newly observed.",
    dashboard: true,
    activity: true,
    recaps: true,
  },
  {
    id: "hackerrank",
    name: "HackerRank",
    label: "HackerRank",
    description: "Keep public solved challenges, problem links, and daily recaps together.",
    coverage:
      "HackerRank public history can be incomplete. Counts reflect saved solved challenges; first-ever solve dates are not guaranteed.",
    readyMessage:
      "You're set. HackerRank recaps will arrive automatically, using available public solved activity.",
    dashboard: true,
    activity: true,
    recaps: true,
  },
] as const satisfies readonly FeatureDefinition[];

export type FeatureId = (typeof features)[number]["id"];
export type ActivityFeatureId = Extract<(typeof features)[number], { activity: true }>["id"];
export const featureIds = features.map((feature) => feature.id);

function featureMap<T>(value: (feature: (typeof features)[number]) => T) {
  return Object.fromEntries(features.map((feature) => [feature.id, value(feature)])) as Record<
    FeatureId,
    T
  >;
}

export const platformLabels = featureMap((feature) => feature.label);
export const featurePaths = featureMap((feature) => `/feature?platform=${feature.id}` as const);
export const statusPaths = featureMap((feature) => `/api/tracking/services/${feature.id}`);
export const featureById: Record<FeatureId, FeatureDefinition> = featureMap((feature) => feature);

export function isFeatureId(value: unknown): value is FeatureId {
  return typeof value === "string" && featureIds.some((id) => id === value);
}

export function isActivityFeatureId(value: unknown): value is ActivityFeatureId {
  return isFeatureId(value) && featureById[value].activity === true;
}
