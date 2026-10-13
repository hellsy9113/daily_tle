import { NextRequest, NextResponse } from "next/server";
import { beginTelegramLogin, LOGIN_COOKIE, LOGIN_SECONDS } from "@/lib/auth/telegram";
import { cookieOptions } from "@/lib/auth/session";
import { errorResponse } from "@/lib/http/api-error";
import { appUrl } from "@/lib/tracking/config";
import { logLoginFailure } from "@/lib/auth/login-errors";

export async function GET(request: NextRequest) {
  try {
    const canonicalLogin = new URL("/api/auth/telegram/login", appUrl());
    if (request.nextUrl.origin !== canonicalLogin.origin)
      return NextResponse.redirect(canonicalLogin, { headers: { "Cache-Control": "no-store" } });
    const { token, url } = await beginTelegramLogin();
    const response = NextResponse.redirect(url, { headers: { "Cache-Control": "no-store" } });
    response.cookies.set(LOGIN_COOKIE, token, { ...cookieOptions, maxAge: LOGIN_SECONDS });
    return response;
  } catch (error) {
    logLoginFailure(error, "login_start");
    const response = errorResponse(error);
    response.headers.set("Cache-Control", "no-store");
    return response;
  }
}
