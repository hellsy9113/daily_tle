import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { serverAccount } from "@/lib/auth/session";
import { trackingStatuses } from "@/lib/tracking/registration";
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
vi.mock("@/lib/tracking/registration", () => ({ trackingStatuses: vi.fn() }));
vi.mock("@/lib/tracking/config", () => ({
  registrationAvailable: () => true,
  trackingBot: () => ({ username: "test_bot" }),
}));
const account = { leetcodeUsername: "fixed-user", chatId: 101, status: "active" } as Account;
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(serverAccount).mockResolvedValue(account);
  vi.mocked(trackingStatuses).mockResolvedValue({
    leetcode: {
      username: "fixed-user",
      connected: true,
      status: "active",
      lastDelivery: null,
      paused: false,
      registrationId: null,
    },
  });
});
describe("connected dashboard navigation", () => {
  it("opens an articles-only account's reading tab without an activity connection", async () => {
    vi.mocked(serverAccount).mockResolvedValue({
      ...account,
      leetcodeUsername: null,
      articlesRegisteredAt: new Date(),
    });
    vi.mocked(trackingStatuses).mockResolvedValue({
      articles: {
        username: "Daily reading",
        registrationId: "articles-generation",
        paused: false,
        connected: false,
        status: "pending",
        lastDelivery: null,
        topics: ["web"],
      },
    });
    const html = renderToStaticMarkup(await DashboardPage({}));
    expect(html).toContain('aria-label="Daily Articles"');
    expect(html).toContain('href="/dashboard?service=articles"');
    expect(html).not.toContain('id="activity-title"');
    expect(html).not.toContain("Connect Daily Grind");
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each([false, true])(
    "shows only Activity and registered Notes in dashboard navigation (Notes registered: %s)",
    async (notesRegistered) => {
      vi.mocked(serverAccount).mockResolvedValue({
        ...account,
        gfgUsername: "gfg_user",
        hackerRankUsername: "hr_user",
        codeforcesUsername: "cf_user",
        notesRegisteredAt: notesRegistered ? new Date() : null,
      });
      vi.mocked(trackingStatuses).mockImplementation(async (_account, ids = []) =>
        Object.fromEntries(
          ids.map((id) => [
            id,
            {
              username: id === "notes" ? "Private notebook" : "fixed-user",
              registrationId: id,
              paused: false,
              connected: id !== "notes",
              status: "active",
              lastDelivery: null,
            },
          ]),
        ),
      );
      const html = renderToStaticMarkup(await DashboardPage({}));
      const navigation = /<nav[^>]*aria-label="Dashboard services"[^>]*>([\s\S]*?)<\/nav>/.exec(
        html,
      )![1];
      const links = [...navigation.matchAll(/href="([^"]+)"/g)].map((match) => match[1]);
      expect(links).toEqual(
        notesRegistered ? ["/dashboard", "/dashboard?service=notes"] : ["/dashboard"],
      );
      expect(html).toContain('id="activity-title"');
      expect(html).toContain('id="gfg-activity-title"');
      expect(html).toContain('id="hackerrank-activity-title"');
      expect(html).toContain('id="codeforces-activity-title"');
      expect(fetch).not.toHaveBeenCalled();
    },
  );
  it("shows Activity when an unregistered user follows a Notes dashboard link", async () => {
    const html = renderToStaticMarkup(
      await DashboardPage({ searchParams: Promise.resolve({ service: "notes" }) }),
    );
    expect(html).not.toContain('href="/dashboard?service=notes"');
    expect(html).not.toContain('aria-label="Private notes"');
    const current = /<a[^>]*aria-current="page"[^>]*>Activity<\/a>/.exec(html)?.[0];
    expect(current).toContain('href="/dashboard"');
    expect(html).toContain('id="activity-title"');
  });
  it("marks Notes as active when a registered user opens it", async () => {
    vi.mocked(serverAccount).mockResolvedValue({ ...account, notesRegisteredAt: new Date() });
    const html = renderToStaticMarkup(
      await DashboardPage({ searchParams: Promise.resolve({ service: "notes" }) }),
    );
    const current = /<a[^>]*aria-current="page"[^>]*>Notes<\/a>/.exec(html)?.[0];
    expect(current).toContain('href="/dashboard?service=notes"');
    expect(html).toContain('aria-label="Private notes"');
    expect(html).not.toContain('id="activity-title"');
  });
  it("shows Notes in Dashboard navigation, not the main navigation, without requiring a bot", async () => {
    const user = { ...account, leetcodeUsername: null, notesRegisteredAt: new Date() } as Account;
    vi.mocked(serverAccount).mockResolvedValue(user);
    vi.mocked(trackingStatuses).mockResolvedValue({
      notes: {
        username: "Private notebook",
        registrationId: "notebook",
        paused: false,
        connected: false,
        status: "pending",
        lastDelivery: null,
      },
    });
    const html = renderToStaticMarkup(await DashboardPage({}));
    expect(html).toContain('aria-label="Dashboard services"');
    expect(html).toContain('href="/dashboard?service=notes"');
    expect(html).toContain('aria-label="Private notes"');
    const navigation = /<nav aria-label="Main navigation">([\s\S]*?)<\/nav>/.exec(html)?.[1];
    expect(navigation).not.toContain("Notes");
    expect(html).not.toContain("Connect Daily Grind");
  });
  it.each(["leetcode", "gfg", "hackerrank", "codeforces"] as const)(
    "replaces a paused %s calendar with a resume placeholder",
    async (platform) => {
      const usernames = {
        leetcodeUsername: "lc_user",
        gfgUsername: "gfg_user",
        hackerRankUsername: "hr_user",
        codeforcesUsername: "cf_user",
      };
      vi.mocked(serverAccount).mockResolvedValue({ ...account, ...usernames });
      vi.mocked(trackingStatuses).mockImplementation(async (_account, ids = []) =>
        Object.fromEntries(
          ids.map((id) => [
            id,
            {
              username:
                id === "leetcode"
                  ? "lc_user"
                  : id === "gfg"
                    ? "gfg_user"
                    : id === "codeforces"
                      ? "cf_user"
                      : "hr_user",
              connected: true,
              status: "active",
              lastDelivery: null,
              paused: id === platform,
              registrationId: "10000000-0000-4000-8000-000000000001",
            },
          ]),
        ),
      );
      const html = renderToStaticMarkup(await DashboardPage({}));
      expect(html).toContain("Your daily data is still saved");
      expect(html).toContain(`href="/feature?platform=${platform}"`);
      expect(html).not.toContain(
        `id="${platform === "leetcode" ? "activity-title" : `${platform}-activity-title`}"`,
      );
    },
  );
  it.each([account, { ...account, leetcodeUsername: null, chatId: null }])(
    "redirects a signed-in homepage visitor to the dashboard",
    async (user) => {
      vi.mocked(serverAccount).mockResolvedValue(user);
      await expect(Home()).rejects.toThrow("redirect:/dashboard");
      expect(trackingStatuses).not.toHaveBeenCalled();
    },
  );
  it("keeps the public homepage available without a session", async () => {
    vi.mocked(serverAccount).mockResolvedValue(null);
    const html = renderToStaticMarkup(await Home());
    expect(html).toContain('href="/api/auth/telegram/login"');
    const navigation = /<nav aria-label="Main navigation">([\s\S]*?)<\/nav>/.exec(html)?.[1];
    expect(navigation).toBeDefined();
    expect(navigation).toContain('href="/feature"');
    expect(navigation).toContain("Sign in");
    expect(html).toContain('id="how-it-works"');
    expect(html).toContain('id="demo"');
    expect(html).toContain("GeeksforGeeks");
    expect(html).toContain("HackerRank");
    expect(html).toContain("Codeforces");
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
      await expect(DashboardPage({})).rejects.toThrow("redirect:/feature");
      expect(trackingStatuses).not.toHaveBeenCalled();
    },
  );
  it("loads only the current account's status and public bot link", async () => {
    const page = await DashboardPage({});
    expect(trackingStatuses).toHaveBeenCalledExactlyOnceWith(account, ["leetcode"]);
    expect(page.props.children[1].props.showBot).toBe(false);
    expect(page.props.children[1].props.botUrl).toBe("");
  });
  it.each(["leetcode", "gfg", "hackerrank", "codeforces"] as const)(
    "opens the dashboard for %s alone before Daily Grind is connected",
    async (platform) => {
      const user = {
        ...account,
        leetcodeUsername: null,
        gfgUsername: null,
        hackerRankUsername: null,
        codeforcesUsername: null,
        chatId: null,
        status: "pending",
        [platform === "hackerrank" ? "hackerRankUsername" : `${platform}Username`]: "fixed-user",
      } as Account;
      vi.mocked(serverAccount).mockResolvedValue(user);
      vi.mocked(trackingStatuses).mockResolvedValue({
        [platform]: {
          username: "fixed-user",
          connected: false,
          status: "pending",
          lastDelivery: null,
          paused: false,
          registrationId: null,
        },
      });
      const page = await DashboardPage({});
      expect(page.props.children[1].props.statusPlatform).toBe(platform);
      expect(trackingStatuses).toHaveBeenCalledExactlyOnceWith(user, [platform]);
      const html = renderToStaticMarkup(page);
      expect(html).toContain(`href="/feature?platform=${platform}"`);
      expect(html).not.toContain('aria-label="Telegram bot status"');
      expect(html).not.toContain("Scheduled for the next morning");
      expect(fetch).not.toHaveBeenCalled();
    },
  );
});
