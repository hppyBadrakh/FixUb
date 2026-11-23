// GET /api/v1/reports/nearby: the report form's duplicate hint, found with PostGIS.
import { afterAll, describe, expect, it } from "vitest";
import { GET as nearbyRoute } from "@/app/api/v1/reports/nearby/route";
import type { NearbyResponse } from "@/lib/api/types";
import { LIMITS } from "@/lib/meta";
import { as, hasDatabase, signOutEveryone, type Persona } from "./helpers/personas";
import { cleanUpReports, makeReport } from "./helpers/reports";

// A point inside the service area with no seeded report within a kilometre, so what the seed
// holds can't push a test report out of the five the endpoint returns.
const HERE = { lng: 106.82, lat: 47.9 };
/** `metres` north of HERE (one degree of latitude is about 111.2 km). */
const north = (metres: number) => ({ lng: HERE.lng, lat: HERE.lat + metres / 111_195 });
/** `metres` east of HERE (a degree of longitude is shorter here: about 74.5 km at 47.9°N). */
const east = (metres: number) => ({ lng: HERE.lng + metres / (111_195 * Math.cos((HERE.lat * Math.PI) / 180)), lat: HERE.lat });

async function ask(persona: Persona, query: Record<string, string> = { ...HERE, category: "roads" } as unknown as Record<string, string>) {
  const params = new URLSearchParams(Object.fromEntries(Object.entries(query).map(([k, v]) => [k, String(v)])));
  return as(persona, () => nearbyRoute(new Request(`http://localhost:3000/api/v1/reports/nearby?${params}`)));
}
async function candidates(persona: Persona, query?: Record<string, string>) {
  const res = await ask(persona, query);
  expect(res.status).toBe(200);
  return ((await res.json()) as { data: NearbyResponse }).data.candidates;
}
const ids = (list: Awaited<ReturnType<typeof candidates>>) => list.map((c) => c.report.id);

describe.skipIf(!hasDatabase)("nearby reports (duplicate hint)", () => {
  afterAll(cleanUpReports);
  afterAll(signOutEveryone);

  it("returns open reports of the same category within the radius, nearest first, with distances in metres", async () => {
    const far = await makeReport({ at: north(LIMITS.duplicateRadiusM + 15) });
    const mid = await makeReport({ at: north(40) });
    const near = await makeReport({ at: north(10) });

    const found = await candidates("citizen");
    expect(ids(found)).toEqual([near, mid]);
    expect(ids(found)).not.toContain(far);
    expect(found[0].distance).toBeCloseTo(10, 0);
    expect(found[1].distance).toBeCloseTo(40, 0);
    // The whole report comes with it, as the hint's list shows it.
    expect(found[0].report).toMatchObject({ id: near, category: "roads", status: "reported" });
  });

  it("measures on the ground, not in degrees", async () => {
    // A degree of longitude is about 33% shorter than one of latitude here, so the same number of
    // degrees east and north are different distances. Metres are what count.
    const e45 = await makeReport({ at: east(45) });
    const n45 = await makeReport({ at: north(45) });
    const e55 = await makeReport({ at: east(55) });
    const n55 = await makeReport({ at: north(55) });
    const found = await candidates("citizen");
    expect(ids(found)).toEqual(expect.arrayContaining([e45, n45]));
    expect(ids(found)).not.toContain(e55);
    expect(ids(found)).not.toContain(n55);
    for (const c of found) expect(c.distance).toBeLessThanOrEqual(LIMITS.duplicateRadiusM);
  });

  it("leaves out other categories, closed work, hidden reports and old ones", async () => {
    const wrongCategory = await makeReport({ at: north(5), category: ["lighting", "not_working"] });
    const resolved = await makeReport({ at: north(5), status: "resolved" });
    const hidden = await makeReport({ at: north(5), hidden: true });
    const tooOld = await makeReport({ at: north(5), ageDays: LIMITS.duplicateDays + 1 });
    const recentEnough = await makeReport({ at: north(5), ageDays: LIMITS.duplicateDays - 1 });
    const inProgress = await makeReport({ at: north(5), status: "in_progress" });

    const found = ids(await candidates("citizen"));
    expect(found).toEqual(expect.arrayContaining([recentEnough, inProgress]));
    for (const id of [wrongCategory, resolved, hidden, tooOld]) expect(found).not.toContain(id);
    // The other category has its own answer.
    expect(ids(await candidates("citizen", { ...HERE, category: "lighting" } as never))).toContain(wrongCategory);
  });

  it("leaves out the viewer's own reports, and shows them to everyone else", async () => {
    const mine = await makeReport({ at: north(5), reporter: "citizen" });
    const theirs = await makeReport({ at: north(5), reporter: "otherCitizen" });

    expect(ids(await candidates("citizen"))).toEqual(expect.not.arrayContaining([mine]));
    expect(ids(await candidates("citizen"))).toContain(theirs);
    for (const who of ["otherCitizen", "signedOut", "admin"] as const) expect(ids(await candidates(who))).toContain(mine);
  });

  it("never says who reported", async () => {
    const id = await makeReport({ at: north(5), reporter: "otherCitizen" });
    for (const who of ["citizen", "signedOut"] as const) {
      const found = (await candidates(who)).find((c) => c.report.id === id);
      expect(found?.report.reporterId).toBeNull();
      expect(JSON.stringify(found)).not.toContain("u-citizen-2");
    }
  });

  it("returns at most five, nearest first", async () => {
    await Promise.all([1, 2, 3, 4, 5, 6, 7].map((i) => makeReport({ at: north(i * 5) })));
    const found = await candidates("citizen");
    expect(found).toHaveLength(5);
    const distances = found.map((c) => c.distance);
    expect(distances).toEqual([...distances].sort((a, b) => a - b));
  });

  it("answers an empty list where nothing is near", async () => {
    expect(await candidates("citizen", { lng: 106.7, lat: 47.82, category: "roads" } as never)).toEqual([]);
    expect(await candidates("citizen", { ...HERE, category: "no-such-category" } as never)).toEqual([]);
  });

  it("refuses a point or category that isn't valid", async () => {
    const bad: Record<string, string>[] = [
      { lat: String(HERE.lat), category: "roads" },
      { lng: String(HERE.lng), category: "roads" },
      { lng: String(HERE.lng), lat: String(HERE.lat) },
      { lng: "abc", lat: String(HERE.lat), category: "roads" },
      { lng: "", lat: String(HERE.lat), category: "roads" },
      { lng: "1e2", lat: String(HERE.lat), category: "roads" },
      { lng: "181", lat: String(HERE.lat), category: "roads" },
      { lng: String(HERE.lng), lat: "-90.5", category: "roads" },
      { lng: String(HERE.lng), lat: String(HERE.lat), category: "Roads; drop table reports" },
    ];
    for (const query of bad) {
      const res = await ask("citizen", query);
      expect(res.status, JSON.stringify(query)).toBe(400);
      expect(((await res.json()) as { error: { code: string } }).error.code).toBe("invalid_input");
    }
  });
});
