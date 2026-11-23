// The duplicate hint's search: GET /api/v1/reports/nearby (FR-004).
// Reports are made with makeReport() and then moved to a known distance or age.
import { eq, sql } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { GET as nearby } from "@/app/api/v1/reports/nearby/route";
import { reports } from "@/db/schema";
import type { NearbyResponse } from "@/lib/api/types";
import { withDb } from "@/server/db";
import { as, hasDatabase, PERSONAS, signOutEveryone, type Persona } from "./helpers/personas";
import { cleanUpReports, makeReport, PLACE, type FixtureOptions } from "./helpers/reports";

/** One metre of latitude, in degrees. */
const M = 1 / 111_195;

/** Makes a report `metres` north of PLACE and `daysOld` days old. */
async function reportAt(metres: number, { daysOld = 0, ...options }: FixtureOptions & { daysOld?: number } = {}): Promise<string> {
  const id = await makeReport(options);
  await withDb((db) =>
    db
      .update(reports)
      .set({
        location: { x: PLACE.lng, y: PLACE.lat + metres * M },
        createdAt: sql`now() - make_interval(days => ${daysOld})`,
      })
      .where(eq(reports.id, id)),
  );
  return id;
}

async function search(persona: Persona, query = `lng=${PLACE.lng}&lat=${PLACE.lat}&category=roads`) {
  const res = await as(persona, () => nearby(new Request(`http://localhost:3000/api/v1/reports/nearby?${query}`)));
  return { status: res.status, body: (await res.json()) as { data: NearbyResponse; error?: { code: string } } };
}
const idsFor = async (persona: Persona, query?: string) => (await search(persona, query)).body.data.candidates.map((c) => c.report.id);

describe.skipIf(!hasDatabase)("the duplicate search", () => {
  afterAll(cleanUpReports);
  afterAll(signOutEveryone);

  it("finds an open report of the same category within 50 m, with its distance in metres", async () => {
    const id = await reportAt(40);
    const { status, body } = await search("citizen");
    expect(status).toBe(200);
    const found = body.data.candidates.find((c) => c.report.id === id);
    expect(found?.distance).toBeGreaterThan(39);
    expect(found?.distance).toBeLessThan(41);
    expect(found?.report).toMatchObject({ category: "roads", status: "reported", visibility: "visible" });
  });

  it("is measured in metres: just inside is found, just outside is not", async () => {
    const inside = await reportAt(49);
    const outside = await reportAt(51);
    const ids = await idsFor("citizen");
    expect(ids).toContain(inside);
    expect(ids).not.toContain(outside);
  });

  it("ignores other categories, closed reports, hidden reports and reports older than 90 days", async () => {
    const wrongCategory = await reportAt(10);
    const resolved = await reportAt(11, { status: "resolved" });
    const hidden = await reportAt(12, { hidden: true });
    const old = await reportAt(13, { daysOld: 91 });
    const recent = await reportAt(14, { daysOld: 89 });
    const inProgress = await reportAt(15, { status: "in_progress" });

    const roads = await idsFor("citizen");
    expect(roads).toEqual(expect.arrayContaining([wrongCategory, recent, inProgress]));
    expect(roads).not.toContain(resolved);
    expect(roads).not.toContain(hidden);
    expect(roads).not.toContain(old);

    expect(await idsFor("citizen", `lng=${PLACE.lng}&lat=${PLACE.lat}&category=waste`)).not.toContain(wrongCategory);
  });

  it("leaves out the signed-in person's own reports, and keeps them for everybody else", async () => {
    const mine = await reportAt(20, { reporter: "citizen" });
    expect(await idsFor("citizen")).not.toContain(mine);
    expect(await idsFor("otherCitizen")).toContain(mine);
    expect(await idsFor("signedOut")).toContain(mine);
  });

  it("gives the nearest five, nearest first", async () => {
    // Far from every other test's reports, so only these six compete.
    const far = `lng=${PLACE.lng + 0.02}&lat=${PLACE.lat}&category=roads`;
    const ids: string[] = [];
    for (const metres of [30, 5, 25, 10, 20, 15]) {
      const id = await makeReport();
      await withDb((db) => db.update(reports).set({ location: { x: PLACE.lng + 0.02, y: PLACE.lat + metres * M } }).where(eq(reports.id, id)));
      ids.push(id);
    }
    const { body } = await search("citizen", far);
    const got = body.data.candidates;
    expect(got).toHaveLength(5);
    expect(got.map((c) => c.report.id)).toEqual([ids[1], ids[3], ids[5], ids[4], ids[2]]);
    expect(got.map((c) => c.distance)).toEqual([...got.map((c) => c.distance)].sort((a, b) => a - b));
  });

  it("never says who reported anything", async () => {
    await reportAt(30, { reporter: "otherCitizen" });
    const { body } = await search("citizen");
    expect(body.data.candidates.length).toBeGreaterThan(0);
    expect(JSON.stringify(body)).not.toContain(PERSONAS.otherCitizen);
    expect(body.data.candidates.every((c) => c.report.reporterId === null)).toBe(true);
  });

  it("finds nothing outside the service area, and refuses a point that isn't one", async () => {
    expect((await search("citizen", "lng=2.35&lat=48.85&category=roads")).body.data.candidates).toEqual([]);
    for (const query of [
      "lat=47.9&category=roads",
      "lng=&lat=47.9&category=roads",
      "lng=abc&lat=47.9&category=roads",
      "lng=999&lat=47.9&category=roads",
      "lng=106.9&lat=47.9",
      "lng=106.9&lat=47.9&category=Roads;drop",
    ]) {
      const { status, body } = await search("citizen", query);
      expect([query, status]).toEqual([query, 400]);
      expect(body.error?.code).toBe("invalid_input");
    }
  });
});
