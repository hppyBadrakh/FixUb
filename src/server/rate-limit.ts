import "server-only";
import { and, eq, lt, sql } from "drizzle-orm";
import type { Db, Tx } from "@/db/client";
import { rateLimitBuckets } from "@/db/schema";
import { AppError } from "./errors";

/**
 * How many times one user may do each kind of write per window. Add a line here for a new
 * kind of write; the name is also the prefix of the key in `rate_limit_buckets`.
 *
 * The numbers are generous for a real person and tight for a script: nobody files more than
 * 10 reports an hour by hand.
 */
export const RATE_LIMITS = {
  "report.create": { limit: 10, windowMinutes: 60 },
  "report.me_too": { limit: 60, windowMinutes: 60 },
  "report.verdict": { limit: 60, windowMinutes: 60 },
  "report.flag": { limit: 20, windowMinutes: 60 },
  "photo.upload": { limit: 40, windowMinutes: 60 },
  /** Everything admins and staff do in the console (priority, assignment, status, categories…). */
  "console.write": { limit: 300, windowMinutes: 60 },
} as const satisfies Record<string, { limit: number; windowMinutes: number }>;

export type RateLimitName = keyof typeof RATE_LIMITS;

/**
 * Counts one write by this user and throws `rate_limited` (429) once they are over the limit.
 * Call it in every server action that writes, right after the permission check:
 *
 *   const actor = requireActor(await getActor(db));
 *   await rateLimit(db, actor, "report.create");
 *
 * Fixed windows in Postgres (`rate_limit_buckets`), because a Worker has no memory between
 * requests. The count is one atomic upsert, so parallel requests can't slip past the limit.
 * Refused attempts count too. Pass `db`, not a transaction handle you might roll back.
 */
export async function rateLimit(
  db: Db | Tx,
  actor: { id: string },
  name: RateLimitName,
  now: number = Date.now(),
): Promise<void> {
  const { limit, windowMinutes } = RATE_LIMITS[name];
  const windowMs = windowMinutes * 60_000;
  const windowStart = new Date(Math.floor(now / windowMs) * windowMs);
  const key = `${name}:user:${actor.id}`;

  const [bucket] = await db
    .insert(rateLimitBuckets)
    .values({ key, windowStart, count: 1 })
    .onConflictDoUpdate({
      target: [rateLimitBuckets.key, rateLimitBuckets.windowStart],
      set: { count: sql`${rateLimitBuckets.count} + 1` },
    })
    .returning({ count: rateLimitBuckets.count });

  // First write of a new window: this user's older windows are no longer needed.
  if (bucket.count === 1) {
    await db.delete(rateLimitBuckets).where(and(eq(rateLimitBuckets.key, key), lt(rateLimitBuckets.windowStart, windowStart)));
  }

  if (bucket.count > limit) {
    const minutes = Math.max(1, Math.ceil((windowStart.getTime() + windowMs - now) / 60_000));
    const per = windowMinutes === 60 ? "hour" : `${windowMinutes} minutes`;
    throw new AppError(
      "rate_limited",
      `Too many requests: the limit is ${limit} per ${per}. Try again in ${minutes} minute${minutes === 1 ? "" : "s"}.`,
    );
  }
}
