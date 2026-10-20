import { NextRequest, NextResponse } from "next/server";
import {
  finishGoogleLogin,
  GOOGLE_LOGIN_COOKIE,
  GOOGLE_DESTINATION_COOKIE,
} from "@/lib/auth/google";
import {
  cookieOptions,
  createSession,
  revokeSession,
  SESSION_COOKIE,
  SESSION_SECONDS,
} from "@/lib/auth/session";
import { appUrl } from "@/lib/tracking/config";
import { loginDestination } from "@/lib/auth/login-destination";

export async function GET(request: NextRequest) {
  let response: NextResponse;
  const stored = request.cookies.get(GOOGLE_DESTINATION_COOKIE)?.value;
  const destination = stored === "/profile" ? "/profile" : loginDestination(stored);
  try {
    const { account, linked } = await finishGoogleLogin(
      request.nextUrl,
      request.cookies.get(GOOGLE_LOGIN_COOKIE)?.value,
      request.cookies.get(SESSION_COOKIE)?.value,
    );
    if (linked) response = NextResponse.redirect(new URL("/profile", appUrl()));
    else {
      await revokeSession(request.cookies.get(SESSION_COOKIE)?.value);
      const token = await createSession(account.id);
      response = NextResponse.redirect(new URL(destination, appUrl()));
      response.cookies.set(SESSION_COOKIE, token, { ...cookieOptions, maxAge: SESSION_SECONDS });
    }
  } catch {
    const retry = new URL(destination, appUrl());
    retry.searchParams.set("error", "google-login");
    response = NextResponse.redirect(retry);
  }
  response.cookies.set(GOOGLE_LOGIN_COOKIE, "", { ...cookieOptions, maxAge: 0 });
  response.cookies.set(GOOGLE_DESTINATION_COOKIE, "", { ...cookieOptions, maxAge: 0 });
  response.headers.set("Cache-Control", "no-store");
  return response;
}
