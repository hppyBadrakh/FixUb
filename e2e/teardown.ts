// Runs once after all tests: removes what they left in the database.
import { existsSync } from "node:fs";
import { and, eq, isNull, like } from "drizzle-orm";
import { createDb } from "../src/db/client";
import { rateLimitBuckets, reportImages } from "../src/db/schema";
import { TEST_PHOTO } from "./helpers";

export default async function teardown(): Promise<void> {
  if (existsSync(".env.local")) process.loadEnvFile(".env.local");
  const connectionString = process.env.DATABASE_URL?.trim();
  if (!connectionString) return;
  const { db, close } = createDb({ connectionString, wsProxy: process.env.DATABASE_WS_PROXY?.trim() || undefined });
  try {
    await db
      .delete(reportImages)
      .where(and(isNull(reportImages.reportId), eq(reportImages.width, TEST_PHOTO.width), eq(reportImages.height, TEST_PHOTO.height)));
    await db.delete(rateLimitBuckets).where(like(rateLimitBuckets.key, "photo.upload:user:u-%"));
  } finally {
    await close();
  }
}
