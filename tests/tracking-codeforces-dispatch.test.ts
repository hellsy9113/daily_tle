import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/http/api-error";
import {
  claimCollection,
  completeCollection,
  failCollection,
  type ClaimedCollection,
} from "@/lib/tracking/collection-store";
import {
  acquireDispatchLock,
  claimDelivery,
  deliveryIsActive,
  failDelivery,
  prepareDeliveries,
  prepareEmptyDayReports,
  prepareWeeklyDeliveries,
  releaseDispatchLock,
  sendDeliveryPart,
  updateDelivery,
  type ClaimedDelivery,
} from "@/lib/tracking/delivery-store";
import { dispatchTracking } from "@/lib/tracking/dispatch";
import { collectWeeklyReport, reportCollectors } from "@/lib/tracking/reports";
import { sendTrackingMessage } from "@/lib/tracking/telegram-client";

vi.mock("@/lib/tracking/config", () => ({ trackingBot: vi.fn() }));
vi.mock("@/lib/tracking/collection-store", () => ({
  claimCollection: vi.fn(),
  completeCollection: vi.fn(),
  failCollection: vi.fn(),
}));
vi.mock("@/lib/tracking/delivery-store", () => ({
  acquireDispatchLock: vi.fn(),
  blockAccount: vi.fn(),
  claimDelivery: vi.fn(),
  cleanExpiredData: vi.fn(),
  deliveryIsActive: vi.fn(),
  sendDeliveryPart: vi.fn(),
  failDelivery: vi.fn(),
  prepareDeliveries: vi.fn(),
  prepareWeeklyDeliveries: vi.fn(),
  prepareEmptyDayReports: vi.fn(),
  prepareDeliveryReport: vi.fn(),
  releaseDispatchLock: vi.fn(),
  updateDelivery: vi.fn(),
}));
vi.mock("@/lib/tracking/reports", () => ({
  collectWeeklyReport: vi.fn(),
  reportCollectors: {
    codeforces: { reserveMs: 32_000, retryMs: 300_000, collect: vi.fn() },
    gfg: { reserveMs: 24_000, retryMs: 300_000, collect: vi.fn() },
  },
}));
vi.mock("@/lib/tracking/telegram-client", () => ({
  sendTrackingMessage: vi.fn(),
  TrackingTelegramError: class extends Error {},
}));

const reportDate = "2026-10-12";
const now = new Date("2026-10-18T17:30:00Z");
const collection = {
  id: "cf-collection",
  accountId: "own",
  registrationId: "registration",
  platform: "codeforces",
  reportDate,
  username: "tourist",
} as ClaimedCollection;
const delivery = {
  id: "cf-delivery",
  accountId: "own",
  registrationId: "registration",
  platform: "codeforces",
  cadence: "daily",
  username: "tourist",
  messages: ["Codeforces daily recap"],
  sentParts: 0,
  chatId: 123,
} as ClaimedDelivery;

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(acquireDispatchLock).mockResolvedValue("dispatch-lease");
  vi.mocked(prepareDeliveries).mockResolvedValue(reportDate);
  vi.mocked(prepareWeeklyDeliveries).mockResolvedValue(reportDate);
  vi.mocked(prepareEmptyDayReports).mockResolvedValue(0);
  vi.mocked(claimDelivery).mockResolvedValue(null);
  vi.mocked(claimCollection).mockResolvedValue(null);
  vi.mocked(deliveryIsActive).mockResolvedValue(true);
  vi.mocked(sendDeliveryPart).mockImplementation(async (_delivery, _index, send) => {
    await send();
    return true;
  });
});

describe("Codeforces Daily Grind dispatch", () => {
  it("claims only one Codeforces lookup at a time while another platform can collect", async () => {
    const second = { ...collection, id: "cf-second", username: "second" };
    const other = { ...collection, id: "gfg", platform: "gfg" } as ClaimedCollection;
    const queued = [collection, second];
    let otherQueued = true;
    vi.mocked(claimCollection).mockImplementation(async (_date, _now, _gfg, _hr, allowCf) => {
      if (allowCf && queued.length) return queued.shift()!;
      if (otherQueued) {
        otherQueued = false;
        return other;
      }
      return null;
    });
    let finishFirst!: () => void;
    const gate = new Promise<void>((resolve) => {
      finishFirst = resolve;
    });
    const result = { result: {} as never, messages: [] };
    vi.mocked(reportCollectors.codeforces.collect)
      .mockImplementationOnce(async () => {
        await gate;
        return result;
      })
      .mockResolvedValue(result);
    vi.mocked(reportCollectors.gfg.collect).mockResolvedValue(result);
    const pending = dispatchTracking({ now });
    await vi.waitFor(() => {
      expect(reportCollectors.codeforces.collect).toHaveBeenCalledTimes(1);
      expect(completeCollection).toHaveBeenCalledWith(other, [], result.result);
    });
    finishFirst();
    expect(await pending).toEqual({ skipped: false, sent: 0, failed: 0 });
    expect(reportCollectors.codeforces.collect).toHaveBeenCalledTimes(2);
    expect(completeCollection).toHaveBeenCalledWith(second, [], result.result);
  });

  it("defers Codeforces after a collection rate limit while keeping other platforms eligible", async () => {
    vi.mocked(claimCollection).mockResolvedValueOnce(collection);
    vi.mocked(reportCollectors.codeforces.collect).mockRejectedValue(new ApiError(429, "Busy"));
    expect(await dispatchTracking({ now })).toEqual({ skipped: false, sent: 0, failed: 1 });
    expect(failCollection).toHaveBeenCalledExactlyOnceWith(collection, "lookup_429", 300);
    expect(completeCollection).not.toHaveBeenCalled();
    expect(claimCollection).toHaveBeenCalledWith(reportDate, expect.any(Date), true, true, false);
    expect(claimDelivery).toHaveBeenCalledWith(
      reportDate,
      expect.any(Date),
      true,
      true,
      true,
      "daily",
      false,
    );
    expect(releaseDispatchLock).toHaveBeenCalledExactlyOnceWith("dispatch-lease");
  });

  it("applies Codeforces backoff to unprepared weekly deliveries", async () => {
    const weekly = { ...delivery, cadence: "weekly", messages: null } as ClaimedDelivery;
    vi.mocked(claimDelivery).mockResolvedValueOnce(weekly);
    vi.mocked(collectWeeklyReport).mockRejectedValue(new ApiError(429, "Busy"));
    expect(await dispatchTracking({ now, cadence: "weekly" })).toEqual({
      skipped: false,
      sent: 0,
      failed: 1,
    });
    expect(failDelivery).toHaveBeenCalledExactlyOnceWith(weekly, "lookup_429", 300);
    expect(claimDelivery).toHaveBeenCalledWith(
      reportDate,
      expect.any(Date),
      true,
      true,
      false,
      "weekly",
      false,
    );
    expect(claimCollection).not.toHaveBeenCalled();
  });

  it("sends prepared Codeforces messages through the shared fenced bot path", async () => {
    vi.mocked(claimDelivery).mockResolvedValueOnce(delivery);
    expect(await dispatchTracking({ now, pause: async () => {} })).toEqual({
      skipped: false,
      sent: 1,
      failed: 0,
    });
    expect(sendDeliveryPart).toHaveBeenCalledExactlyOnceWith(delivery, 0, expect.any(Function));
    expect(sendTrackingMessage).toHaveBeenCalledExactlyOnceWith(123, "Codeforces daily recap");
    expect(updateDelivery).toHaveBeenCalledWith(
      delivery,
      expect.objectContaining({ status: "sent", leaseToken: null, leaseUntil: null }),
    );
  });

  it("does not send a Codeforces report when pause or revocation makes its lease inactive", async () => {
    vi.mocked(claimDelivery).mockResolvedValueOnce(delivery);
    vi.mocked(deliveryIsActive).mockResolvedValue(false);
    expect(await dispatchTracking({ now })).toEqual({ skipped: false, sent: 0, failed: 0 });
    expect(sendDeliveryPart).not.toHaveBeenCalled();
    expect(sendTrackingMessage).not.toHaveBeenCalled();
    expect(updateDelivery).not.toHaveBeenCalled();
  });
});
