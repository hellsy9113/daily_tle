import "server-only";
import * as oidc from "openid-client";
import { and, eq, gt } from "drizzle-orm";
import { ApiError } from "@/lib/http/api-error";
import { db } from "@/lib/db/client";
import { accounts, loginAttempts } from "@/lib/db/schema";
import { loginFailure, TelegramLoginFailure, type LoginStage } from "@/lib/auth/login-errors";
import { appUrl, requireRegistrationAvailable, trackingBot } from "@/lib/tracking/config";
import { hashToken, randomToken, validToken } from "@/lib/tracking/security";

export const LOGIN_COOKIE = "tracking_login";
export const LOGIN_SECONDS = 10 * 60;

const telegramFetch: oidc.CustomFetch = async (input, init) => {
  const body = init.body instanceof Uint8Array ? new Uint8Array(init.body) : init.body;
  const response = await fetch(input, { ...init, body });
  if (new URL(input).pathname === "/token") {
    // Telegram may return OAuth errors with HTTP 200. The OIDC client expects an error status.
    let payload: unknown;
    try {
      payload = await response.clone().json();
    } catch {
      return response;
    }
    if (
      response.status === 200 &&
      payload &&
      typeof payload === "object" &&
      "error" in payload &&
      typeof payload.error === "string" &&
      payload.error
    ) {
      const headers = new Headers(response.headers);
      headers.delete("content-length");
      headers.delete("content-encoding");
      return new Response(JSON.stringify(payload), { status: 400, headers });
    }
  }
  return response;
};

async function configuration() {
  const clientId = process.env.TELEGRAM_LOGIN_CLIENT_ID;
  const secret = process.env.TELEGRAM_LOGIN_CLIENT_SECRET;
  if (!clientId || !secret || clientId !== trackingBot().token.split(":")[0])
    throw new ApiError(503, "Tracking setup is unavailable. Try again later.");
  return oidc.discovery(
    new URL("https://oauth.telegram.org"),
    clientId,
    { id_token_signed_response_alg: "RS256" },
    // Advertised by Telegram's discovery document; URLSearchParams safely encodes the secret.
    oidc.ClientSecretPost(secret),
    {
      timeout: 10,
      execute: [oidc.enableNonRepudiationChecks],
      [oidc.customFetch]: telegramFetch,
    },
  );
}

export function telegramUserId(claims: Record<string, unknown>): number {
  if (typeof claims.sub !== "string" || !claims.sub)
    throw new TelegramLoginFailure("identity", "telegram_subject_invalid");
  const rawId = claims.id;
  const id = typeof rawId === "string" && /^[1-9]\d*$/.test(rawId) ? Number(rawId) : rawId;
  if (typeof id !== "number" || !Number.isSafeInteger(id) || id <= 0)
    throw new TelegramLoginFailure(
      "identity",
      rawId == null ? "telegram_id_missing" : "telegram_id_invalid",
    );
  // OIDC sub is opaque; the profile's id is the Bot API user identifier.
  return id;
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
  let stage: LoginStage = "login_cookie";
  try {
    if (!token || !validToken(token))
      throw new TelegramLoginFailure(
        stage,
        token ? "invalid_login_cookie" : "missing_login_cookie",
      );
    stage = "login_attempt";
    const [attempt] = await db()
      .delete(loginAttempts)
      .where(
        and(eq(loginAttempts.tokenHash, hashToken(token)), gt(loginAttempts.expiresAt, new Date())),
      )
      .returning();
    if (!attempt) throw new TelegramLoginFailure(stage, "expired_or_consumed_login_attempt");
    stage = "discovery";
    const config = await configuration();
    const callback = new URL("/api/auth/telegram/callback", appUrl());
    callback.search = url.search;
    stage = "token_exchange";
    const tokens = await oidc.authorizationCodeGrant(config, callback, {
      pkceCodeVerifier: attempt.verifier,
      expectedState: attempt.state,
      expectedNonce: attempt.nonce,
      idTokenExpected: true,
    });
    stage = "identity";
    const claims = tokens.claims();
    if (!claims) throw new TelegramLoginFailure(stage, "missing_id_token_claims");
    const telegramId = telegramUserId(claims);
    stage = "account_save";
    const [account] = await db()
      .insert(accounts)
      .values({ telegramId })
      .onConflictDoUpdate({ target: accounts.telegramId, set: { telegramId } })
      .returning();
    if (!account) throw new TelegramLoginFailure(stage, "missing_account", 502);
    return account;
  } catch (error) {
    throw loginFailure(error, stage);
  }
}
