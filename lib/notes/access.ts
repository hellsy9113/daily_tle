import "server-only";
import { scrypt } from "node:crypto";
import { and, eq, gt, lt, sql } from "drizzle-orm";
import { accountForToken, requestSessionToken } from "@/lib/auth/session";
import { db } from "@/lib/db/client";
import { accounts, notebooks, notesLoginLimits, notesSessions } from "@/lib/db/schema";
import { NOTES_CODE_PATTERN } from "./validation";
import { ApiError } from "@/lib/http/api-error";
import { isRecord } from "@/lib/http/validation";
import { hashToken, randomToken, validToken } from "@/lib/tracking/security";

export const NOTES_COOKIE = "notes_session";
export const NOTES_SESSION_SECONDS = 20 * 60;

export function notesSessionToken(request: Request) {
  return request.headers
    .get("cookie")
    ?.split(";")
    .map((value) => value.trim())
    .find((value) => value.startsWith(`${NOTES_COOKIE}=`))
    ?.slice(NOTES_COOKIE.length + 1);
}

export function parseCode(body: unknown) {
  if (
    !isRecord(body) ||
    Object.keys(body).some((key) => key !== "code") ||
    typeof body.code !== "string" ||
    !NOTES_CODE_PATTERN.test(body.code)
  )
    throw new ApiError(400, "Use 5–9 letters or digits for your secret code.");
  return body.code;
}

// A deterministic, expensive derivation allows lookup by a single secret without storing
// it or a fast digest. The fixed domain salt is deliberate: identical codes must be unique.
// The code is a bearer credential; online attempts are throttled separately.
export function deriveCode(code: string): Promise<string> {
  return new Promise((resolve, reject) => {
    scrypt(
      code,
      "track.it/notes/access/v1",
      32,
      { N: 32768, maxmem: 64 * 1024 * 1024 },
      (err, key) => {
        if (err) reject(err);
        else resolve(key.toString("hex"));
      },
    );
  });
}

export async function notebookForAccount(accountId: string) {
  await db().insert(notebooks).values({ accountId }).onConflictDoNothing();
  const [notebook] = await db().select().from(notebooks).where(eq(notebooks.accountId, accountId));
  if (!notebook) throw new ApiError(503, "Notes are temporarily unavailable.");
  return notebook;
}

export async function requireNotebook(request: Request) {
  // A website account always takes priority over a code session left in this browser.
  const account = await accountForToken(requestSessionToken(request));
  if (account) {
    if (!account.notesRegisteredAt)
      throw new ApiError(403, "Register Notes on the Feature page first.");
    const [notebook] = await db()
      .select()
      .from(notebooks)
      .where(eq(notebooks.accountId, account.id));
    if (!notebook?.codeHash) throw new ApiError(403, "Register Notes on the Feature page first.");
    if (notebook.paused) throw new ApiError(423, "Notes is paused. Resume it in Manage service.");
    return { notebook, signedIn: true, expiresAt: null };
  }
  const token = notesSessionToken(request);
  if (token && validToken(token)) {
    const [found] = await db()
      .select({ notebook: notebooks, expiresAt: notesSessions.expiresAt })
      .from(notesSessions)
      .innerJoin(notebooks, eq(notesSessions.notebookId, notebooks.id))
      .innerJoin(accounts, eq(notebooks.accountId, accounts.id))
      .where(
        and(
          eq(notesSessions.tokenHash, hashToken(token)),
          gt(notesSessions.expiresAt, new Date()),
          eq(notebooks.paused, false),
          sql`${accounts.notesRegisteredAt} IS NOT NULL`,
        ),
      )
      .limit(1);
    if (found)
      return {
        notebook: found.notebook,
        signedIn: false,
        expiresAt: found.expiresAt.toISOString(),
      };
  }
  throw new ApiError(401, "Sign in or unlock your notes with your secret code.");
}

export async function limitNotesAccess(request: Request) {
  // Deployment must overwrite forwarded IP headers at its trusted ingress (as Vercel does).
  // With no trusted forwarded address, requests share a conservative anonymous bucket.
  const address = request.headers.get("x-forwarded-for")?.split(",")[0].trim() || "unknown";
  const key = hashToken(`notes-access:${address.slice(0, 200)}`);
  const now = new Date();
  const resetAt = new Date(now.getTime() + 15 * 60 * 1000);
  await db().delete(notesLoginLimits).where(lt(notesLoginLimits.resetAt, now));
  const [limit] = await db()
    .insert(notesLoginLimits)
    .values({ key, attempts: 1, resetAt })
    .onConflictDoUpdate({
      target: notesLoginLimits.key,
      set: { attempts: sql`${notesLoginLimits.attempts} + 1` },
    })
    .returning();
  if (limit.attempts > 10)
    throw new ApiError(429, "Too many code attempts. Try again in 15 minutes.");
}

function databaseCode(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null) return;
  if ("code" in error && typeof error.code === "string") return error.code;
  if ("cause" in error) return databaseCode(error.cause);
}

export async function setNotesCode(accountId: string, code: string, registrationId: string) {
  const codeHash = await deriveCode(parseCode({ code }));
  try {
    await db().transaction(async (tx) => {
      // Row locking serializes code rotation with login, including session creation.
      const [account] = await tx
        .select()
        .from(accounts)
        .where(eq(accounts.id, accountId))
        .for("update");
      const [notebook] = await tx
        .select()
        .from(notebooks)
        .where(eq(notebooks.accountId, accountId))
        .for("update");
      if (!account?.notesRegisteredAt || !notebook || notebook.id !== registrationId)
        throw new ApiError(409, "This Notes registration has changed. Refresh and try again.");
      await tx.update(notebooks).set({ codeHash }).where(eq(notebooks.id, notebook.id));
      await tx.delete(notesSessions).where(eq(notesSessions.notebookId, notebook.id));
    });
  } catch (error) {
    if (databaseCode(error) === "23505")
      throw new ApiError(409, "That code is unavailable. Choose a different secret code.");
    throw error;
  }
}

export async function unlockNotes(code: string) {
  const codeHash = await deriveCode(code);
  const token = randomToken();
  await db().transaction(async (tx) => {
    const [candidate] = await tx
      .select({ accountId: notebooks.accountId })
      .from(notebooks)
      .where(eq(notebooks.codeHash, codeHash));
    if (!candidate) throw new ApiError(401, "The secret code is incorrect or no longer active.");
    const [account] = await tx
      .select()
      .from(accounts)
      .where(eq(accounts.id, candidate.accountId))
      .for("update");
    const [notebook] = await tx
      .select()
      .from(notebooks)
      .where(and(eq(notebooks.codeHash, codeHash), eq(notebooks.accountId, candidate.accountId)))
      .for("update");
    if (!notebook || !account?.notesRegisteredAt || notebook.paused)
      throw new ApiError(401, "The secret code is incorrect or no longer active.");
    await tx.delete(notesSessions).where(lt(notesSessions.expiresAt, new Date()));
    await tx.insert(notesSessions).values({
      tokenHash: hashToken(token),
      notebookId: notebook.id,
      expiresAt: new Date(Date.now() + NOTES_SESSION_SECONDS * 1000),
    });
  });
  return token;
}

export async function revokeNotesSession(token?: string) {
  if (token && validToken(token))
    await db()
      .delete(notesSessions)
      .where(eq(notesSessions.tokenHash, hashToken(token)));
}
