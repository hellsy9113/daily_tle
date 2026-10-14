import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { serverAccount } from "@/lib/auth/session";
import { trackingStatus } from "@/lib/tracking/registration";
import TrackingPage from "@/app/tracking/page";
import DashboardPage from "@/app/dashboard/page";
import Home from "@/app/page";
import type { Account } from "@/lib/db/schema";

vi.mock("next/navigation", async () => ({
  ...(await vi.importActual<typeof import("next/navigation")>("next/navigation")),
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
  it.each([account, { ...account, leetcodeUsername: null, chatId: null }])(
    "redirects a signed-in homepage visitor to the dashboard",
    async (user) => {
      vi.mocked(serverAccount).mockResolvedValue(user);
      await expect(Home()).rejects.toThrow("redirect:/dashboard");
      expect(trackingStatus).not.toHaveBeenCalled();
    },
  );
  it("keeps the public homepage available without a session", async () => {
    vi.mocked(serverAccount).mockResolvedValue(null);
    const html = renderToStaticMarkup(await Home());
    expect(html).toContain('href="/tracking"');
    expect(html).toContain('id="how-it-works"');
    expect(html).not.toMatch(
      /Existing bot|View bot commands|#commands|name:your_leetcode_username/,
    );
  });
  it("keeps the public homepage available when session storage is unavailable", async () => {
    vi.mocked(serverAccount).mockRejectedValue(new Error("Session storage is unavailable"));
    expect(await Home()).toBeDefined();
  });
  it("lets Next.js handle framework errors from the session lookup", async () => {
    const frameworkError = Object.assign(new Error("Next.js redirect"), {
      digest: "NEXT_REDIRECT;replace;/tracking;307;",
    });
    vi.mocked(serverAccount).mockRejectedValue(frameworkError);
    await expect(Home()).rejects.toBe(frameworkError);
  });
  it("does not swallow framework redirects while loading setup", async () => {
    const frameworkError = Object.assign(new Error("Next.js redirect"), {
      digest: "NEXT_REDIRECT;replace;/dashboard;307;",
    });
    vi.mocked(serverAccount).mockRejectedValue(frameworkError);
    await expect(TrackingPage({ searchParams: Promise.resolve({}) })).rejects.toBe(frameworkError);
  });
  it.each(["active", "paused", "blocked"] as const)(
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
