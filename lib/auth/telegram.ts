import "server-only";
import * as oidc from "openid-client";
import { and, eq, gt } from "drizzle-orm";
import { ApiError } from "@/lib/http/api-error";
import { db } from "@/lib/db/client";
import { accounts, loginAttempts } from "@/lib/db/schema";
import { appUrl, requireRegistrationAvailable, trackingBot } from "@/lib/tracking/config";
import { hashToken, randomToken, validToken } from "@/lib/tracking/security";

export const LOGIN_COOKIE = "tracking_login";
export const LOGIN_SECONDS = 10 * 60;

async function configuration() {
  const clientId = process.env.TELEGRAM_LOGIN_CLIENT_ID;
  const secret = process.env.TELEGRAM_LOGIN_CLIENT_SECRET;
  if (!clientId || !secret || clientId !== trackingBot().token.split(":")[0])
    throw new ApiError(503, "Tracking setup is unavailable. Try again later.");
  return oidc.discovery(
    new URL("https://oauth.telegram.org"),
    clientId,
    { id_token_signed_response_alg: "RS256" },
    oidc.ClientSecretBasic(secret),
    { timeout: 10, execute: [oidc.enableNonRepudiationChecks] },
  );
}

export function telegramUserId(claims: Record<string, unknown>): number {
  if (
    typeof claims.sub !== "string" ||
    !claims.sub ||
    typeof claims.id !== "number" ||
    !Number.isSafeInteger(claims.id) ||
    claims.id <= 0
  )
    throw new ApiError(401, "Telegram sign-in could not be verified.");
  // OIDC sub is opaque; the profile's id is the Bot API user identifier.
  return claims.id;
}

export async function beginTelegramLogin() {
  requireRegistrationAvailable();
  const config = await configuration();
  const token = randomToken();
  const state = randomToken();
  const nonce = randomToken();
  const verifier = oidc.randomPKCECodeVerifier();
  await db()
    .insert(loginAttempts)
    .values({
      tokenHash: hashToken(token),
      state,
      nonce,
      verifier,
      expiresAt: new Date(Date.now() + LOGIN_SECONDS * 1000),
    });
  const url = oidc.buildAuthorizationUrl(config, {
    redirect_uri: new URL("/api/auth/telegram/callback", appUrl()).href,
    response_type: "code",
    scope: "openid profile",
    state,
    nonce,
    code_challenge: await oidc.calculatePKCECodeChallenge(verifier),
    code_challenge_method: "S256",
  });
  return { token, url };
}

export async function finishTelegramLogin(url: URL, token?: string) {
  if (!token || !validToken(token)) throw new ApiError(401, "Telegram sign-in expired. Try again.");
  const [attempt] = await db()
    .delete(loginAttempts)
    .where(
      and(eq(loginAttempts.tokenHash, hashToken(token)), gt(loginAttempts.expiresAt, new Date())),
    )
    .returning();
  if (!attempt) throw new ApiError(401, "Telegram sign-in expired. Try again.");
  const config = await configuration();
  const callback = new URL("/api/auth/telegram/callback", appUrl());
  callback.search = url.search;
  const tokens = await oidc.authorizationCodeGrant(config, callback, {
    pkceCodeVerifier: attempt.verifier,
    expectedState: attempt.state,
    expectedNonce: attempt.nonce,
    idTokenExpected: true,
  });
  const claims = tokens.claims();
  if (!claims) throw new ApiError(401, "Telegram sign-in could not be verified.");
  const telegramId = telegramUserId(claims);
  const [account] = await db()
    .insert(accounts)
    .values({ telegramId })
    .onConflictDoUpdate({ target: accounts.telegramId, set: { telegramId } })
    .returning();
  return account;
}
