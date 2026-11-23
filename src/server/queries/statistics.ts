import "server-only";
import { sql, type SQL } from "drizzle-orm";
import type { Db, Tx } from "@/db/client";
import type { StatisticsResponse } from "@/lib/api/types";
import { dayKey } from "@/lib/format";
import { DISTRICT_ORDER, OPEN_STATUSES, STATUS_ORDER } from "@/lib/meta";

// The numbers of the public statistics page, counted in SQL. The definitions are the demo's
// (src/lib/domain/metrics.ts, which tests/statistics.db.test.ts runs over the same reports and
// compares): only visible reports count, "open" is reported / investigating / in progress,
// "resolved in a period" counts reports with a Resolved status change in it, and the first
// response is the first status change after "reported".
//
// Days are local days in Asia/Ulaanbaatar. Mongolia has no daylight saving time, so a day is
// always 24 h there and `dayKey()` (the browser demo's) and the SQL below agree.

const TZ = "Asia/Ulaanbaatar";
const DAY_MS = 864e5;
export const SERIES_DAYS = 14;

type Row = Record<string, unknown>;
async function rows(db: Db | Tx, query: SQL): Promise<Row[]> {
  return (await db.execute(query)).rows as Row[];
}

export async function loadStatistics(db: Db | Tx, days: StatisticsResponse["days"], now: Date = new Date()): Promise<StatisticsResponse> {
  const at = sql`${now.toISOString()}::timestamptz`;
  const since = sql`${at} - make_interval(days => ${days})`;
  const prevSince = sql`${at} - make_interval(days => ${days * 2})`;
  const open = sql`r.status in (${sql.join(OPEN_STATUSES.map((s) => sql`${s}`), sql`, `)})`;
  const age = sql`extract(epoch from (${at} - r.created_at)) / 86400`;

  const [[summary], statuses, categories, districts, [response], [prevResolved], series] = await Promise.all([
    rows(
      db,
      sql`select
            count(*) as total,
            count(*) filter (where ${open}) as open,
            count(*) filter (where ${open} and ${age} > 14) as open_over_14,
            count(*) filter (where ${open} and ${age} < 2) as lt2,
            count(*) filter (where ${open} and ${age} >= 2 and ${age} < 7) as d2_7,
            count(*) filter (where ${open} and ${age} >= 7 and ${age} < 14) as d7_14,
            count(*) filter (where ${open} and ${age} >= 14 and ${age} < 30) as d14_30,
            count(*) filter (where ${open} and ${age} >= 30) as gt30,
            (select count(distinct e.report_id) from report_status_events e join reports v on v.id = e.report_id
              where v.visibility = 'visible' and e.to_status = 'resolved' and e.created_at >= ${since} and e.created_at <= ${at}) as resolved
          from reports r where r.visibility = 'visible'`,
    ),
    rows(db, sql`select r.status as key, count(*) as n from reports r where r.visibility = 'visible' group by 1`),
    rows(
      db,
      sql`select c.slug as key, count(*) as n from reports r join categories c on c.id = r.category_id
          where r.visibility = 'visible' and ${open} group by 1 order by n desc, c.slug`,
    ),
    rows(db, sql`select r.district as key, count(*) as n from reports r where r.visibility = 'visible' and ${open} group by 1`),
    // First status change after "reported" (assignments are not status changes), for reports made in the period.
    rows(
      db,
      sql`select percentile_cont(0.5) within group (order by extract(epoch from (f.created_at - r.created_at)) / 3600) as median
          from reports r
          join lateral (select e.created_at from report_status_events e where e.report_id = r.id and e.from_status is not null order by e.id limit 1) f on true
          where r.visibility = 'visible' and r.created_at >= ${since} and r.created_at <= ${at}`,
    ),
    rows(
      db,
      sql`select count(distinct e.report_id) as n from report_status_events e join reports v on v.id = e.report_id
          where v.visibility = 'visible' and e.to_status = 'resolved' and e.created_at >= ${prevSince} and e.created_at < ${since}`,
    ),
    // Incoming and resolved per local day. One query for both; the window is padded by a day for the time zone.
    rows(
      db,
      sql`select kind, to_char(local_day, 'YYYY-MM-DD') as day, count(*) as n from (
            select 'incoming' as kind, (r.created_at at time zone ${TZ})::date as local_day
              from reports r where r.visibility = 'visible' and r.created_at >= ${at} - interval '16 days' and r.created_at <= ${at}
            union all
            select 'resolved', (e.created_at at time zone ${TZ})::date
              from report_status_events e join reports r on r.id = e.report_id
              where r.visibility = 'visible' and e.to_status = 'resolved' and e.created_at >= ${at} - interval '16 days' and e.created_at <= ${at}
          ) x group by 1, 2`,
    ),
  ]);

  const count = (row: Row | undefined, key: string) => Number(row?.[key] ?? 0);
  const byKey = (list: Row[]) => new Map(list.map((r) => [String(r.key), Number(r.n)]));
  const status = byKey(statuses);
  const district = byKey(districts);

  // The same 14 day keys the demo's dailySeries() makes: one per 24 h step back from now.
  const labels = Array.from({ length: SERIES_DAYS }, (_, i) => now.getTime() - (SERIES_DAYS - 1 - i) * DAY_MS);
  const keys = labels.map(dayKey);
  const perDay = (kind: string) => {
    const found = new Map(series.filter((r) => r.kind === kind).map((r) => [String(r.day), Number(r.n)]));
    return keys.map((k) => found.get(k) ?? 0);
  };

  return {
    generatedAt: now.getTime(),
    days,
    total: count(summary, "total"),
    open: count(summary, "open"),
    resolved: count(summary, "resolved"),
    resolvedPrev: count(prevResolved, "n"),
    medianResponseHours: response?.median == null ? null : Number(response.median),
    openOver14: count(summary, "open_over_14"),
    byStatus: Object.fromEntries(STATUS_ORDER.map((s) => [s, status.get(s) ?? 0])) as StatisticsResponse["byStatus"],
    openByCategory: categories.map((r) => ({ category: String(r.key), count: Number(r.n) })),
    openByDistrict: Object.fromEntries(DISTRICT_ORDER.map((d) => [d, district.get(d) ?? 0])) as StatisticsResponse["openByDistrict"],
    openByAge: {
      lt2: count(summary, "lt2"),
      "2-7": count(summary, "d2_7"),
      "7-14": count(summary, "d7_14"),
      "14-30": count(summary, "d14_30"),
      gt30: count(summary, "gt30"),
    },
    series: { labels, incoming: perDay("incoming"), resolved: perDay("resolved") },
  };
}
