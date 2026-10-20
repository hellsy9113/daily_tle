import { beforeEach, describe, expect, it, vi } from "vitest";
import { runScheduledTracking, scheduledWork } from "@/lib/tracking/scheduler";
import { dispatchTracking } from "@/lib/tracking/dispatch";
import { collectNightlyActivity } from "@/lib/tracking/nightly-collection";
import { GET } from "@/app/api/cron/tracking/tick/route";

const { zones } = vi.hoisted(() => ({ zones: vi.fn() }));
vi.mock("@/lib/db/client", () => ({ db: () => ({ selectDistinct: () => ({ from: zones }) }) }));
vi.mock("@/lib/tracking/dispatch", () => ({ dispatchTracking: vi.fn() }));
vi.mock("@/lib/tracking/nightly-collection", () => ({ collectNightlyActivity: vi.fn() }));
beforeEach(() => {
  vi.clearAllMocks();
  zones.mockResolvedValue([{ timezone: "Asia/Kolkata" }, { timezone: "America/New_York" }]);
});

describe("timezone-aware scheduling", () => {
  it.each([
    ["2026-10-20T02:59:00Z", null],
    ["2026-10-20T03:00:00Z", "daily"],
    ["2026-10-20T04:00:00Z", "daily"],
    ["2026-10-20T05:00:00Z", null],
    ["2026-10-20T17:15:00Z", "collect"],
    ["2026-10-20T17:30:00Z", null],
    ["2026-10-18T17:30:00Z", "weekly"],
    ["2026-10-18T18:00:00Z", "weekly"],
    ["2026-10-18T18:30:00Z", null],
  ])("selects the local window at %s", (instant, expected) => {
    expect(scheduledWork(new Date(instant), "Asia/Kolkata")).toBe(expected);
  });
  it("only dispatches timezones in their local morning window", async () => {
    await runScheduledTracking(new Date("2026-10-20T03:00:00Z"));
    expect(dispatchTracking).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ cadence: "daily", timezone: "Asia/Kolkata" }),
    );
    expect(collectNightlyActivity).not.toHaveBeenCalled();
  });
  it("collects at night in the selected timezone without dispatching messages", async () => {
    await runScheduledTracking(new Date("2026-10-20T02:45:00Z")); // 22:45 Monday in New York
    expect(collectNightlyActivity).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ timezone: "America/New_York" }),
    );
    expect(dispatchTracking).not.toHaveBeenCalled();
  });
  it("requires cron authentication before reading any account timezones", async () => {
    expect((await GET(new Request("http://localhost/api/cron/tracking/tick"))).status).toBe(401);
    expect(zones).not.toHaveBeenCalled();
  });
});
