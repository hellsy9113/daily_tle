import { NextRequest, NextResponse } from "next/server";
import {
  beginGoogleLogin,
  GOOGLE_LOGIN_COOKIE,
  GOOGLE_DESTINATION_COOKIE,
  GOOGLE_LOGIN_SECONDS,
} from "@/lib/auth/google";
import { cookieOptions, SESSION_COOKIE } from "@/lib/auth/session";
import { ApiError, errorResponse } from "@/lib/http/api-error";
import { appUrl } from "@/lib/tracking/config";
import { loginDestination } from "@/lib/auth/login-destination";

export async function GET(request: NextRequest) {
  try {
    const linking = request.nextUrl.searchParams.get("link") === "1";
    const destination = linking
      ? "/profile"
      : loginDestination(request.nextUrl.searchParams.get("next"));
    if (request.nextUrl.origin !== appUrl().origin) {
      const canonical = new URL("/api/auth/google/login", appUrl());
      if (linking) canonical.searchParams.set("link", "1");
      else canonical.searchParams.set("next", destination);
      return NextResponse.redirect(canonical, { headers: { "Cache-Control": "no-store" } });
    }
    const session = request.cookies.get(SESSION_COOKIE)?.value;
    if (linking && !session) throw new ApiError(401, "Sign in before linking Google.");
    const { token, url } = await beginGoogleLogin(linking ? session : undefined);
    const response = NextResponse.redirect(url, { headers: { "Cache-Control": "no-store" } });
    response.cookies.set(GOOGLE_LOGIN_COOKIE, token, {
      ...cookieOptions,
      maxAge: GOOGLE_LOGIN_SECONDS,
    });
    response.cookies.set(GOOGLE_DESTINATION_COOKIE, destination, {
      ...cookieOptions,
      maxAge: GOOGLE_LOGIN_SECONDS,
    });
    return response;
  } catch (error) {
    return errorResponse(error);
  }
}
