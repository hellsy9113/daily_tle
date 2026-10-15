import Link from "next/link";

export function SiteShell({
  children,
  signedIn = false,
}: {
  children: React.ReactNode;
  signedIn?: boolean;
}) {
  return (
    <div className="page-shell">
      <header className="site-header">
        <Link className="brand" href="/" aria-label="LeetCode Tracker home">
          <span className="brand-mark" aria-hidden="true">
            ▲
          </span>{" "}
          Track.it
        </Link>
        <nav aria-label="Main navigation">
          <Link href="/feature">Feature</Link>
          <Link href={signedIn ? "/dashboard" : "/tracking"}>
            {signedIn ? "Dashboard" : "Tracking"}
          </Link>
          {signedIn && (
            <form action="/api/auth/logout" method="post">
              <button className="text-button" type="submit">
                Sign out
              </button>
            </form>
          )}
        </nav>
      </header>
      <main id="main-content" tabIndex={-1}>
        {children}
      </main>
      <footer className="site-footer">
        <span>Small steps. Daily progress.</span>
        <span>Asia/Kolkata · IST</span>
      </footer>
    </div>
  );
}
