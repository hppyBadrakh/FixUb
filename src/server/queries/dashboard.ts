import "server-only";
import { and, count, eq, gte, inArray, isNotNull, isNull, lt, sql, type SQL } from "drizzle-orm";
import type { PgColumn } from "drizzle-orm/pg-core";
import type { Db, Tx } from "@/db/client";
import { moderationFlags, organizations, organizationUnits, reports, reportStatusEvents } from "@/db/schema";
import type { DashboardResponse } from "@/lib/api/types";
import { AGE_BUCKETS } from "@/lib/domain/metrics";
import { dayKey } from "@/lib/format";
import { OPEN_STATUSES } from "@/lib/meta";
import { whereVisible } from "./reports";

// The overview's numbers (GET /api/v1/admin/dashboard and /staff/dashboard), counted in SQL.
// Every number follows src/lib/domain/metrics.ts, which the demo computes in the browser:
// tests/dashboard.db.test.ts checks that both give the same answer on the same reports.
//
// - Only visible reports count, like the screens' `visible` list. `scope` narrows them further
//   (a staff member's organization).
// - A period is `[now - days, now]`: metrics.ts writes it as `t >= since && t < now + 1`.
// - Days are local days in Asia/Ulaanbaatar, like `dayKey`.

const DAY = 864e5;
const at = (ms: number) => new Date(ms);

/** How many rows match `cond`. */
const countIf = (cond: SQL | undefined) => sql<number>`(count(*) filter (where ${cond}))::int`;

/** The local day ("2026-11-22") of a timestamp column, as `dayKey` gives it. */
const localDay = (column: PgColumn) => sql<string>`to_char(${column} at time zone 'Asia/Ulaanbaatar', 'YYYY-MM-DD')`;

export interface DashboardOptions {
  /** Which reports, on top of "visible": e.g. a staff member's organization. Undefined = all. */
  scope?: SQL;
  /** The moment to count for (ms). */
  now: number;
  /** Length of the period in days. */
  days: number;
  /** Count the reports with open flags (admins only). */
  withFlags?: boolean;
}

export async function loadDashboard(db: Db | Tx, { scope, now, days, withFlags = false }: DashboardOptions): Promise<DashboardResponse> {
  const base = and(whereVisible, scope);
  const open = inArray(reports.status, OPEN_STATUSES);
  const end = at(now + 1);
  const since = at(now - days * DAY);
  const prevSince = at(now - 2 * days * DAY);

  // `firstResponseHours`: from creation to the first status change after "reported", for the
  // reports created in the current or the previous period.
  const firstResponse = db
    .select({
      createdAt: reports.createdAt,
      hours: sql<number>`(extract(epoch from min(${reportStatusEvents.createdAt}) - ${reports.createdAt}) / 3600)::float8`.as("hours"),
    })
    .from(reports)
    .innerJoin(reportStatusEvents, and(eq(reportStatusEvents.reportId, reports.id), isNotNull(reportStatusEvents.fromStatus)))
    .where(and(base, gte(reports.createdAt, prevSince), lt(reports.createdAt, end)))
    .groupBy(reports.id)
    .as("first_response");
  const median = (cond: SQL) => sql<number | null>`percentile_cont(0.5) within group (order by ${firstResponse.hours}) filter (where ${cond})`;

  const resolvedEvents = and(base, eq(reportStatusEvents.toStatus, "resolved"));
  const resolvedIn = (from: Date, to: Date) =>
    sql<number>`(count(distinct ${reportStatusEvents.reportId}) filter (where ${and(gte(reportStatusEvents.createdAt, from), lt(reportStatusEvents.createdAt, to))}))::int`;

  // The series covers 14 local days; a day is at most 24 h, so 14 × 24 h back reaches its start.
  const seriesStart = at(now - 14 * DAY);

  const [[counts], [ages], [resolved], [medians], incoming, resolvedDaily, workload, flagged] = await Promise.all([
    db
      .select({
        open: countIf(open),
        awaiting: countIf(eq(reports.status, "reported")),
        working: countIf(inArray(reports.status, ["investigating", "in_progress"])),
        unassigned: countIf(and(open, isNull(reports.assignedOrganizationId))),
        openOver14: countIf(and(open, lt(reports.createdAt, at(now - 14 * DAY)))),
      })
      .from(reports)
      .where(base),
    // `ageBuckets`: minDays <= age < maxDays, where age = (now - createdAt) in days. The browser
    // sees createdAt in whole milliseconds, so "createdAt <= t" is written "createdAt < t + 1 ms"
    // (and "> t" as ">= t + 1 ms"): the same answer for a timestamp with microseconds.
    db
      .select(
        Object.fromEntries(
          AGE_BUCKETS.map((b) => [
            b.key,
            countIf(
              and(
                open,
                Number.isFinite(b.minDays) ? lt(reports.createdAt, at(now - b.minDays * DAY + 1)) : undefined,
                Number.isFinite(b.maxDays) ? gte(reports.createdAt, at(now - b.maxDays * DAY + 1)) : undefined,
              ),
            ),
          ]),
        ),
      )
      .from(reports)
      .where(base),
    // `resolved`: reports resolved at least once in the period (reopened ones count again later).
    db
      .select({ current: resolvedIn(since, end), previous: resolvedIn(prevSince, since) })
      .from(reportStatusEvents)
      .innerJoin(reports, eq(reports.id, reportStatusEvents.reportId))
      .where(resolvedEvents),
    db
      .select({ current: median(gte(firstResponse.createdAt, since)), previous: median(lt(firstResponse.createdAt, since)) })
      .from(firstResponse),
    db
      .select({ day: localDay(reports.createdAt), n: count() })
      .from(reports)
      .where(and(base, gte(reports.createdAt, seriesStart)))
      .groupBy(localDay(reports.createdAt)),
    // `dailySeries` counts every resolution, so a report resolved twice in a day counts twice.
    db
      .select({ day: localDay(reportStatusEvents.createdAt), n: count() })
      .from(reportStatusEvents)
      .innerJoin(reports, eq(reports.id, reportStatusEvents.reportId))
      .where(and(resolvedEvents, gte(reportStatusEvents.createdAt, seriesStart)))
      .groupBy(localDay(reportStatusEvents.createdAt)),
    db
      .select({ organizationId: organizations.slug, unitId: organizationUnits.slug, open: count() })
      .from(reports)
      .innerJoin(organizations, eq(organizations.id, reports.assignedOrganizationId))
      .leftJoin(organizationUnits, eq(organizationUnits.id, reports.assignedUnitId))
      .where(and(base, open))
      .groupBy(organizations.slug, organizationUnits.slug)
      .orderBy(sql`count(*) desc`, organizations.slug, organizationUnits.slug),
    // Flags are counted on every report, hidden ones included: hiding doesn't settle a flag.
    withFlags
      ? db.select({ n: sql<number>`count(distinct ${moderationFlags.reportId})::int` }).from(moderationFlags).where(eq(moderationFlags.status, "open"))
      : Promise.resolve(null),
  ]);

  // The 14 days of `dailySeries`, oldest first.
  const labels = Array.from({ length: 14 }, (_, i) => now - (13 - i) * DAY);
  const perDay = (rows: { day: string; n: number }[]) => {
    const byDay = new Map(rows.map((r) => [r.day, r.n]));
    return labels.map((ts) => byDay.get(dayKey(ts)) ?? 0);
  };

  return {
    now,
    days,
    summary: {
      ...counts,
      resolved: resolved.current,
      resolvedPrev: resolved.previous,
      medianResponse: medians.current,
      medianResponsePrev: medians.previous,
    },
    series: { labels, incoming: perDay(incoming), resolved: perDay(resolvedDaily) },
    ageBuckets: AGE_BUCKETS.map(({ key, mn, en }) => ({ key, mn, en, value: ages[key] })),
    workload,
    ...(flagged ? { flagged: flagged[0].n } : {}),
  };
}
