import { ApiError, errorResponse } from "@/lib/http/api-error";
import { requireNotebook } from "@/lib/notes/access";
import { privateNotesHeaders, readNotesJson } from "@/lib/notes/http";
import { createNote, listNotes } from "@/lib/notes/store";
import { requireSameOrigin } from "@/lib/tracking/security";

export async function GET(request: Request) {
  try {
    const { notebook, signedIn, expiresAt } = await requireNotebook(request);
    const raw = new URL(request.url).searchParams.get("offset") ?? "0";
    if (!/^\d{1,7}$/.test(raw)) throw new ApiError(400, "Invalid notes page.");
    return Response.json(
      {
        signedIn,
        expiresAt,
        codeEnabled: Boolean(notebook.codeHash),
        ...(await listNotes(notebook.id, Number(raw))),
      },
      { headers: privateNotesHeaders },
    );
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    requireSameOrigin(request);
    const { notebook } = await requireNotebook(request);
    return Response.json(await createNote(notebook.id, await readNotesJson(request)), {
      status: 201,
      headers: privateNotesHeaders,
    });
  } catch (error) {
    return errorResponse(error);
  }
}
