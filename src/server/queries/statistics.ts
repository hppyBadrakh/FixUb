import "server-only";
import { and, count, eq, inArray, isNotNull } from "drizzle-orm";
import type { Db, Tx } from "@/db/client";
import { categories, reports } from "@/db/schema";
import type { StatisticsResponse } from "@/lib/api/types";
import { OPEN_STATUSES } from "@/lib/meta";
import { loadDashboard } from "./dashboard";
import { serverEnv } from "@/server/env";
import { wherePublic } from "./reports";

/**
 * The public statistics page (GET /api/v1/statistics), counted in SQL over the public reports.
 * The headline numbers, the 14-day series and the age buckets are the dashboard's
 * (./dashboard.ts, same definitions as src/lib/domain/metrics.ts); on top come the three
 * breakdowns only this page shows.
 */
export async function loadStatistics(db: Db | Tx, { now, days }: { now: number; days: number }): Promise<StatisticsResponse> {
  // Only what the public can see is counted: with REVIEW_BEFORE_PUBLIC that leaves out unreviewed reports.
  const reviewed = serverEnv().reviewBeforePublic ? isNotNull(reports.priority) : undefined;
  const open = and(wherePublic(), inArray(reports.status, OPEN_STATUSES));
  const [dashboard, byStatus, openByCategory, openByDistrict] = await Promise.all([
    loadDashboard(db, { now, days, scope: reviewed }),
    db.select({ status: reports.status, n: count() }).from(reports).where(wherePublic()).groupBy(reports.status),
    db
      .select({ category: categories.slug, n: count() })
      .from(reports)
      .innerJoin(categories, eq(categories.id, reports.categoryId))
      .where(open)
      .groupBy(categories.slug),
    db.select({ district: reports.district, n: count() }).from(reports).where(open).groupBy(reports.district),
  ]);
  return {
    now: dashboard.now,
    days: dashboard.days,
    summary: dashboard.summary,
    series: dashboard.series,
    ageBuckets: dashboard.ageBuckets,
    byStatus: Object.fromEntries(byStatus.map((r) => [r.status, r.n])),
    openByCategory: Object.fromEntries(openByCategory.map((r) => [r.category, r.n])),
    openByDistrict: Object.fromEntries(openByDistrict.map((r) => [r.district, r.n])),
  };
}
