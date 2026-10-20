import Link from "next/link";
import type { Metadata } from "next";
import { siteTitle, siteDescription, siteOrigin } from "@/lib/site-metadata";
import { redirect, unstable_rethrow } from "next/navigation";
import { HomePreview } from "@/components/home-preview";
import { SiteShell } from "@/components/site-shell";
import { LeetCodeDemo } from "@/components/leetcode-demo";
import { serverAccount } from "@/lib/auth/session";
import { queryBotUrl } from "@/lib/telegram/bot-link";

export const metadata: Metadata = {
  title: { absolute: siteTitle },
  description: siteDescription,
  alternates: { canonical: "/" },
  openGraph: {
    title: siteTitle,
    description: siteDescription,
    url: "/",
    type: "website",
    siteName: "Track.it",
    locale: "en_IN",
  },
  twitter: { card: "summary_large_image", title: siteTitle, description: siteDescription },
};
const features = [
  {
    number: "01",
    title: "Your practice, in perspective.",
    description:
      "Track available activity from LeetCode, GeeksforGeeks, HackerRank and Codeforces. Explore calendars and revisit saved problem links.",
    detail: "Four coding platforms · Independent registration",
  },
  {
    number: "02",
    title: "Keep the useful bits.",
    description:
      "Save short thoughts, useful links and study reminders in a private notebook. Come back to the ideas you want to remember.",
    detail: "Private Notes · Optional secret-code access",
  },
  {
    number: "03",
    title: "Make room for discovery.",
    description:
      "Choose your topics for Daily Articles. Read relevant publisher excerpts and open the originals, with different unseen catalog matches on later refreshes.",
    detail: "Daily Articles · Up to six at a time",
  },
];
const questions = [
  {
    question: "Do I need Telegram to use Track.it?",
    answer:
      "No. Sign in with Google or Telegram, then enable the services you want. Daily Grind is an optional feature for receiving Telegram recaps.",
  },
  {
    question: "Which coding platforms can I track?",
    answer:
      "LeetCode, GeeksforGeeks, HackerRank and Codeforces. Each platform is registered independently. Public-history limits differ, so your dashboard explains available coverage.",
  },
  {
    question: "Can I use Notes or Articles without coding tracking?",
    answer:
      "Yes. Notes and Daily Articles are independent services. You can enable either without registering a coding-platform username or connecting a bot.",
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
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "WebSite",
            name: "Track.it",
            url: siteOrigin(),
            description: siteDescription,
            inLanguage: "en",
          }).replace(/</g, "\u003c"),
        }}
      />
      <div className="landing-page">
        <div className="landing-hero">
          <div className="landing-intro">
            <p className="landing-kicker">
              <span aria-hidden="true" /> Practice. Remember. Discover.
            </p>
            <h1>
              A home for your
              <br />
              <span>coding routine.</span>
            </h1>
            <p className="lead">
              Follow your coding practice, keep private notes, and find your next useful read.
              Choose the tools you need. Add Telegram recaps when you want them.
            </p>
            <div className="landing-actions">
              <a className="button primary" href="/api/auth/google/login">
                Sign in with Google <span aria-hidden="true">→</span>
              </a>
              <a className="button secondary" href="/api/auth/telegram/login">
                Sign in with Telegram
              </a>
              <a className="landing-text-link" href="#demo">
                Explore a public profile <span aria-hidden="true">↓</span>
              </a>
            </div>
            <div className="landing-platforms" aria-label="Supported platforms">
              <span>LeetCode</span>
              <span>GeeksforGeeks</span>
              <span>HackerRank</span>
              <span>Codeforces</span>
            </div>
            <p className="hero-caption">Google or Telegram sign-in. Every service is optional.</p>
          </div>
          <HomePreview />
        </div>

        <LeetCodeDemo botUrl={queryBotUrl()} />

        <section className="landing-features" aria-labelledby="features-title">
          <div className="landing-section-heading">
            <p className="eyebrow">Built around your practice</p>
            <h2 id="features-title">A little structure for everything you learn.</h2>
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
            <p className="eyebrow">Set up your own routine</p>
            <h2 id="how-it-works-title">Make room for daily progress.</h2>
            <p>Start with one service. Add more whenever they become useful.</p>
          </div>
          <ol className="landing-steps">
            <li>
              <span className="landing-step-number" aria-hidden="true">
                01
              </span>
              <div>
                <h3>Sign in with Google or Telegram</h3>
                <p>Choose Google or Telegram. You can enable optional Telegram recaps later.</p>
              </div>
            </li>
            <li>
              <span className="landing-step-number" aria-hidden="true">
                02
              </span>
              <div>
                <h3>Choose your services on Feature</h3>
                <p>
                  Register a coding profile, start a private notebook, or choose your reading
                  topics. Each service is enabled and managed independently.
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
                  Open Dashboard to revisit your practice, notes and articles. For Telegram recaps,
                  enable Daily Grind separately and connect your bot.
                </p>
              </div>
            </li>
          </ol>
        </section>

        <section className="landing-grind" aria-labelledby="grind-title">
          <div>
            <p className="eyebrow">An optional nudge</p>
            <h2 id="grind-title">Let Daily Grind bring the recap.</h2>
            <p>
              Enable Daily Grind for daily and Sunday weekly Telegram recaps from your registered
              coding platforms. Your dashboard works independently.
            </p>
          </div>
          <Link className="button secondary" href="/feature?platform=daily-grind">
            Explore Daily Grind <span aria-hidden="true">→</span>
          </Link>
        </section>
        <section className="landing-faq" aria-labelledby="faq-title">
          <div className="landing-section-heading">
            <p className="eyebrow">Before you begin</p>
            <h2 id="faq-title">A few things to know.</h2>
          </div>
          {questions.map((item) => (
            <details key={item.question}>
              <summary>{item.question}</summary>
              <p>{item.answer}</p>
            </details>
          ))}
        </section>
        <section className="landing-cta" aria-labelledby="start-title">
          <div>
            <p className="eyebrow">Small steps. Daily progress.</p>
            <h2 id="start-title">Start with what helps you today.</h2>
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
