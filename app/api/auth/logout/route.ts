import { NextResponse } from "next/server";
import {
  cookieOptions,
  requestSessionToken,
  revokeSession,
  SESSION_COOKIE,
} from "@/lib/auth/session";
import { errorResponse } from "@/lib/http/api-error";
import { appUrl } from "@/lib/tracking/config";
import { requireSameOrigin } from "@/lib/tracking/security";

export async function POST(request: Request) {
  try {
    requireSameOrigin(request);
    await revokeSession(requestSessionToken(request));
    const response = NextResponse.redirect(appUrl(), 303);
    response.cookies.set(SESSION_COOKIE, "", { ...cookieOptions, maxAge: 0 });
    return response;
  } catch (error) {
    return errorResponse(error);
  }
}
