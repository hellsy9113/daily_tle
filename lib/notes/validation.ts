import { ApiError } from "@/lib/http/api-error";
import { isRecord } from "@/lib/http/validation";

export const NOTE_WORD_LIMIT = 100;
export const NOTE_LINK_LIMIT = 10;
export const NOTES_CODE_PATTERN = /^[A-Za-z0-9]{5,9}$/;

/** Treat domains as links and other entries as searches; never allow executable schemes. */
export function noteLinkTarget(value: string): string {
  const input = value.trim();
  if (/^[a-z][a-z0-9+.-]*:/i.test(input)) {
    const url = new URL(input);
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password)
      throw new Error("Unsupported link");
    return url.href;
  }
  if (/^(?:[a-z0-9-]+\.)+[a-z]{2,}(?::\d+)?(?:[/?#].*)?$/i.test(input))
    return new URL(`https://${input}`).href;
  return `https://www.google.com/search?q=${encodeURIComponent(input)}`;
}
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
    if (typeof value !== "string" || !value.trim() || value.length > 2048)
      throw new ApiError(400, "Enter a link or search phrase, up to 2048 characters each.");
    try {
      noteLinkTarget(value);
    } catch {
      throw new ApiError(
        400,
        "Use a web link or search phrase without credentials or executable schemes.",
      );
    }
    return value.trim();
  });
  if (!text && !links.length) throw new ApiError(400, "Add some text or a link to your note.");
  const unique = new Map<string, string>();
  for (const link of links)
    if (!unique.has(noteLinkTarget(link))) unique.set(noteLinkTarget(link), link);
  return { text, links: [...unique.values()] };
}

export function parseNoteId(value: string): string {
  if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value))
    throw new ApiError(404, "Note not found.");
  return value;
}
