import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Page not found | LeetCode Tracker",
};

export default function NotFound() {
  return (
    <main className="page-shell dashboard-layout" id="main-content" tabIndex={-1}>
      <p className="eyebrow">Page not found</p>
      <h1>We couldn’t find that page.</h1>
      <p className="lead">Check the address or return to the homepage.</p>
      <p>
        <Link href="/">Return to the homepage</Link>
      </p>
    </main>
  );
}
