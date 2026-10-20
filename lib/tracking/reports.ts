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
import { getSolvedQuestions } from "@/lib/leetcode/solved-questions";
import { formatSolvedQuestions } from "@/lib/telegram/format-solved-questions";
import { splitMessage } from "@/lib/telegram/format-submissions";

/** Use the frozen database boundaries on recovery, rather than recalculating the week. */
export async function collectWeeklyReport(
  source: ReportSource & { start: Date; platform: ActivityPlatform },
) {
  const range = { start: source.start, end: source.end };
  if (source.platform === "gfg") {
    const saved = await readGfgProblems(source.accountId);
    const result = await getGfgProfile(source.username);
    return {
      result,
      messages: formatGfgDailyReport(result, saved, source.end, range, source.timezone),
    };
  }
  if (source.platform === "hackerrank") {
    const saved = await readHackerRankProblems(source.accountId);
    const result = await getHackerRankProfile(source.username);
    return {
      result,
      messages: formatHackerRankDailyReport(result, saved, source.end, range, source.timezone),
    };
  }
  const result = await getSolvedQuestions(source.username, "thisweek", range, source.timezone);
  const cutoff = new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: source.timezone ?? "Asia/Kolkata",
  }).format(source.end);
  return {
    result,
    messages: splitMessage(
      `LeetCode weekly recap · Sunday cutoff: ${cutoff} (${source.timezone ?? "Asia/Kolkata"})\n\n${formatSolvedQuestions(result).join("\n\n")}`,
    ),
  };
}

interface ReportSource {
  accountId: string;
  username: string;
  end: Date;
  timezone?: string;
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
    async collect({ username, end, timezone }) {
      const result = await getLastDaySolvedQuestions(username, end, timezone);
      return { result, messages: formatDailyReport(result) };
    },
  },
  gfg: {
    reserveMs: 24_000,
    retryMs: GFG_REFRESH_MS,
    async collect({ accountId, username, end, timezone }) {
      const saved = await readGfgProblems(accountId);
      const result = await getGfgProfile(username);
      return { result, messages: formatGfgDailyReport(result, saved, end, undefined, timezone) };
    },
  },
  hackerrank: {
    reserveMs: 24_000,
    retryMs: HACKERRANK_REFRESH_MS,
    async collect({ accountId, username, end, timezone }) {
      const saved = await readHackerRankProblems(accountId);
      const result = await getHackerRankProfile(username);
      return {
        result,
        messages: formatHackerRankDailyReport(result, saved, end, undefined, timezone),
      };
    },
  },
};
