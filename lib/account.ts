import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import * as schema from "@/lib/db/schema";

/** Account-first locking fences in-flight collection and delivery work. */
export async function deleteAccount(accountId: string) {
  await db().transaction(async (tx) => {
    const [account] = await tx
      .select({ id: schema.accounts.id })
      .from(schema.accounts)
      .where(eq(schema.accounts.id, accountId))
      .for("update");
    if (!account) return;
    await tx
      .delete(schema.googleLoginAttempts)
      .where(eq(schema.googleLoginAttempts.linkAccountId, accountId));
    // Delete dependents before registration metadata. Notes and article subscriptions
    // cascade to their private content and sessions; the shared catalog is retained.
    const tables = [
      schema.deliveries,
      schema.dailyCollections,
      schema.reportReminders,
      schema.sessions,
      schema.connectionTokens,
      schema.acceptedActivity,
      schema.activityDays,
      schema.activitySync,
      schema.gfgProblems,
      schema.gfgSnapshots,
      schema.gfgSync,
      schema.hackerRankProblems,
      schema.hackerRankSnapshots,
      schema.hackerRankSync,
      schema.codeforcesProblems,
      schema.codeforcesSnapshots,
      schema.codeforcesSync,
      schema.activityGoals,
      schema.notebooks,
      schema.articleSubscriptions,
      schema.platformServices,
    ];
    for (const table of tables) await tx.delete(table).where(eq(table.accountId, accountId));
    await tx.delete(schema.accounts).where(eq(schema.accounts.id, accountId));
  });
}
