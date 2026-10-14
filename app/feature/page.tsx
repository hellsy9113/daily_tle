import Link from "next/link";
import { unstable_rethrow } from "next/navigation";
import { SiteShell } from "@/components/site-shell";
import { TrackingPanel } from "@/components/tracking-panel";
import { serverAccount } from "@/lib/auth/session";
import { registrationAvailable } from "@/lib/tracking/config";
import { trackingStatus } from "@/lib/tracking/registration";

export const metadata = { title: "GFG feature · LeetCode Tracker" };

export default async function FeaturePage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const params = await searchParams;
  const available = registrationAvailable();
  let account;
  let status;
  let unavailable = false;
  try {
    account = await serverAccount();
    if (account) status = await trackingStatus(account, "gfg");
  } catch (error) {
    unstable_rethrow(error);
    unavailable = true;
  }
  return (
    <SiteShell signedIn={Boolean(account)}>
      <div className="tracking-layout">
        <div className="tracking-intro">
          <p className="eyebrow">An optional service for your daily grind</p>
          <h1>
            GeeksforGeeks.
            <br />
            Your progress, together.
          </h1>
          <p className="lead">
            Track your GFG public profile alongside LeetCode, with its own calendar and daily
            Telegram recap.
          </p>
          <ol className="setup-steps">
            <li>
              <span>01</span>Sign in with your Telegram account
            </li>
            <li>
              <span>02</span>Register your GFG username once
            </li>
            <li>
              <span>03</span>Use the same Daily Grind bot connection
            </li>
          </ol>
          <p className="field-help">
            GFG publishes totals and a solved inventory. Its timestamps currently omit a timezone,
            so newly observed activity is clearly labeled and historical daily counts remain
            unavailable.
          </p>
        </div>
        {status && (available || status.username) && !unavailable ? (
          <TrackingPanel platform="gfg" initialStatus={status} />
        ) : (
          <section className="tracking-panel" aria-labelledby="gfg-signin-title">
            <p className="eyebrow">GeeksforGeeks tracking</p>
            <h2 id="gfg-signin-title">
              {unavailable
                ? "GFG tracking is temporarily unavailable"
                : available
                  ? "Sign in to enable this feature"
                  : "GFG registration is being set up"}
            </h2>
            <p className="muted">
              Enable GFG separately for your account. Your LeetCode registration continues
              independently.
            </p>
            {params.error === "login" && (
              <p className="inline-error" role="alert">
                Sign-in expired or could not be verified. Please try again.
              </p>
            )}
            {available && !unavailable ? (
              <a className="button primary full-width" href="/api/auth/telegram/login?next=feature">
                Continue with Telegram <span aria-hidden="true">→</span>
              </a>
            ) : (
              <Link className="button secondary full-width" href="/">
                Return home
              </Link>
            )}
            <p className="field-help">
              No GFG password is needed. Registration permanently links one public username.
            </p>
          </section>
        )}
      </div>
    </SiteShell>
  );
}
