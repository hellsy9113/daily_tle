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

export async function GET(request: NextRequest) {
  let response: NextResponse;
  try {
    const account = await finishTelegramLogin(
      request.nextUrl,
      request.cookies.get(LOGIN_COOKIE)?.value,
    );
    await revokeSession(request.cookies.get(SESSION_COOKIE)?.value);
    const token = await createSession(account.id);
    response = NextResponse.redirect(new URL("/tracking", appUrl()));
    response.cookies.set(SESSION_COOKIE, token, { ...cookieOptions, maxAge: SESSION_SECONDS });
  } catch {
    response = NextResponse.redirect(new URL("/tracking?error=login", appUrl()));
  }
  response.cookies.set(LOGIN_COOKIE, "", { ...cookieOptions, maxAge: 0 });
  return response;
}
