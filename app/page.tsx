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
];

export default function Home() {
  return (
    <div className="page-shell">
      <header className="site-header">
        <span className="brand">LeetCode Tracker</span>
        <nav aria-label="Main navigation">
          <a href="#getting-started">Getting started</a>
          <a href="#commands">Commands</a>
        </nav>
      </header>

      <main id="main-content" tabIndex={-1}>
        <div className="intro">
          <p className="eyebrow">Your practice, at a glance</p>
          <h1>Check your LeetCode progress in Telegram.</h1>
          <p className="lead">
            Send your username to the bot and get your recent submissions without leaving the chat.
          </p>
        </div>

        <section id="getting-started" aria-labelledby="getting-started-title">
          <h2 id="getting-started-title">Getting started</h2>
          <ol className="steps">
            <li>Open a private chat with your configured Telegram bot.</li>
            <li>
              Send <code>name:your_leetcode_username</code>, replacing the username with yours.
            </li>
            <li>Read your results and follow a problem link to keep practicing.</li>
          </ol>
        </section>

        <section id="commands" aria-labelledby="commands-title">
          <h2 id="commands-title">Bot commands</h2>
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
            Results include up to 20 recent submissions, including unsuccessful attempts. Commands
            accept surrounding whitespace; username capitalization is preserved.
          </p>
        </section>
      </main>

      <footer className="site-footer">LeetCode Tracker · Telegram command guide</footer>
    </div>
  );
}
