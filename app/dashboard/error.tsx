"use client";

export default function DashboardError({ retry }: { retry: () => void }) {
  return (
    <div className="dashboard-loading">
      <h1>Could not open your dashboard</h1>
      <p role="alert">Please try again shortly.</p>
      <button className="button primary" onClick={retry}>
        Try again
      </button>
    </div>
  );
}
