// The public statistics counted in SQL must be the numbers the page computed in the browser
// from the public reports (src/lib/domain/metrics.ts).
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { GET as listReports } from "@/app/api/v1/reports/route";
import { GET as statistics } from "@/app/api/v1/statistics/route";
import type { ReportsResponse, StatisticsResponse } from "@/lib/api/types";
import { ageBuckets, dailySeries, isOpen, summarize } from "@/lib/domain/metrics";
import type { Report } from "@/lib/types";
import { as, hasDatabase, signOutEveryone } from "./helpers/personas";
import { cleanUpReports, makeReport } from "./helpers/reports";

type Handler = (request: Request) => Promise<Response>;

async function get<T>(handler: Handler, path: string): Promise<T> {
  const res = await as("signedOut", () => handler(new Request(`http://localhost:3000${path}`)));
  expect(res.status).toBe(200);
  return ((await res.json()) as { data: T }).data;
}

const tally = (reports: Report[], key: (r: Report) => string) => {
  const out: Record<string, number> = {};
  for (const r of reports) out[key(r)] = (out[key(r)] ?? 0) + 1;
  return out;
};

describe.skipIf(!hasDatabase)("public statistics from SQL", () => {
  beforeAll(async () => {
    await makeReport();
    await makeReport({ org: "org-road", status: "in_progress" });
    await makeReport({ org: "org-road", status: "resolved" });
    await makeReport({ hidden: true }); // hidden: counts nowhere
  });
  afterAll(cleanUpReports);
  afterAll(signOutEveryone);

  for (const days of [7, 30, 90]) {
    it(`matches the browser's numbers for ${days} days`, async () => {
      const fromSql = await get<StatisticsResponse>(statistics, `/api/v1/statistics?days=${days}`);
      const { reports } = await get<ReportsResponse>(listReports, "/api/v1/reports");
      const now = fromSql.now;
      expect(fromSql.days).toBe(days);

      const { medianResponse, medianResponsePrev, ...counts } = fromSql.summary;
      const browser = summarize(reports, now, days);
      expect(counts).toEqual({ ...browser, medianResponse: undefined, medianResponsePrev: undefined });
      // The database keeps microseconds, the JSON only milliseconds: medians agree to well under a second.
      for (const [sql, js] of [
        [medianResponse, browser.medianResponse],
        [medianResponsePrev, browser.medianResponsePrev],
      ]) {
        if (js === null) expect(sql).toBeNull();
        else expect(sql).toBeCloseTo(js, 5);
      }

      expect(fromSql.series).toEqual(dailySeries(reports, now, 14));
      expect(fromSql.ageBuckets).toEqual(ageBuckets(reports, now));
      expect(fromSql.byStatus).toEqual(tally(reports, (r) => r.status));
      expect(fromSql.openByCategory).toEqual(tally(reports.filter(isOpen), (r) => r.category));
      expect(fromSql.openByDistrict).toEqual(tally(reports.filter(isOpen), (r) => r.district));
    });
  }

  it("refuses a period the page doesn't offer", async () => {
    const res = await statistics(new Request("http://localhost:3000/api/v1/statistics?days=5"));
    expect(res.status).toBe(400);
  });
});
