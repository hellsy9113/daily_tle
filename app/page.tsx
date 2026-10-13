import Link from "next/link";
import { SiteShell } from "@/components/site-shell";

const commands = [
  {
    command: "hello",
    title: "Say hello",
    description: 'Your bot replies with "welcome".',
  },
  {
    command: "name:your_leetcode_username",
    title: "Check your submissions",
    description: "Get recent problem titles, verdicts, languages, and links in the same chat.",
  },
  {
    command: "lastweek:your_leetcode_username",
    title: "Review last week",
    description:
      "Find unique Accepted problems from the previous Monday–Sunday week in Asia/Kolkata.",
  },
  {
    command: "lastday:your_leetcode_username",
    title: "Review yesterday",
    description: "Find unique Accepted problems from yesterday in Asia/Kolkata.",
  },
];

export default function Home() {
  return (
    <SiteShell>
      <div className="intro">
        <p className="eyebrow">Your practice, at a glance</p>
        <h1>
          Your daily LeetCode recap.
          <br />
          Right in Telegram.
        </h1>
        <p className="lead">
          Register once. Connect Telegram. Get yesterday&apos;s solved questions delivered every
          morning, and follow your Accepted activity on a daily calendar.
        </p>
        <Link className="button primary" href="/tracking">
          Start tracking <span aria-hidden="true">→</span>
        </Link>
        <p className="hero-caption">One-time setup · Daily reports · Your practice calendar</p>
      </div>

      <section id="getting-started" aria-labelledby="getting-started-title">
        <h2 id="getting-started-title">Prefer to check on demand?</h2>
        <ol className="steps">
          <li>Open a private chat with your configured Telegram bot.</li>
          <li>
            Send <code>name:your_leetcode_username</code>, replacing the username with yours.
          </li>
          <li>Read your results and follow a problem link to keep practicing.</li>
        </ol>
      </section>

      <section id="commands" aria-labelledby="commands-title">
        <h2 id="commands-title">Existing bot commands</h2>
        <div className="command-grid">
          {commands.map(({ command, title, description }) => (
            <article className="command-card" key={command}>
              <h3>{title}</h3>
              <code>{command}</code>
              <p>{description}</p>
            </article>
          ))}
        </div>
        <p className="note">
          The name command includes recent unsuccessful attempts. Lastweek and lastday count unique
          Accepted problems from available public history and warn when that history may not cover
          the full period. Send one command per message. Commands accept surrounding whitespace;
          username capitalization is preserved.
        </p>
      </section>
    </SiteShell>
  );
}
