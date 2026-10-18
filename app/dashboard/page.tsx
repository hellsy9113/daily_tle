import { PausedService } from "@/components/service-control";
import { redirect } from "next/navigation";
import { SiteShell } from "@/components/site-shell";
import { ActivityDashboard } from "@/components/activity-dashboard";
import { serverAccount } from "@/lib/auth/session";
import { trackingStatus } from "@/lib/tracking/registration";
import { trackingBot } from "@/lib/tracking/config";
import { HackerRankActivityPanel } from "@/components/hackerrank-activity-panel";
import { GfgActivityPanel } from "@/components/gfg-activity-panel";

export const metadata = { title: "Your activity · LeetCode Tracker" };

export default async function DashboardPage() {
  const account = await serverAccount();
  if (!account) redirect("/feature");
  if (!account.leetcodeUsername && !account.gfgUsername && !account.hackerRankUsername)
    redirect("/feature");
  const platform = account.leetcodeUsername
    ? "leetcode"
    : account.gfgUsername
      ? "gfg"
      : "hackerrank";
  const [leetcodeStatus, gfgStatus, hackerRankStatus] = await Promise.all([
    account.leetcodeUsername ? trackingStatus(account) : null,
    account.gfgUsername ? trackingStatus(account, "gfg") : null,
    account.hackerRankUsername ? trackingStatus(account, "hackerrank") : null,
  ]);
  const status = (leetcodeStatus ?? gfgStatus ?? hackerRankStatus)!;
  const botUrl = `https://t.me/${trackingBot().username}`;
  return (
    <SiteShell signedIn>
      <ActivityDashboard
        botUrl={botUrl}
        statusPlatform={platform}
        initialStatus={status}
        leetcodeEnabled={Boolean(account.leetcodeUsername) && !status.paused}
      >
        {account.leetcodeUsername && status.paused && status.registrationId && (
          <PausedService
            platform="leetcode"
            username={account.leetcodeUsername}
            registrationId={status.registrationId}
          />
        )}
        {account.gfgUsername &&
          (gfgStatus?.paused && gfgStatus.registrationId ? (
            <PausedService
              platform="gfg"
              username={account.gfgUsername}
              registrationId={gfgStatus.registrationId}
            />
          ) : (
            <GfgActivityPanel
              username={account.gfgUsername}
              registrationId={gfgStatus?.registrationId ?? undefined}
            />
          ))}
        {account.hackerRankUsername &&
          (hackerRankStatus?.paused && hackerRankStatus.registrationId ? (
            <PausedService
              platform="hackerrank"
              username={account.hackerRankUsername}
              registrationId={hackerRankStatus.registrationId}
            />
          ) : (
            <HackerRankActivityPanel
              username={account.hackerRankUsername}
              registrationId={hackerRankStatus?.registrationId ?? undefined}
            />
          ))}
      </ActivityDashboard>
    </SiteShell>
  );
}
