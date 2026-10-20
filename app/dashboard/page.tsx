import Link from "next/link";
import { ArticlesPanel } from "@/components/articles-panel";
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

export const metadata = {
  robots: { index: false, follow: false },
  title: "Your activity · Track.it",
};

export default async function DashboardPage({
  searchParams,
}: {
  searchParams?: Promise<{ service?: string }>;
}) {
  const selected = (await searchParams)?.service;
  const account = await serverAccount();
  if (!account) redirect("/feature");
  const registered = registeredFeatures(account);
  if (!registered.length) redirect("/feature");
  if (!registered.some((id) => featureById[id].dashboard))
    redirect("/feature?platform=daily-grind");
  const statuses = await trackingStatuses(account, registered);
  const activity = registered.filter((id) => featureById[id].recaps);
  const selectedActivity = activity.find((id) => id === selected);
  const first = selectedActivity ?? activity[0];
  const notesRegistered = registered.includes("notes");
  const articlesRegistered = registered.includes("articles");
  const showArticles =
    articlesRegistered && (selected === "articles" || (!first && !notesRegistered));
  const showNotes = notesRegistered && (selected === "notes" || (!first && !showArticles));
  return (
    <SiteShell signedIn>
      <nav className="dashboard-service-nav" aria-label="Dashboard services">
        {activity.length > 0 && (
          <Link href="/dashboard" aria-current={!showNotes && !showArticles ? "page" : undefined}>
            Activity
          </Link>
        )}
        {notesRegistered && (
          <Link href="/dashboard?service=notes" aria-current={showNotes ? "page" : undefined}>
            Notes
          </Link>
        )}
        {articlesRegistered && (
          <Link href="/dashboard?service=articles" aria-current={showArticles ? "page" : undefined}>
            Daily Articles
          </Link>
        )}
      </nav>
      {showArticles ? (
        <ArticlesPanel />
      ) : showNotes ? (
        <NotesPanel signedIn />
      ) : (
        <ActivityDashboard
          initialStatus={statuses[first]!}
          statusPlatform={first}
          botUrl={account.dailyGrindRegistrationId ? `https://t.me/${trackingBot().username}` : ""}
          showBot={Boolean(account.dailyGrindRegistrationId) && !account.dailyGrindPaused}
        >
          {activity
            .filter((id) => !selectedActivity || id === selectedActivity)
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
