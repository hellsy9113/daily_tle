export class ApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

/** Keep upstream error details and credentials out of public responses. */
export function errorResponse(error: unknown): Response {
  const status = error instanceof ApiError ? error.status : 500;
  const message = error instanceof ApiError ? error.message : "An unexpected error occurred.";
  return Response.json({ error: message }, { status, headers: { "Cache-Control": "no-store" } });
}
