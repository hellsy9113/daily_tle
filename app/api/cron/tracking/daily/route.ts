import { handleTrackingCron } from "@/lib/tracking/dispatch";

export const runtime = "nodejs";
export const maxDuration = 300;
export const GET = handleTrackingCron;
