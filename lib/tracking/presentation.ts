import type { AccountStatus, DeliveryStatus } from "./types";

export const accountStatusLabels: Record<AccountStatus, string> = {
  pending: "Awaiting connection",
  active: "Connected",
  paused: "Paused",
  blocked: "Blocked",
};

export const deliveryStatusLabels: Record<DeliveryStatus, string> = {
  pending: "Pending",
  sending: "Pending",
  sent: "Delivered",
  failed: "Could not deliver",
  cancelled: "Paused",
};
