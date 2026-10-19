import "server-only";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { accounts, notebooks, notesSessions, type Account } from "@/lib/db/schema";
import { ApiError } from "@/lib/http/api-error";
import type { TrackingStatus } from "@/lib/tracking/types";
import { deriveCode, parseCode } from "./access";

export async function notesStatus(account: Account): Promise<TrackingStatus> {
  if (!account.notesRegisteredAt)
    return {
      username: null,
      registrationId: null,
      paused: false,
      connected: false,
      status: "pending",
      lastDelivery: null,
    };
  const [notebook] = await db().select().from(notebooks).where(eq(notebooks.accountId, account.id));
  const registered = Boolean(account.notesRegisteredAt && notebook?.codeHash);
  return {
    username: registered ? "Private notebook" : null,
    registrationId: registered ? notebook.id : null,
    paused: registered ? notebook.paused : false,
    connected: false,
    status: "pending",
    lastDelivery: null,
  };
}

export async function registerNotes(account: Account, input: unknown) {
  const codeHash = await deriveCode(parseCode({ code: input }));
  try {
    const updated = await db().transaction(async (tx) => {
      const [owner] = await tx
        .select()
        .from(accounts)
        .where(eq(accounts.id, account.id))
        .for("update");
      if (owner.notesRegisteredAt)
        throw new ApiError(409, "Notes is already registered. Change your code in Manage service.");
      await tx
        .insert(notebooks)
        .values({ accountId: account.id, codeHash })
        .onConflictDoUpdate({ target: notebooks.accountId, set: { codeHash, paused: false } });
      await tx
        .delete(notesSessions)
        .where(
          eq(
            notesSessions.notebookId,
            tx
              .select({ id: notebooks.id })
              .from(notebooks)
              .where(eq(notebooks.accountId, account.id)),
          ),
        );
      const [result] = await tx
        .update(accounts)
        .set({ notesRegisteredAt: new Date() })
        .where(eq(accounts.id, account.id))
        .returning();
      return result;
    });
    return notesStatus(updated);
  } catch (error) {
    const cause = error as { code?: string; cause?: { code?: string } };
    if (cause.code === "23505" || cause.cause?.code === "23505")
      throw new ApiError(409, "That secret code is already in use. Choose another.");
    throw error;
  }
}

export async function manageNotes(
  accountId: string,
  registrationId: string,
  paused: boolean | "revoke",
) {
  return db().transaction(async (tx) => {
    const [account] = await tx
      .select()
      .from(accounts)
      .where(eq(accounts.id, accountId))
      .for("update");
    const [notebook] = await tx
      .select()
      .from(notebooks)
      .where(and(eq(notebooks.accountId, accountId), eq(notebooks.id, registrationId)))
      .for("update");
    if (!account?.notesRegisteredAt || !notebook)
      throw new ApiError(409, "This Notes registration has changed. Refresh and try again.");
    await tx.delete(notesSessions).where(eq(notesSessions.notebookId, notebook.id));
    if (paused === "revoke") {
      await tx.delete(notebooks).where(eq(notebooks.id, notebook.id));
      const [updated] = await tx
        .update(accounts)
        .set({ notesRegisteredAt: null })
        .where(eq(accounts.id, accountId))
        .returning();
      return updated;
    }
    await tx.update(notebooks).set({ paused }).where(eq(notebooks.id, notebook.id));
    return account;
  });
}
