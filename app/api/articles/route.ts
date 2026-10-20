import { requireAccount } from "@/lib/auth/session";
import { privateJson } from "@/lib/http/private";
import { errorResponse } from "@/lib/http/api-error";
import { dailyArticles } from "@/lib/articles/service";

export async function GET(request: Request) {
  try {
    return privateJson(await dailyArticles((await requireAccount(request)).id));
  } catch (error) {
    return errorResponse(error);
  }
}
