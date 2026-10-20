import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { serverAccount } from "@/lib/auth/session";
import { profileSummary } from "@/lib/profile";
import ProfilePage from "@/app/profile/page";
import RootLayout from "@/app/layout";
import type { Account } from "@/lib/db/schema";

vi.mock("@/lib/auth/session", () => ({ serverAccount: vi.fn() }));
vi.mock("@/lib/profile", () => ({ profileSummary: vi.fn() }));
vi.mock("next/font/google", () => ({
  Geist: () => ({ variable: "sans" }),
  Geist_Mono: () => ({ variable: "mono" }),
}));
vi.mock("next/navigation", async () => ({
  ...(await vi.importActual<typeof import("next/navigation")>("next/navigation")),
  useRouter: () => ({ refresh: vi.fn() }),
  redirect: (path: string) => {
    throw new Error(`redirect:${path}`);
  },
}));

beforeEach(() => vi.clearAllMocks());
describe("profile access and initial theme", () => {
  it("requires authentication for the profile", async () => {
    vi.mocked(serverAccount).mockResolvedValue(null);
    await expect(ProfilePage()).rejects.toThrow("redirect:/feature");
    expect(profileSummary).not.toHaveBeenCalled();
  });
  it("allows a signed-in account with no services to manage its settings", async () => {
    const account = { id: "own", theme: "dark" } as Account;
    vi.mocked(serverAccount).mockResolvedValue(account);
    vi.mocked(profileSummary).mockResolvedValue({
      telegramId: 101,
      createdAt: "2026-10-18T01:00:00Z",
      connected: false,
      status: "pending",
      theme: "dark",
      timezone: "Asia/Kolkata",
      timezones: ["Asia/Kolkata", "America/New_York", "UTC"],
      services: [],
    });
    const html = renderToStaticMarkup(await ProfilePage());
    expect(html).toContain("Profile &amp; settings");
    expect(html).toContain('action="/api/auth/logout"');
    expect(profileSummary).toHaveBeenCalledWith(account);
  });
  it.each(["light", "dark"] as const)(
    "renders the account's %s theme before hydration",
    async (theme) => {
      vi.mocked(serverAccount).mockResolvedValue({ theme } as Account);
      expect(
        renderToStaticMarkup(
          await RootLayout({ params: Promise.resolve({}), children: <p>Content</p> }),
        ),
      ).toContain(`data-theme="${theme}"`);
    },
  );
  it("uses system colors without a saved preference, including during a database outage", async () => {
    vi.mocked(serverAccount).mockResolvedValue(null);
    expect(
      renderToStaticMarkup(
        await RootLayout({ params: Promise.resolve({}), children: <p>Content</p> }),
      ),
    ).not.toContain("data-theme");
    vi.mocked(serverAccount).mockRejectedValue(new Error("Private database failure"));
    const html = renderToStaticMarkup(
      await RootLayout({ params: Promise.resolve({}), children: <p>Content</p> }),
    );
    expect(html).not.toContain("Private database failure");
    expect(html).not.toContain("data-theme");
  });
});
