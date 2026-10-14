import { redirect } from "next/navigation";
import { SiteShell } from "@/components/site-shell";
import { ActivityDashboard } from "@/components/activity-dashboard";
import { serverAccount } from "@/lib/auth/session";
import { trackingStatus } from "@/lib/tracking/registration";
import { trackingBot } from "@/lib/tracking/config";
import { GfgActivityPanel } from "@/components/gfg-activity-panel";

export const metadata = { title: "Your activity · LeetCode Tracker" };

export default async function DashboardPage() {
  const account = await serverAccount();
  if (!account) redirect("/tracking");
  if ((!account.leetcodeUsername && !account.gfgUsername) || account.chatId === null)
    redirect(account.gfgUsername && !account.leetcodeUsername ? "/feature" : "/tracking");
  const status = account.leetcodeUsername
    ? await trackingStatus(account)
    : await trackingStatus(account, "gfg");
  const botUrl = `https://t.me/${trackingBot().username}`;
  return (
    <SiteShell signedIn>
      <ActivityDashboard
        botUrl={botUrl}
        initialStatus={status}
        leetcodeEnabled={Boolean(account.leetcodeUsername)}
      >
        {account.gfgUsername && <GfgActivityPanel username={account.gfgUsername} />}
      </ActivityDashboard>
    </SiteShell>
  );
}
