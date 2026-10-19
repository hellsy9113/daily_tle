import "server-only";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { accounts, type Account } from "@/lib/db/schema";
import { ApiError } from "@/lib/http/api-error";
import { requireRegistrationAvailable } from "@/lib/tracking/config";
import { platformFields, platformUsername } from "@/lib/tracking/platforms";
import { recordAgreement, type Transaction } from "@/lib/tracking/services";
import { platformLabels, type ActivityFeatureId } from "./catalog";
import { trackingStatus } from "./status";

function isUniqueConflict(error: unknown) {
  const seen = new Set<unknown>();
  while (error && typeof error === "object" && !seen.has(error)) {
    seen.add(error);
    if ("code" in error && error.code === "23505") return true;
    error = "cause" in error ? error.cause : null;
  }
  return false;
}

/** Platform lookup and initial imports stay local; reservation and consent are atomic. */
export async function registerFeature<T>(
  account: Account,
  platform: ActivityFeatureId,
  lookup: () => Promise<T>,
  username: (result: T) => string,
  initialize?: (tx: Transaction, accountId: string, result: T) => Promise<void>,
) {
  requireRegistrationAvailable();
  const label = platformLabels[platform];
  const alreadyRegistered = () =>
    new ApiError(
      409,
      `Your ${label} username is already registered. Revoke this service on the Feature page before registering a different username.`,
    );
  if (platformUsername(account, platform)) throw alreadyRegistered();
  const result = await lookup();
  const fields = platformFields[platform];
  try {
    const registered = await db().transaction(async (tx) => {
      const [updated] = await tx
        .update(accounts)
        .set({ [fields.username]: username(result), [fields.registeredAt]: new Date() })
        .where(and(eq(accounts.id, account.id), isNull(accounts[fields.username])))
        .returning();
      if (!updated) throw alreadyRegistered();
      await initialize?.(tx, account.id, result);
      await recordAgreement(tx, account.id, platform);
      return updated;
    });
    return trackingStatus(registered, platform);
  } catch (error) {
    if (isUniqueConflict(error))
      throw new ApiError(409, `This ${label} username is already registered.`);
    throw error;
  }
}
