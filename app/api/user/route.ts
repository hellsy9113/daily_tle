export async function GET() {
  return Response.json(
    { error: "A username is required. Use /api/user/<username>." },
    { status: 400 },
  );
}
