import { beforeEach, describe, expect, it, vi } from "vitest";
import { serverAccount } from "@/lib/auth/session";
import { trackingStatus } from "@/lib/tracking/registration";
import TrackingPage from "@/app/tracking/page";
import DashboardPage from "@/app/dashboard/page";
import type { Account } from "@/lib/db/schema";

vi.mock("next/navigation", () => ({
  redirect: (path: string) => {
    throw new Error(`redirect:${path}`);
  },
  useRouter: () => ({ replace: vi.fn() }),
}));
vi.mock("@/lib/auth/session", () => ({ serverAccount: vi.fn() }));
vi.mock("@/lib/tracking/registration", () => ({ trackingStatus: vi.fn() }));
vi.mock("@/lib/tracking/config", () => ({
  registrationAvailable: () => true,
  trackingBot: () => ({ username: "test_bot" }),
}));
const account = { leetcodeUsername: "fixed-user", chatId: 101, status: "active" } as Account;
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(serverAccount).mockResolvedValue(account);
  vi.mocked(trackingStatus).mockResolvedValue({
    username: "fixed-user",
    connected: true,
    status: "active",
    lastDelivery: null,
  });
});
describe("connected dashboard navigation", () => {
  it.each(["active", "paused", "blocked"])(
    "takes a connected %s account out of onboarding",
    async (status) => {
      vi.mocked(trackingStatus).mockResolvedValue({
        username: "fixed-user",
        connected: true,
        status,
        lastDelivery: null,
      });
      await expect(TrackingPage({ searchParams: Promise.resolve({}) })).rejects.toThrow(
        "redirect:/dashboard",
      );
    },
  );
  it.each([null, { ...account, leetcodeUsername: null }, { ...account, chatId: null }])(
    "requires sign-in, registration, and connection before the dashboard",
    async (user) => {
      vi.mocked(serverAccount).mockResolvedValue(user);
      await expect(DashboardPage()).rejects.toThrow("redirect:/tracking");
      expect(trackingStatus).not.toHaveBeenCalled();
    },
  );
  it("loads only the current account's status and public bot link", async () => {
    const page = await DashboardPage();
    expect(trackingStatus).toHaveBeenCalledExactlyOnceWith(account);
    expect(page.props.children.props.botUrl).toBe("https://t.me/test_bot");
  });
  it("keeps unconnected registered accounts in setup", async () => {
    vi.mocked(trackingStatus).mockResolvedValue({
      username: "fixed-user",
      connected: false,
      status: "pending",
      lastDelivery: null,
    });
    expect(await TrackingPage({ searchParams: Promise.resolve({}) })).toBeDefined();
  });
});
