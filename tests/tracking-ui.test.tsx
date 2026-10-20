import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { TrackingPanel } from "@/components/tracking-panel";
import type { TrackingStatus } from "@/lib/tracking/types";
import { SiteShell } from "@/components/site-shell";
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn() }) }));

const initial: TrackingStatus = {
  username: null,
  connected: false,
  status: "pending",
  lastDelivery: null,
  paused: false,
  registrationId: null,
};

describe("tracking UI states", () => {
  it("labels the input, explains permanence and requires acknowledgement", () => {
    const html = renderToStaticMarkup(<TrackingPanel initialStatus={initial} />);
    expect(html).toContain('for="leetcode-username"');
    expect(html).toContain('aria-describedby="username-help"');
    expect(html).toContain("stays fixed until you revoke");
    expect(html).not.toContain('type="checkbox"');
    expect(html).toContain("Continue to agreement");
    expect(html).toContain("disabled");
  });
  it("renders registered usernames read-only with a link to optional recaps", () => {
    const html = renderToStaticMarkup(
      <TrackingPanel initialStatus={{ ...initial, username: "registered_user" }} />,
    );
    expect(html).toContain("registered_user");
    expect(html).toContain("Locked");
    expect(html).not.toContain('name="username"');
    expect(html).toContain('href="/feature?platform=daily-grind"');
  });
  it.each(["active", "paused", "blocked"] as const)("renders the %s connection state", (status) => {
    const html = renderToStaticMarkup(
      <TrackingPanel initialStatus={{ ...initial, username: "user", connected: true, status }} />,
    );
    expect(html).toContain("Telegram recaps are optional");
    expect(html).not.toContain("Connect Telegram");
  });
  it("keeps report status out of platform setup", () => {
    const html = renderToStaticMarkup(
      <TrackingPanel
        initialStatus={{
          ...initial,
          username: "user",
          connected: true,
          status: "active",
          lastDelivery: { reportDate: "2026-10-12", status: "failed", sentAt: null },
        }}
      />,
    );
    expect(html).not.toContain("Latest report");
    expect(html).not.toMatch(/lease|database|postgres/i);
  });
  it("provides navigation, one main landmark and a profile link for authenticated users", () => {
    const html = renderToStaticMarkup(
      <SiteShell signedIn>
        <p>Content</p>
      </SiteShell>,
    );
    expect(html).toContain('aria-label="Main navigation"');
    expect(html).toContain('id="main-content"');
    expect(html).not.toContain('action="/api/auth/logout"');
    expect(html).toContain('href="/profile"');
    expect(html).toContain('href="/feature"');
    expect(html).toContain('href="/dashboard"');
    expect(html).not.toContain("Commands");
  });
});
