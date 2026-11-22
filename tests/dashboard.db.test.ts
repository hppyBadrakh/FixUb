// The overview's numbers counted in SQL (src/server/queries/dashboard.ts) must be the numbers the
// screens compute in the browser (src/lib/domain/metrics.ts) from the same reports.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { GET as adminDashboard } from "@/app/api/v1/admin/dashboard/route";
import { GET as adminReports } from "@/app/api/v1/admin/reports/route";
import { GET as staffDashboard } from "@/app/api/v1/staff/dashboard/route";
import { GET as staffReports } from "@/app/api/v1/staff/reports/route";
import type { DashboardResponse } from "@/lib/api/types";
import { ageBuckets, dailySeries, isOpen, summarize } from "@/lib/domain/metrics";
import type { Report } from "@/lib/types";
import { as, hasDatabase, signOutEveryone, type Persona } from "./helpers/personas";
import { cleanUpReports, makeReport } from "./helpers/reports";

type Handler = (request: Request) => Promise<Response>;

async function get<T>(persona: Persona, handler: Handler, path: string): Promise<T> {
  const res = await as(persona, () => handler(new Request(`http://localhost:3000${path}`)));
  expect(res.status).toBe(200);
  return ((await res.json()) as { data: T }).data;
}

/** What the overview computes in the browser from the reports the store holds. */
function inBrowser(reports: Report[], now: number, days: number) {
  const visible = reports.filter((r) => r.visibility === "visible");
  const workload = new Map<string, { organizationId: string; unitId: string | null; open: number }>();
  for (const r of visible.filter(isOpen)) {
    if (!r.organizationId) continue;
    const key = `${r.organizationId}/${r.unitId ?? ""}`;
    const row = workload.get(key) ?? { organizationId: r.organizationId, unitId: r.unitId ?? null, open: 0 };
    row.open++;
    workload.set(key, row);
  }
  return {
    summary: summarize(visible, now, days),
    series: dailySeries(visible, now, 14),
    ageBuckets: ageBuckets(visible, now),
    workload: [...workload.values()],
    flagged: reports.filter((r) => r.flags.some((f) => f.status === "open")).length,
  };
}

const byKey = (w: DashboardResponse["workload"]) => [...w].sort((a, b) => `${a.organizationId}/${a.unitId}`.localeCompare(`${b.organizationId}/${b.unitId}`));

function expectSame(fromSql: DashboardResponse, browser: ReturnType<typeof inBrowser>) {
  const { medianResponse, medianResponsePrev, ...counts } = fromSql.summary;
  const { medianResponse: browserMedian, medianResponsePrev: browserMedianPrev, ...browserCounts } = browser.summary;
  expect(counts).toEqual(browserCounts);
  // The database keeps microseconds, the JSON the browser reads only milliseconds: a median in
  // hours can differ in the last digits, never by more than a millisecond.
  for (const [sql, js] of [
    [medianResponse, browserMedian],
    [medianResponsePrev, browserMedianPrev],
  ]) {
    if (js === null) expect(sql).toBeNull();
    else expect(sql).toBeCloseTo(js, 5);
  }
  expect(fromSql.series).toEqual(browser.series);
  expect(fromSql.ageBuckets).toEqual(browser.ageBuckets);
  expect(byKey(fromSql.workload)).toEqual(byKey(browser.workload));
}

describe.skipIf(!hasDatabase)("dashboard numbers from SQL", () => {
  beforeAll(async () => {
    // Besides the seeded reports: one of each kind the numbers treat differently.
    await makeReport(); // waiting, nobody assigned
    await makeReport({ org: "org-road", status: "in_progress" });
    await makeReport({ org: "org-road", status: "resolved" });
    await makeReport({ org: "org-light", status: "investigating" });
    await makeReport({ org: "org-road", hidden: true }); // hidden: counts nowhere
  });
  afterAll(cleanUpReports);
  afterAll(signOutEveryone);

  for (const days of [1, 7, 30]) {
    it(`admin, ${days} day(s): the same numbers as metrics.ts on every visible report`, async () => {
      const fromSql = await get<DashboardResponse>("admin", adminDashboard, `/api/v1/admin/dashboard?days=${days}`);
      const { reports } = await get<{ reports: Report[] }>("admin", adminReports, "/api/v1/admin/reports");
      const browser = inBrowser(reports, fromSql.now, days);

      expect(fromSql.days).toBe(days);
      // Not a comparison of zeros: the reports made above show up in the numbers.
      expect(fromSql.summary.open).toBeGreaterThanOrEqual(3);
      expect(fromSql.summary.resolved).toBeGreaterThanOrEqual(1);
      expect(fromSql.series.incoming.at(-1)).toBeGreaterThanOrEqual(4);
      expectSame(fromSql, browser);
      expect(fromSql.flagged).toBe(browser.flagged);
    });
  }

  it("staff: the same numbers, only over their organization's reports, and no flag count", async () => {
    const fromSql = await get<DashboardResponse>("roadStaff", staffDashboard, "/api/v1/staff/dashboard");
    const { reports } = await get<{ reports: Report[] }>("roadStaff", staffReports, "/api/v1/staff/reports");
    expect(reports.length).toBeGreaterThan(0);
    expect(reports.every((r) => r.organizationId === "org-road")).toBe(true);

    expectSame(fromSql, inBrowser(reports, fromSql.now, 7));
    expect(fromSql.summary.unassigned).toBe(0);
    expect(fromSql.workload.every((w) => w.organizationId === "org-road")).toBe(true);
    expect(fromSql.flagged).toBeUndefined();
  });
});
