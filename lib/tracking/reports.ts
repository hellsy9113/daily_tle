import "server-only";
import { getLastDaySolvedQuestions } from "@/lib/leetcode/last-day-solved";
import { getGfgProfile } from "@/lib/gfg/client";
import { GFG_REFRESH_MS, readGfgProblems } from "@/lib/gfg/store";
import { formatGfgDailyReport } from "@/lib/gfg/format-report";
import { getHackerRankProfile } from "@/lib/hackerrank/client";
import { HACKERRANK_REFRESH_MS, readHackerRankProblems } from "@/lib/hackerrank/store";
import { formatHackerRankDailyReport } from "@/lib/hackerrank/format-report";
import { formatDailyReport } from "./format-report";
import type { ActivityPlatform } from "@/lib/activity/types";
import type { CollectedResult } from "./result-store";

interface ReportSource {
  accountId: string;
  username: string;
  end: Date;
}
interface ReportCollector {
  reserveMs: number;
  retryMs: number;
  collect(source: ReportSource): Promise<{ result: CollectedResult; messages: string[] }>;
}

/** Both daily collection and unprepared delivery recovery use the stored period. */
export const reportCollectors: Record<ActivityPlatform, ReportCollector> = {
  leetcode: {
    reserveMs: 12_000,
    retryMs: 60_000,
    async collect({ username, end }) {
      const result = await getLastDaySolvedQuestions(username, end);
      return { result, messages: formatDailyReport(result) };
    },
  },
  gfg: {
    reserveMs: 24_000,
    retryMs: GFG_REFRESH_MS,
    async collect({ accountId, username, end }) {
      const saved = await readGfgProblems(accountId);
      const result = await getGfgProfile(username);
      return { result, messages: formatGfgDailyReport(result, saved, end) };
    },
  },
  hackerrank: {
    reserveMs: 24_000,
    retryMs: HACKERRANK_REFRESH_MS,
    async collect({ accountId, username, end }) {
      const saved = await readHackerRankProblems(accountId);
      const result = await getHackerRankProfile(username);
      return { result, messages: formatHackerRankDailyReport(result, saved, end) };
    },
  },
};
