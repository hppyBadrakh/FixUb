// Runs once after all tests: removes what they left in the database.
import { existsSync } from "node:fs";
import { and, eq, inArray, isNull, like } from "drizzle-orm";
import { createDb } from "../src/db/client";
import { auditEvents, photoBlobs, rateLimitBuckets, reportImages, reports } from "../src/db/schema";
import { TEST_PHOTO } from "./helpers";

export default async function teardown(): Promise<void> {
  if (existsSync(".env.local")) process.loadEnvFile(".env.local");
  const connectionString = process.env.DATABASE_URL?.trim();
  if (!connectionString) return;
  const { db, close } = createDb({ connectionString, wsProxy: process.env.DATABASE_WS_PROXY?.trim() || undefined });
  try {
    // Reports the tests filed (their descriptions start with "E2E:"), with their photos and audit trail.
    const filed = (await db.select({ id: reports.id }).from(reports).where(like(reports.description, "E2E:%"))).map((r) => r.id);
    if (filed.length) {
      const photos = await db.select({ key: reportImages.storageKey }).from(reportImages).where(inArray(reportImages.reportId, filed));
      if (photos.length) await db.delete(photoBlobs).where(inArray(photoBlobs.storageKey, photos.map((p) => p.key)));
      await db.delete(auditEvents).where(and(eq(auditEvents.targetType, "report"), inArray(auditEvents.targetId, filed)));
      await db.delete(reports).where(inArray(reports.id, filed));
    }
    await db
      .delete(reportImages)
      .where(and(isNull(reportImages.reportId), eq(reportImages.width, TEST_PHOTO.width), eq(reportImages.height, TEST_PHOTO.height)));
    await db.delete(rateLimitBuckets).where(like(rateLimitBuckets.key, "%:user:u-%"));
  } finally {
    await close();
  }
}
