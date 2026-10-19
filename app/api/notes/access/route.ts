import { requireAccount } from "@/lib/auth/session";
import { ApiError, errorResponse } from "@/lib/http/api-error";
import { isRecord } from "@/lib/http/validation";
import { parseNoteId } from "@/lib/notes/validation";
import { limitNotesAccess, parseCode, setNotesCode } from "@/lib/notes/access";
import { privateNotesHeaders, readNotesJson } from "@/lib/notes/http";
import { requireSameOrigin } from "@/lib/tracking/security";

export async function POST(request: Request) {
  try {
    requireSameOrigin(request);
    const account = await requireAccount(request);
    await limitNotesAccess(request);
    const body = await readNotesJson(request);
    if (
      !isRecord(body) ||
      Object.keys(body).some((key) => key !== "code" && key !== "registrationId") ||
      typeof body.registrationId !== "string"
    )
      throw new ApiError(400, "Provide the current Notes registration.");
    await setNotesCode(
      account.id,
      parseCode({ code: body.code }),
      parseNoteId(body.registrationId),
    );
    return Response.json({ codeEnabled: true }, { headers: privateNotesHeaders });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request: Request) {
  try {
    requireSameOrigin(request);
    await requireAccount(request);
    throw new ApiError(405, "Manage or revoke Notes on the Feature page.");
  } catch (error) {
    return errorResponse(error);
  }
}
