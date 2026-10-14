export type AccountStatus = "pending" | "active" | "paused" | "blocked";
export type DeliveryStatus = "pending" | "sending" | "sent" | "failed" | "cancelled";

export interface TrackingStatus {
  username: string | null;
  connected: boolean;
  status: AccountStatus;
  lastDelivery: {
    reportDate: string;
    status: DeliveryStatus;
    sentAt: string | null;
  } | null;
}

export interface ConnectionLink {
  url: string;
  expiresAt: string;
}
