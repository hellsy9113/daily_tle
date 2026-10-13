import "server-only";
import { ApiError } from "@/lib/http/api-error";

export type LoginStage =
  | "login_start"
  | "login_cookie"
  | "login_attempt"
  | "discovery"
  | "token_exchange"
  | "identity"
  | "account_save"
  | "session_revoke"
  | "session_create";

const knownCodes = new Set([
  "invalid_client",
  "invalid_grant",
  "invalid_request",
  "unauthorized_client",
  "access_denied",
  "server_error",
  "temporarily_unavailable",
  "OAUTH_INVALID_RESPONSE",
  "OAUTH_INVALID_REQUEST",
  "OAUTH_RESPONSE_BODY_ERROR",
  "OAUTH_AUTHORIZATION_RESPONSE_ERROR",
  "OAUTH_RESPONSE_IS_NOT_JSON",
  "OAUTH_RESPONSE_IS_NOT_CONFORM",
  "OAUTH_JWT_TIMESTAMP_CHECK_FAILED",
  "OAUTH_JWT_CLAIM_COMPARISON_FAILED",
  "OAUTH_KEY_SELECTION_FAILED",
  "OAUTH_PARSE_ERROR",
  "OAUTH_OPERATION_PROCESSING_ERROR",
  "OAUTH_MISSING_SERVER_METADATA",
  "OAUTH_INVALID_SERVER_METADATA",
  "42P01",
  "42703",
  "23505",
  "23514",
  "28P01",
  "42501",
  "57014",
  "ENOTFOUND",
  "ECONNREFUSED",
  "ECONNRESET",
  "CONNECT_TIMEOUT",
  "CONNECTION_ENDED",
  "ETIMEDOUT",
  "missing_login_cookie",
  "invalid_login_cookie",
  "expired_or_consumed_login_attempt",
  "missing_id_token_claims",
  "invalid_telegram_identity",
  "missing_account",
  "unexpected_error",
]);

export class TelegramLoginFailure extends ApiError {
  constructor(
    readonly stage: LoginStage,
    readonly reason: string,
    status = 401,
  ) {
    super(status, "Telegram sign-in could not be verified.");
  }
}

export function loginFailure(error: unknown, stage: LoginStage): TelegramLoginFailure {
  if (error instanceof TelegramLoginFailure) return error;
  let reason = "unexpected_error";
  let cause: unknown = error;
  // Drizzle and the OIDC client wrap errors. Read only known codes, never messages or values.
  for (let depth = 0; depth < 4 && cause && typeof cause === "object"; depth++) {
    const item = cause as { error?: unknown; code?: unknown; cause?: unknown };
    const code = [item.error, item.code].find(
      (value): value is string => typeof value === "string" && knownCodes.has(value),
    );
    if (code) {
      reason = code;
      break;
    }
    cause = item.cause;
  }
  return new TelegramLoginFailure(stage, reason, error instanceof ApiError ? error.status : 502);
}

export function logLoginFailure(error: unknown, stage: LoginStage): void {
  const failure = loginFailure(error, stage);
  console.error("[telegram:auth] Sign-in failed", {
    stage: failure.stage,
    reason: knownCodes.has(failure.reason) ? failure.reason : "unexpected_error",
  });
}
