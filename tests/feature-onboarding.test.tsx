import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import FeaturePage from "@/app/feature/page";
import { serverAccount } from "@/lib/auth/session";
import { trackingStatuses } from "@/lib/tracking/registration";
import { registrationAvailable } from "@/lib/tracking/config";
import type { Account } from "@/lib/db/schema";

vi.mock("@/lib/auth/session", () => ({ serverAccount: vi.fn() }));
vi.mock("@/lib/tracking/registration", () => ({ trackingStatuses: vi.fn() }));
vi.mock("@/lib/tracking/config", () => ({ registrationAvailable: vi.fn() }));
vi.mock("next/navigation", async () => ({
  ...(await vi.importActual<typeof import("next/navigation")>("next/navigation")),
  useRouter: () => ({ refresh: vi.fn() }),
}));
const account = {
  id: "own",
  leetcodeUsername: null,
  gfgUsername: null,
  hackerRankUsername: null,
  chatId: null,
  status: "pending",
} as Account;
const initial = {
  username: null,
  connected: false,
  status: "pending",
  lastDelivery: null,
  paused: false,
  registrationId: null,
} as const;
const page = async (platform?: string) =>
  renderToStaticMarkup(await FeaturePage({ searchParams: Promise.resolve({ platform }) }));
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(serverAccount).mockResolvedValue(account);
  vi.mocked(registrationAvailable).mockReturnValue(true);
  vi.mocked(trackingStatuses).mockResolvedValue({
    leetcode: initial,
    gfg: initial,
    hackerrank: initial,
  });
});
describe("service selection after Telegram sign-in", () => {
  it("registers Notes on Feature even when coding-platform registration is closed", async () => {
    vi.mocked(registrationAvailable).mockReturnValue(false);
    vi.mocked(trackingStatuses).mockResolvedValue({ notes: initial });
    const html = await page("notes");
    expect(html).toContain('id="notes-service-code"');
    expect(html).toContain('pattern="[A-Za-z0-9]{5,9}"');
    expect(html).toContain("Register Notes");
    expect(html).not.toContain("Connect Daily Grind once");
    expect(html).not.toContain('href="/notes"');
  });
  it("asks visitors to sign in before showing service selection or registration", async () => {
    vi.mocked(serverAccount).mockResolvedValue(null);
    const html = await page();
    expect(html).toContain("Sign in to choose your services");
    expect(html).toContain('href="/api/auth/telegram/login?next=feature"');
    expect(html).not.toContain('aria-label="Tracking services"');
    expect(html).not.toContain('name="username"');
    expect(trackingStatuses).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });
  it("offers all four services without enabling one automatically", async () => {
    const html = await page();
    for (const platform of ["leetcode", "gfg", "hackerrank"])
      expect(html).toContain(`href="/feature?platform=${platform}"`);
    expect(html.match(/Not enabled/g)).toHaveLength(4);
    expect(html).not.toContain('name="username"');
    expect(trackingStatuses).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });
  it.each(["leetcode", "gfg", "hackerrank"] as const)(
    "opens only the chosen %s registration form",
    async (platform) => {
      const html = await page(platform);
      expect(html).toContain(`for="${platform}-username"`);
      expect(html.match(/name="username"/g)).toHaveLength(1);
      expect(html).toContain('aria-current="page"');
      expect(html).toContain("Logged in");
      expect(trackingStatuses).toHaveBeenCalledExactlyOnceWith(account, [platform]);
      expect(fetch).not.toHaveBeenCalled();
    },
  );
  it("keeps existing registrations enabled when choosing another service", async () => {
    vi.mocked(serverAccount).mockResolvedValue({ ...account, leetcodeUsername: "lc_user" });
    const html = await page("gfg");
    expect(html).toContain("lc_user");
    expect(html).toContain("Manage service");
    expect(html.match(/Not enabled/g)).toHaveLength(3);
    expect(html).toContain('for="gfg-username"');
    expect(html).not.toContain('for="leetcode-username"');
  });
  it("retains a registered service when new registrations are closed", async () => {
    vi.mocked(registrationAvailable).mockReturnValue(false);
    vi.mocked(serverAccount).mockResolvedValue({ ...account, leetcodeUsername: "lc_user" });
    vi.mocked(trackingStatuses).mockResolvedValue({
      leetcode: { ...initial, username: "lc_user" },
    });
    const html = await page("leetcode");
    expect(html).toContain("Service enabled");
    expect(html).toContain("Connect Telegram");
    expect(html).not.toContain('name="username"');
  });
  it("returns unknown service selections to the catalog", async () => {
    const html = await page("unknown");
    expect(html).toContain('aria-label="Tracking services"');
    expect(html).not.toContain('name="username"');
    expect(trackingStatuses).not.toHaveBeenCalled();
  });
  it("handles setup failures without exposing registration or private errors", async () => {
    vi.mocked(trackingStatuses).mockRejectedValue(new Error("private database error"));
    const html = await page("leetcode");
    expect(html).toContain("Tracking is temporarily unavailable");
    expect(html).not.toContain("private database error");
    expect(html).not.toContain('name="username"');
  });
});
