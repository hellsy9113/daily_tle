import { NextRequest, NextResponse } from "next/server";
import { finishTelegramLogin, LOGIN_COOKIE } from "@/lib/auth/telegram";
import {
  cookieOptions,
  createSession,
  revokeSession,
  SESSION_COOKIE,
  SESSION_SECONDS,
} from "@/lib/auth/session";
import { appUrl } from "@/lib/tracking/config";
import { logLoginFailure, type LoginStage } from "@/lib/auth/login-errors";
import { LOGIN_DESTINATION_COOKIE, loginDestination } from "@/lib/auth/login-destination";

export async function GET(request: NextRequest) {
  let response: NextResponse;
  let stage: LoginStage = "login_cookie";
  const destination = loginDestination(request.cookies.get(LOGIN_DESTINATION_COOKIE)?.value);
  try {
    const account = await finishTelegramLogin(
      request.nextUrl,
      request.cookies.get(LOGIN_COOKIE)?.value,
    );
    stage = "session_revoke";
    await revokeSession(request.cookies.get(SESSION_COOKIE)?.value);
    stage = "session_create";
    const token = await createSession(account.id);
    response = NextResponse.redirect(new URL(destination, appUrl()));
    response.cookies.set(SESSION_COOKIE, token, { ...cookieOptions, maxAge: SESSION_SECONDS });
  } catch (error) {
    logLoginFailure(error, stage);
    response = NextResponse.redirect(new URL(`${destination}?error=login`, appUrl()));
  }
  response.cookies.set(LOGIN_COOKIE, "", { ...cookieOptions, maxAge: 0 });
  response.cookies.set(LOGIN_DESTINATION_COOKIE, "", { ...cookieOptions, maxAge: 0 });
  response.headers.set("Cache-Control", "no-store");
  return response;
}
