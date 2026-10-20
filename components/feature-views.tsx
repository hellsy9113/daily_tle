import type { ComponentType } from "react";
import { TrackingPanel } from "./tracking-panel";
import { LeetcodeActivityPanel } from "./leetcode-activity-panel";
import { GfgActivityPanel } from "./gfg-activity-panel";
import { HackerRankActivityPanel } from "./hackerrank-activity-panel";
import { CodeforcesActivityPanel } from "./codeforces-activity-panel";
import type { FeatureId } from "@/lib/features/catalog";
import type { TrackingStatus } from "@/lib/tracking/types";
import { NotesSetup } from "./notes-setup";

import { DailyGrindSetup } from "./daily-grind-setup";
import { ArticlesSetup } from "./articles-setup";

/** Setup is a component slot: future services can supply a form other than a username. */
interface FeatureView {
  Setup: ComponentType<{ platform: FeatureId; initialStatus: TrackingStatus }>;
  Dashboard?: ComponentType<{ username: string }>;
}

export const featureViews: Record<FeatureId, FeatureView> = {
  "daily-grind": { Setup: DailyGrindSetup },
  notes: { Setup: NotesSetup },
  articles: { Setup: ArticlesSetup },
  leetcode: { Setup: TrackingPanel, Dashboard: LeetcodeActivityPanel },
  gfg: { Setup: TrackingPanel, Dashboard: GfgActivityPanel },
  hackerrank: { Setup: TrackingPanel, Dashboard: HackerRankActivityPanel },
  codeforces: { Setup: TrackingPanel, Dashboard: CodeforcesActivityPanel },
};
