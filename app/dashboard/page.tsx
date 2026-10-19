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

export default async function DashboardPage() {
  const account = await serverAccount();
  if (!account) redirect("/feature");
  const registered = registeredFeatures(account);
  if (!registered.length) redirect("/feature");
  const statuses = await trackingStatuses(account, registered);
  const first = registered[0];
  return (
    <SiteShell signedIn>
      <ActivityDashboard
        initialStatus={statuses[first]!}
        statusPlatform={first}
        botUrl={`https://t.me/${trackingBot().username}`}
      >
        {registered.map((id) => {
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
    </SiteShell>
  );
}
