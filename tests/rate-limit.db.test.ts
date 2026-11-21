// rateLimit(): the 11th report in an hour is refused, per user, and the next hour starts fresh.
import { like } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { rateLimitBuckets } from "@/db/schema";
import { withDb } from "@/server/db";
import { AppError } from "@/server/errors";
import { RATE_LIMITS, rateLimit } from "@/server/rate-limit";
import { hasDatabase } from "./helpers/personas";

// Made-up users: buckets have no foreign key, and nothing here touches a real user's count.
const PREFIX = `test-${Date.now().toString(36)}-`;
const user = (name: string) => ({ id: PREFIX + name });
const HOUR = 3_600_000;
/** A fixed "now", 20 minutes into an hour-long window. */
const NOW = Date.UTC(2026, 0, 15, 9, 20);

const cleanUp = () => withDb((db) => db.delete(rateLimitBuckets).where(like(rateLimitBuckets.key, `%:user:${PREFIX}%`)));

async function refusalOf(promise: Promise<void>): Promise<AppError | null> {
  try {
    await promise;
    return null;
  } catch (err) {
    if (err instanceof AppError) return err;
    throw err;
  }
}

describe.skipIf(!hasDatabase)("rateLimit", () => {
  beforeAll(cleanUp);
  afterAll(cleanUp);

  it("allows 10 reports in an hour and refuses the 11th with a readable message", async () => {
    expect(RATE_LIMITS["report.create"]).toEqual({ limit: 10, windowMinutes: 60 });
    await withDb(async (db) => {
      for (let i = 1; i <= 10; i++) {
        expect(await refusalOf(rateLimit(db, user("a"), "report.create", NOW)), `report ${i}`).toBeNull();
      }
      const refused = await refusalOf(rateLimit(db, user("a"), "report.create", NOW));
      expect(refused).toMatchObject({ code: "rate_limited", status: 429 });
      expect(refused?.message).toBe("Too many requests: the limit is 10 per hour. Try again in 40 minutes.");

      // Still refused at the very end of the same hour, with less time left to wait.
      const later = await refusalOf(rateLimit(db, user("a"), "report.create", NOW + 39 * 60_000 + 1));
      expect(later?.message).toMatch(/Try again in 1 minute\.$/);
    });
  });

  it("counts each user and each kind of write separately", async () => {
    await withDb(async (db) => {
      expect(await refusalOf(rateLimit(db, user("b"), "report.create", NOW))).toBeNull();
      expect(await refusalOf(rateLimit(db, user("a"), "report.flag", NOW))).toBeNull();
    });
  });

  it("starts fresh in the next hour and forgets the old window", async () => {
    await withDb(async (db) => {
      expect(await refusalOf(rateLimit(db, user("a"), "report.create", NOW + HOUR))).toBeNull();
      const rows = await db
        .select()
        .from(rateLimitBuckets)
        .where(like(rateLimitBuckets.key, `report.create:user:${PREFIX}a`));
      expect(rows).toHaveLength(1);
      expect(rows[0].count).toBe(1);
    });
  });

  it("can't be beaten by sending requests in parallel", async () => {
    await withDb(async (db) => {
      const results = await Promise.all(
        Array.from({ length: 15 }, () => refusalOf(rateLimit(db, user("c"), "report.create", NOW))),
      );
      expect(results.filter((r) => r === null)).toHaveLength(10);
      expect(results.filter((r) => r?.code === "rate_limited")).toHaveLength(5);
    });
  });
});
