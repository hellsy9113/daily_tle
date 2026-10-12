import { NextResponse } from "next/server";
import { beginTelegramLogin, LOGIN_COOKIE, LOGIN_SECONDS } from "@/lib/auth/telegram";
import { cookieOptions } from "@/lib/auth/session";
import { errorResponse } from "@/lib/http/api-error";

export async function GET() {
  try {
    const { token, url } = await beginTelegramLogin();
    const response = NextResponse.redirect(url);
    response.cookies.set(LOGIN_COOKIE, token, { ...cookieOptions, maxAge: LOGIN_SECONDS });
    return response;
  } catch (error) {
    return errorResponse(error);
  }
}
