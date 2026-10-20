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
import { FeatureDialog } from "@/components/feature-dialog";

export const metadata = {
  robots: { index: false, follow: false },
  title: "Choose your services · Track.it",
};

export default async function FeaturePage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; platform?: string }>;
}) {
  const params = await searchParams;
  const selected = services.find((service) => service.id === params.platform);
  const available = registrationAvailable();
  const selectedAvailable = selected?.id === "notes" || selected?.id === "articles" || available;
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
  const serviceContent =
    account &&
    selected &&
    !unavailable &&
    status &&
    Setup &&
    (selectedAvailable || status.username) ? (
      <>
        <div className="tracking-intro">
          <p className="lead">{selected.description}</p>
          <p className="field-help">{selected.coverage}</p>
        </div>
        <Setup key={selected.id} platform={selected.id} initialStatus={status} />
      </>
    ) : !account || unavailable || (selected && !status?.username && !selectedAvailable) ? (
      <section className="tracking-panel feature-signin" aria-label="Sign in">
        {(unavailable || !selectedAvailable) && (
          <>
            <h2>
              {unavailable
                ? "Tracking is temporarily unavailable"
                : "Service registration is being set up"}
            </h2>
            <p className="muted">Please try again shortly.</p>
          </>
        )}
        {(params.error === "login" || params.error === "google-login") && (
          <p className="inline-error" role="alert">
            Sign-in expired or could not be verified. Please try again.
          </p>
        )}
        {selectedAvailable && !unavailable && !account ? (
          <div className="notes-actions">
            <a
              className="button primary full-width"
              href={`/api/auth/google/login?next=${selected?.id ?? "feature"}`}
            >
              Continue with Google <span aria-hidden="true">→</span>
            </a>
            <a
              className="button secondary full-width"
              href={`/api/auth/telegram/login?next=${selected?.id ?? "feature"}`}
            >
              Continue with Telegram
            </a>
          </div>
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
    );

  if (!account)
    return (
      <main id="main-content" tabIndex={-1} className="signin-page">
        <h1 className="sr-only">Sign in</h1>
        <div className="signin-card">{serviceContent}</div>
      </main>
    );

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
            : "Sign in with Google or Telegram, then choose the services you want to use."}
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
                    scroll={false}
                    aria-haspopup="dialog"
                    aria-current={selected?.id === service.id ? "page" : undefined}
                  >
                    {service.name}
                  </Link>
                </h2>
                <p>{service.description}</p>
                {username && <span className="service-username mono">{username}</span>}
                <Link
                  id={`feature-${service.id}-action`}
                  href={featurePaths[service.id]}
                  scroll={false}
                  aria-haspopup="dialog"
                  className="service-action"
                >
                  {username ? "Manage service" : `Enable ${service.name}`}{" "}
                  <span aria-hidden="true">→</span>
                </Link>
              </article>
            );
          })}
        </nav>
      )}

      {account && selected ? (
        <FeatureDialog
          key={selected.id}
          title={`${selected.name} service`}
          triggerId={`feature-${selected.id}-action`}
        >
          {serviceContent}
        </FeatureDialog>
      ) : (
        serviceContent
      )}
    </SiteShell>
  );
}
