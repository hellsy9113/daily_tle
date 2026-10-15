import Link from "next/link";
import { unstable_rethrow } from "next/navigation";
import { SiteShell } from "@/components/site-shell";
import { TrackingPanel } from "@/components/tracking-panel";
import { serverAccount } from "@/lib/auth/session";
import { registrationAvailable } from "@/lib/tracking/config";
import { trackingStatus } from "@/lib/tracking/registration";

export const metadata = { title: "Optional features · LeetCode Tracker" };

export default async function FeaturePage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; platform?: string }>;
}) {
  const params = await searchParams;
  const platform = params.platform === "hackerrank" ? "hackerrank" : "gfg";
  const label = platform === "hackerrank" ? "HackerRank" : "GFG";
  const displayName = platform === "hackerrank" ? "HackerRank" : "GeeksforGeeks";
  const available = registrationAvailable();
  let account;
  let status;
  let unavailable = false;
  try {
    account = await serverAccount();
    if (account) status = await trackingStatus(account, platform);
  } catch (error) {
    unstable_rethrow(error);
    unavailable = true;
  }
  return (
    <SiteShell signedIn={Boolean(account)}>
      <nav className="feature-tabs" aria-label="Optional tracking features">
        <Link href="/feature" aria-current={platform === "gfg" ? "page" : undefined}>
          GeeksforGeeks
        </Link>
        <Link
          href="/feature?platform=hackerrank"
          aria-current={platform === "hackerrank" ? "page" : undefined}
        >
          HackerRank
        </Link>
      </nav>
      <div className="tracking-layout">
        <div className="tracking-intro">
          <p className="eyebrow">An optional service for your daily grind</p>
          <h1>
            {displayName}.
            <br />
            Your progress, together.
          </h1>
          <p className="lead">
            Track your {label} public profile alongside LeetCode, with its own calendar and daily
            Telegram recap.
          </p>

          <p className="field-help">
            {platform === "hackerrank"
              ? "HackerRank public history can be incomplete. Counts reflect saved solved challenges; first-ever solve dates are not guaranteed."
              : "GFG publishes totals and a solved inventory. Its timestamps currently omit a timezone, so newly observed activity is clearly labeled and historical daily counts remain unavailable."}
          </p>
        </div>
        {status && (available || status.username) && !unavailable ? (
          <TrackingPanel key={platform} platform={platform} initialStatus={status} />
        ) : (
          <section className="tracking-panel" aria-labelledby="feature-signin-title">
            <p className="eyebrow">{displayName} tracking</p>
            <h2 id="feature-signin-title">
              {unavailable
                ? `${label} tracking is temporarily unavailable`
                : available
                  ? "Sign in to enable this feature"
                  : `${label} registration is being set up`}
            </h2>
            <p className="muted">
              Enable {label} separately for your account. Your LeetCode registration continues
              independently.
            </p>
            {params.error === "login" && (
              <p className="inline-error" role="alert">
                Sign-in expired or could not be verified. Please try again.
              </p>
            )}
            {available && !unavailable ? (
              <a
                className="button primary full-width"
                href={`/api/auth/telegram/login?next=${platform === "hackerrank" ? "hackerrank" : "feature"}`}
              >
                Continue with Telegram <span aria-hidden="true">→</span>
              </a>
            ) : (
              <Link className="button secondary full-width" href="/">
                Return home
              </Link>
            )}
            <p className="field-help">
              No {label} password is needed. Registration permanently links one public username.
            </p>
          </section>
        )}
      </div>
    </SiteShell>
  );
}
