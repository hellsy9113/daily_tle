import Link from "next/link";
import { redirect, unstable_rethrow } from "next/navigation";
import { HomePreview } from "@/components/home-preview";
import { SiteShell } from "@/components/site-shell";
import { LeetCodeDemo } from "@/components/leetcode-demo";
import { serverAccount } from "@/lib/auth/session";
import { queryBotUrl } from "@/lib/telegram/bot-link";

export const metadata = {
  title: "Track.it · Your coding practice, together",
  description:
    "Sign in with Telegram and choose LeetCode, GeeksforGeeks, HackerRank, or Codeforces tracking. Follow your practice with activity calendars and daily recaps.",
};

const features = [
  {
    number: "01",
    title: "Four platforms. One dashboard.",
    description:
      "Choose LeetCode, GeeksforGeeks, HackerRank, or Codeforces tracking. Each service is enabled independently, with its own calendar and counts.",
    detail: "Enable each platform separately",
  },
  {
    number: "02",
    title: "A calendar you can explore.",
    description:
      "See 365 days of available activity. Select a day to revisit saved problems and open their links. Missing public history stays clearly marked.",
    detail: "Your saved practice, day by day",
  },
  {
    number: "03",
    title: "Your morning, already organised.",
    description:
      "Daily Grind sends yesterday's available problems to Telegram. When every enabled platform has no matches, you receive one shared reminder.",
    detail: "Daily recaps · Pause or resume in the bot",
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
              <span aria-hidden="true" /> Track.it · Your daily coding rhythm
            </p>
            <h1>
              Make practice count.
              <br />
              <span>See it all together.</span>
            </h1>
            <p className="lead">
              Your LeetCode, GeeksforGeeks, HackerRank, and Codeforces practice, with separate
              calendars, saved problem links, and morning Telegram recaps. Less checking. More
              solving.
            </p>
            <div className="landing-actions">
              <a className="button primary" href="/api/auth/telegram/login">
                Sign in with Telegram <span aria-hidden="true">→</span>
              </a>
              <a className="landing-text-link" href="#demo">
                Try the live demo <span aria-hidden="true">↓</span>
              </a>
            </div>
            <div className="landing-platforms" aria-label="Supported platforms">
              <span>LeetCode</span>
              <span>GeeksforGeeks</span>
              <span>HackerRank</span>
              <span>Codeforces</span>
            </div>
            <p className="hero-caption">Public profiles. One-time registration. Your own pace.</p>
          </div>
          <HomePreview />
        </div>

        <LeetCodeDemo botUrl={queryBotUrl()} />

        <section className="landing-features" aria-labelledby="features-title">
          <div className="landing-section-heading">
            <p className="eyebrow">Built around your practice</p>
            <h2 id="features-title">One place to return to your progress.</h2>
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
                <h3>Choose your services on Feature</h3>
                <p>
                  Enable LeetCode, GFG, HackerRank, or Codeforces by registering its public username
                  once. Each service gets its own dashboard panel.
                </p>
              </div>
            </li>
            <li>
              <span className="landing-step-number" aria-hidden="true">
                03
              </span>
              <div>
                <h3>Explore your progress</h3>
                <p>
                  Your service is ready after registration. Connect Daily Grind once to receive
                  morning recaps for all your enabled services.
                </p>
              </div>
            </li>
          </ol>
        </section>

        <section className="landing-cta" aria-labelledby="start-title">
          <div>
            <p className="eyebrow">Small steps. Daily progress.</p>
            <h2 id="start-title">Your next Accepted is a good place to start.</h2>
          </div>
          <Link className="button primary" href="/feature">
            Choose your services <span aria-hidden="true">→</span>
          </Link>
        </section>
        <p className="landing-coverage">
          Activity comes from available public profiles. Platform coverage differs; calendar info
          explains what each count represents. The live LeetCode demo works without sign-in.
        </p>
      </div>
    </SiteShell>
  );
}
