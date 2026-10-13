import { generateKeyPairSync, sign } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { beginTelegramLogin, finishTelegramLogin, telegramUserId } from "@/lib/auth/telegram";

const database = vi.hoisted(() => {
  const returning = vi.fn();
  const values = vi.fn(
    (value: unknown) => (
      void value,
      {
        onConflictDoUpdate: () => ({ returning: async () => [{ id: "account", telegramId: 123 }] }),
      }
    ),
  );
  return {
    returning,
    values,
    db: () => ({ insert: () => ({ values }), delete: () => ({ where: () => ({ returning }) }) }),
  };
});
vi.mock("@/lib/db/client", () => ({ db: database.db }));

const key = generateKeyPairSync("rsa", { modulusLength: 2048 });
const otherKey = generateKeyPairSync("rsa", { modulusLength: 2048 });
const jwk = {
  ...key.publicKey.export({ format: "jwk" }),
  kid: "test-key",
  alg: "RS256",
  use: "sig",
};
let overrides: Record<string, unknown>;
let wrongSignature: boolean;
let tokenError: string | undefined;
let attempt: { state: string; nonce: string; verifier: string };

beforeEach(() => {
  vi.stubEnv("APP_URL", "http://localhost:3000");
  vi.stubEnv("TRACKING_REGISTRATION_ENABLED", "true");
  vi.stubEnv("DATABASE_URL", "postgres://unused");
  vi.stubEnv("TRACKING_TELEGRAM_BOT_TOKEN", "42:second-bot");
  vi.stubEnv("TRACKING_TELEGRAM_BOT_USERNAME", "second_bot");
  vi.stubEnv("TRACKING_TELEGRAM_WEBHOOK_SECRET", "second-secret");
  vi.stubEnv("TELEGRAM_LOGIN_CLIENT_ID", "42");
  vi.stubEnv("TELEGRAM_LOGIN_CLIENT_SECRET", "client-secret");
  overrides = {};
  wrongSignature = false;
  tokenError = undefined;
  database.values.mockClear();
  database.returning.mockImplementation(async () => [attempt]);
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = input instanceof Request ? input.url : String(input);
      if (url.endsWith("/.well-known/openid-configuration"))
        return Response.json({
          issuer: "https://oauth.telegram.org",
          authorization_endpoint: "https://oauth.telegram.org/auth",
          token_endpoint: "https://oauth.telegram.org/token",
          jwks_uri: "https://oauth.telegram.org/.well-known/jwks.json",
          response_types_supported: ["code"],
          subject_types_supported: ["public"],
          id_token_signing_alg_values_supported: ["RS256"],
          token_endpoint_auth_methods_supported: ["client_secret_basic"],
        });
      if (url.endsWith("/.well-known/jwks.json")) return Response.json({ keys: [jwk] });
      if (url.endsWith("/token")) {
        if (tokenError) return Response.json({ error: tokenError });
        const header = Buffer.from(JSON.stringify({ alg: "RS256", kid: "test-key" })).toString(
          "base64url",
        );
        const payload = Buffer.from(
          JSON.stringify({
            iss: "https://oauth.telegram.org",
            aud: "42",
            sub: "opaque-oidc-subject",
            id: 123,
            iat: Math.floor(Date.now() / 1000),
            exp: Math.floor(Date.now() / 1000) + 300,
            nonce: attempt.nonce,
            ...overrides,
          }),
        ).toString("base64url");
        const signature = sign(
          "RSA-SHA256",
          Buffer.from(`${header}.${payload}`),
          wrongSignature ? otherKey.privateKey : key.privateKey,
        ).toString("base64url");
        return Response.json({
          access_token: "test-access",
          token_type: "Bearer",
          id_token: `${header}.${payload}.${signature}`,
        });
      }
      throw new Error("Unexpected authentication request");
    }),
  );
});

async function begin() {
  const login = await beginTelegramLogin();
  attempt = database.values.mock.calls[0][0] as unknown as typeof attempt;
  const callback = new URL("http://localhost:3000/api/auth/telegram/callback");
  callback.searchParams.set("code", "test-code");
  callback.searchParams.set("state", attempt.state);
  return { login, callback };
}

describe("Telegram OpenID Connect", () => {
  it("uses PKCE, state, nonce and a fixed registered callback", async () => {
    const { login } = await begin();
    expect(login.url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(login.url.searchParams.get("state")).toBe(attempt.state);
    expect(login.url.searchParams.get("nonce")).toBe(attempt.nonce);
    expect(login.url.searchParams.get("redirect_uri")).toBe(
      "http://localhost:3000/api/auth/telegram/callback",
    );
    expect(login.url.searchParams.get("scope")).toBe("openid profile");
    expect(database.values.mock.calls[0][0]).not.toHaveProperty("token", login.token);
  });
  it("verifies a signed token and uses the Bot API id rather than OIDC sub", async () => {
    const { login, callback } = await begin();
    expect((await finishTelegramLogin(callback, login.token)).telegramId).toBe(123);
    expect(database.values).toHaveBeenLastCalledWith({ telegramId: 123 });
  });
  it.each([
    { nonce: "wrong" },
    { iss: "https://attacker.test" },
    { aud: "different-bot" },
    { exp: 1 },
    { id: "123" },
  ])("rejects invalid claims %j", async (claims) => {
    const { login, callback } = await begin();
    overrides = claims;
    await expect(finishTelegramLogin(callback, login.token)).rejects.toThrow();
    expect(database.values).toHaveBeenCalledTimes(1);
  });
  it("rejects invalid signatures", async () => {
    const { login, callback } = await begin();
    wrongSignature = true;
    await expect(finishTelegramLogin(callback, login.token)).rejects.toThrow();
    expect(database.values).toHaveBeenCalledTimes(1);
  });
  it("rejects mismatched state", async () => {
    const { login, callback } = await begin();
    callback.searchParams.set("state", "wrong");
    await expect(finishTelegramLogin(callback, login.token)).rejects.toThrow();
  });
  it("rejects expired or already consumed login attempts", async () => {
    const { login, callback } = await begin();
    database.returning.mockResolvedValue([]);
    await expect(finishTelegramLogin(callback, login.token)).rejects.toMatchObject({ status: 401 });
  });
  it("rejects missing browser login cookies", async () => {
    await expect(
      finishTelegramLogin(new URL("http://localhost:3000/api/auth/telegram/callback")),
    ).rejects.toMatchObject({
      status: 401,
      stage: "login_cookie",
      reason: "missing_login_cookie",
    });
  });
  it.each(["invalid_grant", "invalid_client"])(
    "recognizes Telegram's HTTP 200 %s response without accepting the login",
    async (reason) => {
      const { login, callback } = await begin();
      tokenError = reason;
      await expect(finishTelegramLogin(callback, login.token)).rejects.toMatchObject({
        stage: "token_exchange",
        reason,
      });
      expect(database.values).toHaveBeenCalledTimes(1);
    },
  );
  it("identifies a consumed or expired attempt before exchanging its code", async () => {
    const { login, callback } = await begin();
    database.returning.mockResolvedValue([]);
    vi.mocked(fetch).mockClear();
    await expect(finishTelegramLogin(callback, login.token)).rejects.toMatchObject({
      stage: "login_attempt",
      reason: "expired_or_consumed_login_attempt",
    });
    expect(fetch).not.toHaveBeenCalled();
  });
  it("rejects an opaque OIDC subject without a usable Telegram id", () => {
    expect(() => telegramUserId({ sub: "opaque", id: Number.MAX_SAFE_INTEGER + 1 })).toThrow();
  });
});
