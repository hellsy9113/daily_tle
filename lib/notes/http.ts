import "server-only";
import { ApiError } from "@/lib/http/api-error";

export const privateNotesHeaders = { "Cache-Control": "no-store" };

export async function readNotesJson(request: Request): Promise<unknown> {
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json"))
    throw new ApiError(415, "Send JSON data.");
  const reader = request.body?.getReader();
  if (!reader) throw new ApiError(400, "Invalid JSON");
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 48000) {
        await reader.cancel();
        throw new ApiError(413, "This note is too large.");
      }
      chunks.push(value);
    }
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(400, "Invalid JSON");
  } finally {
    reader.releaseLock();
  }
}
