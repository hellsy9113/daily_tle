import type { AccountStatus, ReportStatus } from "./types";

export const accountStatusLabels: Record<AccountStatus, string> = {
  pending: "Awaiting connection",
  active: "Connected",
  paused: "Paused",
  blocked: "Blocked",
};

export const deliveryStatusLabels: Record<ReportStatus, string> = {
  pending: "Pending",
  sending: "Pending",
  sent: "Delivered",
  failed: "Could not deliver",
  cancelled: "Paused",
  empty: "No problems found",
};
