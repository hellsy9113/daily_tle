import Link from "next/link";
import { NotesPanel } from "@/components/notes-panel";
import { redirect } from "next/navigation";
import { SiteShell } from "@/components/site-shell";
import { ActivityDashboard } from "@/components/activity-dashboard";
import { PausedService } from "@/components/service-control";
import { featureViews } from "@/components/feature-views";
import { serverAccount } from "@/lib/auth/session";
import { trackingStatuses } from "@/lib/tracking/registration";
import { registeredFeatures, platformUsername } from "@/lib/tracking/platforms";
import { featureById } from "@/lib/features/catalog";
import { trackingBot } from "@/lib/tracking/config";

export const metadata = { title: "Your activity · LeetCode Tracker" };

export default async function DashboardPage({
  searchParams,
}: { searchParams?: Promise<{ service?: string }> } = {}) {
  const selected = (await searchParams)?.service;
  const account = await serverAccount();
  if (!account) redirect("/feature");
  const registered = registeredFeatures(account);
  if (!registered.length) redirect("/feature");
  const statuses = await trackingStatuses(account, registered);
  const activity = registered.filter((id) => featureById[id].recaps);
  const first = activity.find((id) => id === selected) ?? activity[0];
  const showNotes = selected === "notes" || !first;
  return (
    <SiteShell signedIn>
      <nav className="dashboard-service-nav" aria-label="Dashboard services">
        {activity.length > 0 && (
          <Link href="/dashboard" aria-current={!selected ? "page" : undefined}>
            Activity
          </Link>
        )}
        {registered.map((id) => (
          <Link
            key={id}
            href={`/dashboard?service=${id}`}
            aria-current={selected === id || (!first && id === "notes") ? "page" : undefined}
          >
            {featureById[id].label}
          </Link>
        ))}
      </nav>
      {showNotes ? (
        registered.includes("notes") ? (
          <NotesPanel signedIn />
        ) : (
          <p>
            Register Notes on the <Link href="/feature?platform=notes">Feature page</Link>.
          </p>
        )
      ) : (
        <ActivityDashboard
          initialStatus={statuses[first]!}
          statusPlatform={first}
          botUrl={`https://t.me/${trackingBot().username}`}
        >
          {activity
            .filter((id) => !selected || id === selected)
            .map((id) => {
              const status = statuses[id]!;
              const username = platformUsername(account, id)!;
              const Panel = featureViews[id].Dashboard;
              return status.paused ? (
                <PausedService key={id} platform={id} username={username} />
              ) : featureById[id].dashboard && Panel ? (
                <Panel key={`${id}:${status.registrationId}`} username={username} />
              ) : null;
            })}
        </ActivityDashboard>
      )}
    </SiteShell>
  );
}
