import { BotStatusPanel } from "./bot-status-panel";
import type { FeatureId } from "@/lib/features/catalog";
import type { TrackingStatus } from "@/lib/tracking/types";

export function ActivityDashboard({
  initialStatus,
  botUrl,
  statusPlatform,
  children,
}: {
  initialStatus: TrackingStatus;
  botUrl: string;
  statusPlatform: FeatureId;
  children: React.ReactNode;
}) {
  return (
    <div className="dashboard-layout">
      <h1 className="sr-only">Your practice, day by day.</h1>
      <BotStatusPanel
        key={JSON.stringify(initialStatus)}
        initialStatus={initialStatus}
        botUrl={botUrl}
        statusPlatform={statusPlatform}
      />
      {children}
    </div>
  );
}
