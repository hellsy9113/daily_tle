import { ApiError } from "./api-error";
import { isRecord } from "./validation";

const RETRY_MESSAGE = "Something went wrong. Try again.";

/** Read an object response from our own APIs without exposing transport or parser errors. */
export async function requestJson<T>(path: string, options: RequestInit = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, { cache: "no-store", ...options });
  } catch (error) {
    if (options.signal?.aborted) throw error;
    throw new ApiError(503, RETRY_MESSAGE);
  }
  let body: unknown;
  try {
    body = await response.json();
  } catch (error) {
    if (options.signal?.aborted) throw error;
    throw new ApiError(response.ok ? 502 : response.status, RETRY_MESSAGE);
  }
  options.signal?.throwIfAborted();
  if (!response.ok) {
    const message =
      isRecord(body) && typeof body.error === "string" && body.error.trim()
        ? body.error
        : RETRY_MESSAGE;
    throw new ApiError(response.status, message);
  }
  if (!isRecord(body)) throw new ApiError(502, RETRY_MESSAGE);
  return body as T;
}
