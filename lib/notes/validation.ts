import { ApiError } from "@/lib/http/api-error";
import { isRecord } from "@/lib/http/validation";

export const NOTE_WORD_LIMIT = 100;
export const NOTE_LINK_LIMIT = 10;
export const wordCount = (text: string) => text.trim().split(/\s+/u).filter(Boolean).length;

export interface NoteInput {
  text: string;
  links: string[];
}

export interface SavedNote extends NoteInput {
  id: string;
  createdAt: string;
  updatedAt: string;
}

export interface NotesPageData {
  signedIn: boolean;
  expiresAt: string | null;
  codeEnabled: boolean;
  notes: SavedNote[];
  nextOffset: number | null;
}

export function parseNote(body: unknown): NoteInput {
  if (
    !isRecord(body) ||
    Object.keys(body).some((key) => key !== "text" && key !== "links") ||
    typeof body.text !== "string" ||
    body.text.length > 10000 ||
    !Array.isArray(body.links) ||
    body.links.length > NOTE_LINK_LIMIT
  )
    throw new ApiError(400, "Enter a note with up to 100 words and 10 links.");
  const text = body.text.trim();
  if (wordCount(text) > NOTE_WORD_LIMIT)
    throw new ApiError(400, "Each note can contain at most 100 words.");
  const links = body.links.map((value: unknown) => {
    if (typeof value !== "string" || value.length > 2048)
      throw new ApiError(400, "Enter valid HTTP or HTTPS links, up to 2048 characters each.");
    let url: URL;
    try {
      url = new URL(value.trim());
    } catch {
      throw new ApiError(400, "Each link must be a full HTTP or HTTPS URL.");
    }
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password)
      throw new ApiError(400, "Each link must be an HTTP or HTTPS URL without credentials.");
    return url.href;
  });
  if (!text && !links.length) throw new ApiError(400, "Add some text or a link to your note.");
  return { text, links: [...new Set(links)] };
}

export function parseNoteId(value: string): string {
  if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value))
    throw new ApiError(404, "Note not found.");
  return value;
}
