import "server-only";
import { getLastDaySolvedQuestions } from "@/lib/leetcode/last-day-solved";
import { getGfgProfile } from "@/lib/gfg/client";
import { GFG_REFRESH_MS, readGfgProblems } from "@/lib/gfg/store";
import { formatGfgDailyReport } from "@/lib/gfg/format-report";
import { getHackerRankProfile } from "@/lib/hackerrank/client";
import { HACKERRANK_REFRESH_MS, readHackerRankProblems } from "@/lib/hackerrank/store";
import { formatHackerRankDailyReport } from "@/lib/hackerrank/format-report";
import { getCodeforcesProfile } from "@/lib/codeforces/client";
import { CODEFORCES_REFRESH_MS, readCodeforcesProblems } from "@/lib/codeforces/store";
import { formatCodeforcesDailyReport } from "@/lib/codeforces/format-report";
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
  if (source.platform === "codeforces") {
    const saved = await readCodeforcesProblems(source.accountId);
    const result = await getCodeforcesProfile(source.username);
    return { result, messages: formatCodeforcesDailyReport(result, saved, source.end, range) };
  }
  if (source.platform === "gfg") {
    const saved = await readGfgProblems(source.accountId);
    const result = await getGfgProfile(source.username);
    return { result, messages: formatGfgDailyReport(result, saved, source.end, range) };
  }
  if (source.platform === "hackerrank") {
    const saved = await readHackerRankProblems(source.accountId);
    const result = await getHackerRankProfile(source.username);
    return { result, messages: formatHackerRankDailyReport(result, saved, source.end, range) };
  }
  const result = await getSolvedQuestions(source.username, "thisweek", range);
  const cutoff = new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Kolkata",
  }).format(source.end);
  return {
    result,
    messages: splitMessage(
      `LeetCode weekly recap · Sunday cutoff: ${cutoff} (Asia/Kolkata)\n\n${formatSolvedQuestions(result).join("\n\n")}`,
    ),
  };
}

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
  codeforces: {
    reserveMs: 32_000,
    retryMs: CODEFORCES_REFRESH_MS,
    async collect({ accountId, username, end }) {
      const saved = await readCodeforcesProblems(accountId);
      const result = await getCodeforcesProfile(username);
      return { result, messages: formatCodeforcesDailyReport(result, saved, end) };
    },
  },
};
