import Link from "next/link";
import { unstable_rethrow } from "next/navigation";
import { SiteShell } from "@/components/site-shell";
import type { TrackingStatus } from "@/lib/tracking/types";
import { featureViews } from "@/components/feature-views";
import { serverAccount } from "@/lib/auth/session";
import type { Account } from "@/lib/db/schema";
import { registrationAvailable } from "@/lib/tracking/config";
import { trackingStatuses } from "@/lib/tracking/registration";
import { platformUsername } from "@/lib/tracking/platforms";
import { features as services, featurePaths, type FeatureId } from "@/lib/features/catalog";
import { InfoPopover } from "@/components/info-popover";
import { NotesIcon } from "@/components/notes-icons";

export const metadata = { title: "Choose your services · Track.it" };

export default async function FeaturePage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; platform?: string }>;
}) {
  const params = await searchParams;
  const selected = services.find((service) => service.id === params.platform);
  const available = registrationAvailable();
  const selectedAvailable = selected?.id === "notes" || available;
  let account: Account | null = null;
  let status;
  let serviceStatuses: Partial<Record<FeatureId, TrackingStatus>> = {};
  let unavailable = false;
  try {
    account = await serverAccount();
    if (account) {
      const currentAccount = account;
      const ids = services
        .filter(
          (service) => platformUsername(currentAccount, service.id) || selected?.id === service.id,
        )
        .map((service) => service.id);
      if (ids.length) serviceStatuses = await trackingStatuses(currentAccount, ids);
      status = selected ? serviceStatuses[selected.id] : undefined;
    }
  } catch (error) {
    unstable_rethrow(error);
    unavailable = true;
  }

  const Setup = selected ? featureViews[selected.id].Setup : null;

  return (
    <SiteShell signedIn={Boolean(account)}>
      <div className="feature-heading">
        <p className="eyebrow">
          {account ? <span className="badge badge-active">Logged in</span> : "Your daily practice"}
        </p>
        <h1>{account ? "Choose your services." : "Your progress starts with sign-in."}</h1>
        <p className="lead">
          {account
            ? "Enable services independently. Register once to use each service and manage it here."
            : "Sign in with Telegram, then choose the services you want to use."}
        </p>
      </div>

      {account && (
        <nav className="service-grid" aria-label="Tracking services">
          {services.map((service) => {
            const username = platformUsername(account, service.id);
            return (
              <article className="service-card" key={service.id}>
                <div className="service-card-toolbar">
                  <span
                    className={`badge ${username && !serviceStatuses[service.id]?.paused ? "badge-active" : ""}`}
                  >
                    {username
                      ? serviceStatuses[service.id]?.paused
                        ? "Paused"
                        : "Enabled"
                      : "Not enabled"}
                  </span>
                </div>
                <h2>
                  <Link
                    href={featurePaths[service.id]}
                    aria-current={selected?.id === service.id ? "page" : undefined}
                  >
                    {service.name}
                  </Link>
                </h2>
                <p>{service.description}</p>
                {username && <span className="service-username mono">{username}</span>}
                <Link href={featurePaths[service.id]} className="service-action">
                  {username ? "Manage service" : `Enable ${service.name}`}{" "}
                  <span aria-hidden="true">→</span>
                </Link>
              </article>
            );
          })}
        </nav>
      )}

      {account &&
      selected &&
      !unavailable &&
      status &&
      Setup &&
      (selectedAvailable || status.username) ? (
        <div className="tracking-layout feature-setup">
          <div className="tracking-intro">
            <p className="eyebrow">{selected.name} service</p>
            <h2>
              {status.username
                ? status.paused
                  ? "Your service is paused."
                  : "Your service is enabled."
                : selected.id === "notes"
                  ? "Register your private notebook."
                  : `Enable ${selected.name} tracking.`}
            </h2>
            <p className="lead">{selected.description}</p>
            <p className="field-help">{selected.coverage}</p>
            {selected.id !== "notes" && (
              <p className="field-help">
                Your dashboard is available after registration. Connect Daily Grind once for all
                enabled services to receive morning Telegram recaps.
              </p>
            )}
          </div>
          <Setup key={selected.id} platform={selected.id} initialStatus={status} />
        </div>
      ) : !account || unavailable || (selected && !status?.username && !selectedAvailable) ? (
        <section className="tracking-panel feature-signin" aria-labelledby="feature-signin-title">
          <h2 id="feature-signin-title">
            {unavailable
              ? "Tracking is temporarily unavailable"
              : !selectedAvailable
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
          {selectedAvailable && !unavailable && !account ? (
            <a
              className="button primary full-width"
              href={`/api/auth/telegram/login?next=${selected?.id ?? "feature"}`}
            >
              Continue with Telegram <span aria-hidden="true">→</span>
            </a>
          ) : (
            <Link className="button secondary full-width" href="/">
              Return home
            </Link>
          )}
          {!account && !unavailable && (
            <div className="notes-actions">
              <Link
                className="button secondary icon-button"
                href="/notes"
                title="Unlock Notes with a code"
                aria-label="Unlock Notes with a code"
              >
                <NotesIcon name="lock" />
              </Link>
              <InfoPopover label="Notes code access">
                Already registered Notes? Use your secret code for 20-minute access without website
                sign-in.
              </InfoPopover>
            </div>
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
