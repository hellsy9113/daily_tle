import { generateKeyPairSync, sign } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { beginGoogleLogin, finishGoogleLogin, googleIdentity } from "@/lib/auth/google";
import { accountForToken } from "@/lib/auth/session";
import { hashToken } from "@/lib/tracking/security";
import type { Account } from "@/lib/db/schema";

const database = vi.hoisted(() => {
  const returning = vi.fn();
  const save = vi.fn(async () => [{ id: "account", googleId: "google-subject" }]);
  const values = vi.fn(
    (_value: unknown) => (void _value, { onConflictDoUpdate: () => ({ returning: save }) }),
  );
  const selects = vi.fn();
  const update = vi.fn((_value: unknown) => (void _value, { where: () => ({ returning: save }) }));
  const tx = {
    select: () => ({ from: () => ({ where: () => ({ for: selects }) }) }),
    update: () => ({ set: update }),
  };
  return {
    returning,
    save,
    values,
    selects,
    update,
    db: () => ({
      insert: () => ({ values }),
      delete: () => ({ where: () => ({ returning }) }),
      transaction: async (work: (transaction: typeof tx) => unknown) => work(tx),
    }),
  };
});
vi.mock("@/lib/db/client", () => ({ db: database.db }));
vi.mock("@/lib/auth/session", () => ({ accountForToken: vi.fn() }));
const key = generateKeyPairSync("rsa", { modulusLength: 2048 });
const other = generateKeyPairSync("rsa", { modulusLength: 2048 });
const jwk = {
  ...key.publicKey.export({ format: "jwk" }),
  kid: "google-test",
  alg: "RS256",
  use: "sig",
};
let overrides: Record<string, unknown>;
let wrongSignature = false;
let attempt: {
  state: string;
  nonce: string;
  verifier: string;
  linkAccountId: string | null;
  sessionHash: string | null;
};
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("APP_URL", "http://localhost:3000");
  vi.stubEnv("TRACKING_REGISTRATION_ENABLED", "true");
  vi.stubEnv("DATABASE_URL", "postgres://unused");
  vi.stubEnv("GOOGLE_CLIENT_ID", "client.apps.googleusercontent.com");
  vi.stubEnv("GOOGLE_CLIENT_SECRET", "test-secret");
  overrides = {};
  wrongSignature = false;
  database.returning.mockImplementation(async () => [attempt]);
  database.selects.mockReset();
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/.well-known/openid-configuration"))
        return Response.json({
          issuer: "https://accounts.google.com",
          authorization_endpoint: "https://accounts.google.com/auth",
          token_endpoint: "https://accounts.google.com/token",
          jwks_uri: "https://accounts.google.com/jwks",
          response_types_supported: ["code"],
          subject_types_supported: ["public"],
          id_token_signing_alg_values_supported: ["RS256"],
          token_endpoint_auth_methods_supported: ["client_secret_post"],
        });
      if (url.endsWith("/jwks")) return Response.json({ keys: [jwk] });
      if (url.endsWith("/token")) {
        const body = new URLSearchParams(String(init?.body));
        expect(body.get("client_secret")).toBe("test-secret");
        expect(body.get("code_verifier")).toBe(attempt.verifier);
        const header = Buffer.from(JSON.stringify({ alg: "RS256", kid: "google-test" })).toString(
          "base64url",
        );
        const payload = Buffer.from(
          JSON.stringify({
            iss: "https://accounts.google.com",
            aud: "client.apps.googleusercontent.com",
            sub: "google-subject",
            email: "person@example.com",
            email_verified: true,
            iat: Math.floor(Date.now() / 1000),
            exp: Math.floor(Date.now() / 1000) + 300,
            nonce: attempt.nonce,
            ...overrides,
          }),
        ).toString("base64url");
        const signature = sign(
          "RSA-SHA256",
          Buffer.from(`${header}.${payload}`),
          wrongSignature ? other.privateKey : key.privateKey,
        ).toString("base64url");
        return Response.json({
          access_token: "unused",
          token_type: "Bearer",
          id_token: `${header}.${payload}.${signature}`,
        });
      }
      throw new Error("Unexpected Google request");
    }),
  );
});
async function begin(session?: string) {
  const login = await beginGoogleLogin(session);
  attempt = database.values.mock.calls[0][0] as typeof attempt;
  const callback = new URL("http://localhost:3000/api/auth/google/callback");
  callback.searchParams.set("code", "test-code");
  callback.searchParams.set("state", attempt.state);
  return { login, callback };
}
describe("Google OIDC sign-in", () => {
  it("requests PKCE, state and nonce with a fixed callback without requiring Telegram", async () => {
    vi.stubEnv("TRACKING_TELEGRAM_BOT_TOKEN", "");
    const { login } = await begin();
    expect(login.url.searchParams.get("scope")).toBe("openid email profile");
    expect(login.url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(login.url.searchParams.get("nonce")).toBe(attempt.nonce);
    expect(login.url.searchParams.get("redirect_uri")).toBe(
      "http://localhost:3000/api/auth/google/callback",
    );
    expect(attempt.linkAccountId).toBeNull();
    expect(database.values.mock.calls[0][0]).not.toHaveProperty("token");
  });
  it("saves the stable Google subject and verified email without creating a Telegram identity", async () => {
    const { login, callback } = await begin();
    expect((await finishGoogleLogin(callback, login.token)).linked).toBe(false);
    expect(database.values).toHaveBeenLastCalledWith({
      googleId: "google-subject",
      googleEmail: "person@example.com",
    });
  });
  it.each([
    { nonce: "wrong" },
    { iss: "https://attacker.example" },
    { aud: "other" },
    { exp: 1 },
    { email_verified: false },
    { sub: "" },
  ])("rejects invalid claims %j", async (claims) => {
    const { login, callback } = await begin();
    overrides = claims;
    await expect(finishGoogleLogin(callback, login.token)).rejects.toThrow();
    expect(database.values).toHaveBeenCalledTimes(1);
  });
  it("rejects a bad signature", async () => {
    const { login, callback } = await begin();
    wrongSignature = true;
    await expect(finishGoogleLogin(callback, login.token)).rejects.toThrow();
  });
  it("rejects mismatched state and consumed attempts", async () => {
    const { login, callback } = await begin();
    callback.searchParams.set("state", "wrong");
    await expect(finishGoogleLogin(callback, login.token)).rejects.toThrow();
    database.returning.mockResolvedValueOnce([]);
    await expect(finishGoogleLogin(callback, login.token)).rejects.toMatchObject({ status: 401 });
  });
  it("rejects missing browser cookies and missing configuration", async () => {
    await expect(finishGoogleLogin(new URL("http://localhost:3000"))).rejects.toMatchObject({
      status: 401,
    });
    vi.stubEnv("GOOGLE_CLIENT_SECRET", "");
    await expect(beginGoogleLogin()).rejects.toMatchObject({ status: 503 });
  });
  it("links Google only to the initiating, still authenticated account", async () => {
    const session = "s".repeat(43);
    vi.mocked(accountForToken).mockResolvedValue({ id: "existing" } as Account);
    const { login, callback } = await begin(session);
    expect(attempt.sessionHash).toBe(hashToken(session));
    database.selects
      .mockResolvedValueOnce([{ id: "existing", googleId: null }])
      .mockResolvedValueOnce([{ accountId: "existing" }]);
    expect((await finishGoogleLogin(callback, login.token, session)).linked).toBe(true);
    expect(database.update).toHaveBeenCalledWith({
      googleId: "google-subject",
      googleEmail: "person@example.com",
    });
    expect(database.values).toHaveBeenCalledTimes(1);
  });
  it("rejects linking from another or logged-out browser session", async () => {
    const session = "s".repeat(43);
    vi.mocked(accountForToken).mockResolvedValue({ id: "existing" } as Account);
    const { login, callback } = await begin(session);
    await expect(finishGoogleLogin(callback, login.token, "x".repeat(43))).rejects.toMatchObject({
      status: 401,
    });
    database.selects
      .mockResolvedValueOnce([{ id: "existing", googleId: null }])
      .mockResolvedValueOnce([]);
    await expect(finishGoogleLogin(callback, login.token, session)).rejects.toMatchObject({
      status: 401,
    });
    expect(database.update).not.toHaveBeenCalled();
  });
  it("does not replace an already linked Google identity", async () => {
    const session = "s".repeat(43);
    vi.mocked(accountForToken).mockResolvedValue({ id: "existing" } as Account);
    const { login, callback } = await begin(session);
    database.selects
      .mockResolvedValueOnce([{ id: "existing", googleId: "other-google" }])
      .mockResolvedValueOnce([{ accountId: "existing" }]);
    await expect(finishGoogleLogin(callback, login.token, session)).rejects.toMatchObject({
      status: 409,
    });
  });
  it("validates verified email separately from the subject used for identity", () => {
    expect(() =>
      googleIdentity({ sub: "stable", email: "x@example.com", email_verified: "true" }),
    ).toThrow();
  });
});
