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
    id: "daily-grind",
    name: "Daily Grind",
    label: "Daily Grind",
    description: "Optional daily and weekly Telegram recaps for your enabled coding platforms.",
    coverage:
      "Enable this service, then connect your Telegram account. Morning recaps arrive at 8:30–9:30 a.m. IST. Platform tracking works independently.",
    readyMessage: "Daily Grind is enabled. Connect Telegram to receive recaps.",
  },
  {
    id: "leetcode",
    name: "LeetCode",
    label: "LeetCode",
    description:
      "Revisit Accepted problems with a daily calendar, saved links, and Telegram recaps.",
    coverage:
      "LeetCode exposes recent Accepted history only. Saved activity builds over time; older solves may be missing.",
    readyMessage:
      "Your LeetCode activity is ready on Dashboard. Enable Daily Grind separately for Telegram recaps.",
    dashboard: true,
    activity: true,
    recaps: true,
  },
  {
    id: "gfg",
    name: "GeeksforGeeks",
    label: "GFG",
    description: "Follow your solved inventory and newly observed practice in a separate calendar.",
    coverage: "Some solve dates are unavailable; newly observed problems are labeled.",
    readyMessage:
      "Your GFG activity is ready on Dashboard. Problems without verified solve dates are labeled as newly observed.",
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
    readyMessage: "Your HackerRank activity is ready on Dashboard.",
    dashboard: true,
    activity: true,
    recaps: true,
  },
  {
    id: "codeforces",
    name: "Codeforces",
    label: "Codeforces",
    description:
      "Follow Accepted problems, contest ratings, and daily practice with saved links and Telegram recaps.",
    coverage:
      "Codeforces activity uses public Accepted submissions. Large histories may be partial; saved counts reflect the available history and re-solves count once per day.",
    readyMessage: "Your Codeforces activity is ready on Dashboard.",
    dashboard: true,
    activity: true,
    recaps: true,
  },
  {
    id: "notes",
    name: "Notes",
    label: "Notes",
    description: "Keep short thoughts and useful links in a private notebook.",
    coverage:
      "100 words per note, with links or search phrases stored separately. A secret code unlocks Notes only for 20 minutes when signed out.",
    readyMessage: "Your private notebook is ready.",
    dashboard: true,
  },
  {
    id: "articles",
    name: "Daily Articles",
    label: "Daily Articles",
    description: "A small daily reading list for the topics you care about.",
    coverage: "Choose up to 2 topics for up to 6 unseen articles. Refresh for more matches.",
    readyMessage: "Your daily reading is ready on Dashboard.",
    dashboard: true,
  },
] as const satisfies readonly FeatureDefinition[];

export type FeatureId = (typeof features)[number]["id"];
export type ActivityFeatureId = Extract<(typeof features)[number], { activity: true }>["id"];
export const featureIds = features.map((feature) => feature.id);
export const activityFeatureIds = features
  .filter((feature) => "activity" in feature && feature.activity)
  .map((feature) => feature.id) as ActivityFeatureId[];

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
