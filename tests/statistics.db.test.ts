// The public statistics, counted in SQL (GET /api/v1/statistics), against what the demo's own
// calculation (src/lib/domain/metrics.ts) gives for the same reports, and against raw counts.
import { eq, sql } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { GET as statistics } from "@/app/api/v1/statistics/route";
import { reports, reportStatusEvents } from "@/db/schema";
import type { StatisticsResponse } from "@/lib/api/types";
import { ageBuckets, dailySeries, isOpen, summarize } from "@/lib/domain/metrics";
import { DISTRICT_ORDER, STATUS_ORDER } from "@/lib/meta";
import type { ReportStatus } from "@/lib/types";
import { withDb } from "@/server/db";
import { loadReports, whereVisible } from "@/server/queries/reports";
import { loadStatistics } from "@/server/queries/statistics";
import { as, hasDatabase, signOutEveryone } from "./helpers/personas";
import { cleanUpReports, makeReport } from "./helpers/reports";

const PERIODS = [7, 30, 90] as const;
const HOUR = 36e5;
const DAY = 864e5;

const stats = (days: (typeof PERIODS)[number], now: Date) => withDb((db) => loadStatistics(db, days, now));

/** A report made `daysOld` days ago whose first status change came 5 hours later. */
async function reportFrom(daysOld: number, options: { status?: Exclude<ReportStatus, "closed">; hidden?: boolean } = {}, now = Date.now()) {
  const id = await makeReport(options);
  const created = new Date(now - daysOld * DAY);
  const changed = new Date(created.getTime() + 5 * HOUR);
  await withDb(async (db) => {
    const events = (await db.select({ id: reportStatusEvents.id }).from(reportStatusEvents).where(eq(reportStatusEvents.reportId, id))).map((e) => e.id).sort((a, b) => a - b);
    await db.update(reportStatusEvents).set({ createdAt: created }).where(eq(reportStatusEvents.id, events[0]));
    if (events[1]) await db.update(reportStatusEvents).set({ createdAt: changed }).where(eq(reportStatusEvents.id, events[1]));
    await db
      .update(reports)
      .set({ createdAt: created, statusChangedAt: changed, resolvedAt: options.status === "resolved" ? changed : null })
      .where(eq(reports.id, id));
  });
  return id;
}

describe.skipIf(!hasDatabase)("the statistics", () => {
  afterAll(cleanUpReports);
  afterAll(signOutEveryone);

  it("match the demo's calculation over the same reports, for every period", async () => {
    const now = new Date();
    // Reports at known ages, on top of the seed, so every number has something to count.
    await reportFrom(0.2);
    await reportFrom(3, { status: "in_progress" });
    await reportFrom(16, { status: "reported" });
    await reportFrom(40, { status: "resolved" });
    await reportFrom(5, { status: "resolved" });
    await reportFrom(0.5, { status: "resolved" }); // resolved 7 hours ago: the newest edge of every period
    await reportFrom(2, { hidden: true });

    const visible = await withDb((db) => loadReports(db, null, whereVisible));
    expect(visible.length).toBeGreaterThan(30);

    for (const days of PERIODS) {
      const got = await stats(days, now);
      const want = summarize(visible, now.getTime(), days);
      expect(got.days).toBe(days);
      expect(got.total).toBe(visible.length);
      expect(got.open).toBe(want.open);
      expect(got.resolved).toBe(want.resolved);
      expect(got.resolvedPrev).toBe(want.resolvedPrev);
      expect(got.openOver14).toBe(want.openOver14);
      if (want.medianResponse === null) expect(got.medianResponseHours).toBeNull();
      else expect(got.medianResponseHours).toBeCloseTo(want.medianResponse, 6);
    }

    const got = await stats(30, now);
    const open = visible.filter(isOpen);
    expect(got.byStatus).toEqual(Object.fromEntries(STATUS_ORDER.map((s) => [s, visible.filter((r) => r.status === s).length])));
    expect(got.openByDistrict).toEqual(Object.fromEntries(DISTRICT_ORDER.map((d) => [d, open.filter((r) => r.district === d).length])));
    const categories = new Map<string, number>();
    for (const r of open) categories.set(r.category, (categories.get(r.category) ?? 0) + 1);
    expect(Object.fromEntries(got.openByCategory.map((c) => [c.category, c.count]))).toEqual(Object.fromEntries(categories));
    expect(got.openByCategory.map((c) => c.count)).toEqual([...got.openByCategory.map((c) => c.count)].sort((a, b) => b - a));
    expect(got.openByAge).toEqual(Object.fromEntries(ageBuckets(visible, now.getTime()).map((b) => [b.key, b.value])));

    const series = dailySeries(visible, now.getTime(), 14);
    expect(got.series).toEqual({ labels: series.labels, incoming: series.incoming, resolved: series.resolved });
    expect(got.series.incoming.reduce((a, b) => a + b, 0)).toBeGreaterThan(0);
  });

  it("match plain COUNT(*) queries on the database", async () => {
    const now = new Date();
    const got = await stats(30, now);
    const { raw } = await withDb(async (db) => {
      const one = async (query: ReturnType<typeof sql>) => Number(((await db.execute(query)).rows[0] as { n: string }).n);
      return {
        raw: {
          total: await one(sql`select count(*) as n from reports where visibility = 'visible'`),
          open: await one(sql`select count(*) as n from reports where visibility = 'visible' and status in ('reported','investigating','in_progress')`),
          resolvedNow: await one(sql`select count(*) as n from reports where visibility = 'visible' and status = 'resolved'`),
          hidden: await one(sql`select count(*) as n from reports where visibility = 'hidden'`),
        },
      };
    });
    expect(got.total).toBe(raw.total);
    expect(got.open).toBe(raw.open);
    expect(got.byStatus.resolved).toBe(raw.resolvedNow);
    expect(Object.values(got.byStatus).reduce((a, b) => a + b, 0)).toBe(raw.total);
    expect(Object.values(got.openByDistrict).reduce((a, b) => a + b, 0)).toBe(raw.open);
    expect(got.openByCategory.reduce((a, c) => a + c.count, 0)).toBe(raw.open);
    expect(Object.values(got.openByAge).reduce((a, b) => a + b, 0)).toBe(raw.open);
    expect(raw.hidden).toBeGreaterThan(0);
  });

  it("count a new report once, and never a hidden one", async () => {
    const now = new Date();
    const before = await stats(30, now);
    await reportFrom(1, { status: "reported" }, now.getTime());
    await reportFrom(1, { hidden: true }, now.getTime());
    const after = await stats(30, now);
    expect(after.total).toBe(before.total + 1);
    expect(after.open).toBe(before.open + 1);
    expect(after.byStatus.reported).toBe(before.byStatus.reported + 1);
    expect(after.series.incoming.reduce((a, b) => a + b, 0)).toBe(before.series.incoming.reduce((a, b) => a + b, 0) + 1);
  });

  it("put a resolution in the period it happened in, and not in the others", async () => {
    const now = new Date();
    const before = { 30: await stats(30, now), 90: await stats(90, now), 7: await stats(7, now) };
    // Resolved 40 days ago: not in the last 30 days, in the 30 days before them, and in the last 90.
    await reportFrom(40, { status: "resolved" }, now.getTime());
    const after = { 30: await stats(30, now), 90: await stats(90, now), 7: await stats(7, now) };
    expect(after[7].resolved).toBe(before[7].resolved);
    expect(after[30].resolved).toBe(before[30].resolved);
    expect(after[30].resolvedPrev).toBe(before[30].resolvedPrev + 1);
    expect(after[90].resolved).toBe(before[90].resolved + 1);

    // Resolved 7 hours ago: in every period, and not in the "previous" one.
    await reportFrom(0.5, { status: "resolved" }, now.getTime());
    const recent = { 7: await stats(7, now), 30: await stats(30, now), 90: await stats(90, now) };
    for (const days of PERIODS) {
      expect(recent[days].resolved).toBe(after[days].resolved + 1);
      expect(recent[days].resolvedPrev).toBe(after[days].resolvedPrev);
    }
  });

  it("is served to everybody, with 30 days when none is asked for", async () => {
    for (const persona of ["signedOut", "citizen", "admin"] as const) {
      const res = await as(persona, () => statistics(new Request("http://localhost:3000/api/v1/statistics")));
      expect(res.status).toBe(200);
      const { data } = (await res.json()) as { data: StatisticsResponse };
      expect(data.days).toBe(30);
      expect(data.series.labels).toHaveLength(14);
    }
    const res = await as("signedOut", () => statistics(new Request("http://localhost:3000/api/v1/statistics?days=90")));
    expect(((await res.json()) as { data: StatisticsResponse }).data.days).toBe(90);
  });
});
