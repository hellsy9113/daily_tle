import Link from "next/link";
import { redirect, unstable_rethrow } from "next/navigation";
import { SiteShell } from "@/components/site-shell";
import { TrackingPanel } from "@/components/tracking-panel";
import { serverAccount } from "@/lib/auth/session";
import { registrationAvailable } from "@/lib/tracking/config";
import { trackingStatus } from "@/lib/tracking/registration";

export const metadata = { title: "Daily tracking · LeetCode Tracker" };

export default async function TrackingPage({
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
    if (account) status = await trackingStatus(account);
  } catch (error) {
    unstable_rethrow(error);
    unavailable = true;
  }
  if (status?.username && status.connected) redirect("/dashboard");
  return (
    <SiteShell signedIn={Boolean(account)}>
      <div className="tracking-layout">
        <div className="tracking-intro">
          <p className="eyebrow">Daily, without the reminders</p>
          <h1>
            Your practice.
            <br />
            One daily recap.
          </h1>
          <p className="lead">
            Yesterday&apos;s Accepted problems, delivered to your Telegram inbox.
          </p>
          <ol className="setup-steps">
            <li>
              <span>01</span>Sign in with Telegram
            </li>
            <li>
              <span>02</span>Register your username once
            </li>
            <li>
              <span>03</span>Connect the bot and you&apos;re set
            </li>
          </ol>
          <p className="field-help">
            Reports use available public LeetCode history and include a warning when coverage is
            limited.
          </p>
        </div>
        {status && (available || status.username) ? (
          <TrackingPanel initialStatus={status} />
        ) : (
          <section className="tracking-panel" aria-labelledby="signin-title">
            <p className="eyebrow">Get started</p>
            <h2 id="signin-title">
              {unavailable
                ? "Tracking is temporarily unavailable"
                : available
                  ? "Sign in to start tracking"
                  : "Daily tracking is being set up"}
            </h2>
            <p className="muted">
              {unavailable
                ? "Please try again shortly."
                : available
                  ? "Use the Telegram account where you want your daily reports delivered."
                  : "Registration will open once daily tracking is ready. Explore how daily recaps and your activity calendar work."}
            </p>
            {params.error === "login" && (
              <p className="inline-error" role="alert">
                Sign-in expired or could not be verified. Please try again.
              </p>
            )}
            {available && !unavailable ? (
              <a href="/api/auth/telegram/login" className="button primary full-width">
                Continue with Telegram <span aria-hidden="true">→</span>
              </a>
            ) : (
              <Link className="button secondary full-width" href="/#how-it-works">
                See how tracking works
              </Link>
            )}
            <p className="field-help">One Telegram account. One permanent LeetCode username.</p>
          </section>
        )}
      </div>
    </SiteShell>
  );
}
