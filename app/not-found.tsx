import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Page not found | LeetCode Tracker",
};

export default function NotFound() {
  return (
    <main className="page-shell intro" id="main-content" tabIndex={-1}>
      <p className="eyebrow">Page not found</p>
      <h1>We couldn’t find that page.</h1>
      <p className="lead">Check the address or return to the command guide.</p>
      <p>
        <Link href="/">Return to the command guide</Link>
      </p>
    </main>
  );
}
