import "server-only";
import { and, desc, gt, inArray, sql } from "drizzle-orm";
import type { Db, Tx } from "@/db/client";
import { reports } from "@/db/schema";
import { LIMITS, OPEN_STATUSES } from "@/lib/meta";
import type { Report } from "@/lib/types";
import type { Actor } from "@/server/actor";
import { loadReports, whereCategory, whereVisible } from "./reports";

/** How many candidates the report form shows. */
const MAX_CANDIDATES = 5;

export interface DuplicateCandidate {
  report: Report;
  /** Metres from the point, on the ground (PostGIS geography, not degrees). */
  distance: number;
}

/**
 * Open reports of the same category close to a point: the "is it one of these?" hint of the
 * report form (FR-004). The same rules the demo applied in the browser (`findDuplicateCandidates`):
 *
 * - visible, still open (reported, investigating, in progress), same category;
 * - within `LIMITS.duplicateRadiusM` metres and `LIMITS.duplicateDays` days;
 * - not the viewer's own reports (they can't "me too" those), nearest first, at most five.
 *
 * Distances are measured in metres with `geography`, so the filter uses the partial index
 * `reports_location_geog_gist` (drizzle/0002), which only covers visible reports.
 * Reports come out of `loadReports`, so they are shown as this viewer may see them.
 */
export async function findDuplicateCandidates(
  db: Db | Tx,
  viewer: Actor | null,
  { lng, lat, category }: { lng: number; lat: number; category: string },
  now = Date.now(),
): Promise<DuplicateCandidate[]> {
  const point = sql`ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography`;
  const where = and(
    whereVisible,
    whereCategory(category),
    inArray(reports.status, OPEN_STATUSES),
    gt(reports.createdAt, new Date(now - LIMITS.duplicateDays * 864e5)),
    sql`ST_DWithin(${reports.location}::geography, ${point}, ${LIMITS.duplicateRadiusM})`,
    // `reporter_id` is null once a user is deleted: those reports are nobody's own.
    viewer ? sql`${reports.reporterId} is distinct from ${viewer.id}` : undefined,
  );
  const distance = sql<number>`ST_Distance(${reports.location}::geography, ${point})`;

  const near = await db
    .select({ id: reports.id, distance: distance.mapWith(Number) })
    .from(reports)
    .where(where)
    .orderBy(distance, desc(reports.createdAt), desc(reports.id))
    .limit(MAX_CANDIDATES);
  if (!near.length) return [];

  const loaded = new Map(
    (
      await loadReports(
        db,
        viewer,
        inArray(
          reports.id,
          near.map((n) => n.id),
        ),
        { limit: MAX_CANDIDATES },
      )
    ).map((r) => [r.id, r]),
  );
  return near.flatMap((n) => {
    const report = loaded.get(n.id);
    return report ? [{ report, distance: n.distance }] : [];
  });
}
