import "server-only";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { notes } from "@/lib/db/schema";
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
  const [note] = await db()
    .insert(notes)
    .values({ notebookId, ...input })
    .returning();
  return serialize(note);
}

export async function editNote(notebookId: string, id: string, value: unknown) {
  const input = parseNote(value);
  const [note] = await db()
    .update(notes)
    .set({ ...input, updatedAt: new Date() })
    .where(and(eq(notes.id, parseNoteId(id)), eq(notes.notebookId, notebookId)))
    .returning();
  if (!note) throw new ApiError(404, "Note not found.");
  return serialize(note);
}

export async function deleteNote(notebookId: string, id: string) {
  const deleted = await db()
    .delete(notes)
    .where(and(eq(notes.id, parseNoteId(id)), eq(notes.notebookId, notebookId)))
    .returning({ id: notes.id });
  if (!deleted.length) throw new ApiError(404, "Note not found.");
}
