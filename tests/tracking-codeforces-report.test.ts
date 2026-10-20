import { beforeEach, describe, expect, it, vi } from "vitest";
import { getCodeforcesProfile } from "@/lib/codeforces/client";
import {
  cacheCodeforcesProfile,
  readCodeforcesProblems,
  writeCodeforcesProfile,
} from "@/lib/codeforces/store";
import { formatCodeforcesDailyReport } from "@/lib/codeforces/format-report";
import type { CodeforcesProfile } from "@/lib/codeforces/types";
import { collectWeeklyReport, reportCollectors } from "@/lib/tracking/reports";
import { writeCollectedResult } from "@/lib/tracking/result-store";
import type { Transaction } from "@/lib/tracking/services";

vi.mock("@/lib/codeforces/client", () => ({ getCodeforcesProfile: vi.fn() }));
vi.mock("@/lib/codeforces/store", () => ({
  CODEFORCES_REFRESH_MS: 300_000,
  readCodeforcesProblems: vi.fn(),
  writeCodeforcesProfile: vi.fn(),
  cacheCodeforcesProfile: vi.fn(),
}));
vi.mock("@/lib/codeforces/format-report", () => ({ formatCodeforcesDailyReport: vi.fn() }));

const end = new Date("2026-10-18T17:30:00Z");
const source = { accountId: "own", username: "tourist", end };
const profile: CodeforcesProfile = {
  platform: "codeforces",
  username: "tourist",
  rating: 3000,
  maxRating: 3200,
  rank: "legendary grandmaster",
  historyComplete: false,
  historyStart: "2026-10-12T00:00:00.000Z",
  checkedAt: end.toISOString(),
  problems: [],
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(readCodeforcesProblems).mockResolvedValue([]);
  vi.mocked(getCodeforcesProfile).mockResolvedValue(profile);
  vi.mocked(formatCodeforcesDailyReport).mockReturnValue(["Codeforces recap"]);
});

describe("Codeforces collection adapters", () => {
  it("prepares daily bot messages from the registered handle and saved account evidence", async () => {
    expect(await reportCollectors.codeforces.collect(source)).toEqual({
      result: profile,
      messages: ["Codeforces recap"],
    });
    expect(readCodeforcesProblems).toHaveBeenCalledExactlyOnceWith("own");
    expect(getCodeforcesProfile).toHaveBeenCalledExactlyOnceWith("tourist");
    expect(formatCodeforcesDailyReport).toHaveBeenCalledExactlyOnceWith(profile, [], end);
    expect(reportCollectors.codeforces.reserveMs).toBeGreaterThanOrEqual(30_000);
    expect(reportCollectors.codeforces.retryMs).toBe(300_000);
  });
  it("uses stored weekly boundaries on recovery instead of calculating a new period", async () => {
    const start = new Date("2026-10-11T18:30:00Z");
    expect(await collectWeeklyReport({ ...source, start, platform: "codeforces" })).toEqual({
      result: profile,
      messages: ["Codeforces recap"],
    });
    expect(formatCodeforcesDailyReport).toHaveBeenCalledExactlyOnceWith(profile, [], end, {
      start,
      end,
    });
  });
  it("writes submissions and the cached profile using the existing fenced transaction", async () => {
    const transaction = {} as Transaction;
    await writeCollectedResult(transaction, source.accountId, profile);
    expect(writeCodeforcesProfile).toHaveBeenCalledExactlyOnceWith(transaction, "own", profile);
    expect(cacheCodeforcesProfile).toHaveBeenCalledExactlyOnceWith(transaction, "own", profile);
  });
});
