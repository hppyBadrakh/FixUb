// More on the public statistics (tests/statistics.db.test.ts compares them with the browser's
// calculation over reports made "now"): reports of known ages, so every period boundary and
// every filter is exercised, plus plain COUNT(*) queries on the database.
import { eq, sql } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { reports, reportStatusEvents } from "@/db/schema";
import { ageBuckets, dailySeries, isOpen, summarize } from "@/lib/domain/metrics";
import type { ReportStatus } from "@/lib/types";
import { withDb } from "@/server/db";
import { loadReports, whereVisible } from "@/server/queries/reports";
import { loadStatistics } from "@/server/queries/statistics";
import { hasDatabase, signOutEveryone } from "./helpers/personas";
import { cleanUpReports, makeReport } from "./helpers/reports";

const PERIODS = [7, 30, 90] as const;
const HOUR = 36e5;
const DAY = 864e5;

const stats = (days: (typeof PERIODS)[number], now: number) => withDb((db) => loadStatistics(db, { now, days }));
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

/** A report made `daysOld` days before `now`, whose first status change came 5 hours later. */
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

describe.skipIf(!hasDatabase)("the statistics, on reports of known ages", () => {
  afterAll(cleanUpReports);
  afterAll(signOutEveryone);

  it("match the browser's calculation for every period", async () => {
    const now = Date.now();
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
      const want = summarize(visible, now, days);
      expect(got.days).toBe(days);
      expect(got.summary).toMatchObject({
        open: want.open,
        resolved: want.resolved,
        resolvedPrev: want.resolvedPrev,
        openOver14: want.openOver14,
      });
      if (want.medianResponse === null) expect(got.summary.medianResponse).toBeNull();
      else expect(got.summary.medianResponse).toBeCloseTo(want.medianResponse, 5);
    }

    const got = await stats(30, now);
    expect(got.series).toEqual(dailySeries(visible, now, 14));
    expect(got.ageBuckets).toEqual(ageBuckets(visible, now));
    expect(sum(got.series.incoming)).toBeGreaterThan(0);
    expect(sum(Object.values(got.openByCategory))).toBe(visible.filter(isOpen).length);
  });

  it("match plain COUNT(*) queries on the database", async () => {
    const now = Date.now();
    const got = await stats(30, now);
    const one = (query: ReturnType<typeof sql>) =>
      withDb(async (db) => Number(((await db.execute(query)).rows[0] as { n: string }).n));
    const total = await one(sql`select count(*) as n from reports where visibility = 'visible'`);
    const open = await one(sql`select count(*) as n from reports where visibility = 'visible' and status in ('reported','investigating','in_progress')`);
    const resolved = await one(sql`select count(*) as n from reports where visibility = 'visible' and status = 'resolved'`);
    const hidden = await one(sql`select count(*) as n from reports where visibility = 'hidden'`);

    expect(sum(Object.values(got.byStatus))).toBe(total);
    expect(got.summary.open).toBe(open);
    expect(got.byStatus.resolved).toBe(resolved);
    expect(sum(Object.values(got.openByDistrict))).toBe(open);
    expect(sum(Object.values(got.openByCategory))).toBe(open);
    expect(sum(got.ageBuckets.map((b) => b.value))).toBe(open);
    expect(hidden).toBeGreaterThan(0);
  });

  it("count a new report once, and never a hidden one", async () => {
    const now = Date.now();
    const before = await stats(30, now);
    await reportFrom(1, { status: "reported" }, now);
    await reportFrom(1, { hidden: true }, now);
    const after = await stats(30, now);
    expect(after.summary.open).toBe(before.summary.open + 1);
    expect(after.byStatus.reported).toBe((before.byStatus.reported ?? 0) + 1);
    expect(sum(Object.values(after.byStatus))).toBe(sum(Object.values(before.byStatus)) + 1);
    expect(sum(after.series.incoming)).toBe(sum(before.series.incoming) + 1);
  });

  it("put a resolution in the period it happened in, and not in the others", async () => {
    const now = Date.now();
    const before = { 7: await stats(7, now), 30: await stats(30, now), 90: await stats(90, now) };
    // Resolved 40 days ago: not in the last 30 days, in the 30 days before them, and in the last 90.
    await reportFrom(40, { status: "resolved" }, now);
    const after = { 7: await stats(7, now), 30: await stats(30, now), 90: await stats(90, now) };
    expect(after[7].summary.resolved).toBe(before[7].summary.resolved);
    expect(after[30].summary.resolved).toBe(before[30].summary.resolved);
    expect(after[30].summary.resolvedPrev).toBe(before[30].summary.resolvedPrev + 1);
    expect(after[90].summary.resolved).toBe(before[90].summary.resolved + 1);

    // Resolved 7 hours ago: in every period, and not in the "previous" one.
    await reportFrom(0.5, { status: "resolved" }, now);
    for (const days of PERIODS) {
      const recent = await stats(days, now);
      expect(recent.summary.resolved).toBe(after[days].summary.resolved + 1);
      expect(recent.summary.resolvedPrev).toBe(after[days].summary.resolvedPrev);
    }
  });
});
