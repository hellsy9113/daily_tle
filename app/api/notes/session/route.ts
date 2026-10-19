import { NextResponse } from "next/server";
import { accountForToken, cookieOptions, requestSessionToken } from "@/lib/auth/session";
import { ApiError, errorResponse } from "@/lib/http/api-error";
import {
  limitNotesAccess,
  NOTES_COOKIE,
  NOTES_SESSION_SECONDS,
  notesSessionToken,
  parseCode,
  revokeNotesSession,
  unlockNotes,
} from "@/lib/notes/access";
import { privateNotesHeaders, readNotesJson } from "@/lib/notes/http";
import { requireSameOrigin } from "@/lib/tracking/security";

export async function POST(request: Request) {
  try {
    requireSameOrigin(request);
    if (await accountForToken(requestSessionToken(request)))
      throw new ApiError(409, "You are already signed in. Your own notes are available.");
    await limitNotesAccess(request);
    let code: string;
    const body = await readNotesJson(request);
    try {
      code = parseCode(body);
    } catch {
      throw new ApiError(401, "The secret code is incorrect or no longer active.");
    }
    const token = await unlockNotes(code);
    await revokeNotesSession(notesSessionToken(request));
    const response = NextResponse.json({ unlocked: true }, { headers: privateNotesHeaders });
    response.cookies.set(NOTES_COOKIE, token, { ...cookieOptions, maxAge: NOTES_SESSION_SECONDS });
    return response;
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request: Request) {
  try {
    requireSameOrigin(request);
    await revokeNotesSession(notesSessionToken(request));
    const response = NextResponse.json({ unlocked: false }, { headers: privateNotesHeaders });
    response.cookies.set(NOTES_COOKIE, "", { ...cookieOptions, maxAge: 0 });
    return response;
  } catch (error) {
    return errorResponse(error);
  }
}
