// GET /api/v1/photos/{id}: the photo itself (image/jpeg), for <img src>. Who may see which
// photo is decided in loadPhoto(). Errors are the usual JSON `{ error }`.
import { getActor } from "@/server/actor";
import { withDb } from "@/server/db";
import { toErrorBody } from "@/server/errors";
import { loadPhoto } from "@/server/photos";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const photo = await withDb(async (db) => loadPhoto(db, await getActor(db), id));
    return new Response(photo.bytes, {
      headers: {
        "Content-Type": photo.contentType,
        "Content-Length": String(photo.bytes.byteLength),
        "X-Content-Type-Options": "nosniff",
        // A photo never changes, but a report can be hidden later: keep it out of shared
        // caches and let the browser reuse it for an hour.
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch (err) {
    const { status, ...error } = toErrorBody(err);
    return Response.json({ error }, { status, headers: { "Cache-Control": "no-store" } });
  }
}
