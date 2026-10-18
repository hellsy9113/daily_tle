export type AccountStatus = "pending" | "active" | "paused" | "blocked";
export type DeliveryStatus = "pending" | "sending" | "sent" | "failed" | "cancelled";
export type ReportStatus = DeliveryStatus | "empty";

export interface TrackingStatus {
  paused: boolean;
  registrationId: string | null;
  username: string | null;
  connected: boolean;
  status: AccountStatus;
  lastDelivery: {
    reportDate: string;
    status: ReportStatus;
    sentAt: string | null;
  } | null;
}

export interface ConnectionLink {
  url: string;
  expiresAt: string;
}
