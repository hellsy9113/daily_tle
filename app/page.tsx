import Link from "next/link";
import { redirect, unstable_rethrow } from "next/navigation";
import { HomePreview } from "@/components/home-preview";
import { SiteShell } from "@/components/site-shell";
import { serverAccount } from "@/lib/auth/session";

const features = [
  {
    number: "01",
    title: "A recap worth waking up to.",
    description:
      "Yesterday's Accepted problems and their links, delivered to Telegram each morning. Pick up where you left off.",
    detail: "Daily delivery · Asia/Kolkata",
  },
  {
    number: "02",
    title: "See the habit taking shape.",
    description:
      "Follow your practice on a 365-day calendar. See active days, solved problems, and the progress you build over time.",
    detail: "Your personal activity dashboard",
  },
  {
    number: "03",
    title: "Set up once. Keep solving.",
    description:
      "Connect your Telegram account and register your LeetCode username once. Your daily recap takes care of itself.",
    detail: "Pause and resume whenever you need",
  },
];

export default async function Home() {
  const account = await serverAccount().catch((error: unknown) => {
    unstable_rethrow(error);
    return null;
  });
  if (account) redirect("/dashboard");

  return (
    <SiteShell>
      <div className="landing-page">
        <div className="landing-hero">
          <div className="landing-intro">
            <p className="landing-kicker">
              <span aria-hidden="true" /> A little practice. Every day.
            </p>
            <h1>
              Keep solving.
              <br />
              <span>See your progress.</span>
            </h1>
            <p className="lead">
              Turn your LeetCode practice into a habit you can see. A daily Telegram recap and a
              personal activity calendar keep every Accepted solution in view.
            </p>
            <div className="landing-actions">
              <Link className="button primary" href="/tracking">
                Start tracking <span aria-hidden="true">→</span>
              </Link>
              <a className="landing-text-link" href="#how-it-works">
                How it works <span aria-hidden="true">↗</span>
              </a>
            </div>
            <p className="hero-caption">Sign in with Telegram. Bring your LeetCode username.</p>
          </div>
          <HomePreview />
        </div>

        <section className="landing-features" aria-labelledby="features-title">
          <div className="landing-section-heading">
            <p className="eyebrow">Built around your practice</p>
            <h2 id="features-title">You do the solving. We keep the story.</h2>
          </div>
          <div className="landing-feature-grid">
            {features.map((feature) => (
              <article className="landing-feature" key={feature.number}>
                <span className="landing-number" aria-hidden="true">
                  {feature.number}
                </span>
                <h3>{feature.title}</h3>
                <p>{feature.description}</p>
                <span className="landing-feature-detail">{feature.detail}</span>
              </article>
            ))}
          </div>
        </section>

        <section className="landing-setup" id="how-it-works" aria-labelledby="how-it-works-title">
          <div className="landing-section-heading">
            <p className="eyebrow">Three steps. One routine.</p>
            <h2 id="how-it-works-title">Make room for daily progress.</h2>
            <p>Connect once, then get back to your next problem.</p>
          </div>
          <ol className="landing-steps">
            <li>
              <span className="landing-step-number" aria-hidden="true">
                01
              </span>
              <div>
                <h3>Sign in with Telegram</h3>
                <p>Use the account where you want your morning recap delivered.</p>
              </div>
            </li>
            <li>
              <span className="landing-step-number" aria-hidden="true">
                02
              </span>
              <div>
                <h3>Register your LeetCode username</h3>
                <p>Choose carefully: your account stays linked to this username.</p>
              </div>
            </li>
            <li>
              <span className="landing-step-number" aria-hidden="true">
                03
              </span>
              <div>
                <h3>Connect your daily recaps</h3>
                <p>Open your personal Telegram link and tap Start. Your dashboard is ready.</p>
              </div>
            </li>
          </ol>
        </section>

        <section className="landing-cta" aria-labelledby="start-title">
          <div>
            <p className="eyebrow">Small steps. Daily progress.</p>
            <h2 id="start-title">Your next Accepted is a good place to start.</h2>
          </div>
          <Link className="button primary" href="/tracking">
            Start tracking <span aria-hidden="true">→</span>
          </Link>
        </section>
        <p className="landing-coverage">
          Recaps and activity use available public LeetCode history. When coverage is limited, your
          report and calendar make that clear.
        </p>
      </div>
    </SiteShell>
  );
}
