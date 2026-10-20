import { refreshArticleCatalog } from "@/lib/articles/ingest";
import { requireCron } from "@/lib/tracking/security";
import { errorResponse } from "@/lib/http/api-error";
import { privateJson } from "@/lib/http/private";

export const runtime = "nodejs";
export const maxDuration = 60;
export async function GET(request: Request) {
  try {
    requireCron(request);
    return privateJson(await refreshArticleCatalog());
  } catch (error) {
    return errorResponse(error);
  }
}
