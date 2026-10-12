import "server-only";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { ApiError } from "@/lib/http/api-error";
import { appUrl } from "./config";

export const randomToken = () => randomBytes(32).toString("base64url");
export const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");
export const validToken = (value: string) => /^[A-Za-z0-9_-]{43}$/.test(value);

export function secretsEqual(actual: string | null, expected: string): boolean {
  if (!actual) return false;
  const a = Buffer.from(actual);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function requireSameOrigin(request: Request): void {
  if (request.headers.get("origin") !== appUrl().origin)
    throw new ApiError(403, "This request is not allowed.");
}

export function requireCron(request: Request): void {
  const secret = process.env.CRON_SECRET;
  if (!secret || !secretsEqual(request.headers.get("authorization"), `Bearer ${secret}`))
    throw new ApiError(401, "Unauthorized");
}
