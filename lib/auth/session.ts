import "server-only";
import { and, eq, gt } from "drizzle-orm";
import { cookies } from "next/headers";
import { ApiError } from "@/lib/http/api-error";
import { db } from "@/lib/db/client";
import { accounts, sessions } from "@/lib/db/schema";
import { hashToken, randomToken, validToken } from "@/lib/tracking/security";

export const SESSION_COOKIE = "tracking_session";
export const SESSION_SECONDS = 30 * 24 * 60 * 60;
export const cookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
};

export function requestSessionToken(request: Request): string | undefined {
  return request.headers
    .get("cookie")
    ?.split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${SESSION_COOKIE}=`))
    ?.slice(SESSION_COOKIE.length + 1);
}

export async function accountForToken(token?: string) {
  if (!token || !validToken(token)) return null;
  const [row] = await db()
    .select({ account: accounts })
    .from(sessions)
    .innerJoin(accounts, eq(sessions.accountId, accounts.id))
    .where(and(eq(sessions.tokenHash, hashToken(token)), gt(sessions.expiresAt, new Date())))
    .limit(1);
  return row?.account ?? null;
}

export async function requireAccount(request: Request) {
  const account = await accountForToken(requestSessionToken(request));
  if (!account) throw new ApiError(401, "Sign in to continue.");
  return account;
}

export async function serverAccount() {
  return accountForToken((await cookies()).get(SESSION_COOKIE)?.value);
}

export async function createSession(accountId: string) {
  const token = randomToken();
  await db()
    .insert(sessions)
    .values({
      accountId,
      tokenHash: hashToken(token),
      expiresAt: new Date(Date.now() + SESSION_SECONDS * 1000),
    });
  return token;
}

export async function revokeSession(token?: string) {
  if (token && validToken(token))
    await db()
      .delete(sessions)
      .where(eq(sessions.tokenHash, hashToken(token)));
}
