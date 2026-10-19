import { requireAccount } from "@/lib/auth/session";
import { errorResponse } from "@/lib/http/api-error";
import { limitNotesAccess, parseCode, setNotesCode } from "@/lib/notes/access";
import { privateNotesHeaders, readNotesJson } from "@/lib/notes/http";
import { requireSameOrigin } from "@/lib/tracking/security";

export async function POST(request: Request) {
  try {
    requireSameOrigin(request);
    const account = await requireAccount(request);
    await limitNotesAccess(request);
    await setNotesCode(account.id, parseCode(await readNotesJson(request)));
    return Response.json({ codeEnabled: true }, { headers: privateNotesHeaders });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request: Request) {
  try {
    requireSameOrigin(request);
    const account = await requireAccount(request);
    await setNotesCode(account.id, null);
    return Response.json({ codeEnabled: false }, { headers: privateNotesHeaders });
  } catch (error) {
    return errorResponse(error);
  }
}
