import { handleScheduledTracking } from "@/lib/tracking/scheduler";

export const runtime = "nodejs";
export const maxDuration = 300;
export const GET = handleScheduledTracking;
