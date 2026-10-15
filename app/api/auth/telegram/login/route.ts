import { NextRequest, NextResponse } from "next/server";
import { beginTelegramLogin, LOGIN_COOKIE, LOGIN_SECONDS } from "@/lib/auth/telegram";
import { cookieOptions } from "@/lib/auth/session";
import { errorResponse } from "@/lib/http/api-error";
import { appUrl } from "@/lib/tracking/config";
import { logLoginFailure } from "@/lib/auth/login-errors";
import { LOGIN_DESTINATION_COOKIE, loginDestination } from "@/lib/auth/login-destination";

export async function GET(request: NextRequest) {
  try {
    const canonicalLogin = new URL("/api/auth/telegram/login", appUrl());
    const destination = loginDestination(request.nextUrl.searchParams.get("next"));
    if (destination === "/feature?platform=hackerrank")
      canonicalLogin.searchParams.set("next", "hackerrank");
    if (destination === "/feature") canonicalLogin.searchParams.set("next", "feature");
    if (request.nextUrl.origin !== canonicalLogin.origin)
      return NextResponse.redirect(canonicalLogin, { headers: { "Cache-Control": "no-store" } });
    const { token, url } = await beginTelegramLogin();
    const response = NextResponse.redirect(url, { headers: { "Cache-Control": "no-store" } });
    response.cookies.set(LOGIN_COOKIE, token, { ...cookieOptions, maxAge: LOGIN_SECONDS });
    response.cookies.set(LOGIN_DESTINATION_COOKIE, destination, {
      ...cookieOptions,
      maxAge: LOGIN_SECONDS,
    });
    return response;
  } catch (error) {
    logLoginFailure(error, "login_start");
    return errorResponse(error);
  }
}
