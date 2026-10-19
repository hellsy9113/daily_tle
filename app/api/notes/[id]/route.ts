import { errorResponse } from "@/lib/http/api-error";
import { requireNotebook } from "@/lib/notes/access";
import { privateNotesHeaders, readNotesJson } from "@/lib/notes/http";
import { deleteNote, editNote } from "@/lib/notes/store";
import { requireSameOrigin } from "@/lib/tracking/security";

type Context = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: Context) {
  try {
    requireSameOrigin(request);
    const { notebook } = await requireNotebook(request);
    const { id } = await context.params;
    return Response.json(await editNote(notebook.id, id, await readNotesJson(request)), {
      headers: privateNotesHeaders,
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request: Request, context: Context) {
  try {
    requireSameOrigin(request);
    const { notebook } = await requireNotebook(request);
    await deleteNote(notebook.id, (await context.params).id);
    return new Response(null, { status: 204, headers: privateNotesHeaders });
  } catch (error) {
    return errorResponse(error);
  }
}
