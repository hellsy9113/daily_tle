import "server-only";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { accounts, notebooks, notes } from "@/lib/db/schema";
import type { Transaction } from "@/lib/tracking/services";
import { ApiError } from "@/lib/http/api-error";
import { parseNote, parseNoteId, type SavedNote } from "./validation";

function serialize(note: typeof notes.$inferSelect): SavedNote {
  return {
    id: note.id,
    text: note.text,
    links: note.links,
    createdAt: note.createdAt.toISOString(),
    updatedAt: note.updatedAt.toISOString(),
  };
}

async function writeNote<T>(notebookId: string, write: (tx: Transaction) => Promise<T>) {
  return db().transaction(async (tx) => {
    const [candidate] = await tx
      .select({ accountId: notebooks.accountId })
      .from(notebooks)
      .where(eq(notebooks.id, notebookId));
    if (!candidate) throw new ApiError(409, "This Notes registration has changed.");
    const [owner] = await tx
      .select()
      .from(accounts)
      .where(eq(accounts.id, candidate.accountId))
      .for("update");
    const [notebook] = await tx
      .select()
      .from(notebooks)
      .where(eq(notebooks.id, notebookId))
      .for("update");
    if (!owner?.notesRegisteredAt || !notebook)
      throw new ApiError(409, "This Notes registration has changed.");
    if (notebook.paused) throw new ApiError(423, "Notes is paused. Resume it in Manage service.");
    return write(tx);
  });
}

export async function listNotes(notebookId: string, offset = 0) {
  const rows = await db()
    .select()
    .from(notes)
    .where(eq(notes.notebookId, notebookId))
    .orderBy(desc(notes.createdAt), desc(notes.id))
    .limit(51)
    .offset(offset);
  return {
    notes: rows.slice(0, 50).map(serialize),
    nextOffset: rows.length > 50 ? offset + 50 : null,
  };
}

export async function createNote(notebookId: string, value: unknown) {
  const input = parseNote(value);
  const [note] = await writeNote(notebookId, (tx) =>
    tx
      .insert(notes)
      .values({ notebookId, ...input })
      .returning(),
  );
  return serialize(note);
}

export async function editNote(notebookId: string, id: string, value: unknown) {
  const input = parseNote(value);
  const [note] = await writeNote(notebookId, (tx) =>
    tx
      .update(notes)
      .set({ ...input, updatedAt: new Date() })
      .where(and(eq(notes.id, parseNoteId(id)), eq(notes.notebookId, notebookId)))
      .returning(),
  );
  if (!note) throw new ApiError(404, "Note not found.");
  return serialize(note);
}

export async function deleteNote(notebookId: string, id: string) {
  const deleted = await writeNote(notebookId, (tx) =>
    tx
      .delete(notes)
      .where(and(eq(notes.id, parseNoteId(id)), eq(notes.notebookId, notebookId)))
      .returning({ id: notes.id }),
  );
  if (!deleted.length) throw new ApiError(404, "Note not found.");
}
