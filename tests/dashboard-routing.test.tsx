import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { serverAccount } from "@/lib/auth/session";
import { trackingStatus } from "@/lib/tracking/registration";
import TrackingPage from "@/app/tracking/page";
import DashboardPage from "@/app/dashboard/page";
import Home from "@/app/page";
import FeaturePage from "@/app/feature/page";
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
    expect(html).toContain('href="/api/auth/telegram/login"');
    const navigation = /<nav aria-label="Main navigation">([\s\S]*?)<\/nav>/.exec(html)?.[1];
    expect(navigation).toBeDefined();
    expect(navigation).not.toContain('href="/feature"');
    expect(navigation).toContain("Sign in");
    expect(html).toContain('id="how-it-works"');
    expect(html).toContain('id="demo"');
    expect(html).toContain("GeeksforGeeks");
    expect(html).toContain("HackerRank");
    expect(html).toContain('href="https://t.me/todo1245bot"');
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
    await expect(FeaturePage({ searchParams: Promise.resolve({}) })).rejects.toBe(frameworkError);
  });
  it.each([{}, { error: "login" }])("preserves old LeetCode setup links", async (params) => {
    await expect(TrackingPage({ searchParams: Promise.resolve(params) })).rejects.toThrow(
      `redirect:/feature?platform=leetcode${params.error ? "&error=login" : ""}`,
    );
    expect(serverAccount).not.toHaveBeenCalled();
  });
  it.each([null, { ...account, leetcodeUsername: null }])(
    "requires sign-in and at least one registered service before the dashboard",
    async (user) => {
      vi.mocked(serverAccount).mockResolvedValue(user);
      await expect(DashboardPage()).rejects.toThrow("redirect:/feature");
      expect(trackingStatus).not.toHaveBeenCalled();
    },
  );
  it("loads only the current account's status and public bot link", async () => {
    const page = await DashboardPage();
    expect(trackingStatus).toHaveBeenCalledExactlyOnceWith(account);
    expect(page.props.children.props.botUrl).toBe("https://t.me/test_bot");
  });
  it.each(["leetcode", "gfg", "hackerrank"] as const)(
    "opens the dashboard for %s alone before Daily Grind is connected",
    async (platform) => {
      const user = {
        ...account,
        leetcodeUsername: null,
        gfgUsername: null,
        hackerRankUsername: null,
        chatId: null,
        status: "pending",
        [platform === "hackerrank" ? "hackerRankUsername" : `${platform}Username`]: "fixed-user",
      } as Account;
      vi.mocked(serverAccount).mockResolvedValue(user);
      vi.mocked(trackingStatus).mockResolvedValue({
        username: "fixed-user",
        connected: false,
        status: "pending",
        lastDelivery: null,
      });
      const page = await DashboardPage();
      expect(page.props.children.props.leetcodeEnabled).toBe(platform === "leetcode");
      expect(page.props.children.props.statusPlatform).toBe(platform);
      expect(trackingStatus).toHaveBeenCalledWith(
        ...(platform === "leetcode" ? [user] : [user, platform]),
      );
      const html = renderToStaticMarkup(page);
      expect(html).toContain(`href="/feature?platform=${platform}"`);
      expect(html).toContain("Connect Daily Grind");
      expect(html).not.toContain("Scheduled for the next morning");
      expect(fetch).not.toHaveBeenCalled();
    },
  );
});
