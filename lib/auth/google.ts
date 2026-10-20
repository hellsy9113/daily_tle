import "server-only";
import * as oidc from "openid-client";
import { and, eq, gt } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { accounts, googleLoginAttempts, sessions } from "@/lib/db/schema";
import { ApiError } from "@/lib/http/api-error";
import { appUrl, requireRegistrationAvailable } from "@/lib/tracking/config";
import { hashToken, randomToken, validToken } from "@/lib/tracking/security";
import { accountForToken } from "./session";

export const GOOGLE_LOGIN_COOKIE = "google_login";
export const GOOGLE_DESTINATION_COOKIE = "google_login_destination";
export const GOOGLE_LOGIN_SECONDS = 600;
async function configuration() {
  const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
  const secret = process.env.GOOGLE_CLIENT_SECRET?.trim();
  if (!clientId || !secret) throw new ApiError(503, "Google sign-in is not configured yet.");
  return oidc.discovery(
    new URL("https://accounts.google.com"),
    clientId,
    { id_token_signed_response_alg: "RS256" },
    oidc.ClientSecretPost(secret),
    { timeout: 10, execute: [oidc.enableNonRepudiationChecks] },
  );
}
export function googleIdentity(claims: Record<string, unknown>) {
  if (
    typeof claims.sub !== "string" ||
    !claims.sub ||
    claims.sub.length > 255 ||
    claims.email_verified !== true ||
    typeof claims.email !== "string" ||
    !claims.email ||
    claims.email.length > 320
  )
    throw new ApiError(401, "Google did not return a verified identity.");
  return { googleId: claims.sub, googleEmail: claims.email };
}
export async function beginGoogleLogin(linkSession?: string) {
  requireRegistrationAvailable();
  const config = await configuration();
  const account = linkSession ? await accountForToken(linkSession) : null;
  if (linkSession && !account) throw new ApiError(401, "Sign in before linking Google.");
  const token = randomToken(),
    state = randomToken(),
    nonce = randomToken();
  const verifier = oidc.randomPKCECodeVerifier();
  await db()
    .insert(googleLoginAttempts)
    .values({
      tokenHash: hashToken(token),
      state,
      nonce,
      verifier,
      expiresAt: new Date(Date.now() + GOOGLE_LOGIN_SECONDS * 1000),
      linkAccountId: account?.id ?? null,
      sessionHash: account && linkSession ? hashToken(linkSession) : null,
    });
  const url = oidc.buildAuthorizationUrl(config, {
    redirect_uri: new URL("/api/auth/google/callback", appUrl()).href,
    response_type: "code",
    scope: "openid email profile",
    prompt: "select_account",
    state,
    nonce,
    code_challenge: await oidc.calculatePKCECodeChallenge(verifier),
    code_challenge_method: "S256",
  });
  return { token, url };
}
export async function finishGoogleLogin(url: URL, token?: string, sessionToken?: string) {
  if (!token || !validToken(token))
    throw new ApiError(401, "Google sign-in expired. Please try again.");
  const [attempt] = await db()
    .delete(googleLoginAttempts)
    .where(
      and(
        eq(googleLoginAttempts.tokenHash, hashToken(token)),
        gt(googleLoginAttempts.expiresAt, new Date()),
      ),
    )
    .returning();
  if (!attempt) throw new ApiError(401, "Google sign-in expired. Please try again.");
  const config = await configuration();
  const callback = new URL("/api/auth/google/callback", appUrl());
  callback.search = url.search;
  const tokens = await oidc.authorizationCodeGrant(config, callback, {
    pkceCodeVerifier: attempt.verifier,
    expectedState: attempt.state,
    expectedNonce: attempt.nonce,
    idTokenExpected: true,
  });
  const claims = tokens.claims();
  if (!claims) throw new ApiError(401, "Google did not return an identity.");
  const identity = googleIdentity(claims);
  if (attempt.linkAccountId) {
    if (
      !sessionToken ||
      !validToken(sessionToken) ||
      hashToken(sessionToken) !== attempt.sessionHash
    )
      throw new ApiError(401, "Sign in again before linking Google.");
    try {
      const account = await db().transaction(async (tx) => {
        const [current] = await tx
          .select()
          .from(accounts)
          .where(eq(accounts.id, attempt.linkAccountId!))
          .for("update");
        const [session] = await tx
          .select()
          .from(sessions)
          .where(
            and(
              eq(sessions.tokenHash, attempt.sessionHash!),
              eq(sessions.accountId, attempt.linkAccountId!),
              gt(sessions.expiresAt, new Date()),
            ),
          )
          .for("update");
        if (!current || !session) throw new ApiError(401, "Sign in again before linking Google.");
        if (current.googleId && current.googleId !== identity.googleId)
          throw new ApiError(409, "A different Google account is already linked.");
        const [updated] = await tx
          .update(accounts)
          .set(identity)
          .where(eq(accounts.id, current.id))
          .returning();
        return updated;
      });
      return { account, linked: true };
    } catch (error) {
      if (error instanceof ApiError) throw error;
      // No implicit merging of accounts, even when email addresses match.
      throw new ApiError(
        409,
        "Could not link Google. It may already belong to another Track.it account.",
      );
    }
  }
  const [account] = await db()
    .insert(accounts)
    .values(identity)
    .onConflictDoUpdate({ target: accounts.googleId, set: { googleEmail: identity.googleEmail } })
    .returning();
  return { account, linked: false };
}
