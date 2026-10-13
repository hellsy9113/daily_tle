import { redirect } from "next/navigation";
import { SiteShell } from "@/components/site-shell";
import { ActivityDashboard } from "@/components/activity-dashboard";
import { serverAccount } from "@/lib/auth/session";
import { trackingStatus } from "@/lib/tracking/registration";
import { trackingBot } from "@/lib/tracking/config";

export const metadata = { title: "Your activity · LeetCode Tracker" };

export default async function DashboardPage() {
  const account = await serverAccount();
  if (!account?.leetcodeUsername || account.chatId === null) redirect("/tracking");
  const status = await trackingStatus(account);
  const botUrl = `https://t.me/${trackingBot().username}`;
  return (
    <SiteShell signedIn>
      <ActivityDashboard
        botUrl={botUrl}
        initialStatus={{
          ...status,
          lastDelivery: status.lastDelivery
            ? { ...status.lastDelivery, sentAt: status.lastDelivery.sentAt?.toISOString() ?? null }
            : null,
        }}
      />
    </SiteShell>
  );
}
