import { handleNightlyCollection } from "@/lib/tracking/nightly-collection";

export const runtime = "nodejs";
export const maxDuration = 300;
export const GET = handleNightlyCollection;
