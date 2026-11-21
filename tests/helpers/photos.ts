// Photo fixtures: an in-memory stand-in for the R2 bucket, JPEG bytes, and photos in known states.
import { and, eq, inArray, like, notExists, sql } from "drizzle-orm";
import { rateLimitBuckets, reportImages, reports } from "@/db/schema";
import { withDb } from "@/server/db";
import { attachReportPhotos, storePhoto, type PhotoBucket } from "@/server/photos";
import { PERSONAS, type Persona } from "./personas";

/** What the server code gets as `env.PHOTOS` in tests (see tests/setup.ts). */
export const bucketObjects = new Map<string, Uint8Array>();
export const fakeBucket: PhotoBucket = {
  async put(key, value) {
    bucketObjects.set(key, value.slice());
  },
  async get(key) {
    const bytes = bucketObjects.get(key);
    return bytes ? { arrayBuffer: async () => bytes.slice().buffer } : null;
  },
  async delete(key) {
    bucketObjects.delete(key);
  },
};

/** The smallest thing that is still a JPEG: start marker, JFIF header, frame header, end. */
export function jpeg(width = 4, height = 3, padding = 0): Uint8Array<ArrayBuffer> {
  const jfif = [0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00];
  const frame = [0xff, 0xc0, 0x00, 0x0b, 0x08, height >> 8, height & 0xff, width >> 8, width & 0xff, 0x01, 0x01, 0x11, 0x00];
  return new Uint8Array([0xff, 0xd8, ...jfif, ...frame, ...new Array<number>(padding).fill(0), 0xff, 0xd9]);
}

const created = new Set<string>();
/** Photos a test created are deleted by cleanUpPhotos(). */
export const rememberPhoto = (id: string) => void created.add(id);

/** A photo this persona uploaded and hasn't attached to anything. */
export async function uploadedBy(persona: Exclude<Persona, "signedOut">): Promise<string> {
  const photo = await withDb((db) => storePhoto(db, { id: PERSONAS[persona] }, jpeg()));
  rememberPhoto(photo.id);
  return photo.id;
}

/** A seeded report that has no photos yet, visible on the public map or hidden by moderation. */
async function reportWithoutPhotos(): Promise<string> {
  const [report] = await withDb((db) =>
    db
      .select({ id: reports.id })
      .from(reports)
      .where(
        and(
          eq(reports.visibility, "visible"),
          notExists(db.select({ one: sql`1` }).from(reportImages).where(eq(reportImages.reportId, reports.id))),
        ),
      )
      .limit(1),
  );
  if (!report) throw new Error("No seeded report without photos. Run npm run db:seed.");
  return report.id;
}

let publicPhotoId: Promise<{ photoId: string; reportId: string }> | undefined;
/** A photo the citizen uploaded, attached to a visible report: everyone may see it. */
export function publicPhoto() {
  return (publicPhotoId ??= (async () => {
    const reportId = await reportWithoutPhotos();
    const photoId = await uploadedBy("citizen");
    await withDb((db) => attachReportPhotos(db, { id: PERSONAS.citizen }, reportId, [photoId]));
    return { photoId, reportId };
  })());
}

/** Removes the photos and the upload counts the tests left in the database. */
export async function cleanUpPhotos(): Promise<void> {
  publicPhotoId = undefined;
  bucketObjects.clear();
  await withDb(async (db) => {
    if (created.size) await db.delete(reportImages).where(inArray(reportImages.id, [...created]));
    await db.delete(rateLimitBuckets).where(like(rateLimitBuckets.key, "photo.upload:user:u-%"));
  });
  created.clear();
}
