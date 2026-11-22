import "server-only";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { and, eq, isNull } from "drizzle-orm";
import type { Db, Tx } from "@/db/client";
import { photoBlobs, reportImages, reports } from "@/db/schema";
import type { UploadedPhoto } from "@/lib/api/types";
import { LIMITS } from "@/lib/meta";
import { AppError } from "./errors";

// Photos: the bytes live in Cloudflare R2 (binding `PHOTOS`), one row per photo in
// `report_images`. A deployment without the binding keeps the bytes in Postgres instead
// (`photo_blobs`), so photos work everywhere; R2 takes over as soon as the binding exists.
//
// A photo is uploaded before the thing it belongs to exists:
//
//   1. the browser sends the JPEG        POST /api/v1/photos        → storePhoto()  → { id }
//   2. the server action attaches it     createReport / changeStatus → attachReportPhotos() /
//                                                                      attachCompletionPhoto()
//   3. anyone who may see the report     GET /api/v1/photos/{id}     → loadPhoto()
//
// Until step 2 only the person who uploaded a photo can see it or attach it.

export const PHOTO_MAX_BYTES = 4 * 1024 * 1024;

/** The part of Cloudflare's R2Bucket this file uses. */
export interface PhotoBucket {
  put(key: string, value: Uint8Array, options?: { httpMetadata?: { contentType?: string } }): Promise<unknown>;
  get(key: string): Promise<{ arrayBuffer(): Promise<ArrayBuffer> } | null>;
  delete(key: string): Promise<void>;
}

/** The same three operations on the `photo_blobs` table. */
function databaseBucket(db: Db | Tx): PhotoBucket {
  return {
    async put(key, value) {
      await db.insert(photoBlobs).values({ storageKey: key, bytes: value }).onConflictDoNothing();
    },
    async get(key) {
      const [row] = await db.select({ bytes: photoBlobs.bytes }).from(photoBlobs).where(eq(photoBlobs.storageKey, key));
      if (!row) return null;
      const bytes = new Uint8Array(row.bytes); // a copy: its buffer holds exactly the photo
      return { arrayBuffer: async () => bytes.buffer };
    },
    async delete(key) {
      await db.delete(photoBlobs).where(eq(photoBlobs.storageKey, key));
    },
  };
}

/** Where photo bytes go: the R2 bucket if this Worker has the `PHOTOS` binding, else Postgres. */
export async function photoBucket(db: Db | Tx): Promise<PhotoBucket> {
  try {
    const { env } = await getCloudflareContext({ async: true });
    const bucket = (env as unknown as { PHOTOS?: PhotoBucket }).PHOTOS;
    if (bucket) return bucket;
  } catch {
    // Not running on Workers and no local simulation.
  }
  return databaseBucket(db);
}

/** A photo is read from where it was written: R2 first, then the table. */
async function readPhoto(db: Db | Tx, key: string) {
  const bucket = await photoBucket(db);
  return (await bucket.get(key)) ?? (await databaseBucket(db).get(key));
}

/**
 * Width and height of a JPEG, or null when the bytes are not one. This is the file-type check:
 * the magic bytes (FF D8 FF) and a frame header must be there, whatever the request claims.
 */
export function readJpegSize(bytes: Uint8Array): { width: number; height: number } | null {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes[2] !== 0xff) return null;
  let i = 2;
  while (i + 3 < bytes.length) {
    if (bytes[i] !== 0xff) return null;
    const marker = bytes[i + 1];
    if (marker === 0xff) {
      i += 1; // padding before a marker
      continue;
    }
    // Markers without a length: TEM, RSTn.
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      i += 2;
      continue;
    }
    // Image data or the end before any frame header: not a usable picture.
    if (marker === 0xda || marker === 0xd9) return null;
    const length = (bytes[i + 2] << 8) | bytes[i + 3];
    if (length < 2) return null;
    // SOF0–SOF15 hold the size; C4, C8 and CC share the range but are other segments.
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      if (i + 8 >= bytes.length) return null;
      const height = (bytes[i + 5] << 8) | bytes[i + 6];
      const width = (bytes[i + 7] << 8) | bytes[i + 8];
      return width > 0 && height > 0 ? { width, height } : null;
    }
    i += 2 + length;
  }
  return null;
}

export const photoUrl = (id: string) => `/api/v1/photos/${id}`;
const storageKey = (id: string) => `photos/${id}.jpg`;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Checks the bytes, stores them in R2 and records the photo as uploaded by `actor`. */
export async function storePhoto(db: Db | Tx, actor: { id: string }, bytes: Uint8Array): Promise<UploadedPhoto> {
  if (bytes.length === 0) throw new AppError("photo_required", "The request has no photo in it.");
  if (bytes.length > PHOTO_MAX_BYTES) throw new AppError("invalid_input", "The photo is larger than 4 MB.");
  const size = readJpegSize(bytes);
  if (!size) throw new AppError("invalid_input", "The file is not a JPEG photo.");

  const bucket = await photoBucket(db);
  const id = crypto.randomUUID();
  await bucket.put(storageKey(id), bytes, { httpMetadata: { contentType: "image/jpeg" } });
  try {
    await db.insert(reportImages).values({
      id,
      uploadedBy: actor.id,
      storageKey: storageKey(id),
      contentType: "image/jpeg",
      width: size.width,
      height: size.height,
      bytes: bytes.length,
    });
  } catch (err) {
    // No row, so nothing would ever point at the object: don't leave it behind.
    await bucket.delete(storageKey(id)).catch(() => {});
    throw err;
  }
  return { id, url: photoUrl(id), width: size.width, height: size.height, bytes: bytes.length };
}

const notYours = () =>
  new AppError("invalid_input", "A photo in the request was not uploaded by you, or is already used.");

/**
 * Attaches the photos a citizen uploaded to their new report, in the order given. Call it
 * inside the transaction that creates the report, so a refusal rolls the report back:
 *
 *   await db.transaction(async (tx) => {
 *     const [report] = await tx.insert(reports).values({ … }).returning({ id: reports.id });
 *     await attachReportPhotos(tx, actor, report.id, input.photoIds);
 *   });
 *
 * Refuses (`invalid_input`) a photo that someone else uploaded or that is already attached.
 */
export async function attachReportPhotos(
  tx: Db | Tx,
  actor: { id: string },
  reportId: string,
  photoIds: readonly string[],
): Promise<void> {
  if (photoIds.length > LIMITS.photosMax) throw new AppError("too_many_photos");
  if (new Set(photoIds).size !== photoIds.length || !photoIds.every((id) => UUID.test(id))) throw notYours();
  for (const [position, id] of photoIds.entries()) {
    const attached = await tx
      .update(reportImages)
      .set({ reportId, position })
      .where(and(eq(reportImages.id, id), eq(reportImages.uploadedBy, actor.id), isNull(reportImages.reportId)))
      .returning({ id: reportImages.id });
    if (attached.length === 0) throw notYours();
  }
}

/**
 * Attaches the completion photo staff uploaded to the status change that resolves a report.
 * Call it inside the same transaction as the status event. Same refusals as attachReportPhotos.
 */
export async function attachCompletionPhoto(
  tx: Db | Tx,
  actor: { id: string },
  target: { reportId: string; statusEventId: number },
  photoId: string,
): Promise<void> {
  if (!UUID.test(photoId)) throw notYours();
  const attached = await tx
    .update(reportImages)
    .set({ reportId: target.reportId, statusEventId: target.statusEventId, position: 0 })
    .where(and(eq(reportImages.id, photoId), eq(reportImages.uploadedBy, actor.id), isNull(reportImages.reportId)))
    .returning({ id: reportImages.id });
  if (attached.length === 0) throw notYours();
}

/**
 * The bytes of a photo, if this person may see it:
 * - attached to a visible report: everyone, signed in or not;
 * - not attached yet, or on a hidden report: the uploader and admins.
 * Everything else is `not_found` (404), so a hidden photo can't be told from a missing one.
 */
export async function loadPhoto(
  db: Db | Tx,
  actor: { id: string; role: string } | null,
  id: string,
): Promise<{ bytes: ArrayBuffer; contentType: string }> {
  if (!UUID.test(id)) throw new AppError("not_found");
  const [photo] = await db
    .select({
      storageKey: reportImages.storageKey,
      contentType: reportImages.contentType,
      uploadedBy: reportImages.uploadedBy,
      visibility: reports.visibility,
    })
    .from(reportImages)
    .leftJoin(reports, eq(reports.id, reportImages.reportId))
    .where(eq(reportImages.id, id));
  if (!photo) throw new AppError("not_found");

  const isPublic = photo.visibility === "visible";
  const isInsider = !!actor && (actor.role === "admin" || actor.id === photo.uploadedBy);
  if (!isPublic && !isInsider) throw new AppError("not_found");

  const object = await readPhoto(db, photo.storageKey);
  if (!object) throw new AppError("not_found");
  return { bytes: await object.arrayBuffer(), contentType: photo.contentType };
}
