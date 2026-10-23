import { NextResponse } from "next/server";
import { deleteAccount } from "@/lib/account";
import { cookieOptions, SESSION_COOKIE } from "@/lib/auth/session";
import { NOTES_COOKIE } from "@/lib/notes/access";
import { eq } from "drizzle-orm";
import { requireAccount } from "@/lib/auth/session";
import { db } from "@/lib/db/client";
import { accounts } from "@/lib/db/schema";
import { ApiError, errorResponse } from "@/lib/http/api-error";
import { isRecord } from "@/lib/http/validation";
import { profileSummary } from "@/lib/profile";
import { requireSameOrigin } from "@/lib/tracking/security";

export async function GET(request: Request) {
  try {
    return Response.json(await profileSummary(await requireAccount(request)), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: Request) {
  try {
    requireSameOrigin(request);
    const account = await requireAccount(request);
    const body: unknown = await request.json().catch(() => {
      throw new ApiError(400, "Invalid JSON");
    });
    if (
      !isRecord(body) ||
      Object.keys(body).some((key) => key !== "theme") ||
      (body.theme !== "light" && body.theme !== "dark")
    )
      throw new ApiError(400, "Choose light or dark mode.");
    await db().update(accounts).set({ theme: body.theme }).where(eq(accounts.id, account.id));
    return Response.json({ theme: body.theme }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request: Request) {
  try {
    requireSameOrigin(request);
    const account = await requireAccount(request);
    const body: unknown = await request.json().catch(() => null);
    if (
      !isRecord(body) ||
      body.confirmPermanentDeletion !== true ||
      Object.keys(body).some((key) => key !== "confirmPermanentDeletion")
    )
      throw new ApiError(400, "Confirm permanent account deletion.");
    await deleteAccount(account.id);
    const response = NextResponse.json(
      { deleted: true },
      { headers: { "Cache-Control": "no-store" } },
    );
    response.cookies.set(SESSION_COOKIE, "", { ...cookieOptions, maxAge: 0 });
    response.cookies.set(NOTES_COOKIE, "", { ...cookieOptions, maxAge: 0 });
    return response;
  } catch (error) {
    return errorResponse(error);
  }
}
