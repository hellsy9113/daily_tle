import Link from "next/link";
import { unstable_rethrow } from "next/navigation";
import { SiteShell } from "@/components/site-shell";
import { ServiceControl } from "@/components/service-control";
import type { TrackingStatus } from "@/lib/tracking/types";
import { TrackingPanel } from "@/components/tracking-panel";
import { serverAccount } from "@/lib/auth/session";
import type { Account } from "@/lib/db/schema";
import { registrationAvailable } from "@/lib/tracking/config";
import { trackingStatus } from "@/lib/tracking/registration";
import { featurePaths, platformUsername } from "@/lib/tracking/platforms";
import type { ActivityPlatform } from "@/lib/activity/types";

export const metadata = { title: "Choose your services · Track.it" };

const services = [
  {
    platform: "leetcode",
    name: "LeetCode",
    description:
      "Revisit Accepted problems with a daily calendar, saved links, and Telegram recaps.",
    coverage:
      "LeetCode exposes recent Accepted history only. Saved activity builds over time; older solves may be missing.",
  },
  {
    platform: "gfg",
    name: "GeeksforGeeks",
    description: "Follow your solved inventory and newly observed practice in a separate calendar.",
    coverage:
      "GFG publishes totals and a solved inventory. Its timestamps currently omit a timezone, so newly observed activity is clearly labeled and historical daily counts remain unavailable.",
  },
  {
    platform: "hackerrank",
    name: "HackerRank",
    description: "Keep public solved challenges, problem links, and daily recaps together.",
    coverage:
      "HackerRank public history can be incomplete. Counts reflect saved solved challenges; first-ever solve dates are not guaranteed.",
  },
] satisfies { platform: ActivityPlatform; name: string; description: string; coverage: string }[];

export default async function FeaturePage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; platform?: string }>;
}) {
  const params = await searchParams;
  const selected = services.find((service) => service.platform === params.platform);
  const available = registrationAvailable();
  let account: Account | null = null;
  let status;
  const serviceStatuses: Partial<Record<ActivityPlatform, TrackingStatus>> = {};
  let unavailable = false;
  try {
    account = await serverAccount();
    if (account) {
      const currentAccount = account;
      await Promise.all(
        services
          .filter(
            (service) =>
              platformUsername(currentAccount, service.platform) ||
              selected?.platform === service.platform,
          )
          .map(async (service) => {
            serviceStatuses[service.platform] = await trackingStatus(
              currentAccount,
              service.platform,
            );
          }),
      );
      status = selected ? serviceStatuses[selected.platform] : undefined;
    }
  } catch (error) {
    unstable_rethrow(error);
    unavailable = true;
  }

  return (
    <SiteShell signedIn={Boolean(account)}>
      <div className="feature-heading">
        <p className="eyebrow">
          {account ? <span className="badge badge-active">Logged in</span> : "Your daily practice"}
        </p>
        <h1>{account ? "Choose what you track." : "Your progress starts with sign-in."}</h1>
        <p className="lead">
          {account
            ? "Enable LeetCode, GeeksforGeeks, or HackerRank independently. Register each public username once to add its activity to your dashboard."
            : "Sign in with Telegram, then choose the services you want to track. No coding-platform password is needed."}
        </p>
      </div>

      {account && (
        <nav className="service-grid" aria-label="Tracking services">
          {services.map((service) => {
            const username = platformUsername(account, service.platform);
            return (
              <article className="service-card" key={service.platform}>
                <div className="service-card-toolbar">
                  <span
                    className={`badge ${username && !serviceStatuses[service.platform]?.paused ? "badge-active" : ""}`}
                  >
                    {username
                      ? serviceStatuses[service.platform]?.paused
                        ? "Paused"
                        : "Enabled"
                      : "Not enabled"}
                  </span>
                  {username && serviceStatuses[service.platform]?.registrationId && (
                    <ServiceControl
                      platform={service.platform}
                      paused={serviceStatuses[service.platform]!.paused}
                      registrationId={serviceStatuses[service.platform]!.registrationId!}
                    />
                  )}
                </div>
                <h2>
                  <Link
                    href={featurePaths[service.platform]}
                    aria-current={selected?.platform === service.platform ? "page" : undefined}
                  >
                    {service.name}
                  </Link>
                </h2>
                <p>{service.description}</p>
                {username && <span className="service-username mono">{username}</span>}
                <Link href={featurePaths[service.platform]} className="service-action">
                  {username ? "Manage service" : `Enable ${service.name}`}{" "}
                  <span aria-hidden="true">→</span>
                </Link>
              </article>
            );
          })}
        </nav>
      )}

      {account && selected && !unavailable && status && (available || status.username) ? (
        <div className="tracking-layout feature-setup">
          <div className="tracking-intro">
            <p className="eyebrow">{selected.name} service</p>
            <h2>
              {status.username
                ? status.paused
                  ? "Your service is paused."
                  : "Your service is enabled."
                : `Enable ${selected.name} tracking.`}
            </h2>
            <p className="lead">{selected.description}</p>
            <p className="field-help">{selected.coverage}</p>
            <p className="field-help">
              Your dashboard is available after registration. Connect Daily Grind once for all
              enabled services to receive morning Telegram recaps.
            </p>
          </div>
          <TrackingPanel
            key={selected.platform}
            platform={selected.platform}
            initialStatus={status}
          />
        </div>
      ) : !account || unavailable || (selected && !status?.username && !available) ? (
        <section className="tracking-panel feature-signin" aria-labelledby="feature-signin-title">
          <h2 id="feature-signin-title">
            {unavailable
              ? "Tracking is temporarily unavailable"
              : !available
                ? "Service registration is being set up"
                : "Sign in to choose your services"}
          </h2>
          <p className="muted">
            {unavailable
              ? "Please try again shortly."
              : "Use the Telegram account where you want your daily recaps delivered. Your services are enabled separately after sign-in."}
          </p>
          {params.error === "login" && (
            <p className="inline-error" role="alert">
              Sign-in expired or could not be verified. Please try again.
            </p>
          )}
          {available && !unavailable && !account ? (
            <a
              className="button primary full-width"
              href={`/api/auth/telegram/login?next=${selected?.platform ?? "feature"}`}
            >
              Continue with Telegram <span aria-hidden="true">→</span>
            </a>
          ) : (
            <Link className="button secondary full-width" href="/">
              Return home
            </Link>
          )}
        </section>
      ) : (
        <p className="field-help">
          Choose a service above to register or manage it. Only enabled services appear on your
          dashboard.
        </p>
      )}
    </SiteShell>
  );
}
