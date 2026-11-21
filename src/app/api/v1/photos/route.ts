// POST /api/v1/photos: upload one photo. The body is the JPEG itself (`Content-Type: image/jpeg`),
// exactly the Blob the camera screen produces. Screens call `uploadPhoto(blob)` from
// src/lib/api/photos.ts and pass the returned id to createReport / changeStatus.
//
// Any signed-in user may upload: citizens for a report, staff for a completion photo.
import { getActor, requireActor } from "@/server/actor";
import { api } from "@/server/api";
import { withDb } from "@/server/db";
import { AppError } from "@/server/errors";
import { PHOTO_MAX_BYTES, storePhoto } from "@/server/photos";
import { rateLimit } from "@/server/rate-limit";
import type { UploadedPhoto } from "@/lib/api/types";

const tooLarge = () => new AppError("invalid_input", "The photo is larger than 4 MB.");

export async function POST(request: Request) {
  return api<UploadedPhoto>(() =>
    withDb(async (db) => {
      const actor = requireActor(await getActor(db));
      await rateLimit(db, actor, "photo.upload");

      const type = request.headers.get("content-type")?.split(";")[0].trim().toLowerCase();
      if (type !== "image/jpeg") throw new AppError("invalid_input", "Send the photo as image/jpeg.");
      // Refuse an oversized upload before reading it; the real size is checked again below.
      if (Number(request.headers.get("content-length") ?? 0) > PHOTO_MAX_BYTES) throw tooLarge();

      const bytes = new Uint8Array(await request.arrayBuffer());
      return storePhoto(db, actor, bytes);
    }),
  );
}
